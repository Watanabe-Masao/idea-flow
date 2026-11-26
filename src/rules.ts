// 決まりの見える化（#8）。リポジトリから決まりの文書を読み、単位に分け、意味の近さで問題を探す。
// GitHub には書き込まない。人が「問題ではない」と決めたものは rule_dismissed に残る。
import type { Env } from './types.ts';
import { classify, defaultPick, parseRules, termsOf, TEMP_WORDS, NEG_WORDS } from './rules-parse.ts';
import { loadVectors, upsertEmbeddings } from './embed.ts';
import { dot, type Vec } from './vec.ts';
import { bulkInsert, nowIso, sha256 } from './util.ts';

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

function ghHeaders(env: Env, raw = false): Record<string, string> {
  const h: Record<string, string> = { accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'user-agent': 'idea-flow', 'x-github-api-version': '2022-11-28' };
  if (env.GITHUB_TOKEN) h.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return h;
}
async function gh<T>(env: Env, path: string, raw = false): Promise<T> {
  const res = await fetch('https://api.github.com' + path, { headers: ghHeaders(env, raw) });
  if (!res.ok) throw new Error(`GitHub: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (raw ? await res.text() : await res.json()) as T;
}

type Source = { repo: string; branch: string; files: string[]; synced_at: string | null };
export async function sources(env: Env): Promise<Source[]> {
  const rows = (await env.DB.prepare('SELECT * FROM rule_sources ORDER BY repo').all<{ repo: string; branch: string; files: string; synced_at: string | null }>()).results;
  return rows.map(r => ({ ...r, files: JSON.parse(r.files) }));
}

/** リポジトリの .md の一覧と、いま選ばれているもの（未選択なら最初の選び方） */
export async function listFiles(env: Env, repo: string) {
  if (!REPO_RE.test(repo)) throw new Error('リポジトリは owner/name の形で入れてください');
  const src = (await sources(env)).find(s => s.repo === repo);
  const branch = src?.branch ?? 'main';
  const tree = await gh<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>(env, `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const md = tree.tree.filter(t => t.type === 'blob' && /\.md$/i.test(t.path)).map(t => t.path).sort();
  const chosen = src && src.files.length ? new Set(src.files) : new Set(md.filter(defaultPick));
  return { repo, branch, truncated: tree.truncated, files: md.map(p => ({ path: p, picked: chosen.has(p), ...classify(p) })) };
}

export async function saveSource(env: Env, repo: string, files: string[], branch = 'main') {
  if (!REPO_RE.test(repo)) throw new Error('リポジトリは owner/name の形で入れてください');
  const clean = [...new Set(files.filter(f => typeof f === 'string' && /\.md$/i.test(f)))].slice(0, 200);
  await env.DB.prepare('INSERT INTO rule_sources (repo, branch, files) VALUES (?, ?, ?) ON CONFLICT(repo) DO UPDATE SET branch = excluded.branch, files = excluded.files')
    .bind(repo, branch, JSON.stringify(clean)).run();
  return { repo, files: clean.length };
}

/** 選ばれたファイルを読み直して、決まりの単位と埋め込みを作り、問題を探し直す */
export async function syncRules(env: Env, repo: string) {
  const info = await listFiles(env, repo);
  const picked = info.files.filter(f => f.picked).map(f => f.path);
  const now = nowIso();
  const docRows: unknown[][] = [], itemRows: unknown[][] = [];
  for (const path of picked) {
    const src = await gh<string>(env, `/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(info.branch)}`, true);
    const c = classify(path);
    const p = parseRules(src, c.kind);
    const id = `${repo}|${path}`;
    docRows.push([id, repo, path, (await sha256(src)).slice(0, 16), c.kind, c.applies, c.scope, p.title, p.description, JSON.stringify(p.refs), now]);
    for (const it of p.items) itemRows.push([(await sha256(`${id}|${it.n}|${it.text}`)).slice(0, 20), id, it.n, it.heading, it.text.slice(0, 1200), it.line, it.kind]);
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rule_items WHERE doc IN (SELECT id FROM rule_docs WHERE repo = ?)').bind(repo),
    env.DB.prepare('DELETE FROM rule_docs WHERE repo = ?').bind(repo),
    ...bulkInsert(env.DB, 'INSERT INTO rule_docs (id, repo, path, sha, kind, applies, scope, title, description, refs, synced_at) VALUES', 11, docRows),
    ...bulkInsert(env.DB, 'INSERT OR IGNORE INTO rule_items (id, doc, n, heading, text, line, kind) VALUES', 7, itemRows),
    env.DB.prepare('UPDATE rule_sources SET synced_at = ?, files = ? WHERE repo = ?').bind(now, JSON.stringify(picked), repo),
  ]);
  await env.DB.prepare('INSERT OR IGNORE INTO rule_sources (repo, branch, files, synced_at) VALUES (?, ?, ?, ?)').bind(repo, info.branch, JSON.stringify(picked), now).run();
  const items = (await env.DB.prepare('SELECT id, heading, text FROM rule_items').all<{ id: string; heading: string; text: string }>()).results;
  const embedded = await upsertEmbeddings(env, items.map(i => ({ kind: 'rule' as const, ref: i.id, text: ruleText(i) })));
  const findings = await analyze(env);
  return { repo, docs: docRows.length, items: itemRows.length, embedded, findings };
}

