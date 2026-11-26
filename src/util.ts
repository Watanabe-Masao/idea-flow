export const nowIso = () => new Date().toISOString();

export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const errorJson = (message: string, status = 400) => json({ error: message }, status);

/** 日本時間の日付（YYYY-MM-DD） */
export function jstDay(iso: string): string {
  const t = new Date(iso).getTime() + 9 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 文字列の長さに依存しない比較（合言葉の照合用） */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** コミットの1行目から PR 番号を取り出す（squash の '(#518)' と、merge の 'Merge pull request #283'） */
export function prNumberOf(message: string): number | null {
  const m = message.match(/\(#(\d+)\)\s*$/) || message.match(/^Merge pull request #(\d+)/);
  return m ? Number(m[1]) : null;
}

/** 本文に出てくる参照：GitHub の '#数字' と Linear の 'WAT-12' のような識別子 */
export function refsOf(text: string, teamKey: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?<![\w/])#(\d+)\b/g)) out.add('#' + m[1]);
  const re = new RegExp(`\\b${teamKey}-(\\d+)\\b`, 'g');
  for (const m of text.matchAll(re)) out.add(`${teamKey}-${m[1]}`);
  return [...out];
}

/** 課題の題名の先頭の '#369' から GitHub の番号を取り出す */
export function ghNumberOfTitle(title: string): number | null {
  const m = title.match(/^#(\d+)\b/);
  return m ? Number(m[1]) : null;
}

/** 埋め込み用の文：PR 番号などの記号を落とし、長さをそろえる */
export function embedText(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join('\n')
    .replace(/\(#\d+\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

/**
 * 複数行をまとめて INSERT する文を作る（D1 は 1文あたりの値が 100 個まで、
 * 1回の実行で使える文の数にも上限があるので、行をまとめて文の数を減らす）。
 * head 例: 'INSERT INTO t (a, b) VALUES'  tail 例: 'ON CONFLICT(a) DO UPDATE SET b=excluded.b'
 */
export function bulkInsert(db: D1Database, head: string, nCols: number, rows: unknown[][], tail = ''): D1PreparedStatement[] {
  const per = Math.max(1, Math.floor(100 / nCols));
  const out: D1PreparedStatement[] = [];
  const ph = '(' + Array(nCols).fill('?').join(', ') + ')';
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    out.push(db.prepare(`${head} ${chunk.map(() => ph).join(', ')} ${tail}`).bind(...chunk.flat()));
  }
  return out;
}
