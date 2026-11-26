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
.wm-link{border-top:1px dashed var(--line);padding:6px 0;font-size:13.5px}.wm-link .ev{font-size:12px;color:var(--mute);margin-top:1px}.wm-kind{font-size:11px;padding:1px 7px;border-radius:999px;background:var(--soft);margin-right:4px;white-space:nowrap}.wm-kind.k{border:1px dashed var(--mute);background:none}
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
const ST = ['作っている', '落ち着いた', '止まっている'];
const S = {}; let EL = null, REPO = '';
const st = r => S[r] || (S[r] = { data: null, span: 21, view: 'feat', ifilt: 'all', isel: null, ifocus: null, cl: null, csel: null, cand: true, filt: -1, sel: null, node: null, busy: false, note: '', synced: false });
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
  const area = `M0 ${H} ` + openAt.map((v, k) => `L${px(k)} ${py(v)}`).join(' ') + ` L${W} ${H} Z`;
  const bars = (arr, cls, dx) => arr.map((v, k) => v ? `<rect x="${px(k) + dx}" y="${py(v)}" width="1.2" height="${H - 2 - py(v)}" fill="${cls}"/>` : '').join('');
  const closed = all.filter(i => !i.open), dur = closed.map(i => dnum(i.closed) - dnum(i.created)).sort((a, b) => a - b);
  const med = dur.length ? dur[Math.floor(dur.length / 2)] : null;
  const ticks = []; for (let k = today; k >= t0; k -= 7) ticks.push(k);
  const axis = `<div class="wm-axis"><i></i><div>${ticks.map(k => `<span style="left:${(k - t0) / Math.max(1, N) * 100}%">${md(dstr(k))}</span>`).join('')}</div></div>`;
  const F = { all: () => true, open: i => i.open, closed: i => !i.open, stale: i => i.stale };
  const near = s.ifocus ? new Set([s.ifocus, ...(all.find(i => i.number === s.ifocus)?.links || []).filter(l => l.type === 'issue').map(l => l.n)]) : null;
  const list = all.filter(i => near ? near.has(i.number) : F[s.ifilt](i)).sort((a, b) => a.created.localeCompare(b.created) || a.number - b.number);
  const fname = id => d.features.find(f => f.id === id)?.name || id;
  const rows = list.map(i => {
    const end = i.closed || d.today, on = s.isel === i.number;
    const pl = i.links.filter(l => l.type === 'pr'), byDay = new Map();
    for (const l of pl) byDay.set(l.day, [...(byDay.get(l.day) || []), l]);
    const prs = [...byDay].map(([day, ls]) => { const c = ls.some(l => l.kind === 'closes'), k = ls.every(l => l.kind === 'candidate');
      return `<i class="pr${c ? ' c' : ''}${k ? ' k' : ''}" style="left:${x(day)}" title="${esc(md(day))} ${ls.map(l => '#' + l.n).join(' ')}">${ls.length > 1 ? `<b>${ls.length}</b>` : ''}</i>`; }).join('');
    const KIND = { parent: '引き継ぎ元', child: '引き継ぎ先', closes: 'これで閉じた', ref: '番号で参照', candidate: '推測（候補）' };
    const det = on ? `<div class="wm-det"><a href="${GH(REPO)}/issues/${i.number}" target="_blank" rel="noopener" style="color:var(--ink);font-weight:600">#${i.number} ${esc(i.title)}</a>
      <div style="margin-top:4px">立てた ${md(i.created)}${i.closed ? `・閉じた ${md(i.closed)}（${dnum(i.closed) - dnum(i.created)}日）` : `・開いたまま ${today - dnum(i.created)}日・最後に動いた ${md(i.updated)}`}${i.stale ? '<span class="wm-stale">古くなっている候補</span>' : ''}</div>
      <div>機能：${esc(i.features.map(fname).join('、') || (i.nodes.length ? 'なし（画面のないデータ）' : 'どの機能にも当たらない'))}${i.how ? `（${esc(i.how)}）` : ''}</div>
      <div class="row" style="margin-top:6px"><button class="btn" data-ifocus="${s.ifocus === i.number ? '' : i.number}" style="min-height:36px">${s.ifocus === i.number ? '中心をやめる' : 'この Issue を中心に'}</button></div>
      <h4>つながり（${i.links.length}）</h4>${i.links.length ? i.links.map(l => `<div class="wm-link"><span class="wm-kind${l.kind === 'candidate' ? ' k' : ''}">${KIND[l.kind]}</span>${l.type === 'issue' ? `<a href="#" data-goto="${l.n}">Issue #${l.n}</a>${l.open ? '（開いている）' : ''}` : `<a href="${esc(l.url)}" target="_blank" rel="noopener">PR #${l.n}</a> ${md(l.day)}`} ${esc(l.title)}${l.evidence.map(e => `<div class="ev">根拠：${esc(e)}</div>`).join('')}</div>`).join('') : '<div>番号でのつながりも、同じ機能の作業も見つかりません</div>'}</div>` : '';
    return `<div class="wm-tl${on ? ' on' : ''}" data-i="${i.number}" role="button" tabindex="0" aria-expanded="${on}"><div class="nm"><b>#${i.number}</b> ${esc(i.title)}</div>
      <div class="wm-track">${ticks.map(k => `<i class="ax" style="left:${(k - t0) / Math.max(1, N) * 100}%"></i>`).join('')}<i class="bar${i.open ? ' open' : ' done'}${i.stale ? ' stale' : ''}" style="left:${x(i.created)};width:calc(${x(end)} - ${x(i.created)})"></i>${prs}</div></div>${det}`;
  }).join('');
  return `<p class="sub" style="margin-top:8px">Issue を立てた日から閉じた日（開いているものは今日）までを線で、つながるマージ（PR）を点で。押すと、つながりの種類と根拠（どこに書いてあったか）が出ます。番号で書かれていないものは「推測（候補）」として分けて出します。</p>
  <div class="wm-sum"><div><b>${all.length}</b><span>立てた Issue</span></div><div><b>${closed.length}</b><span>閉じた（かかった日数の中央 ${med ?? '—'}日）</span></div>
  <div class="hot"><b>${all.length - closed.length}</b><span>開いている</span></div><div><b style="color:var(--warn)">${all.filter(i => i.stale).length}</b><span>古くなっている候補</span></div></div>
  <h3>開いている Issue の数の移り変わり</h3><p class="sub">面は毎日の終わりに開いていた数。緑の棒は立てた数、灰の棒は閉じた数。</p>
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;width:100%;height:120px;margin-top:6px" role="img" aria-label="開いている Issue の数の移り変わり"><path d="${area}" fill="#2fae69" fill-opacity=".18" stroke="#2fae69" stroke-width=".6" vector-effect="non-scaling-stroke"/>${bars(opened, '#2fae69', 0)}${bars(closedN, 'var(--mute)', 1.4)}</svg>
  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--mute)"><span>${md(dstr(t0))}</span><span>いちばん多い日 ${Math.max(...openAt)}件・今 ${openAt.at(-1)}件</span><span>${md(d.today)}</span></div>
  <h3>Issue ごとの経過</h3>
  ${s.ifocus ? `<div class="row" style="margin-top:8px"><b>Issue #${s.ifocus} を中心に表示中</b><button class="btn" data-ifocus="" style="min-height:36px">すべてに戻す</button></div>` : ''}
  <div class="wm-chips">${[['all', 'すべて'], ['open', '開いている'], ['closed', '閉じた'], ['stale', '古くなっている候補']].map(([v, l]) => `<button class="wm-chip" data-ifilt="${v}" aria-pressed="${s.ifilt === v}">${l}</button>`).join('')}</div>
  <div class="wm-legend"><span><span class="wm-sw" style="background:#2fae69"></span>閉じた</span><span><span class="wm-sw" style="border:2px solid #2fae69"></span>開いている</span><span><span class="wm-sw" style="border:2px solid var(--warn)"></span>古くなっている候補</span><span>● 閉じた PR　○ 番号で参照　◌ 推測（候補）　数字＝同じ日のマージ</span></div>
  <div class="wm-board">${axis}${rows || '<p class="sub">該当なし</p>'}</div>`;
}

// クラスター：機能ごとに、その機能の Issue（左）と、つながる PR（右）を線で。線の種類＝つながりの種類
const LK = { closes: ['これで閉じた', '#2fae69', ''], ref: ['番号で参照', 'var(--mute)', ''], parent: ['引き継ぎ', '#5b7fd6', ''], candidate: ['推測（候補）', '#9a6fc0', '5 4'], catalog: ['機能の割り当て', 'var(--line)', '1 4'] };
function clusterView(d, s) {
  const per = d.features.map(f => ({ f, iss: d.issues.filter(i => inC(i)) })).filter(x => x.iss.length)
    .sort((a, b) => b.iss.filter(i => i.open).length - a.iss.filter(i => i.open).length || b.iss.length - a.iss.length);
  // 話題（機能ではないタグ）も入り口にする。id は「t:話題」。その話題の Issue と、その話題を付けた PR
  for (const t of d.topics || []) per.push({ f: { id: 't:' + t.name, name: '話題：' + t.name, state: 1, topic: t }, iss: d.issues.filter(i => (i.topics || []).includes(t.name)) });
  if (!per.length) return '<p class="sub" style="margin-top:8px">機能につながる Issue がまだありません。</p>';
  if (!s.cl || !per.some(x => x.f.id === s.cl)) s.cl = per[0].f.id;
  const { f, iss: all } = per.find(x => x.f.id === s.cl);
  const inC = i => f.topic ? (i.topics || []).includes(f.topic.name) : i.features.includes(f.id);
  // Issue：開いているものすべてと、閉じたものの新しい8件まで。引き継ぎでつながる、ほかの機能の Issue も入れる
  let iss = [...all.filter(i => i.open), ...all.filter(i => !i.open).slice(0, 8)];
  for (const i of [...iss]) for (const l of i.links) if (l.type === 'issue' && (l.kind === 'parent' || l.kind === 'child') && !iss.some(x => x.number === l.n)) { const j = d.issues.find(x => x.number === l.n); if (j) iss.push(j); }
  iss.sort((a, b) => a.created.localeCompare(b.created) || a.number - b.number);
  const prMap = new Map();
  if (f.topic) for (const p of f.topic.prs) prMap.set(p.n, { n: p.n, title: p.t, day: p.day, url: p.url, kind: 'ref', type: 'pr', edges: [] });
  for (const i of iss) for (const l of i.links) if (l.type === 'pr' && (s.cand || l.kind !== 'candidate')) { const p = prMap.get(l.n) || { ...l, edges: [] }; p.edges.push({ i: i.number, kind: l.kind, ev: l.evidence }); prMap.set(l.n, p); }
  const prs = [...prMap.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-24);
  const W = Math.max(300, (EL.clientWidth || 360) - 4);
  const sel = s.csel, active = new Set();
  if (sel) { active.add(sel); if (sel.startsWith('i')) { const n = +sel.slice(1); prs.forEach(p => p.edges.some(e => e.i === n) && active.add('p' + p.n)); iss.find(i => i.number === n)?.links.forEach(l => l.type === 'issue' && active.add('i' + l.n)); } else { const p = prs.find(x => 'p' + x.n === sel); p?.edges.forEach(e => active.add('i' + e.i)); } }
  const dim = id => sel && !active.has(id);
  let lines = '', nodes = '', H;
  if (W >= 640) {
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
    const y1 = yI(k) + NH / 2, y2 = yI(k2) + NH / 2, kind = l.kind === 'ref' ? 'ref' : 'parent', on = !sel || sel === 'i' + i.number || sel === 'i' + l.n, [, c] = LK[kind];
    lines += `<path d="M${lx + 10} ${y1} C${lx - 12} ${y1},${lx - 12} ${y2},${lx + 10} ${y2}" fill="none" stroke="${c}" stroke-width="${kind === 'parent' ? 3 : 1.4}" opacity="${sel && !on ? .12 : .9}"/>`; }));
  const node = (id, x, y, w, h, cls, sub, txt) => `<div class="wm-cn ${cls}${sel === id ? ' on' : ''}${dim(id) ? ' dim' : ''}" data-cn="${id}" role="button" tabindex="0" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><small>${sub}</small><span>${esc(txt)}</span></div>`;
  nodes = node('f', lx, 4, W - lx - 6, 36, 'f', `機能・${ST[f.state]}・開いている Issue ${all.filter(i => i.open).length}`, f.name);
  iss.forEach((i, k) => nodes += node('i' + i.number, lx, yI(k), colW, NH, (i.open ? 'open' : '') + (i.stale ? ' stale' : '') + (inC(i) ? '' : ' other'), `Issue #${i.number}・${i.open ? '開いている' : '閉じた ' + md(i.closed)}`, i.title));
  prs.forEach((p, k) => nodes += node('p' + p.n, rx, yP(k), colW, NH, p.edges.every(e => e.kind === 'candidate') ? 'other' : '', `PR #${p.n}・${md(p.day)}`, p.title));
  } else {
    // スマホ：縦に1列（機能 → Issue → PR）。線は左の余白を通る折れ線で、Issue ごとに通り道を分ける
    const lanes = Math.min(10, Math.max(1, iss.length)), x0 = 10 + lanes * 6, cw = W - x0 - 2, NH = 78, G = 8;
    const laneX = k => 4 + (k % lanes) * 6;
    const yF = 2, yIs = 70, yI = k => yIs + 18 + k * (NH + G), yPs = yI(iss.length) + 6, yP = k => yPs + 18 + k * (NH + G);
    H = yP(prs.length) + 4;
    const on = (a, b) => !sel || (sel === a && active.has(b)) || (sel === b && active.has(a));
    const path = (y1, y2, x, kind, hot) => { const [, c, da] = LK[kind]; return `<path d="M${x0} ${y1} H${x} V${y2} H${x0}" fill="none" stroke="${sel && hot && kind === 'ref' ? 'var(--ink)' : c}" stroke-width="${kind === 'parent' ? 3 : sel && hot ? 2.4 : 1.6}" stroke-dasharray="${da}" opacity="${sel && !hot ? .1 : .9}"/>`; };
    lines += `<path d="M${x0} ${yF + 22} H2 V${yI(iss.length - 1) + 22}" fill="none" stroke="var(--line)" stroke-width="1.4" stroke-dasharray="1 4"/>`;
    iss.forEach((i, k) => { if (inC(i)) lines += `<path d="M2 ${yI(k) + 22} H${x0}" fill="none" stroke="var(--line)" stroke-width="1.4" stroke-dasharray="1 4"/>`; });
    prs.forEach((p, kp) => p.edges.forEach(e => { const ki = iss.findIndex(i => i.number === e.i); if (ki >= 0) lines += path(yI(ki) + 30 + (kp % 3) * 3, yP(kp) + 28, laneX(ki), e.kind, on('i' + e.i, 'p' + p.n)); }));
    const seen = new Set();
    iss.forEach((i, k) => i.links.forEach(l => { if (l.type !== 'issue') return; const k2 = iss.findIndex(x => x.number === l.n); const key = [i.number, l.n].sort().join('-'); if (k2 < 0 || seen.has(key)) return; seen.add(key);
      lines += path(yI(k) + 40, yI(k2) + 40, laneX(Math.min(k, k2)) + 2, l.kind === 'ref' ? 'ref' : 'parent', on('i' + i.number, 'i' + l.n)); }));
    const badge = kinds => [...new Set(kinds)].map(k => `<em style="font-style:normal;font-size:10.5px;padding:1px 6px;border-radius:5px;margin-right:4px;border:1px ${k === 'candidate' ? 'dashed' : 'solid'} ${LK[k === 'child' ? 'parent' : k][1]};color:var(--mute)">${LK[k === 'child' ? 'parent' : k][0]}</em>`).join('');
    const card = (id, y, cls, head, right, title, kinds) => `<div class="wm-cn ${cls}${sel === id ? ' on' : ''}${dim(id) ? ' dim' : ''}" data-cn="${id}" role="button" tabindex="0" style="left:${x0}px;top:${y}px;width:${cw}px;height:${NH}px;font-size:13.5px;padding:5px 9px"><small style="display:flex;justify-content:space-between;gap:6px"><b>${head}</b><span>${right}</span></small><span style="font-weight:600;line-height:1.35">${esc(title)}</span><div style="margin-top:2px;white-space:nowrap;overflow:hidden">${kinds}</div></div>`;
    nodes += `<div class="wm-cn f${dim('f') ? ' dim' : ''}" data-cn="f" role="button" tabindex="0" style="left:${x0}px;top:${yF}px;width:${cw}px;height:46px"><small>機能・${ST[f.state]}・開いている Issue ${all.filter(i => i.open).length}/${all.length}</small><span>${esc(f.name)}</span></div>`;
    nodes += `<div class="sub" style="position:absolute;left:${x0}px;top:${yIs}px;font-weight:600">Issue（${iss.length}）</div><div class="sub" style="position:absolute;left:${x0}px;top:${yPs}px;font-weight:600">PR（${prs.length}）</div>`;
    iss.forEach((i, k) => nodes += card('i' + i.number, yI(k), (i.open ? 'open' : '') + (i.stale ? ' stale' : '') + (inC(i) ? '' : ' other'), `Issue #${i.number}`, i.open ? (i.stale ? '古くなっている候補' : '開いている') : '閉じた ' + md(i.closed), i.title,
      badge([...(inC(i) ? ['catalog'] : []), ...i.links.filter(l => l.type === 'issue' && l.kind !== 'ref').map(l => 'parent')])));
    prs.forEach((p, k) => nodes += card('p' + p.n, yP(k), p.edges.length && p.edges.every(e => e.kind === 'candidate') ? 'other' : '', `PR #${p.n}`, 'マージ ' + md(p.day), p.title, p.edges.length ? badge(p.edges.map(e => e.kind)) : '<em style="font-style:normal;font-size:10.5px;color:var(--mute)">話題のタグ</em>'));
  }
  // 選んだものの中身（根拠）
  let det = '<p class="sub" style="margin-top:8px">四角を押すと、つながりの根拠が出ます。</p>';
  if (sel && sel.startsWith('i')) { const i = d.issues.find(x => x.number === +sel.slice(1)); if (i) det = `<div class="wm-det" style="border-top:1px solid var(--ink);border-radius:10px;margin-top:8px"><a href="${GH(REPO)}/issues/${i.number}" target="_blank" rel="noopener" style="color:var(--ink);font-weight:600">Issue #${i.number} ${esc(i.title)}</a><div>立てた ${md(i.created)}${i.closed ? '・閉じた ' + md(i.closed) : '・開いている'}${i.stale ? '<span class="wm-stale">古くなっている候補</span>' : ''}</div>${i.links.filter(l => s.cand || l.kind !== 'candidate').map(l => `<div class="wm-link"><span class="wm-kind${l.kind === 'candidate' ? ' k' : ''}">${LK[l.kind === 'child' ? 'parent' : l.kind][0]}${l.kind === 'child' ? '（先）' : l.kind === 'parent' ? '（元）' : ''}</span>${l.type === 'pr' ? 'PR' : 'Issue'} #${l.n} ${esc(l.title)}${l.evidence.map(e => `<div class="ev">根拠：${esc(e)}</div>`).join('')}</div>`).join('')}</div>`; }
  if (sel && sel.startsWith('p')) { const p = prs.find(x => 'p' + x.n === sel); if (p) det = `<div class="wm-det" style="border-top:1px solid var(--ink);border-radius:10px;margin-top:8px"><a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:var(--ink);font-weight:600">PR #${p.n} ${esc(p.title)}</a><div>マージ ${md(p.day)}</div>${p.edges.map(e => `<div class="wm-link"><span class="wm-kind${e.kind === 'candidate' ? ' k' : ''}">${LK[e.kind === 'child' ? 'parent' : e.kind][0]}</span>Issue #${e.i}${e.ev.map(x => `<div class="ev">根拠：${esc(x)}</div>`).join('')}</div>`).join('')}</div>`; }
  s._sheet = W < 640 && sel ? det : null;
  if (s._sheet) det = '';
  return `<p class="sub" style="margin-top:8px">機能ごとに、その機能の Issue と、つながる PR を線で結びます。線の種類はつながりの種類です。破線の四角は、ほかの機能の Issue か、推測だけでつながる PR。</p>
  <div class="wm-chips" style="flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch">${per.map(x => `<button class="wm-chip" style="flex:none" data-cl="${esc(x.f.id)}" aria-pressed="${x.f.id === s.cl}">${esc(x.f.name.replace(/（.*）/, ''))} ${x.iss.filter(i => i.open).length}/${x.iss.length}</button>`).join('')}</div>
  <div class="row" style="margin-top:8px"><button class="btn" data-cand="1" style="min-height:36px">${s.cand ? '推測を隠す' : '推測も出す'}</button><span class="sub">PR は新しい24件まで。四角を押すと根拠が出ます</span></div>
  <div class="wm-lk">${Object.values(LK).map(([l, c, da]) => `<span><i style="border-top-color:${c};border-top-style:${da ? (da === '1 4' ? 'dotted' : 'dashed') : 'solid'}"></i>${l}</span>`).join('')}</div>
  <div class="wm-cl" style="height:${H}px"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${lines}</svg>${nodes}</div>${det}`;
}

function draw() {
  if (!EL) return;
  const s = st(REPO), d = s.data;
  const top = `<div class="row" style="margin-top:0"><button class="btn" id="wmsync" ${s.busy ? 'disabled' : ''}>${s.busy ? '読んでいます…' : 'GitHub から読み直す'}</button>
    <div class="seg" role="group" aria-label="期間">${[[21, '3週間'], [60, '2か月']].map(([v, l]) => `<button data-span="${v}" aria-pressed="${s.span === v}">${l}</button>`).join('')}</div></div>
    <div class="seg" role="group" aria-label="見かた" style="margin:8px 0 0;margin-left:0">${[['feat', '機能'], ['cluster', 'クラスター'], ['issue', 'Issue の経過']].map(([v, l]) => `<button data-view="${v}" aria-pressed="${s.view === v}">${l}</button>`).join('')}</div>
    ${s.note ? `<p class="sub" style="margin-top:6px">${esc(s.note)}</p>` : ''}`;
  if (!d) { EL.innerHTML = `<div class="wm">${top}<p class="sub" style="margin-top:8px">読み込み中…</p></div>`; return; }
  if (!d.catalog) { EL.innerHTML = `<div class="wm">${top}<p class="sub" style="margin-top:8px">このリポジトリには、まだ機能の一覧（カタログ）がありません。<code>src/catalogs.ts</code> に足すと、地図が作られます。</p></div>`; return; }
  if (s.view === 'cluster') { EL.innerHTML = `<div class="wm">${top}${clusterView(d, s)}</div>`; sheet(s._sheet); return; }
  sheet(null);
  if (s.view === 'issue') { EL.innerHTML = `<div class="wm">${top}${issueView(d, s)}</div>`; return; }
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
  ${writing(d.writing)}
  <h3>機能ごとの稼働</h3><p class="sub">1マス＝1日（マージした PR の数）。マスを指でなぞると、その日の作業が下に出ます。名前を押すと中身が開きます。</p>
  <div class="wm-legend"><span><span class="wm-sw" style="background:var(--line)"></span>0</span><span><span class="wm-sw" style="background:var(--h1)"></span>1</span><span><span class="wm-sw" style="background:var(--h2)"></span>2〜3</span><span><span class="wm-sw" style="background:var(--h3)"></span>4 以上</span></div>
  <div class="wm-chips">${[['すべて', -1], ...ST.map((l, i) => [l, i])].map(([l, i]) => `<button class="wm-chip" data-filt="${i}" aria-pressed="${s.filt === i}">${l}</button>`).join('')}</div>
  <div class="wm-board"><div class="wm-days"><span></span><div class="wm-strip" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${d.days.map((x, k) => `<i class="l">${(n - 1 - k) % step === 0 ? md(x) : ''}</i>`).join('')}</div></div>
  <div id="wmrows">${rows}</div></div>
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
    const vw = t.closest('[data-view]'); if (vw) { s.view = vw.dataset.view; hideDay(); draw(); return; }
    const ifl = t.closest('[data-ifilt]'); if (ifl) { s.ifilt = ifl.dataset.ifilt; draw(); return; }
    const cl = t.closest('[data-cl]'); if (cl) { s.cl = cl.dataset.cl; s.csel = null; draw(); return; }
    if (t.closest('[data-cand]')) { s.cand = !s.cand; draw(); return; }
    const cn = t.closest('[data-cn]'); if (cn) { s.csel = cn.dataset.cn === 'f' || s.csel === cn.dataset.cn ? null : cn.dataset.cn; draw(); return; }
    const fo = t.closest('[data-ifocus]'); if (fo) { s.ifocus = fo.dataset.ifocus ? +fo.dataset.ifocus : null; draw(); return; }
    const go = t.closest('[data-goto]'); if (go) { e.preventDefault(); s.isel = +go.dataset.goto; if (s.ifocus && !(s.data.issues.find(i => i.number === s.ifocus)?.links || []).some(l => l.n === s.isel) && s.ifocus !== s.isel) s.ifocus = null; s.ifilt = 'all'; draw(); EL.querySelector(`.wm-tl[data-i="${s.isel}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const tl = t.closest('.wm-tl'); if (tl && !t.closest('a')) { s.isel = s.isel === +tl.dataset.i ? null : +tl.dataset.i; draw(); return; }
    const fl = t.closest('[data-filt]'); if (fl) { s.filt = +fl.dataset.filt; draw(); return; }
    if (t.closest('.wm-scr') || t.closest('a')) return;
    const r = t.closest('.wm-row'); if (r) { hideDay(); s.sel = s.sel === r.dataset.f ? null : r.dataset.f; s.node = null; draw(); return; }
    const g = t.closest('[data-node],[data-feat]');
    if (g) { if (g.dataset.node) { s.node = s.node === g.dataset.node ? null : g.dataset.node; s.sel = null; draw(); }
      else { s.sel = g.dataset.feat; s.node = null; draw(); EL.querySelector(`.wm-row[data-f="${CSS.escape(s.sel)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }
  });
  el.addEventListener('keydown', e => { const r = e.target.closest('.wm-row') || e.target.closest('.wm-tl') || e.target.closest('.wm-cn'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
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
