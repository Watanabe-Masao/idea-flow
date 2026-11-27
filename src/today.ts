// 「今日」の画面（#69）：開いたら最初に出る。人が決めることだけを並べ、片づけたものは消す。
// 決めるのは人。この画面は GitHub に書かない（閉じる・Issue を立てるのは、人が GitHub で）
import type { Env } from './types.ts';
import { mapView, relabel, syncMap } from './workmap.ts';

const H = (t: string) => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
const nowIso = () => new Date().toISOString();

export type TodayItem = { key: string; kind: 'own' | 'lack' | 'close' | 'stale' | 'unmatched' | 'conflict' | 'topic'; title: string; sub: string; url?: string; n?: number; links?: { n: number; t: string; url: string; kind: string }[]; own?: string[]; lack?: string[] };

export async function todayView(env: Env, repo: string) {
  let v = await mapView(env, repo, 21);
  // 最後に GitHub から読んでから30分たっていれば、先に読み直す（コネクタの map と同じ。失敗しても手元の分で答える）
  const at = v.sync?.prs_at ? Date.parse(v.sync.prs_at) : 0;
  if (v.catalog && Date.now() - at > 30 * 60e3) {
    try { const u = await syncMap(env, repo, { mode: 'update' }); for (let k = 0; k < 4 && !u.busy && !(await env.DB.prepare('SELECT pr_done FROM map_sync WHERE repo = ?').bind(repo).first<{ pr_done: number }>())?.pr_done; k++) await syncMap(env, repo, { mode: 'backfill', pages: 4 }); v = await mapView(env, repo, 21); } catch { /* 手元の分で */ }
  }
  if (!v.catalog) return { repo, catalog: false as const };
  const [marks, seen, conf] = await env.DB.batch([
    env.DB.prepare('SELECT key FROM today_marks WHERE repo = ?').bind(repo),
    env.DB.prepare('SELECT prev, last FROM today_seen WHERE repo = ?').bind(repo),
    env.DB.prepare(`SELECT f.key, ia.text AS a, ib.text AS b, da.path AS pa, db.path AS pb FROM rule_findings f
      JOIN rule_items ia ON ia.id = f.a JOIN rule_docs da ON da.id = ia.doc LEFT JOIN rule_items ib ON ib.id = f.b LEFT JOIN rule_docs db ON db.id = ib.doc
      WHERE da.repo = ? AND f.kind = 'conflict' AND f.key NOT IN (SELECT key FROM rule_dismissed) ORDER BY f.score DESC LIMIT 5`).bind(repo),
  ]);
  const done = new Set((marks.results as { key: string }[]).map(r => r.key));
  const sn = (seen.results as { prev: string | null; last: string | null }[])[0];
  const since = (sn?.prev ?? new Date(Date.now() - 3 * 864e5).toISOString()).slice(0, 10);
  const items: TodayItem[] = [];
  // 判断の受信箱：直近7日にマージした PR の「自分で判断した所」と「足りなかった決まり」。PR ごとに1枚（1つずつだと多すぎる）
  const from7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const byPr = new Map<number, { title: string; url: string; own: string[]; lack: string[] }>();
  for (const o of v.owns.filter(o => o.day >= from7)) { const x = byPr.get(o.n) ?? { title: o.title, url: o.url, own: [], lack: [] }; x.own.push(o.t); byPr.set(o.n, x); }
  for (const l of v.lacks.filter(l => l.day >= from7)) { const x = byPr.get(l.n); if (x) x.lack.push(l.t); else { const f = v.features.flatMap(f => f.recent).find(r => r.n === l.n); byPr.set(l.n, { title: f?.t ?? '', url: f?.url ?? `https://github.com/${repo}/pull/${l.n}`, own: [], lack: [l.t] }); } }
  for (const [n, x] of [...byPr].sort((a, b) => b[0] - a[0])) items.push({ key: `pr:${n}:${H([...x.own, ...x.lack].join('|'))}`, kind: x.own.length ? 'own' : 'lack', title: `PR #${n} ${x.title}`, sub: '', url: x.url, n, own: x.own, lack: x.lack });
  // 閉じてよさそうな Issue：開いていて、番号で書かれた PR がマージ済みのもの（閉じるかは人が決める）。Issue が動いたらまた出す
  for (const i of v.issues.filter(i => i.open)) {
    const prs = i.links.filter(l => l.type === 'pr' && l.kind !== 'candidate');
    if (!prs.length) continue;
    items.push({ key: `close:${i.number}:${i.updated}`, kind: 'close', title: `#${i.number} ${i.title}`, sub: i.cond ? `閉じる条件：${i.cond}` : '「閉じる条件：」が書かれていません', url: i.url || `https://github.com/${repo}/issues/${i.number}`, n: i.number,
      links: prs.slice(0, 5).map(l => ({ n: l.n, t: l.title, url: l.url, kind: l.kind })) });
  }
  // 気になる所
  for (const i of v.issues.filter(i => i.stale)) items.push({ key: `stale:${i.number}:${i.updated}`, kind: 'stale', title: `#${i.number} ${i.title}`, sub: `つながる機能に、7日以上マージがない（最後に動いた ${i.updated}）`, url: i.url || `https://github.com/${repo}/issues/${i.number}`, n: i.number });
  for (const u of v.unmatched) items.push({ key: `unmatched:${u.n}`, kind: 'unmatched', title: `PR #${u.n} ${u.t}`, sub: `どの機能にも当たらない（${u.files.slice(0, 2).join('、') || 'ファイルなし'}）。カタログに足すか`, url: u.url, n: u.n });
  for (const c of conf.results as { key: string; a: string; b: string | null; pa: string; pb: string | null }[]) items.push({ key: `conflict:${c.key}`, kind: 'conflict', title: `${c.a}${c.b ? ` ⇔ ${c.b}` : ''}`, sub: `文書の食い違いの候補（${c.pa}${c.pb && c.pb !== c.pa ? `・${c.pb}` : ''}）` });
  for (const t of v.topics.filter(t => !t.feature && t.first >= since)) items.push({ key: `topic:${t.name}`, kind: 'topic', title: t.name, sub: `新しい話題（Issue ${t.issues.length}件・PR ${t.prs.length}件）。機能に上げるか・別名にまとめるか・話題のままか` });
  // 前回から変わったこと：機能ごとに1行
  // いちばん新しい題：日は新しい方から、同じ日の中はマージの新しい順（byDay は新しい順に並んでいる）
  const changes = v.features.map(f => { const ks = v.days.map((d, k) => k).filter(k => v.days[k] >= since && f.byDay[k].length); const n = ks.reduce((a, k) => a + f.byDay[k].length, 0); return n ? { id: f.id, name: f.name, n, last: f.byDay[ks.at(-1)!][0].t } : null; }).filter(Boolean);
  // プロジェクト（#77）では、番号を「名前#番号」に戻して返す（印のキーは数のまま）
  return { repo, catalog: true as const, since, items: items.filter(x => !done.has(x.key)).map(x => ({ ...relabel({ ...x, key: '' }, v.names), key: x.key })), changes: relabel(changes, v.names), decided: done.size };
}

