// コネクタ（MCP）の地図の action。Claude が作業の前に読む：全体 → 機能 → Issue の周辺（根拠つき）。
import type { Env } from './types.ts';
import { CATALOGS } from './catalogs.ts';
import { mapView, syncMap } from './workmap.ts';

type MapData = Extract<Awaited<ReturnType<typeof mapView>>, { catalog: true }>;
const ST = ['作っている', '落ち着いた', '止まっている'];
const KIND: Record<string, string> = { parent: '引き継ぎ元', child: '引き継ぎ先', closes: 'これで閉じた', ref: '番号で参照', candidate: '推測（候補・確定ではない）' };
const md = (d: string | null) => (d ? d.slice(5).replace('-', '/') : 'なし');

/** repo を決める（省略時は、カタログがあるリポジトリが1つならそれ） */
function repoOf(a: Record<string, unknown>) {
  const r = String(a.repo ?? '').trim();
  if (r) return r;
  const ks = Object.keys(CATALOGS);
  if (ks.length === 1) return ks[0];
  throw new Error(`repo を指定してください（地図があるのは ${ks.join('、')}）`);
}

/** 地図を読む。最後に GitHub から読んでから30分たっていれば、先に少し読み直す（失敗しても手元の分で答える） */
async function load(env: Env, a: Record<string, unknown>, span = 21): Promise<MapData> {
  const repo = repoOf(a);
  let v = await mapView(env, repo, span);
  if (!v.catalog) throw new Error(`${repo} には機能の一覧（カタログ）がありません`);
  const at = v.sync?.prs_at ? Date.parse(v.sync.prs_at) : 0;
  if (a.refresh || Date.now() - at > 30 * 60 * 1000) {
    try { await syncMap(env, repo, at ? 2 : 4); v = await mapView(env, repo, span); } catch { /* 手元の分で答える */ }
  }
  return v as MapData;
}

const fname = (d: MapData, id: string) => d.features.find(f => f.id === id)?.name ?? id;
const issueLine = (d: MapData, i: MapData['issues'][number]) =>
  `#${i.number} ${i.title}（${i.open ? `開いて ${md(i.created)}〜・最後に動いた ${md(i.updated)}` : `閉じた ${md(i.closed)}`}）${i.stale ? '［古くなっている候補］' : ''}　機能：${i.features.map(f => fname(d, f)).join('、') || 'なし'}`;

