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
.wm-tl{display:grid;grid-template-columns:9.5em minmax(0,1fr);gap:8px;align-items:center;padding:5px 4px;border-radius:10px;border:1px solid transparent;cursor:pointer}
.wm-tl.on{border-color:var(--ink);border-radius:10px 10px 0 0}.wm-tl .nm{font-size:13px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.wm-track{position:relative;height:22px}.wm-track .ax{position:absolute;top:0;bottom:0;width:1px;background:var(--line)}
.wm-track .bar{position:absolute;top:7px;height:8px;border-radius:4px;background:var(--mute);min-width:4px}
.wm-track .bar.open{background:transparent;border:2px solid #2fae69;top:6px}.wm-track .bar.stale{border-color:var(--warn)}.wm-track .bar.done{background:#2fae69}
.wm-track .pr.k{border-style:dashed;opacity:.6;transform:scale(.8)}.wm-track .pr b{position:absolute;top:-13px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:600;color:var(--mute)}
.wm-link{border-top:1px dashed var(--line);padding:8px 0;font-size:13.5px}.wm-lt{display:block;font-weight:600;color:var(--ink);font-size:14.5px;line-height:1.45;text-decoration:none;padding:2px 0}.wm-lt:active,.wm-lt:hover{text-decoration:underline}.wm-lm{font-size:11.5px;color:var(--mute);margin-top:2px}details.ev summary{cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;list-style:none;padding:3px 0}details.ev summary::-webkit-details-marker{display:none}details.ev summary b{color:var(--ink);font-weight:500;margin-right:6px}details.ev[open] summary span{display:none}details.ev div{padding:2px 0 2px 8px;border-left:2px solid var(--line);margin:2px 0}.wm-lh{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:10px}.wm-lh h4{margin:0}.wm-pick{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--ink);border-radius:12px;padding:10px 12px;margin-top:8px}.wm-pick small{display:block;font-size:11.5px;color:var(--mute)}.wm-pick b{font-size:16px}.wm-plist button{display:block;width:100%;text-align:left;margin-top:6px;min-height:44px}.wm-q{flex:1;min-width:0;font-size:16px;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink)}.wm-link .ev{font-size:12px;color:var(--mute);margin-top:1px}.wm-kind{font-size:11px;padding:1px 7px;border-radius:999px;background:var(--soft);margin-right:4px;white-space:nowrap}.wm-kind.k{border:1px dashed var(--mute);background:none}
.wm-track .pr{position:absolute;top:4px;width:12px;height:12px;margin-left:-6px;border-radius:50%;border:2px solid var(--ink);background:var(--panel)}.wm-track .pr.c{background:var(--ink)}
.wm-axis{display:grid;grid-template-columns:9.5em minmax(0,1fr);gap:8px;font-size:11px;color:var(--mute);position:sticky;top:0;background:var(--panel);z-index:2;padding:6px 4px}.wm-axis div{position:relative;height:14px}.wm-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.wm-cl{position:relative;margin-top:10px}.wm-cl svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.wm-cn{position:absolute;box-sizing:border-box;border:1px solid var(--line);background:var(--panel);border-radius:9px;padding:4px 7px;font-size:12px;line-height:1.3;cursor:pointer;overflow:hidden;color:var(--ink)}
.wm-cn small{display:block;font-size:10.5px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wm-cn span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.wm-cn.f{background:var(--ink);color:var(--bg);border-color:var(--ink);font-weight:600}.wm-cn.f small{color:var(--bg);opacity:.75}
.wm-cn.open{border-left:4px solid #2fae69}.wm-cn.stale{border-left-color:var(--warn)}.wm-cn.on{outline:2px solid var(--ink);outline-offset:1px}.wm-cn.dim{opacity:.35}.wm-cn.other{border-style:dashed}
.wm-lk{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--mute);margin-top:6px}.wm-lk i{display:inline-block;width:22px;vertical-align:middle;margin-right:4px;border-top:2px solid var(--mute)}
.wm h3{font-size:16px;color:var(--ink);font-weight:600;margin:22px 0 2px}
`;
document.head.appendChild(css);
// 状態は、見た事実のまま言う（「止まっている」と決めつけない）
const ST = ['直近4日に3件以上マージ', '直近7日にマージあり', '直近7日マージなし'];
const S = {}; let EL = null, REPO = '';
const st = r => S[r] || (S[r] = { data: null, span: 21, view: 'feat', ifilt: 'all', isel: null, ifocus: null, cl: null, csel: null, cand: false, filt: -1, sel: null, node: null, busy: false, note: '', synced: false });
const lv = n => n === 0 ? 'var(--line)' : n <= 1 ? 'var(--h1)' : n <= 3 ? 'var(--h2)' : 'var(--h3)';
const md = d => d ? d.slice(5).replace('-', '/') : '';
const GH = r => `https://github.com/${r}`;

// 期間を続けて切り替えたとき、遅れて届いた古い答えで上書きしない（最後に頼んだ分だけを使う）
async function load(r) { const s = st(r), id = (s.req = (s.req || 0) + 1); const x = await api(`/api/map?repo=${encodeURIComponent(r)}&span=${s.span}`); if (id === s.req) { s.data = x; s.kb = Math.round(JSON.stringify(x).length / 1024); } }
async function sync(r) {
  const s = st(r); if (s.busy) return; s.busy = true; s.note = 'GitHub から最近の更新と Issue を読んでいます…'; draw();
  try {
    // 最近の更新（と Issue）を先に。追いつくまで続ける（3回まで）。そのあと、さかのぼりが残っていれば続ける
    let up = 0, iss = 0, full = false, caught = false, done = false, back = 0, busy = false, calls = 0, ms = 0;
    // ほかの読み込み（コネクタなど）と重なったら、4秒待って2回まで頼み直す（ロックは終われば外れる）
    const call = async body => { for (let t = 0; ; t++) { const x = await api('/api/map/sync', { method: 'POST', body: JSON.stringify({ repo: r, ...body }) }); calls += x.calls || 0; ms += x.ms || 0; if (!x.busy || t >= 2) return x; s.note = 'ほかの読み込みが終わるのを待っています…'; draw(); await new Promise(z => setTimeout(z, 4000)); } };
    for (let k = 0; k < 3 && !caught; k++) { const x = await call({ mode: 'update' }); if (x.busy) { busy = true; break; } up += x.updated; iss += x.issues; full = full || x.issuesFull; caught = x.caughtUp; done = x.backfillDone; }
    for (let k = 0; k < 8 && !busy && !done; k++) { const x = await call({ mode: 'backfill', pages: 4 }); if (x.busy) { busy = true; break; } back += x.backfilled; done = x.backfillDone; s.note = `さかのぼり ${back}件…`; draw(); }
    await load(r);
    s.note = busy ? 'ほかの読み込み（コネクタなど）の途中だったので、保存済みの地図を出しています。少し待ってから読み直してください。'
      : `最近の更新 ${up}件${caught ? '' : '（続きあり）'}・${full ? `Issue ${iss}件（全部読み直し）` : `動いた Issue ${iss}件`}${back ? `・さかのぼり ${back}件` : ''}を確かめました。（計測：GitHub に ${calls}回・${(ms / 1000).toFixed(1)}秒／地図の計算 ${s.data?.took ?? '—'}ms・${s.kb ?? '—'}KB）`;
  } catch (e) { s.note = '読めませんでした：' + e.message; }
  s.busy = false; s.synced = true; draw();
}

function iline(d, i) {
  const fn = id => { const f = d.features.find(x => x.id === id); return f ? `${f.name}（${ST[f.state]}）` : id; };
  const where = i.features.map(fn).join('、') || (i.nodes.length ? 'なし（画面のないデータ）' : 'どの機能にも当たらない');
  return `<div class="wm-iss"><a href="${i.url || GH(REPO) + '/issues/' + i.number}" target="_blank" rel="noopener">#${i.number} ${esc(i.title)}</a>${i.stale ? '<span class="wm-stale">古くなっている候補</span>' : ''}
  <div class="m">${i.open ? '最後に動いた ' + md(i.updated) : '閉じた ' + md(i.closed)}　機能：${esc(where)}${i.nodes.length ? '　データ：' + esc(i.nodes.map(k => d.nodes[k]?.name || k).join('、')) : ''}${i.how ? '　（' + esc(i.how) + '）' : ''}</div></div>`;
}
// 書き方の守り具合（CLAUDE.md の「書き方」）。足りないものの一覧は開いたときだけ
function writing(w) {
  if (!w || (!w.prs && !w.issues)) return '';
  const bar = (k, n, l) => { const p = n ? Math.round(k / n * 100) : 0; return `<div style="display:grid;grid-template-columns:11em minmax(0,1fr) 4.5em;gap:8px;align-items:center;font-size:13px;margin-top:4px"><span>${l}</span><span style="height:8px;border-radius:4px;background:var(--line);overflow:hidden"><i style="display:block;height:100%;width:${p}%;background:${p >= 80 ? '#2fae69' : p >= 50 ? '#c98500' : 'var(--red2)'}"></i></span><span style="text-align:right;font-variant-numeric:tabular-nums">${n ? `${k}/${n}` : '—'}</span></div>`; };
  return `<h3>書き方の守り具合</h3><p class="sub">この期間の PR ${w.prs}件・立てた Issue ${w.issues}件。書き方がそろうほど、地図のつながりが確かになります。</p>
  ${bar(w.prTitle, w.prs, 'PR：題の頭に機能名')}${bar(w.prLinked, w.prs, 'PR：Issue の番号')}${bar(w.prReport, w.prs, 'PR：申告の3つの見出し')}${bar(w.issueFeature, w.issues, 'Issue：「機能：」')}${bar(w.issueClose, w.issues, 'Issue：「閉じる条件：」')}
  ${w.misses.length ? `<details style="margin-top:6px"><summary class="sub">足りないもの（新しい${w.misses.length}件）</summary><ul style="font-size:13px;padding-left:1.2em">${w.misses.map(m => `<li><a href="${GH(REPO)}/${m.type === 'pr' ? 'pull' : 'issues'}/${m.n}" target="_blank" rel="noopener">${m.type === 'pr' ? 'PR' : 'Issue'} #${m.n}</a> ${esc(m.t)}<br><span class="sub">足りない：${esc(m.miss.join('・'))}</span></li>`).join('')}</ul></details>` : ''}`;
}

// Claude の申告（PR の説明の3つの見出し）。無ければ出さない
const report = r => !r ? '' : `<div style="font-size:13px;margin:2px 0 4px;padding:6px 8px;border-radius:8px;background:var(--soft)">${[['確かめた決まり', r.read], ['自分で判断した所', r.own], ['足りなかった決まり', r.lack]].map(([h, xs]) => `<div><b>${h}</b>：${xs.length ? xs.map(esc).join('／') : 'なし'}</div>`).join('')}</div>`;
function detail(d, f) {
  const iss = d.issues.filter(i => i.features.includes(f.id));
  return `<div style="color:var(--ink)">${esc(f.desc)}</div><div style="margin-top:4px">入口：${esc(f.group)}　データ：${esc(f.data.map(k => d.nodes[k]?.name || k).join('、') || 'なし')}</div>
  <h4>最近の作業</h4><ul>${f.recent.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">#${p.n}</a> ${md(p.day)} ${esc(p.t)}${report(p.report)}</li>`).join('') || '<li>なし</li>'}</ul>
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

