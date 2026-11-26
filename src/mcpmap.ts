// コネクタ（MCP）の地図の action。Claude が作業の前に読む：全体 → 機能 → Issue の周辺（根拠つき）。
import type { Env } from './types.ts';
import { CATALOGS } from './catalogs.ts';
import { catalogOf, mapView, syncMap } from './workmap.ts';
import { selfCheck, WRITING_RULES } from './selfcheck.ts';

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
  if (action === 'rules') {
    const repo = repoOf(a), cat = catalogOf(repo);
    if (!cat) throw new Error(`${repo} には機能の一覧（カタログ）がありません`);
    let g = '';
    const L = [WRITING_RULES, '', `■ ${repo} で使える機能名（PR・Issue の題の頭と「機能：」に使う）`];
    for (const f of cat.features) { if (f.group !== g) { g = f.group; L.push(`【${g}】`); } L.push(`- ${f.name}${f.aliases.length ? `（別名：${f.aliases.join('・')}）` : ''}：${f.desc}`); }
    L.push('', '出す前に action="check"（kind・title・body・files）、出したあとに action="check"（pr か issue の番号）で自己チェックする。');
    return L.join('\n');
  }
  if (action === 'check') return await selfCheck(env, repoOf(a), a);
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
    const w = d.writing;
    L.push('', `■ 書き方の守り具合（この期間の PR ${w.prs}件・立てた Issue ${w.issues}件）`,
      `PR：題の頭に機能名 ${w.prTitle}/${w.prs}・Issue の番号 ${w.prLinked}/${w.prs}・申告の3つの見出し ${w.prReport}/${w.prs}`,
      `Issue：「機能：」${w.issueFeature}/${w.issues}・「閉じる条件：」${w.issueClose}/${w.issues}`,
      ...w.misses.slice(0, 8).map(m => `- ${m.type === 'pr' ? 'PR' : 'Issue'} #${m.n} ${m.t}：足りない ${m.miss.join('・')}`));
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
  if (action === 'review') {
    // 週1回の見直し：人が決めることだけを、決めやすい順に並べる（docs/operation.md）
    const L = [`■ ${d.repo} の週の見直し（${md(d.today)}・直近${d.days.length}日）`, '決めるのは人です。それぞれ「案」を添えています。', ''];
    const stale = d.issues.filter(i => i.stale);
    L.push(`1. 古くなっている候補の Issue（${stale.length}）：閉じる／その機能の「残り」に寄せる／そのまま、を決める`, ...stale.map(i => '   - ' + issueLine(d, i)));
    const dirs = new Map<string, number[]>();
    for (const p of d.unmatched) for (const f of new Set(p.files.map(x => x.split('/').slice(0, 2).join('/')))) dirs.set(f, [...(dirs.get(f) ?? []), p.n]);
    L.push('', `2. どの機能にも当たらない作業（${d.unmatched.length}）：カタログに機能を足すか、今のどれかの機能に含めるかを決める`,
      ...[...dirs].sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([k, ns]) => `   - ${k}（${ns.length}件：${ns.slice(0, 5).map(n => '#' + n).join(' ')}）`));
    const w = d.writing, pct = (k: number, n: number) => (n ? Math.round(k / n * 100) + '%' : '—');
    L.push('', `3. 書き方の守り具合：PR の題 ${pct(w.prTitle, w.prs)}・Issue の番号 ${pct(w.prLinked, w.prs)}・申告 ${pct(w.prReport, w.prs)}／Issue の「機能：」${pct(w.issueFeature, w.issues)}・「閉じる条件：」${pct(w.issueClose, w.issues)}`,
      '   足りないもの（新しい順）：', ...w.misses.slice(0, 6).map(m => `   - ${m.type === 'pr' ? 'PR' : 'Issue'} #${m.n} ${m.t}：${m.miss.join('・')}`));
    L.push('', `4. 申告の「足りなかった決まり」（${d.lacks.length}）：決まりに足すか、一回限りかを分ける`, ...d.lacks.slice(0, 10).map(x => `   - PR #${x.n}（${md(x.day)}）：${x.t}`));
    const stoppedOpen = d.features.filter(f => f.state === 2 && d.issues.some(i => i.open && i.features.includes(f.id)));
    L.push('', `5. 止まっているのに開いた Issue がある機能（${stoppedOpen.length}）：続けるか、いったん閉じるか`, ...stoppedOpen.map(f => `   - ${f.name}：開いている Issue ${d.issues.filter(i => i.open && i.features.includes(f.id)).map(i => '#' + i.number).join(' ')}`));
    const unused = Object.entries(d.nodes).filter(([, n]) => n.note === '画面なし');
    if (unused.length) L.push('', `6. 貯めているのに画面で使っていないデータ（${unused.length}）：使う予定があるか、止めるか`, ...unused.map(([, n]) => `   - ${n.name}`));
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