/** 人が片づけた（それでいい・決まりにする・違う・まだ）。消すのではなく、印を残す */
export async function markToday(env: Env, repo: string, key: string, decision: string) {
  if (!repo || !key || !/^(ok|rule|no|later|done)$/.test(decision)) throw new Error('repo・key・decision（ok／rule／no／later／done）を渡してください');
  await env.DB.prepare('INSERT OR REPLACE INTO today_marks (repo, key, decision, at) VALUES (?, ?, ?, ?)').bind(repo, key, decision, nowIso()).run();
  return { ok: true };
}

/** 開いた印。前に開いてから1時間たっていれば、「前回」を今回の前の時刻に進める */
export async function seenToday(env: Env, repo: string) {
  const r = await env.DB.prepare('SELECT prev, last FROM today_seen WHERE repo = ?').bind(repo).first<{ prev: string | null; last: string | null }>();
  const now = nowIso();
  if (!r) await env.DB.prepare('INSERT INTO today_seen (repo, prev, last) VALUES (?, NULL, ?)').bind(repo, now).run();
  else if (!r.last || Date.parse(now) - Date.parse(r.last) > 3600e3) await env.DB.prepare('UPDATE today_seen SET prev = last, last = ? WHERE repo = ?').bind(now, repo).run();
  return { ok: true };
}