export async function mapAction(env: Env, action: string, a: Record<string, unknown>): Promise<string> {
  if (action === 'sync') {
    const repo = repoOf(a); let n = 0, done = false;
    for (let k = 0; k < 4 && !done; k++) { const x = await syncMap(env, repo, 4); n += x.prs; done = x.backfillDone; }
    return `${repo} を GitHub から読み直しました（PR ${n}件${done ? '・過去までさかのぼり済み' : '・さかのぼりの途中'}）。`;
  }
  const d = await load(env, a, Math.min(60, Math.max(7, Number(a.span) || 21)));
  const c = d.counts;
  if (action === 'map') {
    const L = [`■ ${d.repo} の地図（${md(d.today)} まで${d.days.length}日・PR ${c.prs}件）`,
      `作っている ${c.building}・落ち着いた ${c.settled}・止まっている ${c.stopped}／開いている Issue ${c.openIssues}（古くなっている候補 ${c.stale}）／どの機能にも当たらない作業 ${d.unmatched.length}／貯めているが画面なしのデータ ${c.unused}`, ''];
    let g = '';
    for (const f of d.features) {
      if (f.group !== g) { g = f.group; L.push(`【${g}】`); }
      const open = d.issues.filter(i => i.open && i.features.includes(f.id)).length;
      L.push(`- ${f.name}（id=${f.id}）：${ST[f.state]}・この期間 ${f.span}件・最後 ${md(f.last)}${open ? `・開いている Issue ${open}` : ''}`);
    }
    const stale = d.issues.filter(i => i.stale);
    if (stale.length) L.push('', '■ 古くなっている候補（つながる機能がすべて止まっていて、7日以上動いていない）', ...stale.map(i => '- ' + issueLine(d, i)));
    if (d.unmatched.length) L.push('', `■ どの機能にも当たらない作業（カタログに機能を足すかの材料）`, ...d.unmatched.slice(0, 10).map(p => `- #${p.n} ${md(p.day)} ${p.t}`));
    L.push('', '機能の中身は action="feature"（args: id）、Issue の周辺は action="issue"（args: n）。');
    return L.join('\n');
  }
  if (action === 'feature') {
    const q = String(a.id ?? a.name ?? '').trim();
    const f = d.features.find(x => x.id === q || x.name === q || x.name.startsWith(q));
    if (!f) throw new Error(`機能「${q}」はありません。action="map" で id を確かめてください`);
    const iss = d.issues.filter(i => i.features.includes(f.id));
    const L = [`■ ${f.name}（id=${f.id}・入口：${f.group}）：${ST[f.state]}`, f.desc,
      `使うデータ：${f.data.map(k => d.nodes[k]?.name ?? k).join('、') || 'なし'}`,
      `作業：この期間 ${f.span}件・これまで ${f.total}件・最後 ${md(f.last)}`, '', '■ 最近の作業'];
    for (const p of f.recent) {
      L.push(`- PR #${p.n} ${md(p.day)} ${p.t}`);
      if (p.report) L.push(`  確かめた決まり：${p.report.read.join('／') || 'なし'}`, `  自分で判断した所：${p.report.own.join('／') || 'なし'}`, `  足りなかった決まり：${p.report.lack.join('／') || 'なし'}`);
    }
    L.push('', `■ 開いている Issue（${iss.filter(i => i.open).length}）`, ...iss.filter(i => i.open).map(i => '- ' + issueLine(d, i)));
    const closed = iss.filter(i => !i.open);
    if (closed.length) L.push('', `■ 閉じた Issue（${closed.length}・新しい5件）`, ...closed.slice(0, 5).map(i => '- ' + issueLine(d, i)));
    return L.join('\n');
  }
  if (action === 'issue') {
    const n = Number(String(a.n ?? a.number ?? '').replace('#', ''));
    const i = d.issues.find(x => x.number === n);
    if (!i) throw new Error(`Issue #${n} は取り込まれていません（action="sync" で読み直せます）`);
    const L = [`■ ${issueLine(d, i)}`, `機能の決め方：${i.how || 'なし'}${i.nodes.length ? `／データ：${i.nodes.map(k => d.nodes[k]?.name ?? k).join('、')}` : ''}`, '', `■ つながり（${i.links.length}）`];
    for (const l of i.links) {
      L.push(`- [${KIND[l.kind]}] ${l.type === 'pr' ? 'PR' : 'Issue'} #${l.n} ${md(l.day)} ${l.title}${l.type === 'issue' ? (l.open ? '（開いている）' : '（閉じた）') : ''}`);
      for (const e of l.evidence) L.push(`    根拠：${e}`);
    }
    if (!i.links.length) L.push('- なし');
    L.push('', '推測（候補）は、同じ機能のファイルを変えた PR を並べただけで、確定ではありません。作業がこの Issue のものなら、PR に「#' + i.number + '」を書いてつながりを確かにしてください。');
    return L.join('\n');
  }
  if (action === 'issues') {
    const which = String(a.state ?? 'open');
    const xs = d.issues.filter(i => which === 'all' ? true : which === 'closed' ? !i.open : which === 'stale' ? i.stale : i.open)
      .sort((x, y) => Number(y.stale) - Number(x.stale) || y.updated.localeCompare(x.updated));
    return [`■ Issue（${which === 'all' ? 'すべて' : which === 'closed' ? '閉じた' : which === 'stale' ? '古くなっている候補' : '開いている'}・${xs.length}件）`, ...xs.slice(0, 40).map(i => '- ' + issueLine(d, i))].join('\n');
  }
  throw new Error(`知らない action です：${action}`);
}
