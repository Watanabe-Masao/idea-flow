// 範囲の木（#10）。範囲に決まりの文書を付け、下の範囲へ引き継ぐ。例外で一部を外す。
// 変更はすべて変更リクエスト（ops）として出し、人が承認したときだけ反映する。Claude からの提案も同じ入口を通る。
import type { Env } from './types.ts';
import { newId, nowIso } from './util.ts';

export type ScopeRow = { id: string; repo: string; key: string; name: string; parent_id: string | null; note: string; created_at: string };
export type Op =
  | { op: 'add_scope'; key: string; name: string; parent?: string; note?: string }
  | { op: 'rename_scope'; key: string; name?: string; note?: string }
  | { op: 'move_scope'; key: string; parent: string }
  | { op: 'remove_scope'; key: string }
  | { op: 'attach'; scope: string; path: string }
  | { op: 'detach'; scope: string; path: string }
  | { op: 'add_exception'; scope: string; path: string; heading: string; why?: string }
  | { op: 'remove_exception'; scope: string; path: string; heading: string };

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;
const sid = (repo: string, key: string) => `${repo}|${key}`;

export async function scopeTree(env: Env, repo: string) {
  const scopes = (await env.DB.prepare('SELECT * FROM scopes WHERE repo = ? ORDER BY created_at').bind(repo).all<ScopeRow>()).results;
  const docs = (await env.DB.prepare('SELECT d.scope_id, d.path FROM scope_docs d JOIN scopes s ON s.id = d.scope_id WHERE s.repo = ?').bind(repo).all<{ scope_id: string; path: string }>()).results;
  const ex = (await env.DB.prepare('SELECT e.* FROM scope_exceptions e JOIN scopes s ON s.id = e.scope_id WHERE s.repo = ?').bind(repo).all<{ scope_id: string; path: string; heading: string; why: string }>()).results;
  return scopes.map(s => ({ ...s, docs: docs.filter(d => d.scope_id === s.id).map(d => d.path), exceptions: ex.filter(e => e.scope_id === s.id).map(e => ({ path: e.path, heading: e.heading, why: e.why })) }));
}
export type Tree = Awaited<ReturnType<typeof scopeTree>>;

/** 範囲までの道筋（根から） */
export function chain(tree: Tree, id: string) {
  const out: Tree = [];
  for (let s = tree.find(x => x.id === id); s; s = s.parent_id ? tree.find(x => x.id === s!.parent_id) : undefined) out.unshift(s);
  return out;
}

/** その範囲で効く文書と例外（上の範囲から引き継ぐ） */
export function effective(tree: Tree, id: string) {
  const c = chain(tree, id);
  const docs = new Map<string, string>(); // path → 付けた範囲の名前
  const exceptions: { path: string; heading: string; why: string; from: string }[] = [];
  for (const s of c) {
    for (const p of s.docs) if (!docs.has(p)) docs.set(p, s.name);
    for (const e of s.exceptions) exceptions.push({ ...e, from: s.name });
  }
  return { chain: c.map(s => s.name), docs: [...docs].map(([path, from]) => ({ path, from })), exceptions };
}

/** 決まりの単位（見出しの道筋つき）が、例外で外れるか */
export function excluded(exceptions: { path: string; heading: string }[], path: string, heading: string) {
  const segs = heading.split(' › ');
  return exceptions.some(e => e.path === path && (e.heading === '*' || segs.some(s => s.startsWith(e.heading))));
}

function check(op: Op) {
  const k = (v: unknown) => typeof v === 'string' && (v === 'root' || KEY_RE.test(v));
  switch (op.op) {
    case 'add_scope': if (!k(op.key) || op.key === 'root' || !String(op.name ?? '').trim() || (op.parent && !k(op.parent))) throw new Error(`範囲を足す：key（英小文字・数字）と名前が必要です（${op.key}）`); break;
    case 'rename_scope': case 'remove_scope': if (!k(op.key)) throw new Error('範囲の key が不正です'); if (op.op === 'remove_scope' && op.key === 'root') throw new Error('全体（root）は消せません'); break;
    case 'move_scope': if (!k(op.key) || !k(op.parent) || op.key === 'root') throw new Error('範囲を動かす：key と parent が必要です'); break;
    case 'attach': case 'detach': if (!k(op.scope) || !String(op.path ?? '').endsWith('.md')) throw new Error('文書を付ける・外す：scope と .md の path が必要です'); break;
    case 'add_exception': case 'remove_exception': if (!k(op.scope) || !String(op.path ?? '').endsWith('.md') || !String(op.heading ?? '').trim()) throw new Error('例外：scope・path・heading が必要です'); break;
    default: throw new Error(`知らない操作です：${(op as { op: string }).op}`);
  }
}

