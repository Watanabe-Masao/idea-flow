// 引き継ぎの系譜（#70）：1つの Issue がいる系譜を1枚で。どこから引き継ぎ・何をして・何が残り・どこへ渡したかを、上から順に読む。
// 系譜＝Issue どうしの「親子」と「引き継ぎ（#n の続き など）」でつながる Issue の集まり。参照（関連 #n）と推測は系譜に入れない
(() => {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = d => d ? d.slice(5).replace('-', '/') : '';
const LINK = ['parent', 'child', 'from', 'to'];

/** n がいる系譜を作る：Issue の集まり・背骨（親を持たないもの、古い順）・子 */
function build(d, n) {
  const by = new Map(d.issues.map(i => [i.number, i]));
  if (!by.has(n)) return null;
  const seen = new Set([n]), q = [n];
  while (q.length) { const i = by.get(q.shift()); for (const l of i.links) if (l.type === 'issue' && LINK.includes(l.kind) && by.has(l.n) && !seen.has(l.n)) { seen.add(l.n); q.push(l.n); } }
  const iss = [...seen].map(x => by.get(x)).sort((a, b) => a.created.localeCompare(b.created) || a.number - b.number);
  const parentOf = i => i.links.find(l => l.type === 'issue' && l.kind === 'parent' && seen.has(l.n))?.n;
  const spine = iss.filter(i => !parentOf(i)), kids = p => iss.filter(i => parentOf(i) === p.number);
  return { iss, spine, kids, by };
}
/** a から b への引き継ぎの根拠（b の「from」か a の「to」） */
function handoff(a, b) {
  const l = b.links.find(x => x.type === 'issue' && x.n === a.number && (x.kind === 'from' || x.kind === 'ref')) || a.links.find(x => x.type === 'issue' && x.n === b.number && x.kind === 'to');
  return l ? (l.evidence[0] || '') : '';
}
function prsOf(d, i, cand) {
  const ls = i.links.filter(l => l.type === 'pr' && (cand || l.kind !== 'candidate'));
  return ls.map(l => ({ ...l, own: (d.owns || []).filter(o => o.n === l.n).map(o => o.t), lack: (d.lacks || []).filter(o => o.n === l.n).map(o => o.t) }));
}
function node(d, i, here, cand, depth) {
  const prs = prsOf(d, i, cand), nc = i.links.filter(l => l.type === 'pr' && l.kind === 'candidate').length;
  const st = i.open ? (here ? '今ここ・開いている' : '開いている') : `閉じた`;
  const when = `${md(i.created)}〜${i.closed ? md(i.closed) : ''}`;
  return `<div class="ln-node${here ? ' here' : ''}${i.open ? ' open' : ''}" style="margin-left:${depth * 14}px" id="ln-${i.number}">
    <span class="ln-dot"></span>
    <div class="ln-st">${st}・${when}</div>
    <a class="ln-t" href="${esc(i.url)}" target="_blank" rel="noopener">#${i.number} ${esc(i.title)}</a>
    ${i.cond ? `<div class="ln-cond"><span>閉じる条件：</span>${esc(i.cond)}</div>` : ''}
    ${prs.length ? `<details class="ln-prs"${here ? ' open' : ''}><summary>この Issue で働いた PR ${prs.length}件${prs.some(p => p.own.length || p.lack.length) ? '・判断あり' : ''}</summary>
      ${prs.map(p => `<div class="ln-pr"><a href="${esc(p.url)}" target="_blank" rel="noopener">PR #${p.n} ${esc(p.title)}</a> <small>${md(p.day)}</small>
        ${p.own.map(t => `<div class="ln-j">判断：${esc(t)}</div>`).join('')}${p.lack.map(t => `<div class="ln-j lack">足りなかった決まり：${esc(t)}</div>`).join('')}</div>`).join('')}</details>` : '<div class="sub" style="font-size:12px">番号で書かれた PR はまだない</div>'}
    ${nc && !cand ? `<div class="sub" style="font-size:12px">推測の PR ${nc}件（畳んでいる）</div>` : ''}
  </div>`;
}
function render(d, n, opt = {}) {
  const L = build(d, n);
  if (!L) return `<p class="sub">#${n} は、この地図の Issue にありません。</p>`;
  const { iss, spine, kids } = L, cand = !!opt.cand;
  const open = iss.filter(i => i.open), first = spine[0], hand = spine.length - 1;
  const sum = iss.length === 1 ? `#${n} はほかの Issue とつながっていません（引き継ぎ・親子なし）`
    : `#${first.number} から始まり、${hand ? `${hand}回引き継いで` : ''}${iss.length}件。開いているのは ${open.length ? open.map(i => '#' + i.number).join('・') : 'なし'}`;
  const tree = (i, depth) => node(d, i, i.number === n, cand, depth) + kids(i).map(k => `<div class="ln-edge" style="margin-left:${(depth + 1) * 14}px">子（GitHub の親子）</div>` + tree(k, depth + 1)).join('');
  const body = spine.map((i, k) => (k ? `<div class="ln-edge">${esc(handoff(spine[k - 1], i) || `#${spine[k - 1].number} のあと`)}</div>` : '') + tree(i, 0)).join('');
  // 同じ機能のほかの系譜：名前だけ（系譜の最初の Issue）
  const feats = new Set(iss.flatMap(i => i.features)), inL = new Set(iss.map(i => i.number)), others = [];
  for (const i of [...d.issues].sort((a, b) => a.created.localeCompare(b.created))) {
    if (inL.has(i.number) || !i.features.some(f => feats.has(f))) continue;
    const o = build(d, i.number); o.iss.forEach(x => inL.add(x.number));
    if (o.iss.length > 1 || o.iss[0].open) others.push(o);
    if (others.length >= 6) break;
  }
  return `<style>.ln{position:relative;border-left:2px solid var(--line);margin:10px 0 0 6px;padding-left:14px}.ln-node{position:relative;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--panel);margin:6px 0}.ln-node.here{border-color:var(--ink)}
    .ln-dot{position:absolute;left:-22px;top:14px;width:10px;height:10px;border-radius:50%;background:var(--bg);border:2px solid var(--mute)}.ln-node.open .ln-dot{border-color:var(--ink)}.ln-node.here .ln-dot{background:var(--ink)}
    .ln-st{font-size:12px;color:var(--mute)}.ln-t{display:block;font-weight:600;color:var(--ink);text-decoration:none;line-height:1.45;margin:2px 0}.ln-cond{font-size:13px;margin:6px 0;padding:6px 8px;background:var(--soft);border-radius:8px}.ln-cond span{color:var(--mute)}
    .ln-prs summary{cursor:pointer;font-size:13px;color:var(--mute);padding:4px 0}.ln-pr{font-size:13px;padding:4px 0;border-top:1px dashed var(--line)}.ln-pr a{color:var(--ink)}.ln-j{font-size:12px;color:var(--mute);padding-left:8px}.ln-j.lack{color:var(--red)}
    .ln-edge{font-size:12px;color:var(--mute);margin:2px 0;padding:3px 8px;border:1px dashed var(--line);border-radius:8px;display:inline-block}</style>
    <div class="row" style="margin-top:8px;justify-content:space-between">${opt.back ? `<button class="btn s" data-lnback="1">‹ ${esc(opt.back)}</button>` : '<span></span>'}<button class="btn s" data-cand="1">推測を${cand ? '隠す' : '出す'}</button></div>
    <p class="sub" style="margin:8px 0 0">引き継ぎの系譜</p><p style="margin:2px 0 0;font-weight:700;line-height:1.5">${esc(sum)}</p>
    <div class="ln">${body}</div>
    ${[...feats].length ? `<p style="margin-top:14px">${[...feats].map(id => (d.features || []).find(f => f.id === id)).filter(Boolean).map(f => `<a class="btn s" href="#" data-fpage="${esc(f.id)}">機能のページ：${esc(f.name)}</a>`).join(' ')}</p>` : ''}${others.length ? `<h3 style="font-size:15px;margin-top:16px">同じ機能のほかの系譜</h3><ul class="items">${others.map(o => { const a = o.iss[0], z = o.iss.filter(x => x.open); return `<li><a href="#" data-lin="${a.number}">#${a.number} ${esc(a.title)}</a> <small class="sub">${o.iss.length}件${z.length ? `・開いている ${z.length}` : '・すべて閉じた'}</small></li>`; }).join('')}</ul>` : ''}`;
}
// 機能のページ（#70 の2つ目）：その機能を通る系譜の一覧が主役。稼働の帯・開いている Issue（閉じる条件つき）・最近の作業と判断・使うデータ
const ST = ['直近4日に3件以上マージ', '直近7日にマージあり', '直近7日マージなし'];
function feature(d, id, opt = {}) {
  const f = d.features.find(x => x.id === id);
  if (!f) return `<p class="sub">機能「${esc(id)}」は、この地図にありません。</p>`;
  const mine = d.issues.filter(i => i.features.includes(f.id));
  // 系譜：この機能の Issue がいる系譜（重ならないように）。開いている Issue がある系譜を先に、新しく動いた順
  const done = new Set(), lines = [];
  for (const i of [...mine].sort((a, b) => b.updated.localeCompare(a.updated))) {
    if (done.has(i.number)) continue;
    const L = build(d, i.number); L.iss.forEach(x => done.add(x.number)); lines.push(L);
  }
  lines.sort((a, b) => (b.iss.some(i => i.open) - a.iss.some(i => i.open)) || b.iss.at(-1).created.localeCompare(a.iss.at(-1).created));
  const lineRow = L => { const a = L.iss[0], open = L.iss.filter(i => i.open), z = open.at(-1) || L.iss.at(-1), hand = L.spine.length - 1;
    return `<li class="fp-ln"><a href="#" data-lin="${z.number}"><b>#${a.number} ${esc(a.title)}</b>${L.iss.length > 1 ? ` → <b>#${z.number}</b>` : ''}</a>
      <small class="sub">${L.iss.length > 1 ? `${L.iss.length}件・引き継ぎ${hand}回` : '1件'}・${open.length ? `開いている ${open.length}` : 'すべて閉じた'}</small></li>`; };
  const max = Math.max(1, ...f.days), cell = v => `<i title="${v}" style="height:${v ? 6 + Math.round(v / max * 22) : 2}px;background:${v ? 'var(--ink)' : 'var(--line)'}"></i>`;
  const own = (d.owns || []).filter(o => f.recent.some(p => p.n === o.n));
  return `<style>.fp-strip{display:grid;grid-template-columns:repeat(${f.days.length},minmax(0,1fr));gap:2px;align-items:end;height:30px;margin-top:6px}.fp-strip i{display:block;border-radius:2px}
    .fp-ln{padding:8px 0;border-top:1px solid var(--line);list-style:none}.fp-ln a{color:var(--ink);text-decoration:none;line-height:1.5}.fp-ul{padding:0;margin:4px 0}</style>
    <div class="row" style="margin-top:8px">${opt.back ? `<button class="btn s" data-lnback="1">‹ ${esc(opt.back)}</button>` : ''}</div>
    <p class="sub" style="margin:8px 0 0">機能 · ${esc(f.group)}</p><h2 style="margin:2px 0 0;font-size:20px">${esc(f.name)}</h2>
    <p class="sub" style="margin:4px 0 0">${esc(ST[f.state])}・この期間 ${f.span}件・最後 ${f.last ? md(f.last) : 'なし'}</p>
    <div class="fp-strip" aria-label="日ごとのマージの数">${f.days.map(cell).join('')}</div>
    <h3 style="font-size:16px;margin-top:16px">この機能を通る系譜（${lines.length}）</h3>
    ${lines.length ? `<ul class="fp-ul">${lines.slice(0, 20).map(lineRow).join('')}</ul>${lines.length > 20 ? `<p class="sub">ほか ${lines.length - 20}</p>` : ''}` : '<p class="sub">この機能の Issue はまだありません。</p>'}
    <h3 style="font-size:16px;margin-top:16px">開いている Issue（${mine.filter(i => i.open).length}）</h3>
    <ul class="fp-ul">${mine.filter(i => i.open).map(i => `<li class="fp-ln"><a href="#" data-lin="${i.number}">#${i.number} ${esc(i.title)}</a>${i.cond ? `<div class="sub" style="font-size:13px">閉じる条件：${esc(i.cond)}</div>` : '<div class="sub" style="font-size:12px">「閉じる条件：」なし</div>'}</li>`).join('') || '<li class="sub" style="list-style:none">なし</li>'}</ul>
    <h3 style="font-size:16px;margin-top:16px">最近の作業</h3>
    <ul class="fp-ul">${f.recent.map(p => `<li class="fp-ln"><a href="${esc(p.url)}" target="_blank" rel="noopener">PR #${p.n} ${esc(p.t)}</a> <small class="sub">${md(p.day)}</small>${own.filter(o => o.n === p.n).map(o => `<div class="sub" style="font-size:12px">判断：${esc(o.t)}</div>`).join('')}</li>`).join('') || '<li class="sub" style="list-style:none">なし</li>'}</ul>
    <p class="sub" style="margin-top:12px">${esc(f.desc)}${f.data.length ? `　データ：${esc(f.data.map(k => d.nodes[k]?.name || k).join('、'))}` : ''}</p>`;
}
window.Lineage = { render, build, feature };
})();
