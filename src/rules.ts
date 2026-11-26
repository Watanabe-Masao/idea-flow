// 決まりの見える化（#8）。リポジトリから決まりの文書を読み、単位に分け、意味の近さで問題を探す。
// GitHub には書き込まない。人が「問題ではない」と決めたものは rule_dismissed に残る。
import type { Env } from './types.ts';
import { classify, defaultPick, externalByLicense, frontmatter, parseRules, sectionsOf, resolveRef, termsOf, TEMP_WORDS, NEG_WORDS } from './rules-parse.ts';
import { audit, depsOf, type AuditHit } from './audit.ts';
import { embedMany, loadVectors, upsertEmbeddings } from './embed.ts';
import { dot, type Vec } from './vec.ts';
import { bulkInsert, nowIso, sha256 } from './util.ts';
import { diagnose } from './diagnosis.ts';
import { gh, readMany, REPO_RE } from './gh.ts';

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
  const all = tree.tree.filter(t => t.type === 'blob').map(t => t.path);
  const md = all.filter(p => /\.md$/i.test(p)).sort();
  const chosen = src && src.files.length ? new Set(src.files) : new Set(md.filter(defaultPick));
  return { repo, branch, truncated: tree.truncated, all, files: md.map(p => ({ path: p, picked: chosen.has(p), external: externalByLicense(all, p), ...classify(p) })) };
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
  const extAuto = new Map(info.files.map(f => [f.path, f.external]));
  const extHuman = new Map((await env.DB.prepare('SELECT path, external FROM rule_external WHERE repo = ?').bind(repo).all<{ path: string; external: number }>()).results.map(r => [r.path, !!r.external]));
  const now = nowIso();
  const docRows: unknown[][] = [], itemRows: unknown[][] = [], secRows: unknown[][] = [];
  // .md を全部（と package.json）まとめて読む。読めなければ、選んだものだけ1つずつ読む
  const mdAll = info.files.map(f => f.path);
  const bulk = await readMany(env, repo, info.branch, [...mdAll, ...(info.all.includes('package.json') ? ['package.json'] : [])]);
  const texts = bulk ?? new Map<string, string>();
  for (const path of picked) {
    const src = texts.get(path) ?? await gh<string>(env, `/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(info.branch)}`, true);
    texts.set(path, src);
    const c = classify(path);
    const p = parseRules(src, c.kind);
    const id = `${repo}|${path}`;
    const ext = extHuman.has(path) ? extHuman.get(path)! : !!extAuto.get(path);
    docRows.push([id, repo, path, (await sha256(src)).slice(0, 16), c.kind, c.applies, c.scope, p.title, p.description, JSON.stringify(p.refs), now, ext ? 1 : 0, extHuman.has(path) ? 'human' : ext ? 'auto' : null]);
    for (const sc of sectionsOf(src)) secRows.push([id, sc.heading, sc.line, sc.md.slice(0, 20000)]);
    for (const it of p.items) itemRows.push([(await sha256(`${id}|${it.n}|${it.text}`)).slice(0, 20), id, it.n, it.heading, it.text.slice(0, 1200), it.line, it.kind]);
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rule_items WHERE doc IN (SELECT id FROM rule_docs WHERE repo = ?)').bind(repo),
    env.DB.prepare('DELETE FROM rule_sections WHERE doc IN (SELECT id FROM rule_docs WHERE repo = ?)').bind(repo),
    env.DB.prepare('DELETE FROM rule_docs WHERE repo = ?').bind(repo),
    ...bulkInsert(env.DB, 'INSERT INTO rule_docs (id, repo, path, sha, kind, applies, scope, title, description, refs, synced_at, external, external_by) VALUES', 13, docRows),
    ...bulkInsert(env.DB, 'INSERT OR IGNORE INTO rule_items (id, doc, n, heading, text, line, kind) VALUES', 7, itemRows),
    ...bulkInsert(env.DB, 'INSERT OR IGNORE INTO rule_sections (doc, heading, line, md) VALUES', 4, secRows),
    env.DB.prepare('UPDATE rule_sources SET synced_at = ?, files = ? WHERE repo = ?').bind(now, JSON.stringify(picked), repo),
  ]);
  await env.DB.prepare('INSERT OR IGNORE INTO rule_sources (repo, branch, files, synced_at) VALUES (?, ?, ?, ?)').bind(repo, info.branch, JSON.stringify(picked), now).run();
  const auditN = await runAudit(env, repo, info.branch, info.all, texts, now, picked);
  const items = (await env.DB.prepare('SELECT id, heading, text FROM rule_items').all<{ id: string; heading: string; text: string }>()).results;
  const embedded = await upsertEmbeddings(env, items.map(i => ({ kind: 'rule' as const, ref: i.id, text: ruleText(i) })));
  const findings = await analyze(env);
  return { repo, docs: docRows.length, items: itemRows.length, embedded, findings, audit: auditN, readAll: !!bulk };
}