const dnum = x => Math.round(Date.parse(x + 'T00:00:00Z') / 864e5);
const dstr = k => new Date(k * 864e5).toISOString().slice(0, 10);
function issueView(d, s) {
  const today = dnum(d.today), all = d.issues;
  if (!all.length) return '<p class="sub" style="margin-top:8px">Issue がまだありません。</p>';
  const t0 = Math.max(Math.min(...all.map(i => dnum(i.created))), today - 120), N = today - t0;
  const x = day => `${(Math.min(Math.max(dnum(day), t0), today) - t0) / Math.max(1, N) * 100}%`;
  // 毎日の終わりに開いていた数・その日に立てた数・閉じた数
  const opened = [], closedN = [], openAt = [];
  for (let k = t0; k <= today; k++) { opened.push(all.filter(i => dnum(i.created) === k).length); closedN.push(all.filter(i => i.closed && dnum(i.closed) === k).length); openAt.push(all.filter(i => dnum(i.created) <= k && (!i.closed || dnum(i.closed) > k)).length); }
  const max = Math.max(1, ...openAt, ...opened, ...closedN), W = 100, H = 60, px = k => (k / Math.max(1, N)) * W, py = v => H - v / max * (H - 6) - 2;
  // 最後の日の値を右端まで伸ばしてから閉じる（範囲が0日のとき、斜めの面にならないように）
  const area = `M0 ${H} ` + openAt.map((v, k) => `L${px(k)} ${py(v)}`).join(' ') + ` L${W} ${py(openAt.at(-1) ?? 0)} L${W} ${H} Z`;
  const bars = (arr, cls, dx) => arr.map((v, k) => v ? `<rect x="${px(k) + dx}" y="${py(v)}" width="1.2" height="${H - 2 - py(v)}" fill="${cls}"/>` : '').join('');
  const closed = all.filter(i => !i.open), dur = closed.map(i => dnum(i.closed) - dnum(i.created)).sort((a, b) => a - b);
  const h = dur.length >> 1, med = dur.length ? (dur.length % 2 ? dur[h] : Math.round((dur[h - 1] + dur[h]) / 2 * 10) / 10) : null; // 偶数件なら真ん中2つの平均
  const ticks = []; for (let k = today; k >= t0; k -= 7) ticks.push(k);
  const axis = `<div class="wm-axis"><i></i><div>${ticks.map(k => `<span style="left:${(k - t0) / Math.max(1, N) * 100}%">${md(dstr(k))}</span>`).join('')}</div></div>`;
  const F = { all: () => true, open: i => i.open, closed: i => !i.open, stale: i => i.stale };
  const near = s.ifocus ? new Set([s.ifocus, ...(all.find(i => i.number === s.ifocus)?.links || []).filter(l => l.type === 'issue').map(l => l.n)]) : null;
  const list = all.filter(i => near ? near.has(i.number) : F[s.ifilt](i)).sort((a, b) => (near ? (b.number === s.ifocus) - (a.number === s.ifocus) : 0) || a.created.localeCompare(b.created) || a.number - b.number); // 中心の Issue を先頭に
  const fname = id => d.features.find(f => f.id === id)?.name || id;
  const rows = list.map(i => {
    const end = i.closed || d.today, on = s.isel === i.number;
    const pl = i.links.filter(l => l.type === 'pr' && (s.cand || l.kind !== 'candidate')), byDay = new Map(); // 推測の出し入れは、クラスターと同じ
    for (const l of pl) byDay.set(l.day, [...(byDay.get(l.day) || []), l]);
    const prs = [...byDay].map(([day, ls]) => { const c = ls.some(l => l.kind === 'closes'), k = ls.every(l => l.kind === 'candidate');
      return `<i class="pr${c ? ' c' : ''}${k ? ' k' : ''}" style="left:${x(day)}" title="${esc(md(day))} ${ls.map(l => '#' + l.n).join(' ')}">${ls.length > 1 ? `<b>${ls.length}</b>` : ''}</i>`; }).join('');
    const KIND = KNAME;
    const det = on ? `<div class="wm-det"><a href="${i.url || GH(REPO) + '/issues/' + i.number}" target="_blank" rel="noopener" style="color:var(--ink);font-weight:600">#${i.number} ${esc(i.title)}</a>
      <div style="margin-top:4px">立てた ${md(i.created)}${i.closed ? `・閉じた ${md(i.closed)}（${dnum(i.closed) - dnum(i.created)}日）` : `・開いたまま ${today - dnum(i.created)}日・最後に動いた ${md(i.updated)}`}${i.stale ? '<span class="wm-stale">古くなっている候補</span>' : ''}</div>
      <div>機能：${esc(i.features.map(fname).join('、') || (i.nodes.length ? 'なし（画面のないデータ）' : 'どの機能にも当たらない'))}${i.how ? `（${esc(i.how)}）` : ''}</div>
      <div class="row" style="margin-top:6px"><button class="btn" data-ifocus="${s.ifocus === i.number ? '' : i.number}" style="min-height:36px">${s.ifocus === i.number ? '中心をやめる' : 'この Issue を中心に'}</button></div>
      ${linkHead(i, s)}${linkList(i, s, { goto: true })}</div>` : '';
    return `<div class="wm-tl${on ? ' on' : ''}" data-i="${i.number}" role="button" tabindex="0" aria-expanded="${on}"><div class="nm"><b>#${i.number}</b> ${esc(i.title)}</div>
      <div class="wm-track">${ticks.map(k => `<i class="ax" style="left:${(k - t0) / Math.max(1, N) * 100}%"></i>`).join('')}<i class="bar${i.open ? ' open' : ' done'}${i.stale ? ' stale' : ''}" style="left:${x(i.created)};width:calc(${x(end)} - ${x(i.created)})"></i>${prs}</div></div>${det}`;
  }).join('');
  const intro = `<p class="sub" style="margin-top:8px">Issue を立てた日から閉じた日（開いているものは今日）までを線で、つながるマージ（PR）を点で。押すと、つながりの種類と根拠（どこに書いてあったか）が出ます。番号で書かれていないものは「推測（候補）」として分けて出します。<br>出している範囲：${md(dstr(t0))}〜${md(d.today)}（${N}日・最長120日。機能の見方の期間とは別）</p>`;
  const overview = `<div class="wm-sum"><div><b>${all.length}</b><span>立てた Issue</span></div><div><b>${closed.length}</b><span>閉じた（かかった日数の中央 ${med ?? '—'}日）</span></div>
  <div class="hot"><b>${all.length - closed.length}</b><span>開いている</span></div><div><b style="color:var(--warn)">${all.filter(i => i.stale).length}</b><span>古くなっている候補</span></div></div>
  <h3>開いている Issue の数の移り変わり</h3><p class="sub">面は毎日の終わりに開いていた数。緑の棒は立てた数、灰の棒は閉じた数。</p>
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;width:100%;height:120px;margin-top:6px" role="img" aria-label="開いている Issue の数の移り変わり"><path d="${area}" fill="#2fae69" fill-opacity=".18" stroke="#2fae69" stroke-width=".6" vector-effect="non-scaling-stroke"/>${bars(opened, '#2fae69', 0)}${bars(closedN, 'var(--mute)', 1.4)}</svg>
  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--mute)"><span>${md(dstr(t0))}</span><span>いちばん多い日 ${Math.max(...openAt)}件・今 ${openAt.at(-1)}件</span><span>${md(d.today)}</span></div>`;
  const filters = `<div class="wm-chips">${[['all', 'すべて'], ['open', '開いている'], ['closed', '閉じた'], ['stale', '古くなっている候補']].map(([v, l]) => `<button class="wm-chip" data-ifilt="${v}" aria-pressed="${s.ifilt === v}">${l}</button>`).join('')}</div>`;
  const board = `<div class="wm-legend"><span><span class="wm-sw" style="background:#2fae69"></span>閉じた</span><span><span class="wm-sw" style="border:2px solid #2fae69"></span>開いている</span><span><span class="wm-sw" style="border:2px solid var(--warn)"></span>古くなっている候補</span><span>● 閉じた PR　○ 番号で参照　◌ 推測（候補）　数字＝同じ日のマージ</span></div>
  <div class="wm-board">${axis}${rows || '<p class="sub">該当なし</p>'}</div>`;
  // 1つの Issue を中心にしているときは、その Issue の経過を先頭に。全体のグラフと絞り込みは「すべての Issue に戻る」の先へ（絞り込みが効かないボタンを出さない）
  if (s.ifocus) {
    const fi = all.find(i => i.number === s.ifocus);
    return `<div class="wm-pick" style="display:block"><small>Issue の経過・この Issue と、つながる Issue ${Math.max(0, list.length - 1)}件</small><b>#${s.ifocus} ${esc(fi?.title || '')}</b>
      <div class="row" style="margin-top:8px">${s.from ? `<button class="btn" data-back="1" style="min-height:40px">‹ ${esc(s.from.name)} に戻る</button>` : ''}<button class="btn" data-ifocus="" style="min-height:40px">すべての Issue に戻る</button></div></div>
    ${board}<p class="sub" style="margin-top:8px">出している範囲：${md(dstr(t0))}〜${md(d.today)}（${N}日・最長120日）</p>`;
  }
  return `${intro}${overview}<h3>Issue ごとの経過</h3>${filters}${board}`;
}

