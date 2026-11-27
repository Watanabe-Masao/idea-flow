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
    ${others.length ? `<h3 style="font-size:15px;margin-top:16px">同じ機能のほかの系譜</h3><ul class="items">${others.map(o => { const a = o.iss[0], z = o.iss.filter(x => x.open); return `<li><a href="#" data-lin="${a.number}">#${a.number} ${esc(a.title)}</a> <small class="sub">${o.iss.length}件${z.length ? `・開いている ${z.length}` : '・すべて閉じた'}</small></li>`; }).join('')}</ul>` : ''}`;
}
window.Lineage = { render, build };
})();