/**
 * 機能していない・意味がなさそうな文書の候補を調べて残す。
 * 読めた .md だけで調べる（トークンが無いと、選んだ文書だけになる）。
 * もう無いファイルは、最後に触ったコミット（消したコミット）も調べる（多くて8件）。
 */
async function runAudit(env: Env, repo: string, branch: string, all: string[], texts: Map<string, string>, now: string, picked: string[]) {
  // 決まりとして選んだ文書は「入口からたどれない」で見るので、ここでは数えない（同じことを2回言わない）
  const placed = new Set(picked);
  const descriptions = new Map<string, string>();
  for (const [p, t] of texts) if (classify(p).kind === 'skill') { const d = frontmatter(t).meta.description; if (d) descriptions.set(p, d); }
  const md = new Map([...texts].filter(([p]) => /\.md$/i.test(p)));
  const hits: AuditHit[] = audit({ all, texts: md, deps: depsOf(texts.get('package.json')), placed, descriptions });
  let looked = 0;
  for (const h of hits) if (h.kind === 'dead_ref') for (const r of h.detail.refs as { ref: string; gone?: unknown }[]) {
    if (looked >= 8) break;
    looked++;
    try {
      const cs = await gh<{ sha: string; commit: { message: string; committer: { date: string } } }[]>(env, `/repos/${repo}/commits?path=${encodeURIComponent(r.ref)}&sha=${encodeURIComponent(branch)}&per_page=1`);
      if (cs[0]) r.gone = { sha: cs[0].sha.slice(0, 7), message: cs[0].commit.message.split('\n')[0].slice(0, 120), date: cs[0].commit.committer.date.slice(0, 10) };
    } catch { /* 調べられなくても候補は残す */ }
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rule_audit WHERE repo = ?').bind(repo),
    ...bulkInsert(env.DB, 'INSERT OR REPLACE INTO rule_audit (key, repo, path, kind, detail, at) VALUES', 6, hits.map(h => [`${h.kind}|${repo}|${h.path}`, repo, h.path, h.kind, JSON.stringify(h.detail), now])),
  ]);
  return hits.length;
}

const ruleText = (i: { heading: string; text: string }) => (i.heading ? i.heading.split(' › ').pop() + '：' : '') + i.text.slice(0, 500);

type Item = { id: string; doc: string; heading: string; text: string; kind: string };
type Doc = { id: string; repo: string; path: string; kind: string; applies: string; scope: string; title: string | null; description: string | null; refs: string; external: number; external_by: string | null };

/** 問題の探し方の版。探し方を変えたら上げる（古い結果のままなら、画面で取り込み直しを促す） */
export const ANALYZE_VERSION = '4';

/** 問題を探し直す（全部のリポジトリをまとめて。別のリポジトリどうしの重複も見える） */
export async function analyze(env: Env) {
  const st = Object.fromEntries((await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'rule_%'").all<{ key: string; value: string }>()).results.map(r => [r.key, Number(r.value)]));
  const dupT = st.rule_dup || 0.88, confT = st.rule_conflict || 0.78, skillT = st.rule_skill || 0.75;
  const docs = (await env.DB.prepare('SELECT * FROM rule_docs').all<Doc>()).results;
  const extDoc = new Set(docs.filter(d => d.external).map(d => d.id));
  const items = (await env.DB.prepare('SELECT id, doc, heading, text, kind FROM rule_items').all<Item>()).results.filter(i => !extDoc.has(i.doc)); // 外から入れたものは診断しない
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

  // 届き方：自動で届く文書（CLAUDE.md など）から、参照をたどって届くか
  for (const repo of new Set(docs.map(d => d.repo))) {
    const ds = docs.filter(d => d.repo === repo && !d.external);
    const g = refGraph(ds);
    const entries = ds.filter(d => d.applies === 'always');
    const need = ds.filter(d => d.applies === 'referenced');
    if (!entries.length) {
      // 入口が無い：文書ごとに並べず、原因を1件にまとめる。入口の候補は、参照をたどって多くの文書に届くもの
      if (!need.length) continue;
      // ほかの文書からよく参照されている（まとめ役の）文書を先に。同じなら届く数が多い順
      // （届く数だけで選ぶと、まとめ役を参照しているだけの個別の文書（絵本の決まりなど）が上に来てしまう）
      const indeg = (id: string) => [...g.values()].filter(t => t.has(id)).length;
      const reach = need.map(d => ({ d, n: reachFrom(g, d.id).size - 1, k: indeg(d.id) })).sort((a, b) => b.k - a.k || b.n - a.n);
      add('no_entry', `${repo}|`, null, null, { docs: need.map(d => d.path), items: items.filter(i => need.some(d => d.id === i.doc)).length, candidates: reach.slice(0, 3).filter(r => r.n > 0).map(r => ({ path: r.d.path, reaches: [...reachFrom(g, r.d.id)].filter(id => id !== r.d.id).map(id => ds.find(x => x.id === id)!.path) })) });
      continue;
    }
    const reached = new Set<string>();
    for (const e of entries) for (const id of reachFrom(g, e.id)) reached.add(id);
    for (const d of need) if (!reached.has(d.id)) {
      const from = ds.filter(o => g.get(o.id)?.has(d.id)).map(o => o.path);
      add('unreferenced', d.id, null, null, { from });
    }
  }

  // 機能していない・意味がなさそうな文書（取り込みのときに調べた結果）。外から入れたものは除く
  // （ただし「使っていない技術向けのスキル」は、外から入れたスキルこそ当たるので残す）
  const extPath = new Set(docs.filter(d => d.external).map(d => `${d.repo}|${d.path}`));
  for (const r of (await env.DB.prepare('SELECT repo, path, kind, detail FROM rule_audit').all<{ repo: string; path: string; kind: string; detail: string }>()).results)
    if (r.kind === 'skill_unused' || !extPath.has(`${r.repo}|${r.path}`)) add(r.kind, `${r.repo}|${r.path}`, null, null, { path: r.path, ...JSON.parse(r.detail) });

  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('rule_analyze_v', ?)").bind(ANALYZE_VERSION),
    env.DB.prepare('DELETE FROM rule_findings'),
    ...bulkInsert(env.DB, 'INSERT OR IGNORE INTO rule_findings (key, kind, a, b, score, detail) VALUES', 6, rows),
  ]);
  const count: Record<string, number> = {};
  for (const r of rows) count[r[1] as string] = (count[r[1] as string] ?? 0) + 1;
  return count;
}

