// 地図（「決まり」タブの「地図」）。機能の一覧（カタログ）と、マージした PR・Issue から自動で作る。
// 機能ごとの稼働（なぞるとその日の作業）・状態・使うデータ・関係する Issue、データの流れの図。
(() => {
const IF = window.IF, { api, esc } = IF;
const css = document.createElement('style');
css.textContent = `
.wm{--h1:light-dark(#9fe3bb,#1d5e3b);--h2:light-dark(#2fae69,#2fae69);--h3:light-dark(#0c5a35,#9ff2c2);--warn:light-dark(#9a5b00,#f2b75a);--warnbg:light-dark(#fff3dc,#3a2a10);--red2:light-dark(#b42318,#ff8a80)}
.wm-sum{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
.wm-sum div{background:var(--soft);border-radius:12px;padding:8px 12px}.wm-sum b{display:block;font-size:24px;line-height:1.2;font-variant-numeric:tabular-nums}.wm-sum span{font-size:12.5px;color:var(--mute)}
.wm-sum .hot{background:#b8f5d0;color:#0c3b24}.wm-sum .hot span{color:#0c3b24}
.wm-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.wm-chip{font:inherit;font-size:13px;min-height:38px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}.wm-chip[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.wm-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12.5px;color:var(--mute);margin-top:8px}.wm-sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.wm-days,.wm-row{display:grid;grid-template-columns:8.6em minmax(0,1fr);gap:8px;align-items:center}
.wm-days{font-size:11px;color:var(--mute);position:sticky;top:0;background:var(--panel);z-index:2;padding:6px 4px}
.wm-strip{display:grid;gap:2px}.wm-strip i{display:block;height:18px;border-radius:2px;background:var(--line)}.wm-strip i.l{height:auto;background:none;font-style:normal;text-align:left;white-space:nowrap;overflow:visible}
.wm-strip i.hit{outline:2px solid var(--ink);outline-offset:1px}
.wm-gh{font-size:12.5px;font-weight:600;color:var(--mute);margin:12px 0 2px;padding:0 4px}
.wm-row{padding:5px 4px;border-radius:10px;border:1px solid transparent;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.wm-row.on{border-color:var(--ink);border-radius:10px 10px 0 0}.wm-row.dim{opacity:.35}
.wm-nm{font-size:14px;line-height:1.35}.wm-nm small{font-size:11.5px}
.wm-s0{color:#1f9e5a}.wm-s2{color:var(--warn)}
.wm-scr{touch-action:pan-y;cursor:crosshair;padding:6px 0}
.wm-det{margin:0 0 8px;padding:10px 12px;border:1px solid var(--ink);border-top:0;border-radius:0 0 10px 10px;font-size:14px;color:var(--mute)}
.wm-det h4{margin:10px 0 2px;font-size:13px;color:var(--ink)}.wm-det ul{margin:0;padding-left:1.2em}.wm-det li{margin:2px 0}
.wm-iss{border-top:1px solid var(--line);padding:9px 0;font-size:14px}.wm-iss a{font-weight:600;text-decoration:none}.wm-iss a:hover{text-decoration:underline}.wm-iss .m{font-size:12.5px;color:var(--mute)}
.wm-stale{color:var(--warn);background:var(--warnbg);font-size:11.5px;padding:1px 8px;border-radius:999px;margin-left:6px;white-space:nowrap}
.wm-bar{position:fixed;left:8px;right:8px;bottom:max(10px,env(safe-area-inset-bottom));max-width:640px;margin:0 auto;background:var(--ink);color:var(--bg);border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.5;z-index:20;max-height:42vh;overflow:auto}
.wm-bar ul{margin:4px 0 0;padding-left:1.1em}.wm-bar a{color:inherit}.wm-bar .x{float:right;background:none;border:0;color:inherit;font:inherit;font-size:18px;min-width:44px;min-height:32px;cursor:pointer}
.wm h3{font-size:16px;color:var(--ink);font-weight:600;margin:22px 0 2px}
`;
document.head.appendChild(css);
const ST = ['作っている', '落ち着いた', '止まっている'];
const S = {}; let EL = null, REPO = '';
const st = r => S[r] || (S[r] = { data: null, span: 21, filt: -1, sel: null, node: null, busy: false, note: '', synced: false });
const lv = n => n === 0 ? 'var(--line)' : n <= 1 ? 'var(--h1)' : n <= 3 ? 'var(--h2)' : 'var(--h3)';
const md = d => d ? d.slice(5).replace('-', '/') : '';
const GH = r => `https://github.com/${r}`;

async function load(r) { const s = st(r); s.data = await api(`/api/map?repo=${encodeURIComponent(r)}&span=${s.span}`); }
async function sync(r) {
  const s = st(r); if (s.busy) return; s.busy = true; s.note = 'GitHub から PR と Issue を読んでいます…'; draw();
  try {
    let n = 0;
    for (let k = 0; k < 8; k++) { const x = await api('/api/map/sync', { method: 'POST', body: JSON.stringify({ repo: r, pages: 4 }) }); n += x.prs; s.note = `PR を ${n} 件読みました…`; draw(); if (x.backfillDone) break; }
    await load(r); s.note = '';
  } catch (e) { s.note = '読めませんでした：' + e.message; }
  s.busy = false; s.synced = true; draw();
}

function iline(d, i) {
  const fn = id => { const f = d.features.find(x => x.id === id); return f ? `${f.name}（${ST[f.state]}）` : id; };
  const where = i.features.map(fn).join('、') || (i.nodes.length ? 'なし（画面のないデータ）' : 'どの機能にも当たらない');
  return `<div class="wm-iss"><a href="${GH(REPO)}/issues/${i.number}" target="_blank" rel="noopener">#${i.number} ${esc(i.title)}</a>${i.stale ? '<span class="wm-stale">古くなっている候補</span>' : ''}
  <div class="m">${i.open ? '最後に動いた ' + md(i.updated) : '閉じた ' + md(i.closed)}　機能：${esc(where)}${i.nodes.length ? '　データ：' + esc(i.nodes.map(k => d.nodes[k]?.name || k).join('、')) : ''}${i.how ? '　（' + esc(i.how) + '）' : ''}</div></div>`;
}
function detail(d, f) {
  const iss = d.issues.filter(i => i.features.includes(f.id));
  return `<div style="color:var(--ink)">${esc(f.desc)}</div><div style="margin-top:4px">入口：${esc(f.group)}　データ：${esc(f.data.map(k => d.nodes[k]?.name || k).join('、') || 'なし')}</div>
  <h4>最近の作業</h4><ul>${f.recent.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">#${p.n}</a> ${md(p.day)} ${esc(p.t)}</li>`).join('') || '<li>なし</li>'}</ul>
  <h4>関係する Issue</h4>${iss.length ? iss.map(i => iline(d, i)).join('') : '<div>なし</div>'}`;
}
function flow(d, s) {
  const nk = Object.keys(d.nodes), fs = d.features, W = Math.max(320, (EL.clientWidth || 360) - 8), rh = 26, H = Math.max(nk.length, fs.length) * rh + 30;
  const lw = Math.min(170, W * 0.44), rx = W - Math.min(170, W * 0.44), ny = k => 20 + nk.indexOf(k) * (H - 30) / nk.length, fy = i => 20 + i * (H - 30) / fs.length;
  const fsz = W < 420 ? 10.5 : 12, any = s.sel || s.node, act = f => s.sel === f.id || (s.node && f.data.includes(s.node));
  let o = '';
  fs.forEach((f, i) => f.data.forEach(k => { if (!d.nodes[k]) return; const y1 = ny(k), y2 = fy(i), a = act(f); o += `<path d="M${lw} ${y1} C${(lw + rx) / 2} ${y1},${(lw + rx) / 2} ${y2},${rx} ${y2}" fill="none" stroke="${a ? '#2fae69' : 'currentColor'}" stroke-opacity="${a ? 0.9 : any ? 0.06 : 0.2}" stroke-width="${a ? 2 : 1}"/>`; }));
  nk.forEach(k => { const n = d.nodes[k], y = ny(k), unused = n.note === '画面なし', on = s.node === k || (s.sel && fs.find(f => f.id === s.sel)?.data.includes(k));
    o += `<g data-node="${esc(k)}" style="cursor:pointer;opacity:${any && !on ? 0.35 : 1}"><rect x="2" y="${y - 11}" width="${lw - 4}" height="22" rx="5" fill="${n.col ? 'var(--panel)' : 'var(--soft)'}" stroke="${unused ? 'var(--red2)' : on ? '#2fae69' : 'var(--line)'}" stroke-dasharray="${unused ? '4 3' : ''}"/><text x="10" y="${y + 4}" font-size="${fsz}" fill="${unused ? 'var(--red2)' : 'currentColor'}">${esc(n.name)}</text></g>`; });
  fs.forEach((f, i) => { const y = fy(i), nm = f.name.replace(/（.*）/, ''), lab = W < 420 && nm.length > 10 ? nm.slice(0, 9) + '…' : nm;
    o += `<g data-feat="${esc(f.id)}" style="cursor:pointer;opacity:${any && !act(f) ? 0.35 : 1}"><circle cx="${rx + 6}" cy="${y}" r="4" fill="${f.state === 0 ? '#2fae69' : f.state === 2 ? '#c98500' : '#9a9a95'}"/><text x="${rx + 14}" y="${y + 4}" font-size="${fsz}" fill="currentColor">${esc(lab)}</text></g>`; });
  return `<svg id="wmflow" viewBox="0 0 ${W} ${H}" style="display:block;width:100%;height:${H}px" role="img" aria-label="データと機能のつながり">${o}</svg>`;
}

function draw() {
  if (!EL) return;
  const s = st(REPO), d = s.data;
  const top = `<div class="row" style="margin-top:0"><button class="btn" id="wmsync" ${s.busy ? 'disabled' : ''}>${s.busy ? '読んでいます…' : 'GitHub から読み直す'}</button>
    <div class="seg" role="group" aria-label="期間">${[[21, '3週間'], [60, '2か月']].map(([v, l]) => `<button data-span="${v}" aria-pressed="${s.span === v}">${l}</button>`).join('')}</div></div>
    ${s.note ? `<p class="sub" style="margin-top:6px">${esc(s.note)}</p>` : ''}`;
  if (!d) { EL.innerHTML = `<div class="wm">${top}<p class="sub" style="margin-top:8px">読み込み中…</p></div>`; return; }
  if (!d.catalog) { EL.innerHTML = `<div class="wm">${top}<p class="sub" style="margin-top:8px">このリポジトリには、まだ機能の一覧（カタログ）がありません。<code>src/catalogs.ts</code> に足すと、地図が作られます。</p></div>`; return; }
  const c = d.counts, n = d.days.length, step = n > 30 ? 14 : 7;
  let rows = '', g = '';
  for (const f of d.features) {
    if (s.filt >= 0 && f.state !== s.filt) continue;
    if (f.group !== g) { g = f.group; rows += `<div class="wm-gh">${esc(g)}</div>`; }
    const on = s.sel === f.id, dim = s.node && !f.data.includes(s.node), open = d.issues.filter(i => i.open && i.features.includes(f.id)).length;
    rows += `<div class="wm-row${on ? ' on' : ''}${dim ? ' dim' : ''}" data-f="${esc(f.id)}" tabindex="0" role="button" aria-expanded="${on}"><div class="wm-nm">${esc(f.name)}<small class="wm-s${f.state}">${ST[f.state]}・最後 ${md(f.last) || 'なし'}・${f.span}件${open ? `・Issue ${open}` : ''}</small></div>
      <div class="wm-strip wm-scr" data-f="${esc(f.id)}" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${f.days.map(v => `<i style="background:${lv(v)}"></i>`).join('')}</div></div>${on ? `<div class="wm-det">${detail(d, f)}</div>` : ''}`;
  }
  const open = d.issues.filter(i => i.open), closed = d.issues.filter(i => !i.open);
  const nodeNote = s.node ? `<div class="card" style="margin-top:8px"><b>${esc(d.nodes[s.node].name)}</b><div class="sub">${esc(d.nodes[s.node].note)}。使っている機能：${esc(d.features.filter(f => f.data.includes(s.node)).map(f => f.name).join('、') || 'なし')}</div>${d.issues.filter(i => i.nodes.includes(s.node)).map(i => iline(d, i)).join('')}</div>` : '';
  EL.innerHTML = `<div class="wm">${top}
  <p class="sub" style="margin-top:8px">機能の一覧と、マージした PR（変えたファイル）・Issue から自動で作ります。読むだけで、リポジトリには書きません。今日（${md(d.today)}）までの${n}日。</p>
  <div class="wm-sum"><div class="hot"><b>${c.stopped}</b><span>止まっている機能（直近7日に作業なし）</span></div><div><b>${c.building}／${c.settled}</b><span>作っている／落ち着いた</span></div>
  <div><b>${c.openIssues}</b><span>開いている Issue（うち古い候補 ${c.stale}）</span></div><div><b style="color:var(--red2)">${c.unused}</b><span>貯めているが画面なし</span></div></div>
  <h3>機能ごとの稼働</h3><p class="sub">1マス＝1日（マージした PR の数）。マスを指でなぞると、その日の作業が下に出ます。名前を押すと中身が開きます。</p>
  <div class="wm-legend"><span><span class="wm-sw" style="background:var(--line)"></span>0</span><span><span class="wm-sw" style="background:var(--h1)"></span>1</span><span><span class="wm-sw" style="background:var(--h2)"></span>2〜3</span><span><span class="wm-sw" style="background:var(--h3)"></span>4 以上</span></div>
  <div class="wm-chips">${[['すべて', -1], ...ST.map((l, i) => [l, i])].map(([l, i]) => `<button class="wm-chip" data-filt="${i}" aria-pressed="${s.filt === i}">${l}</button>`).join('')}</div>
  <div class="wm-days"><span></span><div class="wm-strip" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${d.days.map((x, k) => `<i class="l">${(n - 1 - k) % step === 0 ? md(x) : ''}</i>`).join('')}</div></div>
  <div id="wmrows">${rows}</div>
  <p class="sub" style="margin-top:8px">状態：直近7日に作業なし＝止まっている。直近4日に3件以上＝作っている。それ以外＝落ち着いた。</p>
  <h3>開いている Issue と、つながる機能</h3><p class="sub">関係する機能がすべて止まっていて、Issue も7日以上動いていないものに「古くなっている候補」を付けます。閉じるかを決めるのは人です。</p>
  ${[...open].sort((a, b) => b.stale - a.stale).map(i => iline(d, i)).join('') || '<p class="sub">なし</p>'}
  <details style="margin-top:8px"><summary class="sub">閉じた Issue ${closed.length} 件</summary>${closed.map(i => iline(d, i)).join('')}</details>
  <h3>どの機能にも当たらない作業</h3><p class="sub">この期間に、一覧のどの機能のファイルにも当たらなかった PR。増えてきたら、一覧に機能を足すかを決めます。</p>
  ${d.unmatched.length ? `<ul style="font-size:14px;padding-left:1.2em">${d.unmatched.slice(0, 30).map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">#${p.n}</a> ${md(p.day)} ${esc(p.t)}</li>`).join('')}</ul>` : '<p class="sub">なし</p>'}
  <h3>データの流れ</h3><p class="sub">左はデータ、右は機能。赤い破線は、貯めているのにどの画面も使っていないデータ。押すと、つながる先が光ります。</p>
  ${nodeNote}<div class="fig" style="margin-top:8px">${flow(d, s)}</div>
  <p class="sub" style="margin-top:8px">取り込み：PR ${d.sync?.pr_done ? 'すべて' : '途中まで'}・最後に読んだ ${d.sync?.prs_at ? md(d.sync.prs_at.slice(0, 10)) + ' ' + d.sync.prs_at.slice(11, 16) + '（UTC）' : 'まだ'}</p></div>`;
}

