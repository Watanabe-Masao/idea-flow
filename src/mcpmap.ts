// コネクタ（MCP）の地図の action。Claude が作業の前に読む：全体 → 機能 → Issue の周辺（根拠つき）。
import type { Env } from './types.ts';
import { CATALOGS } from './catalogs.ts';
import { catalogOf, mapView, membersOf, relabel, shortOf, syncMap } from './workmap.ts';
import { selfCheck, WRITING_RULES } from './selfcheck.ts';

type MapData = Extract<Awaited<ReturnType<typeof mapView>>, { catalog: true }> & { took: number };
const ST = ['直近4日に3件以上マージ', '直近7日にマージあり', '直近7日マージなし'];
const KIND: Record<string, string> = { parent: '親子（親）', child: '親子（子）', from: '引き継ぎ元（本文から）', to: '引き継ぎ先（本文から）', closes: 'これで閉じた', ref: '番号で参照', candidate: '推測（候補・確定ではない）' };
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
  let t0 = Date.now(), v = await mapView(env, repo, span), took = Date.now() - t0;
  if (!v.catalog) throw new Error(`${repo} には機能の一覧（カタログ）がありません`);
  const at = v.sync?.prs_at ? Date.parse(v.sync.prs_at) : 0;
  if (a.refresh || Date.now() - at > 30 * 60 * 1000) {
    try { const u = await syncMap(env, repo, { mode: 'update' }); if (!u.busy && !u.backfillDone) await syncMap(env, repo, { mode: 'backfill', pages: 2 }); t0 = Date.now(); v = await mapView(env, repo, span); took = Date.now() - t0; } catch { /* 手元の分で答える */ }
  }
  return { ...v, took } as MapData; // took：地図の計算にかかった時間（#44 の計測）
}

const fname = (d: MapData, id: string) => d.features.find(f => f.id === id)?.name ?? id;
const issueLine = (d: MapData, i: MapData['issues'][number]) =>
  `#${i.number} ${i.title}（${i.open ? `開いて ${md(i.created)}〜・最後に動いた ${md(i.updated)}` : `閉じた ${md(i.closed)}`}）${i.stale ? '［古くなっている候補］' : ''}　機能：${i.features.map(f => fname(d, f)).join('、') || 'なし'}`;