/** 文書の参照のつながり（パスを正しく直してから） */
function refGraph(ds: Doc[]) {
  const known = new Set(ds.map(d => d.path)), byPath = new Map(ds.map(d => [d.path, d.id]));
  const g = new Map<string, Set<string>>();
  for (const d of ds) {
    const to = new Set<string>();
    for (const r of JSON.parse(d.refs) as string[]) { const p = resolveRef(d.path, r, known); if (p && p !== d.path) to.add(byPath.get(p)!); }
    g.set(d.id, to);
  }
  return g;
}
function reachFrom(g: Map<string, Set<string>>, start: string) {
  const seen = new Set<string>([start]), q = [start];
  while (q.length) for (const n of g.get(q.shift()!) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  return seen;
}

/** 人が「外から入れたもの（書き換えない）」かどうかを決める。次の取り込みからも効く */
export async function setExternal(env: Env, repo: string, path: string, external: boolean) {
  const d = await env.DB.prepare('SELECT id FROM rule_docs WHERE repo = ? AND path = ?').bind(repo, path).first<{ id: string }>();
  if (!d) throw new Error('その文書は取り込まれていません');
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO rule_external (repo, path, external, at) VALUES (?, ?, ?, ?)').bind(repo, path, external ? 1 : 0, nowIso()),
    env.DB.prepare("UPDATE rule_docs SET external = ?, external_by = 'human' WHERE id = ?").bind(external ? 1 : 0, d.id),
  ]);
  return { ok: true, findings: await analyze(env) };
}

/** 画面用：文書・決まり・問題（人が「問題ではない」にしたものは除く） */
export async function rulesView(env: Env) {
  const docs = (await env.DB.prepare('SELECT id, repo, path, kind, applies, scope, title, description, refs, synced_at, external, external_by FROM rule_docs ORDER BY repo, path').all<Doc & { synced_at: string }>()).results;
  const items = (await env.DB.prepare('SELECT id, doc, n, heading, text, line, kind FROM rule_items ORDER BY doc, n').all()).results;
  const dismissed = new Set((await env.DB.prepare('SELECT key FROM rule_dismissed').all<{ key: string }>()).results.map(r => r.key));
  const findings = (await env.DB.prepare('SELECT key, kind, a, b, score, detail FROM rule_findings ORDER BY kind, score DESC').all<{ key: string; kind: string; a: string; b: string | null; score: number | null; detail: string }>()).results
    .filter(f => !dismissed.has(f.key)).map(f => ({ ...f, detail: JSON.parse(f.detail) }));
  const ds = docs.map(d => ({ ...d, refs: JSON.parse(d.refs) }));
  const srcs = await sources(env);
  const repos = [...new Set([...srcs.map(x => x.repo), ...ds.map(d => d.repo)])];
  const diagnosis = Object.fromEntries(repos.map(r => [r, diagnose(r, findings, ds, items as { id: string; doc: string }[])]));
  const av = await env.DB.prepare("SELECT value FROM settings WHERE key = 'rule_analyze_v'").first<{ value: string }>();
  return { sources: srcs, docs: ds, items, findings, dismissed: dismissed.size, diagnosis, stale: ds.length > 0 && av?.value !== ANALYZE_VERSION };
}

export async function dismiss(env: Env, key: string, why: string | null) {
  if (!(await env.DB.prepare('SELECT key FROM rule_findings WHERE key = ?').bind(key).first())) throw new Error('その問題は見つかりません');
  await env.DB.prepare('INSERT OR REPLACE INTO rule_dismissed (key, at, why) VALUES (?, ?, ?)').bind(key, nowIso(), why).run();
  return { ok: true };
}
