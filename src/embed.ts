import type { Env } from './types.ts';
import { bulkInsert, embedText, nowIso, sha256 } from './util.ts';
import { fromBlob, normalize, toBlob, type Vec } from './vec.ts';

export const MODEL = '@cf/baai/bge-m3';
const BATCH = 50;

/**
 * Workers AI の bge-m3 で埋め込みを作る。
 * 返り値の形が版によって違う可能性があるので、data / response のどちらでも読めるようにしておく。
 */
export async function embedMany(env: Env, texts: string[]): Promise<Vec[]> {
  const out: Vec[] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await env.AI.run(MODEL as Parameters<Ai['run']>[0], { text: batch } as never) as unknown as
      { data?: number[][]; response?: number[][]; shape?: number[] };
    const rows = res.data ?? res.response;
    if (!Array.isArray(rows) || rows.length !== batch.length || !Array.isArray(rows[0])) {
      throw new Error(`bge-m3 の返り値の形が想定と違います: ${JSON.stringify(res).slice(0, 200)}`);
    }
    for (const r of rows) out.push(normalize(r));
  }
  return out;
}

export type EmbedKind = 'issue' | 'commit' | 'rule';
export type Item = { kind: EmbedKind; ref: string; text: string };

/** 文が変わったものだけ埋め込みを作り直す */
export async function refreshEmbeddings(env: Env): Promise<{ embedded: number; skipped: number }> {
  const issues = await env.DB.prepare('SELECT id, title, description FROM issues').all<{ id: string; title: string; description: string | null }>();
  const commits = await env.DB.prepare('SELECT sha, message, body FROM commits WHERE is_merge = 0').all<{ sha: string; message: string; body: string }>();
  const items: Item[] = [
    ...issues.results.map(i => ({ kind: 'issue' as const, ref: i.id, text: embedText(i.title.replace(/^#\d+\s*/, ''), i.description?.slice(0, 300)) })),
    ...commits.results.map(c => ({ kind: 'commit' as const, ref: c.sha, text: embedText(c.message, c.body.split('\n').slice(0, 3).join(' ')) })),
  ];
  const embedded = await upsertEmbeddings(env, items);
  return { embedded, skipped: items.length - embedded };
}

/** 文が変わったものだけ埋め込みを作り直して保存する。作った件数を返す */
export async function upsertEmbeddings(env: Env, items: Item[]): Promise<number> {
  if (!items.length) return 0;
  const kinds = [...new Set(items.map(i => i.kind))];
  const have = await env.DB.prepare(`SELECT kind, ref, text_hash FROM embeddings WHERE model = ? AND kind IN (${kinds.map(() => '?').join(',')})`).bind(MODEL, ...kinds).all<{ kind: string; ref: string; text_hash: string }>();
  const known = new Map(have.results.map(r => [`${r.kind}|${r.ref}`, r.text_hash]));
  const todo: (Item & { hash: string })[] = [];
  for (const it of items) {
    const hash = (await sha256(it.text)).slice(0, 16);
    if (known.get(`${it.kind}|${it.ref}`) !== hash) todo.push({ ...it, hash });
  }
  const now = nowIso();
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const vecs = await embedMany(env, chunk.map(c => c.text || '（空）'));
    await env.DB.batch(bulkInsert(env.DB, 'INSERT INTO embeddings (kind, ref, model, dim, vec, text_hash, updated_at) VALUES', 7,
      chunk.map((c, k) => [c.kind, c.ref, MODEL, vecs[k].length, toBlob(vecs[k]), c.hash, now]),
      'ON CONFLICT(kind, ref) DO UPDATE SET model=excluded.model, dim=excluded.dim, vec=excluded.vec, text_hash=excluded.text_hash, updated_at=excluded.updated_at'));
  }
  return todo.length;
}

export async function loadVectors(env: Env, kind: EmbedKind): Promise<Map<string, Vec>> {
  const rows = await env.DB.prepare('SELECT ref, vec FROM embeddings WHERE kind = ? AND model = ?').bind(kind, MODEL).all<{ ref: string; vec: ArrayBuffer }>();
  return new Map(rows.results.map(r => [r.ref, fromBlob(r.vec)]));
}
