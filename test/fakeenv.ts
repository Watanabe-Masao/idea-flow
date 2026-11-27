// テスト用の D1 と Workers AI の代わり（node:sqlite と、文字の2文字組から作る簡易ベクトル）
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const conv = (v: unknown) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v === undefined ? null : v);

class Stmt {
  args: unknown[] = [];
  db: DatabaseSync; sql: string;
  constructor(db: DatabaseSync, sql: string) { this.db = db; this.sql = sql; }
  bind(...a: unknown[]) { const s = new Stmt(this.db, this.sql); s.args = a.map(conv); return s; }
  async all() { return { results: this.db.prepare(this.sql).all(...(this.args as never[])) }; }
  async first() { return this.db.prepare(this.sql).get(...(this.args as never[])) ?? null; }
  async run() { this.db.prepare(this.sql).run(...(this.args as never[])); return { success: true }; }
}

export function fakeEnv() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').sort()) db.exec(readFileSync('migrations/' + f, 'utf8'));
  const D1 = {
    prepare: (sql: string) => new Stmt(db, sql),
    // 本物の D1 と同じく、文ごとの結果（results）を返す（SELECT なら行、ほかは空）
    batch: async (ss: Stmt[]) => { const out: { results: unknown[]; success: boolean }[] = []; db.exec('BEGIN'); try { for (const s of ss) { const st = db.prepare(s.sql); out.push(/^\s*select/i.test(s.sql) ? { results: st.all(...(s.args as never[])), success: true } : (st.run(...(s.args as never[])), { results: [], success: true })); } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; },
  };
  const DIM = 128;
  const vec = (t: string) => {
    const v = new Array(DIM).fill(0);
    for (let i = 0; i < t.length - 1; i++) { let h = 0; for (const c of t.slice(i, i + 2)) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % DIM] += 1; }
    return v;
  };
  // 文を作るモデル：見出しの番号ごとに「要約:見出しの頭」を返す（要約の流れを確かめるため）
  const AI = { run: async (_m: string, inp: { text?: string[]; messages?: { content: string }[] }) => {
    if (inp.messages) {
      const u = inp.messages[inp.messages.length - 1].content;
      if (u.includes('"s"')) return { response: JSON.stringify({ s: '要約:' + u.slice(u.indexOf('「') + 1, u.indexOf('」')) }) };
      const out: Record<string, string> = {};
      for (const m of u.matchAll(/\[(\d+)\] 見出し：(.+)/g)) out[m[1]] = '要約:' + m[2];
      return { response: '答え：' + JSON.stringify(out) };
    }
    return { data: inp.text!.map(vec) };
  } };
  return { DB: D1, AI, MCP_TOKEN: 'tok', ADMIN_TOKEN: 'adm' } as never;
}