// クラスター：機能ごとに、その機能の Issue（左）と、つながる PR（右）を線で。線の種類＝つながりの種類
const LK = { closes: ['これで閉じた', '#2fae69', ''], ref: ['番号で参照', 'var(--mute)', ''], parent: ['親子（GitHub）', '#3b5fc4', ''], from: ['引き継ぎ（本文から）', '#7f9be0', '6 3'], candidate: ['推測（候補）', '#9a6fc0', '5 4'], catalog: ['機能の割り当て', 'var(--line)', '1 4'] };
const LKOF = k => LK[k === 'child' ? 'parent' : k === 'to' ? 'from' : k];
const KNAME = { parent: '親子（親）', child: '親子（子）', from: '引き継ぎ元（本文から）', to: '引き継ぎ先（本文から）', closes: 'これで閉じた', ref: '番号で参照', candidate: '推測（候補）' };
// Issue のつながりを、種類ごとに・全部・GitHub へのリンクつきで（クラスターと Issue の経過で同じものを使う）
// つながりの見出し：数と、推測の出し入れをその場で（一覧の総数とずれて、リンクが欠けたように見えないように）
function linkHead(i, s) {
  const all = i.links.length, c = i.links.filter(l => l.kind === 'candidate').length;
  const n = s.cand || !c ? `${all}件${c ? `（うち推測${c}件）` : ''}` : `${all - c}件・推測${c}件は隠している`;
  return `<div class="wm-lh"><h4>つながり ${n}</h4>${c ? `<button class="btn" data-cand="1" style="min-height:34px">推測${c}件を${s.cand ? '隠す' : '表示'}</button>` : ''}</div>`;
}
// 題を主役に（番号と題を一つのリンクに）。種類・日付は補い。根拠は最初の1行だけ、押すと全部
function linkList(i, s, opt = {}) {
  const ls = i.links.filter(l => s.cand || l.kind !== 'candidate');
  if (!ls.length) return '<div class="sub">番号でのつながりも、同じ機能の作業も見つかりません</div>';
  return ls.map(l => { const href = l.type === 'issue' && opt.goto ? `href="#" data-goto="${l.n}"` : `href="${esc(l.url)}" target="_blank" rel="noopener"`, ev = l.evidence;
    return `<div class="wm-link"><a class="wm-lt" ${href}>${l.type === 'pr' ? 'PR' : 'Issue'} #${l.n}　${esc(l.title)}</a>
    <div class="wm-lm"><span class="wm-kind${l.kind === 'candidate' ? ' k' : ''}">${KNAME[l.kind]}</span>${l.type === 'pr' ? 'マージ ' : ''}${md(l.day)}${l.type === 'issue' ? (l.open ? '・開いている' : '・閉じた') : ''}</div>
    ${ev.length ? `<details class="ev"><summary><b>根拠を見る${ev.length > 1 ? `（${ev.length}）` : ''}</b><span>${esc(ev[0])}</span></summary>${ev.map(e => `<div>${esc(e)}</div>`).join('')}</details>` : ''}</div>`; }).join('');
}
function clusterView(d, s) {
  const per = d.features.map(f => ({ f, iss: d.issues.filter(i => i.features.includes(f.id)) })).filter(x => x.iss.length)
    .sort((a, b) => b.iss.filter(i => i.open).length - a.iss.filter(i => i.open).length || b.iss.length - a.iss.length);
  // 話題（機能ではないタグ）も入り口にする。id は「t:話題」。その話題の Issue と、その話題を付けた PR
  for (const t of d.topics || []) per.push({ f: { id: 't:' + t.name, name: t.feature ? `${(d.features.find(x => x.id === t.feature)?.name || '').replace(/（.*）/, '')} › ${t.name}` : '話題：' + t.name, state: 1, topic: t, data: [] }, iss: d.issues.filter(i => (i.topics || []).includes(t.name)) });
  if (!per.length) return '<p class="sub" style="margin-top:8px">機能につながる Issue がまだありません。</p>';
  if (!s.cl || !per.some(x => x.f.id === s.cl)) s.cl = per[0].f.id;
  const { f, iss: all } = per.find(x => x.f.id === s.cl);
  const inC = i => f.topic ? (i.topics || []).includes(f.topic.name) : i.features.includes(f.id);
  // Issue：開いているものすべてと、閉じたものの新しい8件まで。引き継ぎでつながる、ほかの機能の Issue も入れる
  let iss = [...all.filter(i => i.open), ...all.filter(i => !i.open).slice(0, 8)];
  for (const i of [...iss]) for (const l of i.links) if (l.type === 'issue' && ['parent', 'child', 'from', 'to'].includes(l.kind) && !iss.some(x => x.number === l.n)) { const j = d.issues.find(x => x.number === l.n); if (j) iss.push(j); }
  iss.sort((a, b) => a.created.localeCompare(b.created) || a.number - b.number);
  const prMap = new Map();
  if (f.topic) for (const p of f.topic.prs) prMap.set(p.n, { n: p.n, title: p.t, day: p.day, url: p.url, kind: 'ref', type: 'pr', edges: [] });
  for (const i of iss) for (const l of i.links) if (l.type === 'pr' && (s.cand || l.kind !== 'candidate')) { const p = prMap.get(l.n) || { ...l, edges: [] }; p.edges.push({ i: i.number, kind: l.kind, ev: l.evidence }); prMap.set(l.n, p); }
  // PR は新しい24件まで。ただし選んだ Issue につながる PR は、古くても全部出す
  const selI = s.csel && s.csel.startsWith('i') ? +s.csel.slice(1) : null;
  const allPrs = [...prMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  const keep = new Set(allPrs.slice(-24).map(p => p.n)); if (selI) allPrs.forEach(p => p.edges.some(e => e.i === selI) && keep.add(p.n));
  const prs = allPrs.filter(p => keep.has(p.n));
  const W = Math.max(300, (EL.clientWidth || 360) - 4);
  const sel = s.csel, active = new Set();
  if (sel) { active.add(sel); if (sel.startsWith('i')) { const n = +sel.slice(1); prs.forEach(p => p.edges.some(e => e.i === n) && active.add('p' + p.n)); iss.find(i => i.number === n)?.links.forEach(l => l.type === 'issue' && active.add('i' + l.n)); } else { const p = prs.find(x => 'p' + x.n === sel); p?.edges.forEach(e => active.add('i' + e.i)); } }
  const dim = id => sel && !active.has(id);
  let lines = '', nodes = '', H;
  const phone = W < 640;
  if (!phone) {
  const W = Math.max(320, (EL.clientWidth || 360) - 4), gap = 44, colW = Math.floor((W - 20 - gap) / 2), H0 = 52, NH = 50, G = 8;
  const lx = 14, rx = lx + colW + gap, yP = k => H0 + k * (NH + G);
  // Issue は、つながる PR の高さの平均に置く（重ならないように下へずらす）。線が短く、交わりにくくなる
  const want = iss.map((i, k) => { const ys = prs.map((p, kp) => p.edges.some(e => e.i === i.number) ? yP(kp) : null).filter(v => v != null); return { k, y: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : H0 + k * (NH + G) }; }).sort((a, b) => a.y - b.y);
  const pos = []; let last = H0 - NH - G;
  for (const w of want) { const y = Math.max(w.y, last + NH + G); pos[w.k] = y; last = y; }
  const yI = k => pos[k]; H = Math.max(last, yP(prs.length - 1)) + NH + 8;
  const ln = (x1, y1, x2, y2, kind, on) => { const [, c, da] = LK[kind]; const mx = (x1 + x2) / 2; return `<path d="M${x1} ${y1} C${mx} ${y1},${mx} ${y2},${x2} ${y2}" fill="none" stroke="${sel && on && kind === 'ref' ? 'var(--ink)' : c}" stroke-width="${sel && on ? 2.6 : 1.4}" stroke-dasharray="${da}" opacity="${sel && !on ? .1 : .85}"/>`; };
  // 機能 → Issue（左の柱）
  lines += `<path d="M${lx - 6} 40 V${yI(iss.length - 1) + NH / 2}" stroke="var(--line)" stroke-width="1.4" stroke-dasharray="1 4" fill="none"/>`;
  iss.forEach((i, k) => { if (inC(i)) lines += `<path d="M${lx - 6} ${yI(k) + NH / 2} H${lx}" stroke="var(--line)" stroke-width="1.4" fill="none"/>`; });
  // Issue → PR
  prs.forEach((p, kp) => p.edges.forEach(e => { const ki = iss.findIndex(i => i.number === e.i); if (ki >= 0) lines += ln(lx + colW, yI(ki) + NH / 2, rx, yP(kp) + NH / 2, e.kind, !sel || (active.has('i' + e.i) && active.has('p' + p.n) && (sel === 'i' + e.i || sel === 'p' + p.n))); }));
  // Issue ↔ Issue（引き継ぎ・参照）：左の外側を回る弧
  const seen = new Set();
  iss.forEach((i, k) => i.links.forEach(l => { if (l.type !== 'issue') return; const k2 = iss.findIndex(x => x.number === l.n); const key = [i.number, l.n].sort().join('-'); if (k2 < 0 || seen.has(key)) return; seen.add(key);
    const y1 = yI(k) + NH / 2, y2 = yI(k2) + NH / 2, kind = l.kind === 'ref' ? 'ref' : ['from', 'to'].includes(l.kind) ? 'from' : 'parent', on = !sel || sel === 'i' + i.number || sel === 'i' + l.n, [, c] = LK[kind];
    lines += `<path d="M${lx + 10} ${y1} C${lx - 12} ${y1},${lx - 12} ${y2},${lx + 10} ${y2}" fill="none" stroke="${c}" stroke-width="${kind === 'parent' ? 3 : 1.4}" opacity="${sel && !on ? .12 : .9}"/>`; }));
  const node = (id, x, y, w, h, cls, sub, txt) => `<div class="wm-cn ${cls}${sel === id ? ' on' : ''}${dim(id) ? ' dim' : ''}" data-cn="${id}" role="button" tabindex="0" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><small>${sub}</small><span>${esc(txt)}</span></div>`;
  nodes = node('f', lx, 4, W - lx - 6, 36, 'f', `機能・${ST[f.state]}・開いている Issue ${all.filter(i => i.open).length}`, f.name);
  iss.forEach((i, k) => nodes += node('i' + i.number, lx, yI(k), colW, NH, (i.open ? 'open' : '') + (i.stale ? ' stale' : '') + (inC(i) ? '' : ' other'), `Issue #${i.number}・${i.open ? '開いている' : '閉じた ' + md(i.closed)}`, i.title));
  prs.forEach((p, k) => nodes += node('p' + p.n, rx, yP(k), colW, NH, p.edges.every(e => e.kind === 'candidate') ? 'other' : '', `PR #${p.n}・${md(p.day)}`, p.title));
  }
  // 選んだものの中身（根拠）
  let det = '<p class="sub" style="margin-top:8px">四角を押すと、つながりの根拠が出ます。</p>';
  // スマホでは、題はすぐ上の行に出ているので繰り返さない
  const issueDet = i => `<div class="wm-det" style="${phone ? 'margin-top:0' : 'border-top:1px solid var(--ink);border-radius:10px;margin-top:8px'}">${phone ? '' : `<a href="${i.url || GH(REPO) + '/issues/' + i.number}" target="_blank" rel="noopener" style="color:var(--ink);font-weight:600">Issue #${i.number} ${esc(i.title)}</a>`}<div>立てた ${md(i.created)}${i.closed ? '・閉じた ' + md(i.closed) : '・開いている'}${i.stale ? '<span class="wm-stale">古くなっている候補</span>' : ''}</div>
    <div class="row" style="margin-top:6px"><button class="btn" data-totl="${i.number}" style="min-height:36px">Issue の経過で見る</button>${phone ? `<a href="${i.url || GH(REPO) + '/issues/' + i.number}" target="_blank" rel="noopener" style="align-self:center;font-size:13px">GitHub で開く</a>` : ''}</div>${linkHead(i, s)}${linkList(i, s)}</div>`;
  if (sel && sel.startsWith('i')) { const i = d.issues.find(x => x.number === +sel.slice(1)); if (i) det = issueDet(i); }
  if (sel && sel.startsWith('p')) { const p = prs.find(x => 'p' + x.n === sel); if (p) det = `<div class="wm-det" style="border-top:1px solid var(--ink);border-radius:10px;margin-top:8px"><a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:var(--ink);font-weight:600">PR #${p.n} ${esc(p.title)}</a><div>マージ ${md(p.day)}</div>${p.edges.map(e => `<div class="wm-link"><span class="wm-kind${e.kind === 'candidate' ? ' k' : ''}">${LKOF(e.kind)[0]}</span>Issue #${e.i}${e.ev.map(x => `<div class="ev">根拠：${esc(x)}</div>`).join('')}</div>`).join('')}</div>`; }
  s._sheet = null;
  return `<p class="sub" style="margin-top:8px">${phone ? 'Issue を押すと、その下に、つながる PR・Issue と根拠が出ます。' : '機能ごとに、その機能の Issue と、つながる PR を線で結びます。線の種類はつながりの種類です。破線の四角は、ほかの機能の Issue か、推測だけでつながる PR。'}</p>
  ${phone ? picker() : `<div class="wm-chips" style="flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch">${per.map(x => `<button class="wm-chip" style="flex:none" data-cl="${esc(x.f.id)}" aria-pressed="${x.f.id === s.cl}">${esc(x.f.name.replace(/（.*）/, ''))} ${x.f.topic && !x.iss.length ? `PR ${x.f.topic.prs.length}` : `${x.iss.filter(i => i.open).length}/${x.iss.length}`}</button>`).join('')}</div>`}
  ${phone ? '' : `<div class="row" style="margin-top:8px"><button class="btn" data-cand="1" style="min-height:36px">${s.cand ? '推測を隠す' : '推測も出す'}</button><span class="sub">PR は新しい24件まで（選んだ Issue の PR は全部）。四角を押すと根拠が出ます</span></div>`}
  ${phone ? '' : `<div class="wm-lk">${Object.values(LK).map(([l, c, da]) => `<span><i style="border-top-color:${c};border-top-style:${da ? (da === '1 4' ? 'dotted' : 'dashed') : 'solid'}"></i>${l}</span>`).join('')}</div>`}
  ${phone ? phoneList() : `<div class="wm-cl" style="height:${H}px"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${lines}</svg>${nodes}</div>${det}`}`;
  // スマホ：選んでいる入り口を1行で。「変更」で、話題と機能の一覧と、番号・言葉で探す欄を開く（横送りをなくす）
  function picker() {
    const cnt = x => x.f.topic ? `話題・関連PR ${x.f.topic.prs.length}件・この話題の Issue ${x.iss.length}件` : `機能・${ST[x.f.state]}・Issue ${x.iss.filter(i => i.open).length}/${x.iss.length}（開いている/全部）`;
    const cur = per.find(x => x.f.id === s.cl);
    if (!s.pick) return `<div class="wm-pick"><div style="min-width:0"><small>${esc(cnt(cur))}</small><b>${esc(cur.f.name.replace(/（.*）/, ''))}</b></div><button class="btn" data-pick="1" style="flex:none;min-height:40px">変更</button></div>`;
    // 探す：番号なら、その Issue がいる入り口（Issue の少ない、狭い方）へ。言葉なら、入り口の名前と Issue の題から
    const q = (s.q || '').trim(), num = /^#?\d+$/.test(q) ? +q.replace('#', '') : null;
    const home = n => per.filter(x => x.iss.some(i => i.number === n)).sort((a, b) => a.iss.length - b.iss.length || (b.f.topic ? 1 : 0) - (a.f.topic ? 1 : 0))[0]; // 同じ数なら話題（より狭い）
    let hits = '';
    if (q) {
      const iss = num ? d.issues.filter(i => i.number === num) : d.issues.filter(i => i.title.includes(q)).slice(0, 8);
      const cls = num ? [] : per.filter(x => x.f.name.includes(q));
      hits = [...cls.map(x => `<button class="btn" data-cl="${esc(x.f.id)}">${esc(x.f.name.replace(/（.*）/, ''))}<br><small class="sub">${esc(cnt(x))}</small></button>`),
        ...iss.map(i => { const h = home(i.number); return h ? `<button class="btn" data-jump="${esc(h.f.id)}|${i.number}">Issue #${i.number} ${esc(i.title)}<br><small class="sub">${esc(h.f.name.replace(/（.*）/, ''))} で開く</small></button>` : `<a class="btn" style="display:block;margin-top:6px" href="${i.url || GH(REPO) + '/issues/' + i.number}" target="_blank" rel="noopener">Issue #${i.number} ${esc(i.title)}（どの入り口にもない・GitHub で開く）</a>`; })].join('') || '<p class="sub">見つかりません</p>';
    }
    const group = (title, xs) => xs.length ? `<h4>${title}</h4>${xs.map(x => `<button class="btn" data-cl="${esc(x.f.id)}" aria-pressed="${x.f.id === s.cl}">${esc(x.f.name.replace(/（.*）/, ''))}<br><small class="sub">${esc(cnt(x))}</small></button>`).join('')}` : '';
    return `<div class="wm-pick" style="display:block"><div class="row" style="margin-top:0;flex-wrap:nowrap"><input id="wmq" class="wm-q" type="search" placeholder="#411 や言葉で探す" value="${esc(q)}" enterkeyhint="search"><button class="btn" data-qgo="1" style="flex:none">探す</button><button class="btn" data-pick="0" style="flex:none">閉じる</button></div>
      <div class="wm-plist">${q ? `<h4>探した結果</h4>${hits}` : ''}${group('話題', per.filter(x => x.f.topic))}${group('機能', per.filter(x => !x.f.topic))}</div></div>`;
  }
  // スマホ：Issue を起点に。Issue の一覧を出し、押すとその直下に、つながる PR・Issue を種類ごとに全部（根拠・リンクつき）
  function phoneList() {
    const kinds = i => [...new Set(i.links.filter(l => s.cand || l.kind !== 'candidate').map(l => KNAME[l.kind]))].join('・') || 'つながりなし';
    const prOnly = f.topic ? f.topic.prs.filter(p => !iss.some(i => i.links.some(l => l.type === 'pr' && l.n === p.n))) : [];
    return `${iss.length ? '' : '<p class="sub" style="margin-top:8px">この話題につながる Issue はありません。下の PR を見てください。</p>'}
    ${iss.map(i => { const on = selI === i.number; return `<div class="wm-row${on ? ' on' : ''}" data-cn="i${i.number}" role="button" tabindex="0" aria-expanded="${on}" style="display:block;margin-top:6px;border-color:${on ? 'var(--ink)' : 'var(--line)'};border-left:4px solid ${i.open ? (i.stale ? 'var(--warn)' : '#2fae69') : 'var(--line)'}">
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--mute)"><b>Issue #${i.number}</b><span>${i.open ? (i.stale ? '古くなっている候補' : '開いている') : '閉じた ' + md(i.closed)}</span></div>
      <div style="font-size:14px;font-weight:600;line-height:1.4">${esc(i.title)}</div><div class="sub" style="font-size:12px">${i.links.length}件${!s.cand && i.links.some(l => l.kind === 'candidate') ? `（うち推測${i.links.filter(l => l.kind === 'candidate').length}件）` : ''}：${esc(kinds(i))}</div></div>${on ? issueDet(i) : ''}`; }).join('')}
    ${prOnly.length ? `<h3>このタグを付けた PR（Issue につながらないもの）</h3><ul style="font-size:13.5px;padding-left:1.2em">${prOnly.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">PR #${p.n}</a> ${md(p.day)} ${esc(p.t)}</li>`).join('')}</ul>` : ''}`;
  }
}

// プロジェクト（#77）：番号（100万以上）を「名前#番号」に戻して出す。数としての番号（data-…）はそのまま
const relabelHtml = (h, names) => names && names.length > 1 ? h.replace(/#(\d{7,})\b/g, (_m, n) => `${names[Math.floor(n / 1e6) - 1] || '?'}#${n % 1e6}`) : h;
function draw() {
  if (!EL) return;
  const s = st(REPO), d = s.data;
  const top = `<div class="row" style="margin-top:0"><button class="btn" id="wmsync" ${s.busy ? 'disabled' : ''}>${s.busy ? '読んでいます…' : 'GitHub から読み直す'}</button>
    ${s.view === 'feat' ? `<div class="seg" role="group" aria-label="期間">${[[21, '3週間'], [60, '2か月']].map(([v, l]) => `<button data-span="${v}" aria-pressed="${s.span === v}">${l}</button>`).join('')}</div>` : ''}</div>
    <div class="seg" role="group" aria-label="見かた" style="margin:8px 0 0;margin-left:0">${[['feat', '機能'], ['cluster', (EL.clientWidth || 400) < 640 ? '関連する作業' : 'クラスター'], ['issue', 'Issue の経過']].map(([v, l]) => `<button data-view="${v}" aria-pressed="${s.view === v}">${l}</button>`).join('')}</div>
    ${s.note ? `<p class="sub" style="margin-top:6px">${esc(s.note)}</p>` : ''}`;
  if (!d) { EL.innerHTML = relabelHtml(`<div class="wm">${top}<p class="sub" style="margin-top:8px">読み込み中…</p></div>`, d && d.names); return; }
  if (!d.catalog) { EL.innerHTML = relabelHtml(`<div class="wm">${top}<p class="sub" style="margin-top:8px">このリポジトリには、まだ機能の一覧（カタログ）がありません。<code>src/catalogs.ts</code> に足すと、地図が作られます。</p></div>`, d && d.names); return; }
  if (s.view === 'cluster') { EL.innerHTML = relabelHtml(`<div class="wm">${top}${clusterView(d, s)}</div>`, d && d.names); sheet(s._sheet); return; }
  sheet(null);
  if (s.view === 'issue') { EL.innerHTML = relabelHtml(`<div class="wm">${top}${issueView(d, s)}</div>`, d && d.names); return; }
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
  EL.innerHTML = relabelHtml(`<div class="wm">${top}
  <p class="sub" style="margin-top:8px">機能の一覧と、マージした PR（変えたファイル）・Issue から自動で作ります。読むだけで、リポジトリには書きません。今日（${md(d.today)}）までの${n}日。</p>
  <div class="wm-sum"><div class="hot"><b>${c.stopped}</b><span>直近7日マージなしの機能</span></div><div><b>${c.building}／${c.settled}</b><span>直近4日に3件以上マージ／直近7日にマージあり</span></div>
  <div><b>${c.openIssues}</b><span>開いている Issue（うち古い候補 ${c.stale}）</span></div><div><b style="color:var(--red2)">${c.unused}</b><span>貯めているが画面なし</span></div></div>
  ${writing(d.writing)}
  <h3>機能ごとの稼働</h3><p class="sub">1マス＝1日（マージした PR の数）。マスを指でなぞると、その日の作業が下に出ます。名前を押すと中身が開きます。</p>
  <div class="wm-legend"><span><span class="wm-sw" style="background:var(--line)"></span>0</span><span><span class="wm-sw" style="background:var(--h1)"></span>1</span><span><span class="wm-sw" style="background:var(--h2)"></span>2〜3</span><span><span class="wm-sw" style="background:var(--h3)"></span>4 以上</span></div>
  <div class="wm-chips">${[['すべて', -1], ...ST.map((l, i) => [l, i])].map(([l, i]) => `<button class="wm-chip" data-filt="${i}" aria-pressed="${s.filt === i}">${l}</button>`).join('')}</div>
  <div class="wm-board"><div class="wm-days"><span></span><div class="wm-strip" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${d.days.map((x, k) => `<i class="l">${(n - 1 - k) % step === 0 ? md(x) : ''}</i>`).join('')}</div></div>
  <div id="wmrows">${rows}</div></div>
  <p class="sub" style="margin-top:8px">状態は、その機能のファイルを変えた PR のマージの数から：直近4日に3件以上／直近7日にマージあり／直近7日マージなし。</p>
  <h3>開いている Issue と、つながる機能</h3><p class="sub">関係する機能がすべて直近7日マージなしで、Issue も7日以上動いていないものに「古くなっている候補」を付けます。閉じるかを決めるのは人です。</p>
  ${[...open].sort((a, b) => b.stale - a.stale).map(i => iline(d, i)).join('') || '<p class="sub">なし</p>'}
  <details style="margin-top:8px"><summary class="sub">閉じた Issue ${closed.length} 件</summary>${closed.map(i => iline(d, i)).join('')}</details>
  <h3>どの機能にも当たらない作業</h3><p class="sub">この期間に、一覧のどの機能のファイルにも当たらなかった PR。増えてきたら、一覧に機能を足すかを決めます。</p>
  ${d.unmatched.length ? `<ul style="font-size:14px;padding-left:1.2em">${d.unmatched.slice(0, 30).map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">#${p.n}</a> ${md(p.day)} ${esc(p.t)}</li>`).join('')}</ul>` : '<p class="sub">なし</p>'}
  <h3>データの流れ</h3><p class="sub">左はデータ、右は機能。赤い破線は、貯めているのにどの画面も使っていないデータ。押すと、つながる先が光ります。</p>
  ${nodeNote}<div class="fig" style="margin-top:8px">${flow(d, s)}</div>
  <p class="sub" style="margin-top:8px">取り込み：Issue ${d.issues.length}件${d.sync?.issues_more ? '（1000件で止めた。続きあり）' : '（すべて）'}・PR ${d.sync?.pr_done ? 'すべて' : '途中まで'}・最後に読んだ ${d.sync?.prs_at ? md(d.sync.prs_at.slice(0, 10)) + ' ' + d.sync.prs_at.slice(11, 16) + '（UTC）' : 'まだ'}</p></div>`, d && d.names);
}

// スマホでは、選んだものの根拠を画面の下から出す（下までスクロールしなくてよい）
let sh = null;
function sheet(html) {
  if (!html) { if (sh) sh.hidden = true; return; }
  if (!sh) { sh = document.createElement('div'); sh.className = 'wm-bar'; sh.style.cssText = 'background:var(--panel);color:var(--ink);border:1px solid var(--ink);max-height:55vh;padding:6px 12px 12px'; document.body.appendChild(sh);
    sh.addEventListener('click', e => { if (e.target.closest('.x')) { st(REPO).csel = null; draw(); } }); }
  sh.innerHTML = `<button class="x" aria-label="閉じる">×</button>${html.replace('border-top:1px solid var(--ink);border-radius:10px;margin-top:8px', 'border:0;padding:0;margin:0')}`; sh.hidden = false; sh.scrollTop = 0;
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
    const vw = t.closest('[data-view]'); if (vw) { s.view = vw.dataset.view; s.from = null; hideDay(); draw(); return; }
    const ifl = t.closest('[data-ifilt]'); if (ifl) { s.ifilt = ifl.dataset.ifilt; draw(); return; }
    const tt = t.closest('[data-totl]'); if (tt) { s.from = { cl: s.cl, csel: s.csel, name: (EL.querySelector('.wm-pick b') || EL.querySelector('.wm-chip[aria-pressed="true"]'))?.textContent.replace(/\s+(PR\s*)?\d+(\/\d+)?$/, '') || '関連する作業' }; s.view = 'issue'; s.isel = +tt.dataset.totl; s.ifocus = +tt.dataset.totl; s.ifilt = 'all'; draw(); (EL.querySelector('.wm-pick') || EL.querySelector(`.wm-tl[data-i="${s.isel}"]`))?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const cl = t.closest('[data-cl]'); if (cl) { s.cl = cl.dataset.cl; s.csel = null; s.pick = false; s.q = ''; draw(); return; }
    const pk = t.closest('[data-pick]'); if (pk) { s.pick = pk.dataset.pick === '1'; draw(); if (s.pick) EL.querySelector('#wmq')?.focus(); return; }
    if (t.closest('[data-qgo]')) { s.q = EL.querySelector('#wmq')?.value || ''; draw(); return; }
    const jp = t.closest('[data-jump]'); if (jp) { const [c, n] = jp.dataset.jump.split('|'); s.cl = c; s.csel = 'i' + n; s.pick = false; s.q = ''; draw(); EL.querySelector(`[data-cn="i${n}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (t.closest('[data-cand]')) { s.cand = !s.cand; draw(); return; }
    const cn = t.closest('[data-cn]'); if (cn) { s.csel = cn.dataset.cn === 'f' || s.csel === cn.dataset.cn ? null : cn.dataset.cn; draw(); return; }
    const fo = t.closest('[data-ifocus]'); if (fo) { s.ifocus = fo.dataset.ifocus ? +fo.dataset.ifocus : null; s.from = null; if (!s.ifocus) s.ifilt = 'all'; draw(); return; }
    if (t.closest('[data-back]') && s.from) { const f = s.from, n = s.ifocus; s.view = 'cluster'; s.cl = f.cl; s.csel = f.csel; s.ifocus = null; s.from = null; draw(); EL.querySelector(`[data-cn="i${n}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const go = t.closest('[data-goto]'); if (go) { e.preventDefault(); s.isel = +go.dataset.goto; if (s.ifocus && !(s.data.issues.find(i => i.number === s.ifocus)?.links || []).some(l => l.n === s.isel) && s.ifocus !== s.isel) s.ifocus = null; s.ifilt = 'all'; draw(); (EL.querySelector('.wm-pick') || EL.querySelector(`.wm-tl[data-i="${s.isel}"]`))?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const tl = t.closest('.wm-tl'); if (tl && !t.closest('a')) { s.isel = s.isel === +tl.dataset.i ? null : +tl.dataset.i; draw(); return; }
    const fl = t.closest('[data-filt]'); if (fl) { s.filt = +fl.dataset.filt; draw(); return; }
    if (t.closest('.wm-scr') || t.closest('a')) return;
    const r = t.closest('.wm-row'); if (r) { hideDay(); s.sel = s.sel === r.dataset.f ? null : r.dataset.f; s.node = null; draw(); return; }
    const g = t.closest('[data-node],[data-feat]');
    if (g) { if (g.dataset.node) { s.node = s.node === g.dataset.node ? null : g.dataset.node; s.sel = null; draw(); }
      else { s.sel = g.dataset.feat; s.node = null; draw(); EL.querySelector(`.wm-row[data-f="${CSS.escape(s.sel)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }
  });
  el.addEventListener('keydown', e => { if (e.target.id === 'wmq' && e.key === 'Enter') { e.preventDefault(); const st0 = st(REPO); st0.q = e.target.value; draw(); return; } const r = e.target.closest('.wm-row') || e.target.closest('.wm-tl') || e.target.closest('.wm-cn'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
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