let bar = null;
function showDay(strip, x) {
  const d = st(REPO).data, f = d.features.find(z => z.id === strip.dataset.f), rc = strip.getBoundingClientRect(), n = d.days.length;
  const k = Math.max(0, Math.min(n - 1, Math.floor((x - rc.left) / rc.width * n)));
  EL.querySelectorAll('.wm-strip i.hit').forEach(c => c.classList.remove('hit')); strip.children[k].classList.add('hit');
  if (!bar) { bar = document.createElement('div'); bar.className = 'wm-bar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); bar.addEventListener('click', e => { if (e.target.closest('.x')) hideDay(); }); }
  const L = f.byDay[k];
  bar.innerHTML = `<button class="x" aria-label="閉じる">×</button><b>${md(d.days[k])}</b>　${esc(f.name)}：<b>${L.length}件</b>${L.length ? `<ul>${L.slice(0, 8).map(p => `<li><a href="${GH(REPO)}/pull/${p.n}" target="_blank" rel="noopener">#${p.n}</a> ${esc(p.t)}</li>`).join('')}${L.length > 8 ? `<li>ほか ${L.length - 8}件</li>` : ''}</ul>` : '<div>この日の作業はありません</div>'}`;
  bar.hidden = false;
}
function hideDay() { if (bar) bar.hidden = true; EL && EL.querySelectorAll('.wm-strip i.hit').forEach(c => c.classList.remove('hit')); }

let scrub = null, bound = null;
function bind(el) {
  if (bound === el) return; bound = el;
  el.addEventListener('pointerdown', e => { const sc = e.target.closest('.wm-scr'); if (!sc) return; scrub = sc; try { sc.setPointerCapture(e.pointerId); } catch (_) {} showDay(sc, e.clientX); });
  el.addEventListener('pointermove', e => { if (scrub) showDay(scrub, e.clientX); });
  ['pointerup', 'pointercancel'].forEach(k => el.addEventListener(k, () => { scrub = null; }));
  el.addEventListener('click', e => {
    const s = st(REPO), t = e.target;
    if (t.closest('#wmsync')) { sync(REPO); return; }
    const sp = t.closest('[data-span]'); if (sp) { s.span = +sp.dataset.span; hideDay(); load(REPO).then(draw).catch(err => { s.note = err.message; draw(); }); return; }
    const fl = t.closest('[data-filt]'); if (fl) { s.filt = +fl.dataset.filt; draw(); return; }
    if (t.closest('.wm-scr') || t.closest('a')) return;
    const r = t.closest('.wm-row'); if (r) { hideDay(); s.sel = s.sel === r.dataset.f ? null : r.dataset.f; s.node = null; draw(); return; }
    const g = t.closest('[data-node],[data-feat]');
    if (g) { if (g.dataset.node) { s.node = s.node === g.dataset.node ? null : g.dataset.node; s.sel = null; draw(); }
      else { s.sel = g.dataset.feat; s.node = null; draw(); EL.querySelector(`.wm-row[data-f="${CSS.escape(s.sel)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }
  });
  el.addEventListener('keydown', e => { const r = e.target.closest('.wm-row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
}

async function render(el, repo) {
  EL = el; REPO = repo; bind(el); hideDay(); draw();
  const s = st(repo);
  try { await load(repo); draw(); } catch (e) { s.note = e.message; draw(); return; }
  // 開いたときに一度だけ、静かに新しい PR と Issue を読む
  if (!s.synced && s.data?.catalog) sync(repo);
}
window.WorkMap = { render };
})();
