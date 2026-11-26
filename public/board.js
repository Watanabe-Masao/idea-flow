// 範囲のボード（「決まり」タブの「範囲」）。
// 札（決まりの文書）を棚（範囲）に置くと、その棚と下の棚に効く。横の棚には効かない。
// 札を押すと、置く棚・その棚で使わない部分（見出しや決まり1つまで）・要約・原文・ピン・書き換えを扱える。
// 操作はまず「変更 N件」にたまり、「確かめて確定」で1回で反映する。ピンと書き換えは相談（変更リクエスト）になり、Claude がコネクタで返事を書く。
(() => {
const IF = window.IF, { api, esc, say } = IF;
const $ = s => document.querySelector(s);
const SEP = ' ¶ ';
const itemHead = t => String(t).replace(/\s+/g, ' ').trim().slice(0, 40);
const itemEx = (h, t) => `${h}${SEP}${itemHead(t)}`;
function excluded(exs, path, heading, text) {
  const segs = heading.split(' › ');
  return exs.some(e => {
    if (e.path !== path) return false;
    if (e.heading === '*') return true;
    const k = e.heading.indexOf(SEP);
    if (k >= 0) return heading === e.heading.slice(0, k) && itemHead(text).startsWith(e.heading.slice(k + SEP.length));
    return segs.some(s => s.startsWith(e.heading));
  });
}
const lead = x => { const t = String(x).replace(/\s+/g, ' ').trim(); const m = t.match(/^(.{2,60}?)[：:]/); let r = m ? m[1] : t.split(/。/)[0]; return r.length > 44 ? r.slice(0, 43) + '…' : r; };
const GC = ['#2f7de1', '#1f9e75', '#d4537e', '#ba7517', '#7f77dd'];

// ── 見た目 ──
const css = document.createElement('style');
css.textContent = `
.bd-seg{display:flex;border:1px solid var(--ink);border-radius:10px;overflow:hidden;margin-top:6px}.bd-seg button{flex:1;font:inherit;font-size:15px;min-height:44px;border:0;background:var(--panel);color:var(--ink);cursor:pointer}.bd-seg button[aria-pressed=true]{background:var(--ink);color:var(--bg)}
.bd-shelf{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-top:10px}
.bd-shelf h3{font-size:17px;color:var(--ink);font-weight:700;margin:0;display:flex;align-items:center;gap:8px}
.bd-ssum{font-size:13.5px;color:var(--mute);margin:2px 0 0}
.bd-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.bd-chip{font:inherit;font-size:14px;min-height:40px;padding:6px 12px;border-radius:10px;border:1px solid var(--ink);background:var(--panel);color:var(--ink);cursor:pointer;text-align:left;max-width:100%}
.bd-chip b{font-weight:600}.bd-chip .sum{display:block;font-size:12.5px;line-height:1.45;color:var(--mute);margin-top:2px}
.bd-chip.inh{border-style:dashed;border-color:var(--line);color:var(--mute)}.bd-chip.inh .sum{display:none}.bd-chip.chg{border-color:#e07a1f;box-shadow:inset 0 0 0 1px #e07a1f}
.bd-chip .ex{display:block;font-size:12px;color:var(--red)}
.bd-link{font:inherit;font-size:13px;color:var(--mute);background:none;border:0;text-decoration:underline;cursor:pointer;padding:6px 0;min-height:36px;margin-left:auto}
.bd-bar{position:fixed;left:0;right:0;bottom:0;background:var(--panel);border-top:1px solid var(--line);padding:10px max(4vw,12px) calc(10px + env(safe-area-inset-bottom));display:flex;gap:8px;align-items:center;z-index:20}
.bd-bar b{flex:1}
.bd-scrim{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:30}
.bd-sheet{position:fixed;inset:auto 0 0 0;max-height:88vh;overflow:auto;background:var(--panel);border-top:1px solid var(--ink);border-radius:16px 16px 0 0;padding:16px max(4vw,14px) calc(28px + env(safe-area-inset-bottom));z-index:31;max-width:760px;margin:0 auto}
.bd-sheet h2{font-size:19px}.bd-sheet h4{font-size:15px;margin:16px 0 2px}
.bd-opt{display:flex;gap:10px;align-items:center;min-height:44px;padding:6px 0;border-top:1px solid var(--line);font-size:15px}
.bd-opt input{width:22px;height:22px;flex:none}
.bd-off{text-decoration:line-through;color:var(--mute)}
.bd-hsum{display:block;font-size:12.5px;color:var(--mute);line-height:1.4}
.bd-g{border-left:4px solid var(--gc);padding-left:8px;margin:8px 0;background:color-mix(in srgb,var(--gc) 6%,transparent)}
.bd-g .bd-opt.grp{border-top:0}.bd-g .bd-opt.sub{border-left:2px solid color-mix(in srgb,var(--gc) 55%,transparent);padding-left:8px}
.bd-g.nest{margin-left:8px}
.bd-orig{margin:-2px 0 6px 32px;font-size:13px}.bd-orig summary{color:var(--mute);cursor:pointer;min-height:34px;display:flex;align-items:center}
.bd-otext{font-size:13px;line-height:1.6;background:var(--soft);border-radius:8px;padding:8px 10px;max-height:300px;overflow:auto}
.bd-otext p{margin:0 0 6px}.bd-otext ul,.bd-otext ol{margin:0 0 6px;padding-left:18px}.bd-otext code{font-size:12px;background:var(--panel);padding:0 3px;border-radius:4px;overflow-wrap:anywhere}
.bd-otext pre{font-size:11.5px;white-space:pre-wrap;background:var(--panel);padding:6px;border-radius:6px;margin:0 0 6px}
.bd-otbl{overflow-x:auto;margin:0 0 8px}.bd-otbl table{border-collapse:collapse;font-size:12px;min-width:100%}.bd-otbl th,.bd-otbl td{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}
.bd-note{font-size:13px;margin:8px 0;padding:8px;border-radius:8px;background:color-mix(in srgb,#e07a1f 10%,transparent)}
.bd-ta{width:100%;font:14px/1.5 inherit;padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink)}
.bd-diff{font-size:13px;line-height:1.6;white-space:pre-wrap;margin-top:6px}.bd-diff ins{background:color-mix(in srgb,#1f9e75 28%,transparent);text-decoration:none}.bd-diff del{background:color-mix(in srgb,var(--red) 22%,transparent)}
.bd-badge{font-size:11.5px;padding:1px 8px;border-radius:999px;white-space:nowrap;margin-left:4px}.bd-badge.pin{background:#e07a1f;color:#fff}.bd-badge.ed{background:#1f9e75;color:#fff}
.bd-req{border:1px solid var(--ink);border-radius:12px;padding:10px 12px;margin-top:10px;background:var(--panel)}
.bd-reply{white-space:pre-wrap;font-size:14px;border-left:3px solid var(--ink);padding:4px 10px;margin:8px 0;background:var(--soft)}
.bd-map{background:var(--panel);border:1px solid var(--line);border-radius:14px;margin-top:10px;padding:6px}.bd-map svg{display:block;width:100%;height:auto}.bd-map g[data-sc]{cursor:pointer}
@media (prefers-reduced-motion:no-preference){.bd-sheet{animation:bdup .18s ease-out}@keyframes bdup{from{transform:translateY(20px);opacity:0}}}
`;
document.head.appendChild(css);

// ── 状態（リポジトリごと） ──
const B = {};
let RVSEEN = null, EL = null, REPO = '';
const key = r => 'idea-flow-board:' + r;
function st(r) {
  if (!B[r]) { let ops = []; try { ops = JSON.parse(localStorage.getItem(key(r)) || '[]'); } catch (_) {} B[r] = { ops, view: 'shelf', data: null, tree: null, preview: [], error: null, docs: {}, sum: null }; }
  return B[r];
}
const save = r => { try { localStorage.setItem(key(r), JSON.stringify(st(r).ops)); } catch (_) {} };
const docsOf = r => IF.rv().docs.filter(d => d.repo === r);
const docByPath = (r, p) => docsOf(r).find(d => d.path === p);
const title = (r, p) => { const d = docByPath(r, p); return (d && d.title) || p.split('/').pop().replace(/\.md$/i, ''); };
const committed = r => st(r).data ? st(r).data.tree : [];
const tree = r => st(r).ops.length && st(r).tree ? st(r).tree : committed(r);
const sumOf = (r, k) => { const s = st(r).data && st(r).data.summaries[k]; return s ? s.text : ''; };

async function load(r) {
  const S = st(r);
  S.data = await api('/api/scopes?repo=' + encodeURIComponent(r));
  await refresh(r);
}
async function refresh(r) {
  const S = st(r); S.error = null;
  if (!S.ops.length) { S.tree = null; S.preview = []; return; }
  try { const x = await api('/api/scopes/preview', { method: 'POST', body: JSON.stringify({ repo: r, ops: S.ops.filter(o => o.op !== 'pin' && o.op !== 'edit') }) }); S.tree = x.tree; S.preview = x.preview; }
  catch (e) { S.error = e.message; }
}
async function setOps(r, ops) { const S = st(r); S.ops = ops; save(r); await refresh(r); draw(); }

// ── 木の計算 ──
const kidsOf = (t, id) => t.filter(s => s.parent_id === id);
const chainOf = (t, id) => { const out = []; for (let s = t.find(x => x.id === id); s; s = s.parent_id ? t.find(x => x.id === s.parent_id) : null) out.unshift(s); return out; };
const inherited = (t, id) => chainOf(t, id).slice(0, -1).flatMap(p => p.docs.map(d => ({ d, from: p })));
const exChain = (t, id) => chainOf(t, id).flatMap(p => p.exceptions.map(e => ({ ...e, from: p })));
const placed = (r, p) => tree(r).filter(s => s.docs.includes(p));
const newKey = () => 'b' + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 36).toString(36);

// ── 描く ──
function render(el, r) {
  EL = el; REPO = r;
  if (RVSEEN !== IF.rv()) { RVSEEN = IF.rv(); for (const k in B) { B[k].docs = {}; } }
  const S = st(r);
  if (!S.data) { el.innerHTML = '<p class="sub">範囲を読み込んでいます…</p>'; load(r).then(draw).catch(e => { el.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`; }); return; }
  draw();
  if (!S.sum && docsOf(r).length) summarize(r);
}
function draw() {
  const r = REPO, S = st(r), el = EL;
  if (!el || !document.body.contains(el)) { bar(); return; }
  const t = tree(r), docs = docsOf(r);
  const pend = S.data.requests.filter(q => q.status === 'pending');
  let h = '';
  if (!docs.length) { el.innerHTML = '<p>まだ決まりを取り込んでいません。「診断」で取り込んでください。</p>'; bar(); return; }
  h += `<p class="sub">札（決まりの文書）を棚（範囲）に置くと、その棚と<b>下の棚</b>に効きます。横の棚には効きません。札を押すと、置き場所・使わない部分・原文・ピンを扱えます。</p>`;
  if (S.sum && S.sum.left) h += `<p class="sub" style="margin-top:6px">要約を作っています（あと ${S.sum.left}）…</p>`;
  if (S.error) h += `<p style="color:var(--red);font-size:14px">この変更はそのままでは反映できません：${esc(S.error)}</p>`;
  h += pend.map(reqHtml).join('');
  if (t.length) h += `<div class="bd-shelf" style="border:2px solid var(--ink)"><h3>Claude に届ける</h3><p class="bd-ssum">範囲の木から CLAUDE.md の「決まりの道案内」を作り、承認した書き換えといっしょに PR として出します。マージはあなたがします。</p><div class="row"><button class="btn s p" data-bexport="1">書き出す内容を見る</button></div></div>`;
  h += `<div class="bd-seg" role="group" aria-label="表示"><button data-bview="shelf" aria-pressed="${S.view === 'shelf'}">棚で見る</button><button data-bview="circle" aria-pressed="${S.view === 'circle'}">円で見る</button></div>`;
  if (!t.length) {
    h += `<div class="bd-shelf"><p style="margin:0">範囲の木はまだありません。</p><div class="row"><button class="btn s p" data-bsuggest="1">木の案を作る</button><button class="btn s" data-baddunder="root">最初の棚を作る</button></div><p class="sub" style="margin-top:6px">木の案は、参照のつながりとスキルの名前から作るたたき台です。「変更」にたまるので、直してから確定できます。</p></div>`;
  } else if (S.view === 'shelf') {
    const walk = (id, d) => kidsOf(t, id).map(s => shelfHtml(r, t, s, d) + walk(s.id, d + 1)).join('');
    h += walk(null, 0);
  } else h += circles(r, t);
  const loose = docs.filter(d => !placed(r, d.path).length);
  h += `<div class="bd-shelf" style="border-style:dashed"><h3>どこにも置いていない札</h3><div class="bd-chips">${loose.map(d => chip(r, null, d.path, false)).join('') || '<span class="sub">ありません</span>'}</div><small>どこにも置かない札は、会話で渡さない限り効きません。</small></div>`;
  el.innerHTML = h;
  bar();
}
function chip(r, sid, p, inh) {
  const d = docByPath(r, p), S = st(r), t = tree(r);
  const ex = sid ? exChain(t, sid).filter(e => e.path === p) : [];
  const chg = S.ops.some(o => (o.path === p) && (o.scope === undefined || !sid || o.scope === (t.find(x => x.id === sid) || {}).key));
  const sum = d ? sumOf(r, 'doc|' + d.id) : '';
  return `<button class="bd-chip${inh ? ' inh' : ''}${chg ? ' chg' : ''}" data-bdoc="${esc(p)}" data-bin="${esc(sid || '')}" data-binh="${inh ? 1 : 0}">${inh ? '↓ ' : ''}<b>${esc(title(r, p))}</b>${d ? ` <span class="sub" style="display:inline">${IF.rv().items.filter(i => i.doc === d.id).length}</span>` : ''}${sum ? `<span class="sum">${esc(sum)}</span>` : ''}${ex.length ? `<span class="ex">使わない部分 ${ex.length}</span>` : ''}</button>`;
}
function shelfHtml(r, t, s, depth) {
  const inh = inherited(t, s.id), total = new Set([...inh.map(x => x.d), ...s.docs]).size, sum = sumOf(r, 'scope|' + s.id);
  return `<div class="bd-shelf" style="margin-left:${depth * 14}px"><h3>${depth ? '<span class="sub">└</span>' : ''}<span>${esc(s.name)}</span> <span class="badge">${total}つ効く</span><button class="bd-link" data-bscope="${esc(s.id)}">…</button></h3>
  ${sum ? `<p class="bd-ssum">${esc(sum)}</p>` : s.note ? `<p class="bd-ssum">${esc(s.note)}</p>` : ''}
  <div class="bd-chips">${s.docs.map(p => chip(r, s.id, p, false)).join('') || '<span class="sub">この棚に置いた札はありません</span>'}</div>
  ${inh.length ? `<div class="bd-chips">${inh.map(x => chip(r, s.id, x.d, true)).join('')}</div><small>↓ は上の棚から降りてくる札（押すと、この棚で使わない部分を選べます）</small>` : ''}</div>`;
}
function circles(r, t) {
  const root = t.find(s => !s.parent_id); if (!root) return '';
  const shared = (a, b) => a.docs.filter(d => b.docs.includes(d));
  const lay = s => { const ks = kidsOf(t, s.id); if (!ks.length) { s._r = Math.max(66 + 5 * s.docs.length, Math.min(84, 50 + s.name.length * 2)); return s._r; } ks.forEach(lay); const gaps = ks.slice(1).map((k, i) => shared(ks[i], k).length ? -0.35 * Math.min(ks[i]._r, k._r) : 12); const W = ks.reduce((a, k) => a + 2 * k._r, 0) + gaps.reduce((a, g) => a + g, 0), mr = Math.max(...ks.map(k => k._r)); s._W = W; s._gaps = gaps; s._r = Math.hypot(W / 2, mr) + 30; return s._r; };
  const place = (s, cx, cy) => { s._x = cx; s._y = cy; const ks = kidsOf(t, s.id); if (!ks.length) return; let x = cx - s._W / 2; ks.forEach((k, i) => { if (i) x += s._gaps[i - 1]; place(k, x + k._r, cy + 18); x += 2 * k._r; }); };
  const lines = (n, r) => { const w = Math.max(5, Math.floor((r || 70) / 9.5)); if (n.length <= w) return [n]; const k = Math.ceil(n.length / Math.ceil(n.length / w)), out = []; for (let i = 0; i < n.length; i += k) out.push(n.slice(i, i + k)); return out.slice(0, 4); };
  const top = kidsOf(t, root.id); top.forEach(lay);
  const FW = Math.max(420, ...top.map(k => 2 * k._r + 24)); let rows = [], cur = [], w = 0;
  top.forEach(k => { const d = 2 * k._r; if (cur.length && w + 12 + d > FW - 24) { rows.push(cur); cur = []; w = 0; } cur.push(k); w += (cur.length > 1 ? 12 : 0) + d; }); if (cur.length) rows.push(cur);
  let y = 74; rows.forEach(rw => { const hh = Math.max(...rw.map(k => 2 * k._r)), ww = rw.reduce((a, k) => a + 2 * k._r, 0) + 12 * (rw.length - 1); let x = (FW - ww) / 2; rw.forEach(k => { place(k, x + k._r, y + hh / 2); x += 2 * k._r + 12; }); y += hh + 14; });
  const H = y + 8, fills = ['', 'light-dark(#e3e9ee,#262c31)', 'light-dark(#cfdae3,#303a42)', 'light-dark(#bccbd7,#3b4852)'];
  const order = []; (function walk(x) { if (x !== root) order.push(x); kidsOf(t, x.id).forEach(walk); })(root);
  let g = `<g data-sc="${esc(root.id)}" role="button" tabindex="0"><rect x="2" y="2" width="${FW - 4}" height="${H - 4}" rx="18" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.2"/><text x="18" y="32" font-size="19" font-weight="700" fill="var(--ink)">${esc(root.name)}</text><text x="18" y="54" font-size="15" fill="var(--mute)">中のすべての円に効く札：${root.docs.length}</text></g>`;
  order.forEach(s => {
    const leaf = !kidsOf(t, s.id).length, L = lines(s.name, leaf ? s._r : s._r * 1.6), dep = chainOf(t, s.id).length - 1, total = new Set([...inherited(t, s.id).map(x => x.d), ...s.docs]).size;
    const ty = leaf ? s._y - (L.length - 1) * 11 : s._y - s._r + 30;
    g += `<g data-sc="${esc(s.id)}" role="button" tabindex="0" aria-label="${esc(s.name)}"><circle cx="${s._x}" cy="${s._y}" r="${s._r}" fill="${fills[Math.min(dep, 3)]}" fill-opacity=".9" stroke="var(--ink)"/>${L.map((x, i) => `<text x="${s._x}" y="${ty + i * 22}" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)">${esc(x)}</text>`).join('')}<text x="${s._x}" y="${ty + L.length * 22}" text-anchor="middle" font-size="14" fill="var(--mute)">${total}つ効く</text></g>`;
  });
  order.forEach(s => { const ks = kidsOf(t, s.id); ks.slice(1).forEach((k, i) => { const a = ks[i], sh = shared(a, k); if (sh.length) g += `<text x="${(a._x + a._r + k._x - k._r) / 2}" y="${a._y + Math.min(a._r, k._r) * 0.75}" text-anchor="middle" font-size="13" font-weight="700" fill="#e07a1f">共通${sh.length}</text>`; }); });
  return `<div class="bd-map"><svg viewBox="0 0 ${FW} ${H}" role="img" aria-label="範囲を円で表した図">${g}</svg></div><small style="margin-top:6px">円の中の円は、外の円の札を受け継ぎます。同じ札を2つの円に置くと重なります。円や枠を押すと、そこで効く札が見られます。</small>
  <div class="bd-shelf"><h3>それぞれの範囲で守ること</h3>${[root, ...order].map(x => `<button class="bd-chip" style="width:100%;margin-top:6px;padding-left:${10 + 14 * (chainOf(t, x.id).length - 1)}px" data-bscope="${esc(x.id)}"><b>${esc(x.name)}</b><span class="sum">${esc(sumOf(r, 'scope|' + x.id) || x.note || '（要約はまだありません）')}</span></button>`).join('')}</div>`;
}
function bar() {
  let b = $('#bd-bar');
  const S = REPO && st(REPO), show = S && S.ops.length && EL && document.body.contains(EL) && !$('#v-rules').hidden;
  if (!show) { if (b) b.remove(); document.body.style.paddingBottom = ''; return; }
  if (!b) { b = document.createElement('div'); b.id = 'bd-bar'; b.className = 'bd-bar'; document.body.appendChild(b); }
  b.innerHTML = `<b>変更 ${S.ops.length}件</b><button class="btn s" data-bundo="1">元に戻す</button><button class="btn s p" data-breview="1">確かめて確定</button>`;
  document.body.style.paddingBottom = '80px';
}

// ── シート ──
function sheet(html) {
  close();
  const sc = document.createElement('div'); sc.className = 'bd-scrim'; sc.id = 'bd-scrim';
  const sh = document.createElement('div'); sh.className = 'bd-sheet'; sh.id = 'bd-sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.innerHTML = html;
  document.body.append(sc, sh);
  return sh;
}
function close() { $('#bd-scrim') && $('#bd-scrim').remove(); $('#bd-sheet') && $('#bd-sheet').remove(); }
const closeRow = '<div class="row" style="margin-top:14px"><button class="btn p" data-bclose="1" style="flex:1">閉じる</button></div>';

// ── 文書のシート ──
async function docData(r, p) {
  const S = st(r);
  if (!S.docs[p]) S.docs[p] = await api(`/api/rules/doc?repo=${encodeURIComponent(r)}&path=${encodeURIComponent(p)}`);
  return S.docs[p];
}
/** 決まり1つの元の書き方（箇条書きのまとまり） */
function rawOf(D, it) {
  const secs = D.sections.filter(s => s.heading === it.heading && s.line < it.line).sort((a, b) => b.line - a.line);
  const s = secs[0]; if (!s) return it.text;
  const lines = s.md.split('\n'), idx = it.line - s.line - 1;
  const next = D.items.filter(x => x.heading === it.heading && x.line > it.line).sort((a, b) => a.line - b.line)[0];
  let end = next ? Math.min(lines.length, next.line - s.line - 1) : lines.length;
  if (it.kind === 'row') end = idx + 1;
  if (it.kind === 'para') { let k = idx; while (k < end && lines[k] && lines[k].trim()) k++; end = k; }
  const out = lines.slice(Math.max(0, idx), end); while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n') || it.text;
}
/** 画面の木：見出し（markdown の入れ子＋「2.1」は「2.」の下）→ 決まり */
function buildTree(D) {
  const nodes = new Map(), roots = [];
  const order = [...new Set(D.items.map(i => i.heading))];
  const get = p => nodes.get(p);
  for (const p of order) {
    const segs = p ? p.split(' › ') : [];
    for (let k = 1; k <= segs.length; k++) { const q = segs.slice(0, k).join(' › '); if (!nodes.has(q)) nodes.set(q, { path: q, title: segs[k - 1], items: [], kids: [], parent: null }); }
  }
  if (order.includes('')) nodes.set('', { path: '', title: '（見出しの前）', items: [], kids: [], parent: null });
  for (const it of D.items) nodes.get(it.heading).items.push(it);
  const list = [...nodes.values()].sort((a, b) => firstLine(D, a) - firstLine(D, b));
  for (const n of list) {
    const segs = n.path ? n.path.split(' › ') : [];
    let parent = segs.length > 1 ? get(segs.slice(0, -1).join(' › ')) : null;
    // 「2.1 …」は、同じ親のもとの「2. …」の下へ
    const m = n.title.match(/^(\d+)\.(\d+[a-z]?)(\s|$)/);
    if (m) { const sib = list.find(o => o !== n && (o.path ? o.path.split(' › ').slice(0, -1).join(' › ') : null) === (segs.slice(0, -1).join(' › ')) && new RegExp(`^${m[1]}\\.(\\s|$)`).test(o.title)); if (sib) parent = sib; }
    n.parent = parent; (parent ? parent.kids : roots).push(n);
  }
  return roots;
}
const firstLine = (D, n) => { let m = Infinity; const walk = x => { x.items.forEach(i => { if (i.line < m) m = i.line; }); }; walk(n); const sec = D.sections.find(s => s.heading === n.path); return Math.min(m, sec ? sec.line : Infinity); };
const leavesOf = n => [...n.items, ...n.kids.flatMap(leavesOf)];

function docSheet(r, p, sid, inh) {
  const S = st(r), t = tree(r), s = sid ? t.find(x => x.id === sid) : null, d = docByPath(r, p);
  const sh = sheet('<p class="sub">読み込んでいます…</p>');
  sh.dataset.doc = p; sh.dataset.in = sid || ''; sh.dataset.inh = inh ? '1' : '';
  docData(r, p).then(D => {
    if (!$('#bd-sheet') || $('#bd-sheet') !== sh) return;
    const y = sh.scrollTop;
    const dsum = D.summaries['doc|' + D.doc.id];
    const placeTree = (pid, dep) => kidsOf(t, pid).map(x => `<label class="bd-opt" style="padding-left:${dep * 16}px"><input type="checkbox" data-bplace="${esc(x.key)}" ${x.docs.includes(p) ? 'checked' : ''}> ${esc(x.name)}</label>` + placeTree(x.id, dep + 1)).join('');
    let h = `<h2>${esc(D.doc.title || p)}</h2><p class="sub"><a href="${esc(gh(r, p))}" target="_blank" rel="noopener">${esc(p)}</a>・決まり ${D.items.length}</p>
      ${dsum ? `<p style="margin:8px 0 0;font-size:15px">${esc(dsum.text)}</p><small>${dsum.by === 'ai' ? '要約は AI が文書から作ったもの。正しいのは原文です。' : '要約の代わりに、先頭の文を出しています。'}</small>` : ''}`;
    if (!inh) h += `<h4>どの棚に置く？</h4><p class="sub">置いた棚と、その下の棚に効きます。いくつでも選べます。</p>${placeTree(null, 0) || '<p class="sub">棚がまだありません</p>'}`;
    else h += `<p style="margin:12px 0 0">この札は「${esc(placed(r, p).map(x => x.name).join('、'))}」から降りてきています。</p>`;
    const roots = buildTree(D);
    const ownEx = s ? s.exceptions.filter(e => e.path === p) : [], inhEx = s ? chainOf(t, s.id).slice(0, -1).flatMap(x => x.exceptions.filter(e => e.path === p).map(e => ({ ...e, from: x }))) : [];
    const isOwn = it => excluded(ownEx, p, it.heading, it.text), isInh = it => inhEx.find(e => excluded([e], p, it.heading, it.text));
    let gi = 0;
    const leaf = (it, sub, label, sum) => {
      const own = s && isOwn(it), ih = s && isInh(it), opk = o => o.path === p && o.heading === it.heading && o.item === itemHead(it.text);
      const pin = S.ops.find(o => o.op === 'pin' && opk(o)), ed = S.ops.find(o => o.op === 'edit' && opk(o));
      return `<label class="bd-opt${sub ? ' sub' : ''}">${s ? `<input type="checkbox" data-bex="${it.id}" ${own || ih ? 'checked' : ''} ${ih ? 'disabled' : ''}>` : ''} <span class="${own || ih ? 'bd-off' : ''}">${esc(label || lead(it.text))}${pin ? '<span class="bd-badge pin">ピン</span>' : ''}${ed ? '<span class="bd-badge ed">直した</span>' : ''}${sum ? `<span class="bd-hsum">${esc(sum)}</span>` : ''}</span>${ih ? `<small style="margin-left:auto">${esc(ih.from.name)}で決めた</small>` : ''}</label>
      <details class="bd-orig" ${pin || ed ? 'open' : ''}><summary>原文を見る・直す</summary><div class="bd-otext">${mdHtml(rawOf(D, it))}</div><a class="bd-link" style="margin:0" href="${esc(gh(r, p, it.line))}" target="_blank" rel="noopener">${it.line}行目（GitHub）</a>
      ${pin ? `<div class="bd-note"><b>見直しのピン</b>${pin.note ? '：' + esc(pin.note) : ''} <button class="bd-link" style="margin:0" data-bunpin="${it.id}">外す</button></div>` : ''}
      ${ed ? `<div class="bd-note"><b>直した内容</b>（緑が足した所、赤が消した所） <button class="bd-link" style="margin:0" data-bunedit="${it.id}">元に戻す</button>${diffHtml(ed.before, ed.after)}</div>` : ''}
      <div class="row" data-bacts="${it.id}"><button class="btn s" data-bpin="${it.id}">見直しのピン</button><button class="btn s" data-bedit="${it.id}">直接直す</button><button class="btn s" data-bask="${it.id}">Claude に聞く</button></div></details>`;
    };
    const node = (n, sub) => {
      const L = leavesOf(n), hs = D.summaries[`head|${D.doc.id}|${n.path}`], hsum = hs ? hs.text : '';
      if (!n.kids.length && n.items.length === 1) return leaf(n.items[0], sub, n.title, hsum);
      const parts = [];
      if (n.items.length && n.kids.length) parts.push(n.items.length === 1 ? leaf(n.items[0], true, n.title + ' の本文', '') : group({ path: n.path + '#body', title: n.title + ' の本文', items: n.items, kids: [] }, true, hsum));
      else n.items.forEach(it => parts.push(leaf(it, true)));
      n.kids.forEach(k => parts.push(node(k, true)));
      return groupWrap(n, L, sub, n.kids.length ? '' : hsum, parts.join(''));
    };
    const group = (n, sub, hsum) => groupWrap(n, n.items, sub, hsum, n.items.map(it => leaf(it, true)).join(''));
    const groupWrap = (n, L, sub, hsum, inner) => {
      const k = s ? L.filter(it => isOwn(it) || isInh(it)).length : 0, all = L.length, locked = s && L.every(it => isInh(it));
      return `<div class="bd-g${sub ? ' nest' : ''}" style="--gc:${GC[gi++ % GC.length]}"><label class="bd-opt grp">${s ? `<input type="checkbox" data-bgrp="${esc(n.path)}" ${k === all ? 'checked' : ''} ${k && k < all ? 'data-mixed="1"' : ''} ${locked ? 'disabled' : ''}>` : ''} <span><b>${esc(n.title)}</b> <span class="sub" style="display:inline">（${all}）</span>${hsum ? `<span class="bd-hsum">${esc(hsum)}</span>` : ''}${k && k < all ? `<span class="bd-hsum">${k}つを使わない</span>` : ''}</span></label>${inner}</div>`;
    };
    h += s ? `<h4>「${esc(s.name)}」では使わない部分</h4><p class="sub">チェックすると線で消え、この棚と下の棚では効かなくなります。親にチェックすると下が全部入ります。</p>` : `<h4>中身</h4><p class="sub">棚に置いた札を棚から開くと、使わない部分も選べます。</p>`;
    h += roots.map(n => node(n, false)).join('') + closeRow;
    sh.innerHTML = h; sh.scrollTop = y;
    sh.querySelectorAll('[data-mixed]').forEach(x => { x.indeterminate = true; });
    sh._D = D; sh._roots = roots;
  }).catch(e => { sh.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>${closeRow}`; });
}
const gh = (r, p, line) => { const s = (IF.rv().sources || []).find(x => x.repo === r); return `https://github.com/${r}/blob/${encodeURIComponent((s && s.branch) || 'main')}/${p.split('/').map(encodeURIComponent).join('/')}${line ? '#L' + line : ''}`; };
const reopen = () => { const sh = $('#bd-sheet'); if (sh && sh.dataset.doc !== undefined) docSheet(REPO, sh.dataset.doc, sh.dataset.in || null, !!sh.dataset.inh); };

/** その棚・その文書の「使わない」を、選んだ決まりの集まりから、少ない例外に直す */
function minimalExceptions(D, sel, inh) {
  const L = D.items, cov = it => sel.has(it.id) || inh.has(it.id);
  if (L.every(cov) && L.some(it => sel.has(it.id))) return ['*'];
  const out = [], paths = [...new Set(L.map(i => i.heading))];
  const under = P => L.filter(i => P === '' ? true : i.heading === P || i.heading.startsWith(P + ' › '));
  const kids = P => [...new Set(paths.filter(q => q !== P && (P === '' ? true : q.startsWith(P + ' › '))).map(q => (P === '' ? q.split(' › ')[0] : P + ' › ' + q.slice(P.length + 3).split(' › ')[0])))];
  const walk = P => {
    const U = under(P);
    if (P !== '' && U.every(cov) && U.some(i => sel.has(i.id))) {
      const seg = P.split(' › ').pop(), hit = L.filter(i => excluded([{ path: 'x', heading: seg }], 'x', i.heading, i.text));
      if (hit.every(cov)) { out.push(seg); return; }
    }
    L.filter(i => i.heading === P && sel.has(i.id) && !inh.has(i.id)).forEach(i => out.push(itemEx(P, i.text)));
    kids(P).forEach(walk);
  };
  walk('');
  return [...new Set(out)];
}
async function setExceptions(r, sid, p, sel) {
  const S = st(r), t = tree(r), s = t.find(x => x.id === sid), D = await docData(r, p);
  const inhEx = chainOf(t, sid).slice(0, -1).flatMap(x => x.exceptions.filter(e => e.path === p));
  const inh = new Set(D.items.filter(it => excluded(inhEx, p, it.heading, it.text)).map(i => i.id));
  const M = minimalExceptions(D, sel, inh);
  const base = ((committed(r).find(x => x.id === sid) || { exceptions: [] }).exceptions).filter(e => e.path === p).map(e => e.heading);
  const ops = S.ops.filter(o => !((o.op === 'add_exception' || o.op === 'remove_exception') && o.scope === s.key && o.path === p));
  base.filter(hd => !M.includes(hd)).forEach(hd => ops.push({ op: 'remove_exception', scope: s.key, path: p, heading: hd }));
  M.filter(hd => !base.includes(hd)).forEach(hd => ops.push({ op: 'add_exception', scope: s.key, path: p, heading: hd }));
  await setOps(r, ops); reopen();
}
function currentSel(r, sid, p, D) {
  const s = tree(r).find(x => x.id === sid);
  const own = s.exceptions.filter(e => e.path === p);
  return new Set(D.items.filter(it => excluded(own, p, it.heading, it.text)).map(i => i.id));
}

// ── 範囲のシート ──
function scopeSheet(r, sid) {
  const t = tree(r), s = t.find(x => x.id === sid); if (!s) return;
  const inh = inherited(t, sid), sum = sumOf(r, 'scope|' + sid), others = t.filter(x => x.id !== sid && !chainOf(t, x.id).some(c => c.id === sid));
  const isCommitted = committed(r).some(x => x.id === sid);
  sheet(`<h2>${esc(chainOf(t, sid).map(x => x.name).join(' › '))}</h2>${sum ? `<p style="margin:8px 0 0;font-size:15px">${esc(sum)}</p>` : ''}
  <h4>この棚に置いた札</h4><div class="bd-chips">${s.docs.map(p => chip(r, sid, p, false)).join('') || '<span class="sub">ありません</span>'}</div>
  ${inh.length ? `<h4>上の棚から受け継ぐ札</h4><div class="bd-chips">${inh.map(x => chip(r, sid, x.d, true)).join('')}</div>` : ''}
  <h4>棚の手入れ</h4>
  ${s.key !== 'root' ? `<div class="row"><input id="bd-rn" value="${esc(s.name)}" style="flex:1 1 160px"><button class="btn s" data-brename="${esc(s.key)}">名前を変える</button></div>
  <div class="row"><select id="bd-mv" style="flex:1 1 160px"><option value="">親を選ぶ…</option>${others.map(o => `<option value="${esc(o.key)}">${esc(o.name)}</option>`).join('')}</select><button class="btn s" data-bmove="${esc(s.key)}">この下へ動かす</button></div>` : ''}
  <div class="row"><button class="btn s" data-baddunder="${esc(s.key)}">＋ 下に棚を足す</button>${s.key !== 'root' && !kidsOf(t, sid).length ? `<button class="btn s" data-bremove="${esc(s.key)}">この棚をなくす</button>` : ''}</div>
  ${isCommitted ? `<div class="row"><button class="btn s" data-bproject="${esc(s.key)}">claude.ai のプロジェクト用の指示文</button></div>` : ''}
  ${isCommitted ? `<details style="margin-top:10px" data-bcontract="${esc(s.key)}"><summary class="sub" style="cursor:pointer;min-height:36px">この範囲で Claude に渡す内容</summary><div class="bd-otext" style="white-space:pre-wrap">読み込み中…</div></details>` : ''}
  ${closeRow}`);
}
function nameSheet(r, parentKey) {
  sheet(`<h2>${parentKey === 'root' && !tree(r).length ? '最初の棚を作る' : `「${esc((tree(r).find(x => x.key === parentKey) || { name: parentKey }).name)}」の下に棚を足す`}</h2><input id="bd-nn" placeholder="名前（例：画面）" style="margin-top:10px;width:100%"><p class="sub" style="margin-top:6px">上の棚の札は、自動で降りてきます。</p><div class="row"><button class="btn p" data-bmk="${esc(parentKey)}" style="flex:1">足す</button><button class="btn" data-bclose="1">やめる</button></div>`);
  setTimeout(() => $('#bd-nn') && $('#bd-nn').focus(), 50);
}

// ── 確かめて確定 ──
function opText(r, o) {
  const T = p => `「${title(r, p)}」`, sc = k => { const s = tree(r).find(x => x.key === k) || committed(r).find(x => x.key === k); return `「${s ? s.name : k}」`; };
  const hd = h => h === '*' ? '全体' : h.includes(SEP) ? h.replace(SEP, '：') + '…' : h;
  switch (o.op) {
    case 'add_scope': return `棚${'「' + o.name + '」'}を${o.parent && o.parent !== 'root' ? sc(o.parent) + 'の下に' : ''}作る`;
    case 'rename_scope': return `${sc(o.key)}の名前を「${o.name}」にする`;
    case 'move_scope': return `${sc(o.key)}を${sc(o.parent)}の下へ動かす`;
    case 'remove_scope': return `${sc(o.key)}をなくす`;
    case 'attach': return `${T(o.path)}を${sc(o.scope)}に置く`;
    case 'detach': return `${T(o.path)}を${sc(o.scope)}から外す`;
    case 'add_exception': return `${sc(o.scope)}では、${T(o.path)}の「${hd(o.heading)}」を使わない`;
    case 'remove_exception': return `${sc(o.scope)}で、${T(o.path)}の「${hd(o.heading)}」を使う`;
    case 'pin': return `見直しのピン：${T(o.path)}「${o.heading || '見出しの前'}：${o.item || ''}…」${o.note ? '（' + o.note + '）' : ''}`;
    case 'edit': return `書き換え：${T(o.path)}「${o.heading || '見出しの前'}：${o.item || ''}…」`;
  }
  return JSON.stringify(o);
}
function previewList(pv) {
  return (pv || []).map(p => `<div class="bd-opt" style="display:block"><b>${esc(p.chain.join(' › '))}</b>${p.isNew ? ' <span class="badge">新しい棚</span>' : ''}${p.starts.length ? `<small>効き始める：${p.starts.map(x => esc(title(REPO, x))).join('、')}</small>` : ''}${p.stops.length ? `<small style="color:var(--red)">効かなくなる：${p.stops.map(x => esc(title(REPO, x))).join('、')}</small>` : ''}${p.newExceptions.length ? `<small>使わない部分が増える：${p.newExceptions.length}</small>` : ''}${p.droppedExceptions.length ? `<small>使わない部分が減る：${p.droppedExceptions.length}</small>` : ''}</div>`).join('') || '<p class="sub">効き方は変わりません</p>';
}
function reviewSheet(r) {
  const S = st(r), scopeOps = S.ops.filter(o => o.op !== 'pin' && o.op !== 'edit'), content = S.ops.filter(o => o.op === 'pin' || o.op === 'edit');
  sheet(`<h2>確定する前に</h2>
  ${scopeOps.length ? `<h4>範囲の変更（${scopeOps.length}件）</h4><ul style="margin:4px 0;padding-left:20px;font-size:14px">${scopeOps.map(o => `<li>${esc(opText(r, o))}</li>`).join('')}</ul><h4>これで変わること</h4>${S.error ? `<p style="color:var(--red)">${esc(S.error)}</p>` : previewList(S.preview)}` : ''}
  ${content.length ? `<h4>見直しの相談（${content.length}件）</h4>${content.map(o => `<div class="bd-opt" style="display:block"><b>${esc(opText(r, o))}</b>${o.op === 'edit' ? diffHtml(o.before, o.after) : ''}</div>`).join('')}<p class="sub">相談は「承認待ち」に入ります。コネクタの Claude に「idea-flow の相談を見て」と頼むと、差分を読んで影響と副作用を返事します。</p>` : ''}
  <p class="sub" style="margin-top:12px">${scopeOps.length ? '範囲の変更は、確定するとすぐ反映され、履歴に残ります。' : ''}</p>
  <div class="row" style="margin-top:8px"><button class="btn p" data-bcommit="1" style="flex:1" ${S.error ? 'disabled' : ''}>確定する</button><button class="btn" data-bprompt="all">Claude に渡す文</button><button class="btn" data-bclose="1">戻る</button></div>`);
}
async function commit(r) {
  const S = st(r), scopeOps = S.ops.filter(o => o.op !== 'pin' && o.op !== 'edit'), content = S.ops.filter(o => o.op === 'pin' || o.op === 'edit');
  if (scopeOps.length) {
    const p = await api('/api/scopes/propose', { method: 'POST', body: JSON.stringify({ repo: r, title: `範囲の変更（${scopeOps.length}件）`, reason: 'ボードで変更', ops: scopeOps }) });
    await api('/api/scopes/decide', { method: 'POST', body: JSON.stringify({ id: p.id, decision: 'accept', note: 'ボードで確定' }) });
  }
  if (content.length) await api('/api/scopes/propose', { method: 'POST', body: JSON.stringify({ repo: r, title: `見直しの相談（ピン ${content.filter(o => o.op === 'pin').length}・書き換え ${content.filter(o => o.op === 'edit').length}）`, reason: '', ops: content }) });
  S.ops = []; save(r); close(); await load(r); S.sum = null; summarize(r); draw();
  say(content.length ? '確定しました。相談は承認待ちに入りました（Claude の返事は、ここに付きます）。' : '確定しました。');
}
async function promptSheet(r, body, back) {
  const prev = $('#bd-sheet'), keep = prev ? { doc: prev.dataset.doc, in: prev.dataset.in, inh: prev.dataset.inh } : null;
  const sh = sheet('<p class="sub">作っています…</p>');
  if (keep && keep.doc !== undefined) Object.assign(sh.dataset, keep);
  try {
    const x = await api('/api/requests/prompt', { method: 'POST', body: JSON.stringify({ repo: r, ...body }) });
    sh.innerHTML = `<h2>Claude に渡す文</h2><p class="sub">原文・書き換えたあと・効いている範囲・意味の近い決まり・答え方を、自動でまとめました（約${x.text.length.toLocaleString()}字）。相談に出したものは、コネクタの Claude が直接読めます。</p><textarea id="bd-ctext" class="bd-ta" readonly style="height:50vh;margin-top:10px;font:12.5px/1.5 ui-monospace,monospace">${esc(x.text)}</textarea><div class="row"><button class="btn p" data-bcopy="1" style="flex:1">コピー</button>${back ? `<button class="btn" data-bback="${esc(back)}">戻る</button>` : '<button class="btn" data-bclose="1">閉じる</button>'}</div>`;
  } catch (e) { sh.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>${closeRow}`; }
}

// ── 届ける（書き出し） ──
async function exportSheet(r) {
  const sh = sheet('<p class="sub">書き出す内容を作っています…</p>');
  try {
    const x = await api('/api/export/preview?repo=' + encodeURIComponent(r));
    const cm = x.files.find(f => f.path === 'CLAUDE.md'), others = x.files.filter(f => f.path !== 'CLAUDE.md');
    const block = cm ? cm.after.slice(cm.after.indexOf('<!-- idea-flow:start -->')) : '';
    sh.innerHTML = `<h2>Claude に届ける</h2><p class="sub">${esc(r)}（${esc(x.branch)}）に、PR として出す内容です。</p>
    ${x.notes.map(n => `<p class="sub">${esc(n)}</p>`).join('')}
    ${cm ? `<h4>CLAUDE.md ${cm.before == null ? '<span class="badge">新しいファイル</span>' : '<span class="badge">印の間だけ書き換え</span>'}</h4><p class="sub">Claude Code は CLAUDE.md を毎回自動で読みます。ここに道案内があると、作業の範囲に合った決まりを読んでから進めます。</p><div class="bd-otext" style="white-space:pre-wrap;font:12.5px/1.55 ui-monospace,monospace">${esc(block)}</div>` : (x.files.length || !x.notes.length ? '<p class="sub" style="margin-top:8px">CLAUDE.md の道案内は、もう最新です。</p>' : '')}
    ${x.edits.length ? `<h4>承認した書き換え</h4>${x.edits.map(e => `<div class="bd-opt" style="display:block">${esc(e.path)}「${esc(e.heading || '見出しの前')}」<small style="color:${e.ok ? 'inherit' : 'var(--red)'}">${e.ok ? 'PR に入れます' : '入れません：' + esc(e.reason)}</small></div>`).join('')}` : ''}
    ${others.length ? `<p class="sub">書き換えるファイル：${others.map(f => esc(f.path)).join('、')}</p>` : ''}
    ${!x.canWrite ? '<p style="color:var(--red);font-size:14px">書き込み用の鍵（GITHUB_WRITE_TOKEN）がまだ無いので、PR は出せません。</p>' : ''}
    <div class="row" style="margin-top:12px"><button class="btn p" data-bpr="1" style="flex:1" ${!x.canWrite || !x.files.length ? 'disabled' : ''}>PR を出す</button><button class="btn" data-bclose="1">閉じる</button></div>`;
  } catch (e) { sh.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>${closeRow}`; }
}
async function exportPr(r, b) {
  b.disabled = true; b.textContent = 'PR を出しています…';
  const x = await api('/api/export/pr', { method: 'POST', body: JSON.stringify({ repo: r }) });
  sheet(`<h2>PR を出しました</h2><p><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a></p><p class="sub">中身を確かめて、よければ GitHub でマージしてください。マージすると、次の作業から Claude が道案内を読みます。</p>${x.skipped.length ? `<p class="sub">入れなかった書き換え：${x.skipped.map(e => esc(e.path + '「' + e.heading + '」：' + e.reason)).join('、')}</p>` : ''}${closeRow}`);
  await load(r); draw();
}
async function projectSheet(r, key) {
  const sh = sheet('<p class="sub">作っています…</p>');
  try {
    const x = await api(`/api/export/project?repo=${encodeURIComponent(r)}&scope=${encodeURIComponent(key)}`);
    sh.innerHTML = `<h2>プロジェクト用の指示文</h2><p class="sub">claude.ai でこの範囲の話をするプロジェクトを作り、その「指示」に貼ってください。会話のたびに、Claude がコネクタでこの範囲の決まりを読みます（決まりを変えても、貼り直さなくて大丈夫です）。プロジェクトのメモリを「このプロジェクトだけ」にすると、ほかの話が混ざりにくくなります。</p><textarea id="bd-ctext" class="bd-ta" readonly style="height:34vh;margin-top:10px">${esc(x.text)}</textarea><div class="row"><button class="btn p" data-bcopy="1" style="flex:1">コピー</button><button class="btn" data-bclose="1">閉じる</button></div>`;
  } catch (e) { sh.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>${closeRow}`; }
}

// ── 承認待ちの相談 ──
function reqHtml(q) {
  const content = q.ops.filter(o => o.op === 'pin' || o.op === 'edit'), scopeOps = q.ops.filter(o => o.op !== 'pin' && o.op !== 'edit');
  return `<div class="bd-req"><span class="badge${q.by === 'ai' ? ' k' : ''}">${q.by === 'ai' ? 'Claude からの提案' : '承認待ち'}</span> <b>${esc(q.title)}</b>${q.reason ? `<p class="sub" style="margin:4px 0">${esc(q.reason)}</p>` : ''}
  ${content.map(o => `<div style="margin-top:6px;font-size:14px">${esc(opText(REPO, o))}${o.op === 'edit' ? diffHtml(o.before, o.after) : ''}</div>`).join('')}
  ${scopeOps.length ? `<details><summary class="sub" style="cursor:pointer;min-height:36px">範囲の変更（${scopeOps.length}件）</summary><ul style="margin:4px 0;padding-left:18px;font-size:14px">${scopeOps.map(o => `<li>${esc(opText(REPO, o))}</li>`).join('')}</ul>${q.error ? `<p style="color:var(--red);font-size:14px">このままでは反映できません：${esc(q.error)}</p>` : previewList(q.preview)}</details>` : ''}
  ${(q.comments || []).map(c => `<div class="bd-reply"><b>${c.by === 'ai' ? 'Claude' : 'あなた'}</b>　${esc(c.text)}</div>`).join('')}
  ${!(q.comments || []).some(c => c.by === 'ai') && content.length ? '<p class="sub" style="margin:6px 0">Claude の返事はまだです。コネクタの Claude に「idea-flow の相談を見て」と頼むと、ここに返事が付きます。</p>' : ''}
  <div class="row"><input data-breply="${esc(q.id)}" placeholder="返事（任意）" style="flex:1 1 160px"><button class="btn s" data-bsend="${esc(q.id)}">送る</button></div>
  <div class="row"><button class="btn s p" data-bdecide="${esc(q.id)}" data-d="accept" ${q.error ? 'disabled' : ''}>承認</button><button class="btn s" data-bdecide="${esc(q.id)}" data-d="reject">見送り</button><button class="btn s" data-bprompt="${esc(q.id)}">Claude に渡す文</button></div></div>`;
}

// ── 要約（少しずつ作る） ──
async function summarize(r) {
  const S = st(r); if (S.sum && S.sum.running) return;
  S.sum = { running: true, left: 0 };
  try {
    for (let k = 0; k < 40; k++) {
      const x = await api('/api/rules/summarize', { method: 'POST', body: JSON.stringify({ repo: r, budget: 4 }) });
      S.sum.left = x.remaining; if (REPO === r) draw();
      if (!x.remaining || !x.calls) break;
    }
    { S.data = await api('/api/scopes?repo=' + encodeURIComponent(r)); S.docs = {}; }
  } catch (e) { S.sum.error = e.message; }
  S.sum.running = false; S.sum.left = 0; if (REPO === r) draw();
}

// ── 原文の整形・差分 ──
const inl = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
function mdHtml(src) {
  const L = String(src).split('\n'), o = []; let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^\s*```/.test(l)) { const lang = l.trim().slice(3).trim(), b = []; i++; while (i < L.length && !/^\s*```/.test(L[i])) b.push(L[i++]); i++; o.push(lang === 'mermaid' ? '<p class="sub">（ここに図があります。GitHub で見られます）</p>' : `<pre>${esc(b.join('\n'))}</pre>`); continue; }
    if (/^\s*\|/.test(l)) { const rows = []; while (i < L.length && /^\s*\|/.test(L[i])) rows.push(L[i++]); const cells = x => x.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()); const body = rows.filter(x => !/^\s*\|[\s:|-]+\|\s*$/.test(x)); o.push(`<div class="bd-otbl"><table>${body.map((x, k) => `<tr>${cells(x).map(c => k ? `<td>${inl(c)}</td>` : `<th>${inl(c)}</th>`).join('')}</tr>`).join('')}</table></div>`); continue; }
    if (/^\s*([-*+]|\d+[.)])\s/.test(l)) { const ol = /^\s*\d+/.test(l), it = []; while (i < L.length && /^\s*([-*+]|\d+[.)])\s/.test(L[i])) { it.push(L[i].replace(/^\s*([-*+]|\d+[.)])\s/, '')); i++; while (i < L.length && /^\s{2,}\S/.test(L[i]) && !/^\s*([-*+]|\d+[.)])\s/.test(L[i])) it[it.length - 1] += ' ' + L[i++].trim(); } o.push(`<${ol ? 'ol' : 'ul'}>${it.map(x => `<li>${inl(x)}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`); continue; }
    if (/^#{1,6}\s/.test(l)) { o.push(`<p><b>${inl(l.replace(/^#+\s/, ''))}</b></p>`); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const p = []; while (i < L.length && L[i].trim() && !/^(\s*```|\s*\||\s*([-*+]|\d+[.)])\s|#{1,6}\s)/.test(L[i])) p.push(L[i++].replace(/^\s*>\s?/, '')); o.push(`<p>${inl(p.join(''))}</p>`);
  }
  return o.join('');
}
function lcsOps(A, B) {
  const m = A.length, n = B.length, L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const o = []; let i = 0, j = 0;
  while (i < m || j < n) { if (i < m && j < n && A[i] === B[j]) { o.push(['=', A[i]]); i++; j++; } else if (j < n && (i >= m || L[i][j + 1] >= L[i + 1][j])) { o.push(['+', B[j]]); j++; } else { o.push(['-', A[i]]); i++; } }
  return o;
}
function diffHtml(a, b) {
  const sp = t => String(t).split(/(?<=[。\n])/), ops = lcsOps(sp(a), sp(b)); let o = '';
  for (let k = 0; k < ops.length; k++) {
    const [t, v] = ops[k];
    if (t !== '=') {
      const dels = [], adds = []; while (k < ops.length && ops[k][0] !== '=') (ops[k][0] === '-' ? dels : adds).push(ops[k++][1]); k--;
      const A = dels.join(''), Bb = adds.join('');
      if (A && Bb && A.length * Bb.length < 400000) lcsOps([...A], [...Bb]).forEach(([t2, c]) => { o += t2 === '=' ? esc(c) : t2 === '+' ? `<ins>${esc(c)}</ins>` : `<del>${esc(c)}</del>`; });
      else o += (A ? `<del>${esc(A)}</del>` : '') + (Bb ? `<ins>${esc(Bb)}</ins>` : '');
    } else o += esc(v);
  }
  return `<div class="bd-diff">${o.replace(/<\/del><del>/g, '').replace(/<\/ins><ins>/g, '')}</div>`;
}

// ── 操作 ──
const itemOf = id => { const sh = $('#bd-sheet'); return sh && sh._D ? sh._D.items.find(i => i.id === id) : null; };
document.addEventListener('click', async e => {
  const g = e.target.closest('g[data-sc]'); if (g && EL && EL.contains(g)) { scopeSheet(REPO, g.dataset.sc); return; }
  if (e.target.id === 'bd-scrim') { close(); return; }
  const b = e.target.closest('button'); if (!b) return;
  const D = b.dataset, r = REPO;
  if (!Object.keys(D).some(k => k.startsWith('b'))) return;
  try {
    if (D.bview) { st(r).view = D.bview; draw(); return; }
    if (D.bclose) { close(); return; }
    if (D.bdoc) { docSheet(r, D.bdoc, D.bin || null, D.binh === '1'); return; }
    if (D.bscope) { scopeSheet(r, D.bscope); return; }
    if (D.bexport) { await exportSheet(r); return; }
    if (D.bpr) { await exportPr(r, b); return; }
    if (D.bproject) { await projectSheet(r, D.bproject); return; }
    if (D.bsuggest) { b.disabled = true; b.textContent = '案を作っています…'; const x = await api('/api/scopes/suggest', { method: 'POST', body: JSON.stringify({ repo: r }) }); await setOps(r, [...st(r).ops, ...x.ops]); say(`木の案を「変更」に入れました（${x.ops.length}件）。直してから確定してください。`); return; }
    if (D.baddunder) { nameSheet(r, D.baddunder); return; }
    if (D.bmk) { const v = ($('#bd-nn').value || '').trim(); if (!v) return; close(); await setOps(r, [...st(r).ops, { op: 'add_scope', key: newKey(), name: v, parent: D.bmk }]); return; }
    if (D.brename) { const v = ($('#bd-rn').value || '').trim(); if (!v) return; close(); await setOps(r, [...st(r).ops, { op: 'rename_scope', key: D.brename, name: v }]); return; }
    if (D.bmove) { const v = $('#bd-mv').value; if (!v) return say('親を選んでください'); close(); await setOps(r, [...st(r).ops, { op: 'move_scope', key: D.bmove, parent: v }]); return; }
    if (D.bremove) { close(); await setOps(r, [...st(r).ops, { op: 'remove_scope', key: D.bremove }]); return; }
    if (D.bundo) { await setOps(r, []); return; }
    if (D.breview) { reviewSheet(r); return; }
    if (D.bcommit) { b.disabled = true; await commit(r); return; }
    if (D.bprompt) { await promptSheet(r, D.bprompt === 'all' ? { ops: st(r).ops } : { id: D.bprompt }, D.bprompt === 'all' ? 'review' : ''); return; }
    if (D.bback) { if (D.bback === 'review') reviewSheet(r); else reopen(); return; }
    if (D.bcopy) { const ta = $('#bd-ctext'); try { await navigator.clipboard.writeText(ta.value); b.textContent = 'コピーしました'; } catch (_) { ta.select(); } return; }
    if (D.bsend) { const inp = document.querySelector(`[data-breply="${CSS.escape(D.bsend)}"]`); if (!inp.value.trim()) return; b.disabled = true; await api('/api/requests/comment', { method: 'POST', body: JSON.stringify({ id: D.bsend, text: inp.value }) }); await load(r); draw(); return; }
    if (D.bdecide) { b.disabled = true; const inp = document.querySelector(`[data-breply="${CSS.escape(D.bdecide)}"]`); await api('/api/scopes/decide', { method: 'POST', body: JSON.stringify({ id: D.bdecide, decision: D.d, note: inp && inp.value || null }) }); await load(r); draw(); say(D.d === 'accept' ? '承認しました（履歴に残ります）。' : '見送りました。'); return; }
    // 決まり1つへの操作
    const sh = $('#bd-sheet'), p = sh && sh.dataset.doc;
    if (D.bpin || D.bedit || D.bask) {
      const it = itemOf(D.bpin || D.bedit || D.bask), box = b.closest('[data-bacts]'); if (!it) return;
      const base = { path: p, heading: it.heading, item: itemHead(it.text), line: it.line };
      if (D.bask) { const ex = st(r).ops.find(o => (o.op === 'edit' || o.op === 'pin') && o.path === p && o.heading === it.heading && o.item === base.item); await promptSheet(r, { ops: [ex || { op: 'pin', ...base }] }, 'doc'); return; }
      if (D.bpin) { const cur = st(r).ops.find(o => o.op === 'pin' && o.path === p && o.heading === it.heading && o.item === base.item); box.innerHTML = `<textarea class="bd-ta" style="height:90px" placeholder="何を見直してほしいか（空でもよい）">${esc(cur ? cur.note || '' : '')}</textarea><div class="row"><button class="btn s p" data-bpinsave="${it.id}">ピンを付ける</button><button class="btn s" data-breopen="1">やめる</button></div>`; box.querySelector('textarea').focus(); return; }
      const raw = rawOf(sh._D, it), cur = st(r).ops.find(o => o.op === 'edit' && o.path === p && o.heading === it.heading && o.item === base.item);
      box.innerHTML = `<textarea class="bd-ta" style="height:200px">${esc(cur ? cur.after : raw)}</textarea><div class="row"><button class="btn s p" data-beditsave="${it.id}">直した内容を入れる</button><button class="btn s" data-breopen="1">やめる</button></div>`; box.querySelector('textarea').focus(); return;
    }
    if (D.bpinsave || D.beditsave) {
      const it = itemOf(D.bpinsave || D.beditsave), v = b.closest('[data-bacts]').querySelector('textarea').value; if (!it) return;
      const base = { path: p, heading: it.heading, item: itemHead(it.text), line: it.line };
      const same = o => o.path === p && o.heading === it.heading && o.item === base.item;
      let ops = st(r).ops;
      if (D.bpinsave) ops = [...ops.filter(o => !(o.op === 'pin' && same(o))), { op: 'pin', ...base, note: v.trim() }];
      else { const before = rawOf(sh._D, it); ops = ops.filter(o => !(o.op === 'edit' && same(o))); if (v.trim() !== before.trim()) ops.push({ op: 'edit', ...base, before, after: v }); }
      await setOps(r, ops); reopen(); return;
    }
    if (D.bunpin || D.bunedit) { const it = itemOf(D.bunpin || D.bunedit); if (!it) return; const k = D.bunpin ? 'pin' : 'edit'; await setOps(r, st(r).ops.filter(o => !(o.op === k && o.path === p && o.heading === it.heading && o.item === itemHead(it.text)))); reopen(); return; }
    if (D.breopen) { reopen(); return; }
  } catch (err) { say(err.message); b.disabled = false; }
});
document.addEventListener('change', async e => {
  const x = e.target, sh = $('#bd-sheet'); if (!sh || !sh.contains(x)) return;
  const r = REPO, p = sh.dataset.doc, sid = sh.dataset.in;
  try {
    if (x.dataset.bplace) {
      const k = x.dataset.bplace, S = st(r);
      const was = (committed(r).find(s => s.key === k) || { docs: [] }).docs.includes(p);
      let ops = S.ops.filter(o => !((o.op === 'attach' || o.op === 'detach') && o.scope === k && o.path === p));
      if (x.checked && !was) ops.push({ op: 'attach', scope: k, path: p });
      if (!x.checked && was) ops.push({ op: 'detach', scope: k, path: p });
      await setOps(r, ops); reopen(); return;
    }
    if (x.dataset.bex || x.dataset.bgrp) {
      const D = sh._D, sel = currentSel(r, sid, p, D);
      let ids;
      if (x.dataset.bex) ids = [x.dataset.bex];
      else { const path = x.dataset.bgrp; const find = (ns) => { for (const n of ns) { if (n.path === path) return n; const f = find(n.kids); if (f) return f; } return null; }; let n = find(sh._roots); if (!n && path.endsWith('#body')) { const o = find_(sh._roots, path.slice(0, -5)); n = o ? { items: o.items, kids: [] } : null; } ids = n ? leavesOf(n).map(i => i.id) : []; }
      ids.forEach(id => x.checked ? sel.add(id) : sel.delete(id));
      await setExceptions(r, sid, p, sel); return;
    }
  } catch (err) { say(err.message); }
});
function find_(ns, path) { for (const n of ns) { if (n.path === path) return n; const f = find_(n.kids, path); if (f) return f; } return null; }
document.addEventListener('toggle', async e => {
  const d = e.target; if (!d.dataset || !d.dataset.bcontract || !d.open) return;
  const box = d.querySelector('.bd-otext');
  try { const x = await api(`/api/scopes/contract?repo=${encodeURIComponent(REPO)}&scope=${encodeURIComponent(d.dataset.bcontract)}`); box.textContent = x.text; } catch (err) { box.textContent = err.message; }
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); const g = e.target.closest && e.target.closest('g[data-sc]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); scopeSheet(REPO, g.dataset.sc); } });
// タブを移ったら下の帯を片づける
new MutationObserver(() => bar()).observe($('#v-rules'), { attributes: true, attributeFilter: ['hidden'] });

window.Board = { render };
})();