/** 変更リクエストを出す（人からも Claude からも）。まだ反映しない */
export async function propose(env: Env, repo: string, by: 'human' | 'ai', title: string, reason: string, ops: Op[]) {
  if (!Array.isArray(ops) || !ops.length || ops.length > 60) throw new Error('ops は1〜60件の配列で渡してください');
  ops.forEach(check);
  const id = newId('cr');
  await env.DB.prepare('INSERT INTO change_requests (id, repo, by, title, reason, ops, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, repo, by, String(title).slice(0, 120) || '範囲の変更', String(reason ?? '').slice(0, 2000), JSON.stringify(ops), nowIso()).run();
  return { id, preview: await preview(env, repo, ops) };
}

/** 反映したらどうなるか（範囲ごとに、効き始める文書・効かなくなる文書） */
export async function preview(env: Env, repo: string, ops: Op[]) {
  const before = await scopeTree(env, repo);
  const after = applyInMemory(repo, structuredClone(before), ops);
  return after.map(s => {
    const b = before.find(x => x.id === s.id) ? effective(before, s.id) : { docs: [], exceptions: [] as { path: string; heading: string }[] };
    const a = effective(after, s.id);
    const bp = new Set(b.docs.map(d => d.path)), ap = new Set(a.docs.map(d => d.path));
    const ex = (xs: { path: string; heading: string }[]) => new Set(xs.map(e => `${e.path}#${e.heading}`));
    const be = ex(b.exceptions), ae = ex(a.exceptions);
    return {
      scope: s.key, name: s.name, chain: a.chain, isNew: !before.some(x => x.id === s.id),
      starts: [...ap].filter(p => !bp.has(p)), stops: [...bp].filter(p => !ap.has(p)),
      newExceptions: [...ae].filter(e => !be.has(e)), droppedExceptions: [...be].filter(e => !ae.has(e)),
    };
  }).filter(r => r.isNew || r.starts.length || r.stops.length || r.newExceptions.length || r.droppedExceptions.length);
}

function applyInMemory(repo: string, tree: Tree, ops: Op[]): Tree {
  const find = (key: string) => tree.find(s => s.id === sid(repo, key));
  const ensureRoot = () => { if (!find('root')) tree.unshift({ id: sid(repo, 'root'), repo, key: 'root', name: repo.split('/')[1] + '（全体）', parent_id: null, note: '', created_at: '', docs: [], exceptions: [] }); };
  ensureRoot();
  for (const op of ops) {
    switch (op.op) {
      case 'add_scope': {
        if (find(op.key)) throw new Error(`範囲 ${op.key} はもうあります`);
        const parent = find(op.parent ?? 'root'); if (!parent) throw new Error(`親の範囲 ${op.parent} がありません`);
        tree.push({ id: sid(repo, op.key), repo, key: op.key, name: op.name.trim().slice(0, 40), parent_id: parent.id, note: (op.note ?? '').slice(0, 300), created_at: '', docs: [], exceptions: [] });
        break;
      }
      case 'rename_scope': { const s = find(op.key); if (!s) throw new Error(`範囲 ${op.key} がありません`); if (op.name) s.name = op.name.slice(0, 40); if (op.note !== undefined) s.note = op.note.slice(0, 300); break; }
      case 'move_scope': {
        const s = find(op.key), p = find(op.parent); if (!s || !p) throw new Error('範囲が見つかりません');
        if (chain(tree, p.id).some(x => x.id === s.id)) throw new Error('自分の下へは動かせません');
        s.parent_id = p.id; break;
      }
      case 'remove_scope': {
        const s = find(op.key); if (!s) throw new Error(`範囲 ${op.key} がありません`);
        if (tree.some(x => x.parent_id === s.id)) throw new Error(`範囲 ${op.key} の下に範囲があるので消せません`);
        tree.splice(tree.indexOf(s), 1); break;
      }
      case 'attach': { const s = find(op.scope); if (!s) throw new Error(`範囲 ${op.scope} がありません`); if (!s.docs.includes(op.path)) s.docs.push(op.path); break; }
      case 'detach': { const s = find(op.scope); if (!s) throw new Error(`範囲 ${op.scope} がありません`); s.docs = s.docs.filter(p => p !== op.path); break; }
      case 'add_exception': { const s = find(op.scope); if (!s) throw new Error(`範囲 ${op.scope} がありません`); if (!s.exceptions.some(e => e.path === op.path && e.heading === op.heading)) s.exceptions.push({ path: op.path, heading: op.heading.trim(), why: (op.why ?? '').slice(0, 300) }); break; }
      case 'remove_exception': { const s = find(op.scope); if (!s) throw new Error(`範囲 ${op.scope} がありません`); s.exceptions = s.exceptions.filter(e => !(e.path === op.path && e.heading === op.heading)); break; }
    }
  }
  return tree;
}

/** 承認：ops を反映する（全部まとめて。途中で失敗したら何も変えない） */
export async function decide(env: Env, id: string, decision: 'accept' | 'reject', note: string | null) {
  const cr = await env.DB.prepare('SELECT * FROM change_requests WHERE id = ?').bind(id).first<{ id: string; repo: string; ops: string; status: string; title: string }>();
  if (!cr) throw new Error('変更リクエストが見つかりません');
  if (cr.status !== 'pending') throw new Error('このリクエストはもう決まっています');
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('UPDATE change_requests SET status = ?, decided_at = ?, decided_note = ? WHERE id = ?').bind(decision === 'accept' ? 'accepted' : 'rejected', now, note, id),
    env.DB.prepare('INSERT INTO events (id, at, kind, subject, value, by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(newId('ev'), now, 'change_' + decision, id, cr.title, 'human', note),
  ];
  if (decision === 'accept') {
    const before = await scopeTree(env, cr.repo);
    const after = applyInMemory(cr.repo, structuredClone(before), JSON.parse(cr.ops));
    // 差分を書く：消えた範囲・付け外し・例外は、範囲ごとに消して入れ直す
    for (const s of before) if (!after.some(a => a.id === s.id)) stmts.push(env.DB.prepare('DELETE FROM scopes WHERE id = ?').bind(s.id));
    for (const s of after) {
      stmts.push(env.DB.prepare('INSERT INTO scopes (id, repo, key, name, parent_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id, note = excluded.note')
        .bind(s.id, s.repo, s.key, s.name, s.parent_id, s.note, s.created_at || now));
    }
    for (const s of [...before, ...after]) {
      stmts.push(env.DB.prepare('DELETE FROM scope_docs WHERE scope_id = ?').bind(s.id), env.DB.prepare('DELETE FROM scope_exceptions WHERE scope_id = ?').bind(s.id));
    }
    for (const s of after) {
      for (const p of s.docs) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO scope_docs (scope_id, path) VALUES (?, ?)').bind(s.id, p));
      for (const e of s.exceptions) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO scope_exceptions (scope_id, path, heading, why) VALUES (?, ?, ?, ?)').bind(s.id, e.path, e.heading, e.why));
    }
  }
  await env.DB.batch(stmts);
  return { ok: true, status: decision === 'accept' ? 'accepted' : 'rejected' };
}

export async function requests(env: Env, repo: string) {
  const rows = (await env.DB.prepare('SELECT * FROM change_requests WHERE repo = ? ORDER BY created_at DESC LIMIT 50').bind(repo).all<{ id: string; ops: string; status: string; title: string; by: string; reason: string; created_at: string }>()).results;
  const out = [];
  for (const r of rows) {
    const ops = JSON.parse(r.ops) as Op[];
    let pv: unknown = null, error: string | null = null;
    if (r.status === 'pending') { try { pv = await preview(env, repo, ops); } catch (e) { error = e instanceof Error ? e.message : String(e); } }
    out.push({ ...r, ops, preview: pv, error });
  }
  return out;
}

/** その範囲で Claude に渡す内容（契約）。文書と例外を、引き継ぎ元つきで */
export function contractText(repo: string, tree: Tree, id: string) {
  const e = effective(tree, id);
  const s = tree.find(x => x.id === id)!;
  const others = tree.filter(x => x.id !== id && !chain(tree, id).some(c => c.id === x.id) && !chain(tree, x.id).some(c => c.id === id)).map(x => x.name);
  const L = [`範囲：${e.chain.join(' › ')}（${repo}）`, s.note ? `説明：${s.note}` : '', '', '■ この範囲で守る決まり（文書）'];
  for (const d of e.docs) L.push(`・${d.path}（${d.from}から）`);
  if (!e.docs.length) L.push('・なし');
  if (e.exceptions.length) { L.push('', '■ この範囲では使わない部分（例外）'); for (const x of e.exceptions) L.push(`・${x.path} の「${x.heading === '*' ? '全体' : x.heading}」${x.why ? '：' + x.why : ''}（${x.from}で決めた）`); }
  if (others.length) L.push('', '■ 範囲外', `・${others.join('、')} の決まりは持ち込まない`);
  L.push('・決まりでまかなえないことが出たら、作らずに「不足」として伝える');
  return L.filter((l, i) => l !== '' || i > 1).join('\n');
}