const ruleText = (i: { heading: string; text: string }) => (i.heading ? i.heading.split(' › ').pop() + '：' : '') + i.text.slice(0, 500);

type Item = { id: string; doc: string; heading: string; text: string; kind: string };
type Doc = { id: string; repo: string; path: string; kind: string; applies: string; scope: string; title: string | null; description: string | null; refs: string };

/** 問題を探し直す（全部のリポジトリをまとめて。別のリポジトリどうしの重複も見える） */
export async function analyze(env: Env) {
  const st = Object.fromEntries((await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'rule_%'").all<{ key: string; value: string }>()).results.map(r => [r.key, Number(r.value)]));
  const dupT = st.rule_dup || 0.88, confT = st.rule_conflict || 0.78, skillT = st.rule_skill || 0.75;
  const docs = (await env.DB.prepare('SELECT * FROM rule_docs').all<Doc>()).results;
  const items = (await env.DB.prepare('SELECT id, doc, heading, text, kind FROM rule_items').all<Item>()).results;
  const vecs = await loadVectors(env, 'rule');
  const rows: unknown[][] = [];
  const add = (kind: string, a: string, b: string | null, score: number | null, detail: unknown) => rows.push([`${kind}|${a}|${b ?? ''}`, kind, a, b, score, JSON.stringify(detail)]);

  // 一時的な決まりの残り（言葉で探す候補）
  for (const it of items) { const m = it.text.match(TEMP_WORDS); if (m && it.kind !== 'desc') add('temporary', it.id, null, null, { word: m[0] }); }

  // 重複と食い違いの候補：別の文書どうしで意味が近いもの（短すぎるものは除く）
  const cand = items.filter(i => i.kind !== 'desc' && i.text.length >= 12 && vecs.has(i.id)).map(i => ({ i, v: vecs.get(i.id)! as Vec, neg: NEG_WORDS.test(i.text), terms: termsOf(i.text) }));
  const pairs: { a: typeof cand[number]; b: typeof cand[number]; s: number }[] = [];
  for (let x = 0; x < cand.length; x++) for (let y = x + 1; y < cand.length; y++) {
    if (cand[x].i.doc === cand[y].i.doc) continue;
    const s = dot(cand[x].v, cand[y].v);
    if (s >= confT) pairs.push({ a: cand[x], b: cand[y], s });
  }
  pairs.sort((p, q) => q.s - p.s);
  let nd = 0, nc = 0, nf = 0;
  for (const p of pairs) {
    if (p.s >= dupT) { if (nd < 80) { add('duplicate', p.a.i.id, p.b.i.id, p.s, {}); nd++; } continue; }
    // 同じ言葉を別の文書で説明している → 定義が分かれている（食い違いより先に見る）
    const shared = [...p.a.terms].filter(t => p.b.terms.has(t));
    if (shared.length) { if (nf < 80) { add('definition', p.a.i.id, p.b.i.id, p.s, { terms: shared.slice(0, 5) }); nf++; } continue; }
    if (p.a.neg !== p.b.neg && nc < 80) { add('conflict', p.a.i.id, p.b.i.id, p.s, {}); nc++; }
  }

  // スキルの読み込まれ方：説明文どうしが近いと、間違った場面で読まれやすい
  const descs = items.filter(i => i.kind === 'desc' && vecs.has(i.id));
  for (let x = 0; x < descs.length; x++) for (let y = x + 1; y < descs.length; y++) {
    const s = dot(vecs.get(descs[x].id)!, vecs.get(descs[y].id)!);
    if (s >= skillT) add('skill_overlap', descs[x].doc, descs[y].doc, s, {});
  }

  // どこからも読まれない決まりの文書：自動で読まれる文書（CLAUDE.md など）からたどれないもの
  for (const repo of new Set(docs.map(d => d.repo))) {
    const ds = docs.filter(d => d.repo === repo);
    const byPath = (ref: string) => ds.find(d => d.path === ref || d.path.endsWith('/' + ref));
    const reached = new Set<string>();
    const walk = (d: Doc) => { if (reached.has(d.id)) return; reached.add(d.id); for (const r of JSON.parse(d.refs) as string[]) { const t = byPath(r); if (t) walk(t); } };
    ds.filter(d => d.applies === 'always').forEach(walk);
    for (const d of ds) if (d.applies === 'referenced' && !reached.has(d.id)) {
      const from = ds.filter(o => o.id !== d.id && (JSON.parse(o.refs) as string[]).some(r => byPath(r)?.id === d.id)).map(o => o.path);
      add('unreferenced', d.id, null, null, { from, noAuto: !ds.some(o => o.applies === 'always') });
    }
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM rule_findings'),
    ...bulkInsert(env.DB, 'INSERT OR IGNORE INTO rule_findings (key, kind, a, b, score, detail) VALUES', 6, rows),
  ]);
  const count: Record<string, number> = {};
  for (const r of rows) count[r[1] as string] = (count[r[1] as string] ?? 0) + 1;
  return count;
}

/** 画面用：文書・決まり・問題（人が「問題ではない」にしたものは除く） */
export async function rulesView(env: Env) {
  const docs = (await env.DB.prepare('SELECT id, repo, path, kind, applies, scope, title, description, refs, synced_at FROM rule_docs ORDER BY repo, path').all<Doc & { synced_at: string }>()).results;
  const items = (await env.DB.prepare('SELECT id, doc, n, heading, text, line, kind FROM rule_items ORDER BY doc, n').all()).results;
  const dismissed = new Set((await env.DB.prepare('SELECT key FROM rule_dismissed').all<{ key: string }>()).results.map(r => r.key));
  const findings = (await env.DB.prepare('SELECT key, kind, a, b, score, detail FROM rule_findings ORDER BY kind, score DESC').all<{ key: string; kind: string; a: string; b: string | null; score: number | null; detail: string }>()).results
    .filter(f => !dismissed.has(f.key)).map(f => ({ ...f, detail: JSON.parse(f.detail) }));
  return { sources: await sources(env), docs: docs.map(d => ({ ...d, refs: JSON.parse(d.refs) })), items, findings, dismissed: dismissed.size };
}

export async function dismiss(env: Env, key: string, why: string | null) {
  if (!(await env.DB.prepare('SELECT key FROM rule_findings WHERE key = ?').bind(key).first())) throw new Error('その問題は見つかりません');
  await env.DB.prepare('INSERT OR REPLACE INTO rule_dismissed (key, at, why) VALUES (?, ?, ?)').bind(key, nowIso(), why).run();
  return { ok: true };
}
