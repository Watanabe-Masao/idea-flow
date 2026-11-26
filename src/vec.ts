// 生成 AI を使わない、確実な計算だけの部分。テストしやすいよう D1 や Workers AI に依存しない。

export type Vec = Float32Array;

export function normalize(v: ArrayLike<number>): Vec {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** 正規化済みのベクトル同士のコサイン類似度 */
export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function centroid(vs: Vec[]): Vec | null {
  if (!vs.length) return null;
  const out = new Float32Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return normalize(out);
}

export const toBlob = (v: Vec): ArrayBuffer => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
export const fromBlob = (b: ArrayBuffer | Uint8Array | number[]): Vec => {
  if (Array.isArray(b)) return new Float32Array(new Uint8Array(b).buffer);
  if (b instanceof Uint8Array) return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return new Float32Array(b);
};

export type Ranked = { id: string; score: number }[];

/** 候補を近い順に上位 k 件 */
export function topK(q: Vec, items: Map<string, Vec>, k = 3): Ranked {
  const out: Ranked = [];
  for (const [id, v] of items) out.push({ id, score: dot(q, v) });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, k);
}

/** 近さがしきい値以上のものをつないだ連結成分（小さい成分は捨てる） */
export function threshClusters(ids: string[], vecs: Vec[], link: number, minSize: number): string[][] {
  const n = ids.length, parent = ids.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (dot(vecs[i], vecs[j]) >= link) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
  }
  const groups = new Map<number, string[]>();
  ids.forEach((id, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(id); });
  return [...groups.values()].filter(g => g.length >= minSize).sort((a, b) => b.length - a.length);
}

/** 塊の中で、ほかの全員にいちばん近いもの（代表） */
export function medoid(members: Vec[]): number {
  let best = 0, bestS = -Infinity;
  members.forEach((v, i) => {
    let s = 0;
    for (const w of members) s += dot(v, w);
    if (s > bestS) { bestS = s; best = i; }
  });
  return best;
}

export type Decision = { level: 'auto' | 'pending' | 'none'; target: string | null; score: number };

/** 近さとしきい値から、自動・確認待ち・該当なしを決める */
export function decide(top: Ranked, auto: number, ask: number): Decision {
  const t = top[0];
  if (!t) return { level: 'none', target: null, score: 0 };
  if (t.score >= auto) return { level: 'auto', target: t.id, score: t.score };
  if (t.score >= ask) return { level: 'pending', target: t.id, score: t.score };
  return { level: 'none', target: null, score: t.score };
}

/**
 * 答え合わせ：正解が分かっている組（番号で確定したコミット）について、
 * しきい値ごとの「当たった割合」と「カバーできた割合」を出す。
 */
export function sweep(pairs: { score: number; correct: boolean }[], from = 0.4, to = 0.95, step = 0.02) {
  const rows: { threshold: number; covered: number; coverage: number; precision: number }[] = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    const kept = pairs.filter(p => p.score >= t);
    const ok = kept.filter(p => p.correct).length;
    rows.push({
      threshold: Math.round(t * 100) / 100,
      covered: kept.length,
      coverage: pairs.length ? kept.length / pairs.length : 0,
      precision: kept.length ? ok / kept.length : 0,
    });
  }
  return rows;
}