export async function mapAction(env: Env, action: string, a: Record<string, unknown>): Promise<string> {
  // プロジェクト（#77）：答えの文の中の番号（100万以上）を「名前#番号」に戻す
  const out = await mapAction0(env, action, a);
  let names: string[] = []; try { names = membersOf(repoOf(a)).map(shortOf); } catch { /* repo が無ければそのまま */ }
  return relabel(out, names);
}
async function mapAction0(env: Env, action: string, a: Record<string, unknown>): Promise<string> {
  if (action === 'sync') {
    const repo = repoOf(a);
    const u = await syncMap(env, repo, { mode: 'update' });
    if (u.busy) return `${repo} はいま別の読み込みの途中です。少し待ってから読んでください（保存済みの地図はそのまま読めます）。`;
    let b = 0, done = u.backfillDone, calls = u.calls, ms = u.ms;
    for (let k = 0; k < 4 && !done; k++) { const x = await syncMap(env, repo, { mode: 'backfill', pages: 4 }); if (x.busy) break; b += x.backfilled; done = x.backfillDone; calls += x.calls; ms += x.ms; }
    return `${repo} を GitHub から読み直しました。最近の更新 ${u.updated}件${u.caughtUp ? '（前回まで追いついた）' : '（まだ続きあり。次の読み直しで続きから）'}・${u.issuesFull ? `Issue ${u.issues}件（全部読み直し）` : `動いた Issue ${u.issues}件`}${u.issuesMore ? '（1000件で止めた）' : ''}・さかのぼり ${b}件${done ? '（過去まで済み）' : '（途中）'}。\n計測：GitHub に ${calls}回・${(ms / 1000).toFixed(1)}秒。`;
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
    const rv = d.sync?.reviewed_at ? new Date(Date.parse(d.sync.reviewed_at) + 9 * 3600e3).toISOString().slice(0, 10) : null;
    const L = [`■ ${d.repo} の地図（${md(d.today)} まで${d.days.length}日・PR ${c.prs}件）　毎日の見直し：${rv === d.today ? '今日は済み' : `今日はまだ（前回 ${rv ? md(rv) : 'なし'}）→ action="review"`}`,
      `直近4日に3件以上 ${c.building}・直近7日にマージあり ${c.settled}・直近7日マージなし ${c.stopped}／開いている Issue ${c.openIssues}（古くなっている候補 ${c.stale}）／どの機能にも当たらない作業 ${d.unmatched.length}／貯めているが画面なしのデータ ${c.unused}`, ''];
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
    if (stale.length) L.push('', '■ 古くなっている候補（つながる機能がすべて直近7日マージなしで、7日以上動いていない）', ...stale.map(i => '- ' + issueLine(d, i)));
    if (d.topics.length) L.push('', `■ 話題（タグ）${d.topics.length}：${d.topics.slice(0, 15).map(t => `${t.name}（${t.issues.length + t.prs.length}）`).join('、')}`);
    if (d.unmatched.length) L.push('', `■ どの機能にも当たらない作業（カタログに機能を足すかの材料）`, ...d.unmatched.slice(0, 10).map(p => `- #${p.n} ${md(p.day)} ${p.t}`));
    L.push('', `計測：地図の計算 ${d.took}ms・大きさ ${Math.round(JSON.stringify(d).length / 1024)}KB（画面が受け取るものと同じ）`);
    L.push('', '機能の中身は action="feature"（args: id）、Issue の周辺は action="issue"（args: n）。');
    return L.join('\n');
  }
  if (action === 'feature') {
    const q = String(a.id ?? a.name ?? '').trim();
    const f = d.features.find(x => x.id === q || x.name === q || x.name.startsWith(q));
    const tp = !f ? d.topics.find(t => t.name === q.replace(/^[@＠#＃]/, '')) : null;
    if (tp) {
      const iss = d.issues.filter(i => i.topics.includes(tp.name));
      return [`■ 話題「${tp.name}」（タグ。最初 ${md(tp.first)}・最後 ${md(tp.last)}）`, '', `■ Issue（${iss.length}）`, ...iss.map(i => '- ' + issueLine(d, i)),
        '', `■ このタグを付けた PR（${tp.prs.length}）`, ...tp.prs.slice(-10).map(p => `- PR #${p.n} ${md(p.day)} ${p.t}`)].join('\n');
    }
    if (!f) throw new Error(`機能・話題「${q}」はありません。action="map" で確かめてください`);
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
    // 毎日の見直し（実装担当者がその日の最初の作業の前に読む。docs/operation.md「3. 毎日の見直し」）
    // 前回の見直しからの新しいものだけを出し、自分で直すもの／人に決めてもらうもの／待っているもの に分ける
    const last = d.sync?.reviewed_at ?? null, since = last ? md(last.slice(0, 10)) : null;
    const lastDay = last ? new Date(Date.parse(last) + 9 * 3600e3).toISOString().slice(0, 10) : '';
    const isNew = (day: string) => !lastDay || day >= lastDay;
    const L = [`■ ${d.repo} の毎日の見直し（${md(d.today)}）　前回：${since ?? 'まだ一度もない'}`, ''];
    const w = d.writing, pct = (k: number, n: number) => (n ? Math.round(k / n * 100) + '%' : '—');
    const mine = w.misses.filter(m => isNew(m.day));
    L.push(`1. 自分で直すもの：書き方の足りないもの（前回から ${mine.length}件）。自分の PR・Issue なら、題・説明を直す。ほかの人のものなら、2 に回す`,
      ...mine.slice(0, 10).map(m => `   - ${m.type === 'pr' ? 'PR' : 'Issue'} #${m.n} ${m.t}：${m.miss.join('・')}`),
      `   （直近${d.days.length}日の守り具合：PR の題 ${pct(w.prTitle, w.prs)}・Issue の番号 ${pct(w.prLinked, w.prs)}・申告 ${pct(w.prReport, w.prs)}／Issue の「機能：」${pct(w.issueFeature, w.issues)}・「閉じる条件：」${pct(w.issueClose, w.issues)}）`);
    const um = d.unmatched.filter(p => isNew(p.day)), dirs = new Map<string, number[]>();
    for (const p of um) for (const f of new Set(p.files.map(x => x.split('/').slice(0, 2).join('/')))) dirs.set(f, [...(dirs.get(f) ?? []), p.n]);
    const lk = d.lacks.filter(x => isNew(x.day));
    L.push('', `2. 人に決めてもらうもの（前回から新しく出たもの）`,
      `   a. どの機能にも当たらない作業 ${um.length}件 → カタログに足すか、今の機能に含めるか（案を添える）`,
      ...[...dirs].sort((x, y) => y[1].length - x[1].length).slice(0, 6).map(([k, ns]) => `      - ${k}（${ns.map(n => '#' + n).join(' ')}）`),
      `   b. 申告の「足りなかった決まり」${lk.length}件 → 決まりに足すか、一回限りか（よく出るものは足す案に）`,
      ...lk.slice(0, 8).map(x => `      - PR #${x.n}：${x.t}`));
    const nt = d.topics.filter(t => isNew(t.first));
    L.push(`   c. 新しく出てきた話題（タグ）${nt.length}件 → 機能に上げる／別名にまとめる／話題のまま（案を添える）`,
      ...nt.slice(0, 8).map(t => `      - ${t.name}（Issue ${t.issues.map(n => '#' + n).join(' ') || 'なし'}・PR ${t.prs.map(p => '#' + p.n).join(' ') || 'なし'}）`));
    const stale = d.issues.filter(i => i.stale);
    const stoppedOpen = d.features.filter(f => f.state === 2 && d.issues.some(i => i.open && i.features.includes(f.id)));
    const unused = Object.values(d.nodes).filter(n => n.note === '画面なし');
    L.push('', '3. 人の判断を待っているもの（前からのもの。増えたときだけ人に伝える）',
      `   - 古くなっている候補の Issue ${stale.length}件：${stale.map(i => '#' + i.number).join(' ') || 'なし'}`,
      `   - 直近7日マージなしなのに開いた Issue がある機能 ${stoppedOpen.length}：${stoppedOpen.map(f => f.name).join('、') || 'なし'}`,
      `   - 貯めているのに画面で使っていないデータ ${unused.length}：${unused.map(n => n.name).join('、') || 'なし'}`);
    L.push('', '人への伝え方：1 は直したことを1行で。2 は案を添えて決めてもらう。3 は数が増えたときだけ。どれも無ければ「見直し：変わりなし」と1行で。');
    if (!a.peek) await env.DB.prepare('UPDATE map_sync SET reviewed_at = ? WHERE repo = ?').bind(new Date().toISOString(), d.repo).run();
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
