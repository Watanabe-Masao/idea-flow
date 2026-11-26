// 要約：文書・見出し・範囲を1行で。中身が変わったときだけ作り直す（ハッシュで見分ける）。
// 作るのは Workers AI。失敗したら、先頭の文で代用する（by = 'lead'）。要約は道案内で、正しいのは原文。
import type { Env } from './types.ts';
import { nowIso, sha256 } from './util.ts';
import { scopeTree } from './scopes.ts';

export const SUM_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const VER = 'v1'; // 作り方を変えたら上げる（全部作り直しになる）
const CHUNK = 14;

/** 先頭の文（太字の頭があればそれ）。AI が使えないときの代わり */
export function leadOf(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/^\*\*(.+?)\*\*/);
  let r = m ? m[1] : t.replace(/\*\*|`/g, '').split(/。|：|(?<=\.)\s/)[0];
  r = r.replace(/[。：:]$/, '');
  return r.length > 40 ? r.slice(0, 39) + '…' : r;
}

/** AI の返事から JSON を取り出す */
export function parseJsonLoose(s: string): Record<string, string> | null {
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const j = JSON.parse(s.slice(a, b + 1)); return j && typeof j === 'object' ? j : null; } catch { return null; }
}

async function ask(env: Env, system: string, user: string): Promise<Record<string, string> | null> {
  try {
    const r = await env.AI.run(SUM_MODEL as never, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 1200, temperature: 0.2 } as never) as { response?: string | object };
    const txt = typeof r?.response === 'string' ? r.response : JSON.stringify(r?.response ?? '');
    return parseJsonLoose(txt);
  } catch { return null; }
}

const SYS = 'あなたは、ソフトウェアの開発で使う「決まりの文書」を要約します。やさしい日本語で、中身に書いてあることだけを短くまとめます。推測や付け足しはしません。返すのは JSON だけです。';
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + '…' : t);

type Unit = { key: string; hash: string; label: string; text: string; lead: string };

async function saved(env: Env, keys: string[]) {
  const m = new Map<string, { hash: string; text: string; by: string }>();
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const rows = (await env.DB.prepare(`SELECT key, hash, text, by FROM rule_summaries WHERE key IN (${part.map(() => '?').join(',')})`).bind(...part).all<{ key: string; hash: string; text: string; by: string }>()).results;
    for (const r of rows) m.set(r.key, r);
  }
  return m;
}
async function put(env: Env, rows: { key: string; hash: string; text: string; by: string }[]) {
  if (!rows.length) return;
  const now = nowIso();
  await env.DB.batch(rows.map(r => env.DB.prepare('INSERT OR REPLACE INTO rule_summaries (key, hash, text, by, at) VALUES (?, ?, ?, ?, ?)').bind(r.key, r.hash, r.text.slice(0, 200), r.by, now)));
}

/** 作り直しが要るもの（見出し → 文書 → 範囲 の順。上が済まないと下は作れない） */
async function work(env: Env, repo: string) {
  const docs = (await env.DB.prepare('SELECT id, path, title, external FROM rule_docs WHERE repo = ? ORDER BY path').bind(repo).all<{ id: string; path: string; title: string | null; external: number }>()).results;
  const items = (await env.DB.prepare('SELECT i.doc, i.heading, i.text FROM rule_items i JOIN rule_docs d ON d.id = i.doc WHERE d.repo = ? ORDER BY i.doc, i.n').bind(repo).all<{ doc: string; heading: string; text: string }>()).results;
  const heads: (Unit & { doc: string })[] = [];
  for (const d of docs) {
    const by = new Map<string, string[]>();
    for (const it of items) if (it.doc === d.id) (by.get(it.heading) ?? by.set(it.heading, []).get(it.heading)!).push(it.text);
    for (const [h, ts] of by) {
      const text = ts.join('\n');
      heads.push({ doc: d.id, key: `head|${d.id}|${h}`, hash: (await sha256(VER + h + text)).slice(0, 16), label: h || '（見出しの前）', text, lead: leadOf(ts[0]) });
    }
  }
  const have = await saved(env, [...heads.map(h => h.key), ...docs.map(d => `doc|${d.id}`)]);
  const headText = (k: string) => have.get(k)?.text ?? '';
  const docUnits: (Unit & { doc: string })[] = [];
  for (const d of docs) {
    const hs = heads.filter(h => h.doc === d.id);
    const text = hs.map(h => `${h.label}：${headText(h.key) || h.lead}`).join('\n');
    docUnits.push({ doc: d.id, key: `doc|${d.id}`, hash: (await sha256(VER + (d.title ?? '') + hs.map(h => h.hash).join())).slice(0, 16), label: d.title ?? d.path, text, lead: leadOf(items.find(i => i.doc === d.id)?.text ?? d.path) });
  }
  return { docs, heads: heads.filter(h => have.get(h.key)?.hash !== h.hash), docUnits: docUnits.filter(u => have.get(u.key)?.hash !== u.hash), headsAll: heads };
}

/**
 * 要約を少しずつ作る（1回の呼び出しで AI を最大 budget 回）。画面は remaining が 0 になるまで呼ぶ。
 * 見出し → 文書 → 範囲 の順に作る。
 */
export async function summarizeStep(env: Env, repo: string, budget = 4) {
  const w = await work(env, repo);
  let calls = 0, done = 0;
  // 見出し：文書ごとに、まとめて1回で
  const byDoc = new Map<string, typeof w.heads>();
  for (const h of w.heads) (byDoc.get(h.doc) ?? byDoc.set(h.doc, []).get(h.doc)!).push(h);
  for (const [docId, hs] of byDoc) {
    const title = w.docs.find(d => d.id === docId)?.title ?? '';
    for (let i = 0; i < hs.length && calls < budget; i += CHUNK) {
      const part = hs.slice(i, i + CHUNK);
      calls++;
      const j = await ask(env, SYS, `文書「${title}」の見出しごとの決まりです。見出しごとに、何を決めているかを1行（40字以内）にまとめてください。\n\n${part.map((h, k) => `[${k}] 見出し：${h.label}\n${clip(h.text, 700)}`).join('\n\n')}\n\n返す形：{"0":"要約","1":"要約",...}`);
      await put(env, part.map((h, k) => { const t = j?.[String(k)]; return typeof t === 'string' && t.trim() ? { key: h.key, hash: h.hash, text: t.trim(), by: 'ai' } : { key: h.key, hash: h.hash, text: h.lead, by: 'lead' }; }));
      done += part.length;
    }
    if (calls >= budget) break;
  }
  // 文書：見出しが全部済んでから
  if (calls < budget && done >= w.heads.length) {
    const again = await work(env, repo);
    for (const u of again.docUnits) {
      if (calls >= budget) break;
      calls++;
      const j = await ask(env, SYS, `文書「${u.label}」の見出しと、その要約です。この文書が何についての決まりかを、1〜2文（60字以内）でまとめてください。\n\n${clip(u.text, 3000)}\n\n返す形：{"s":"要約"}`);
      const t = j?.s;
      await put(env, [typeof t === 'string' && t.trim() ? { key: u.key, hash: u.hash, text: t.trim(), by: 'ai' } : { key: u.key, hash: u.hash, text: u.lead, by: 'lead' }]);
      done++;
    }
  }
  // 範囲：文書の要約がそろってから
  const after = await work(env, repo);
  if (!after.heads.length && !after.docUnits.length) {
    for (const u of await scopeWork(env, repo)) {
      if (calls >= budget) break;
      calls++;
      const j = await ask(env, SYS, `「${u.label}」という範囲で使う決まりの文書と、その要約です。この範囲で守ることを1文（50字以内）でまとめてください。\n\n${clip(u.text, 3000)}\n\n返す形：{"s":"要約"}`);
      const t = j?.s;
      await put(env, [typeof t === 'string' && t.trim() ? { key: u.key, hash: u.hash, text: t.trim(), by: 'ai' } : { key: u.key, hash: u.hash, text: u.lead, by: 'lead' }]);
      done++;
    }
  }
  const left = await work(env, repo);
  return { done, calls, remaining: left.heads.length + left.docUnits.length + (await scopeWork(env, repo)).length };
}

/** 範囲の要約：付けた文書（上から引き継ぐものは除く。その範囲の特徴を言うため）の要約から */
async function scopeWork(env: Env, repo: string) {
  const tree = await scopeTree(env, repo);
  const docs = (await env.DB.prepare('SELECT id, path, title FROM rule_docs WHERE repo = ?').bind(repo).all<{ id: string; path: string; title: string | null }>()).results;
  const have = await saved(env, [...docs.map(d => `doc|${d.id}`), ...tree.map(s => `scope|${s.id}`)]);
  const out: Unit[] = [];
  for (const s of tree) {
    if (!s.docs.length) continue;
    const lines = s.docs.map(p => { const d = docs.find(x => x.path === p); return `${d?.title ?? p}：${d ? have.get(`doc|${d.id}`)?.text ?? '' : ''}`; });
    const text = (s.note ? `説明：${s.note}\n` : '') + lines.join('\n');
    const hash = (await sha256(VER + s.name + text)).slice(0, 16);
    if (have.get(`scope|${s.id}`)?.hash !== hash) out.push({ key: `scope|${s.id}`, hash, label: s.name, text, lead: s.note || lines[0].replace(/：$/, '') });
  }
  return out;
}

/** 画面用：要約を読む（文書・見出し・範囲） */
export async function summariesOf(env: Env, keys: string[]) {
  const m = await saved(env, keys);
  return Object.fromEntries([...m].map(([k, v]) => [k, { text: v.text, by: v.by }]));
}
