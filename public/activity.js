// 作業の記録（「決まり」タブの「記録」）。Claude がしたことを、マージした PR ごとに見せる。
// 判断はしない。ずれ（範囲外の決まりを使った・範囲の決まりを1つも確かめていない）だけを目立たせる。
(() => {
const IF = window.IF, { api, esc, say } = IF;
const css = document.createElement('style');
css.textContent = `
.ac-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.ac-sum div{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 10px}.ac-sum b{display:block;font-size:22px;line-height:1.2}.ac-sum span{font-size:12.5px;color:var(--mute)}
.ac-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.ac-chip{font:inherit;font-size:13px;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}.ac-chip[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.ac-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;margin-top:10px;overflow:hidden}
.ac-head{display:block;width:100%;text-align:left;font:inherit;color:var(--ink);background:none;border:0;padding:12px 14px;cursor:pointer}
.ac-meta{font-size:12.5px;color:var(--mute)}.ac-title{font-size:15.5px;font-weight:600;line-height:1.45;margin:2px 0 6px}
.ac-tag{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;background:var(--soft);margin:0 4px 4px 0}
.ac-st{font-size:13px;font-weight:600}.ac-st.ok{color:#1f9e75}.ac-st.warn{color:#e07a1f}.ac-st.none{color:var(--mute);font-weight:400}
.ac-body{border-top:1px solid var(--line);padding:10px 14px 14px}.ac-body h4{font-size:13px;color:var(--mute);font-weight:600;margin:12px 0 4px}
.ac-body ul{margin:0;padding-left:18px;font-size:14px}.ac-rule{display:flex;gap:8px;font-size:14px;padding:5px 0;border-top:1px dashed var(--line)}.ac-rule i{font-style:normal;width:20px;flex:none;text-align:center}
.ac-note{font-size:13.5px;background:var(--soft);border-radius:10px;padding:8px 10px;margin-top:8px}
.ac-flag{border-left:3px solid #e07a1f;background:color-mix(in srgb,#e07a1f 10%,transparent);padding:8px 10px;font-size:14px;margin-top:8px}
`;
document.head.appendChild(css);
const S = {}; let EL = null, REPO = '';
const st = r => S[r] || (S[r] = { data: null, filter: 'すべて', open: new Set(), busy: false, loaded: false });

async function load(r) { st(r).data = await api('/api/activity?repo=' + encodeURIComponent(r)); }
async function refresh(r, quiet) {
  const s = st(r); if (s.busy) return; s.busy = true; draw();
  try {
    for (let k = 0; k < 6; k++) { const x = await api('/api/activity/refresh', { method: 'POST', body: JSON.stringify({ repo: r, budget: 10 }) }); if (!x.remaining) break; }
    await load(r);
  } catch (e) { if (!quiet) say(e.message); else s.err = e.message; }
  s.busy = false; draw();
}
function render(el, r) {
  EL = el; REPO = r; const s = st(r);
  if (!s.loaded) { s.loaded = true; el.innerHTML = '<p class="sub">記録を読んでいます…</p>'; load(r).then(() => { draw(); refresh(r, true); }).catch(e => { el.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`; }); return; }
  draw();
}
const st0 = i => i.state === 'ok' ? '<span class="ac-st ok">✓ 決まりを確かめた</span>' : i.state === 'warn' ? '<span class="ac-st warn">⚠ 気になる所あり</span>' : '<span class="ac-st none">申告なし（どの決まりを見たか分からない）</span>';
function draw() {
  const el = EL, r = REPO, s = st(r); if (!el || !document.body.contains(el) || !s.data) return;
  const x = s.data, scopes = [...new Set(x.items.flatMap(i => i.scopes))];
  const list = x.items.filter(i => s.filter === 'すべて' || i.scopes.includes(s.filter) || (s.filter === '気になる所' && i.state === 'warn'));
  el.innerHTML = `<p class="sub">マージした作業（PR）ごとに、何を変えて、どの決まりを確かめたかを並べます。判断はしません。ずれだけを目立たせます。</p>
  ${s.busy ? '<p class="sub" style="margin-top:6px">新しい PR を読んでいます…</p>' : `<div class="row"><button class="btn s" data-acref="1">新しい PR を読む</button></div>`}
  ${s.err ? `<p style="color:var(--red);font-size:14px">${esc(s.err)}</p>` : ''}
  ${!x.hasTree ? '<p class="sub" style="margin-top:6px">範囲の木がまだ無いので、「範囲」と「関係する決まり」は出ません（「範囲」タブで作れます）。</p>' : ''}
  <div class="ac-sum"><div><b>${x.counts.total}</b><span>作業</span></div><div><b>${x.counts.reported}</b><span>決まりの申告あり</span></div><div><b style="color:${x.counts.warn ? '#e07a1f' : 'inherit'}">${x.counts.warn}</b><span>気になる所あり</span></div></div>
  ${x.counts.total && !x.counts.reported ? '<p class="sub" style="margin-top:8px">まだどの作業にも申告がありません。「範囲」→「Claude に届ける」で CLAUDE.md を書き出すと、次の作業から Claude が PR に「確かめた決まり」などを書きます。</p>' : ''}
  <div class="ac-chips" role="group" aria-label="絞る">${['すべて', ...(x.counts.warn ? ['気になる所'] : []), ...scopes].map(f => `<button class="ac-chip" data-acf="${esc(f)}" aria-pressed="${s.filter === f}">${esc(f)}</button>`).join('')}</div>
  ${list.map(i => { const o = s.open.has(i.number), rep = i.report;
    return `<div class="ac-card"><button class="ac-head" data-aco="${i.number}" aria-expanded="${o}"><div class="ac-meta">#${i.number}・${esc(i.merged_at.slice(5, 16).replace('T', ' '))}</div><div class="ac-title">${esc(i.title)}</div>${i.scopes.map(t => `<span class="ac-tag">${esc(t)}</span>`).join('')}<div>${st0(i)}</div></button>
    ${o ? `<div class="ac-body">
      <h4>変えたファイル（${i.files.length}）</h4><ul>${i.files.slice(0, 20).map(f => `<li><code>${esc(f)}</code></li>`).join('')}${i.files.length > 20 ? `<li>ほか ${i.files.length - 20}</li>` : ''}</ul>
      <h4>関係する決まり（範囲から）と、確かめたか</h4>${i.expected.map(e => `<div class="ac-rule"><i>${!rep ? '・' : e.confirmed ? '✓' : e.skill ? '－' : '？'}</i><span>${esc(e.title || e.path)} <span class="ac-meta">${esc(e.path)}・「${esc(e.from)}」から${rep && !e.confirmed && !e.skill ? '・確かめた申告なし' : ''}${e.skill ? '・スキル（場面に合えば読み込まれる）' : ''}</span></span></div>`).join('') || '<p class="sub">範囲が分からないので出せません</p>'}
      ${i.exceptions.length ? `<p class="ac-meta" style="margin-top:6px">この範囲では使わない部分：${i.exceptions.map(e => esc(e.path + '「' + e.heading.replace(' ¶ ', '：') + '」')).join('、')}</p>` : ''}
      ${rep ? `${i.outside.length ? `<div class="ac-flag"><b>範囲外の決まりを使った</b><br>${i.outside.map(esc).join('<br>')}</div>` : ''}
      ${i.none ? '<div class="ac-flag"><b>この範囲の決まりを、1つも確かめていない</b></div>' : ''}
      <h4>Claude の申告</h4><div class="ac-note"><b>確かめた決まり</b><br>${rep.read.map(esc).join('<br>') || 'なし'}</div>
      ${rep.own.length ? `<div class="ac-note"><b>決まりになく、自分で判断した所</b><br>${rep.own.map(esc).join('<br>')}</div>` : ''}
      ${rep.lack.length ? `<div class="ac-note"><b>足りなかった決まり</b><br>${rep.lack.map(esc).join('<br>')}</div>` : ''}`
      : '<div class="ac-note">この作業では、Claude がどの決まりを確かめたかの申告がありません。</div>'}
      <p class="ac-meta" style="margin-top:10px"><a href="${esc(i.url)}" target="_blank" rel="noopener">GitHub で PR を見る</a></p></div>` : ''}</div>`; }).join('') || '<p class="sub" style="margin-top:10px">記録はまだありません。</p>'}`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || !EL || !EL.contains(b)) return; const D = b.dataset, s = st(REPO);
  if (D.acf) { s.filter = D.acf; draw(); return; }
  if (D.aco) { const n = +D.aco; s.open.has(n) ? s.open.delete(n) : s.open.add(n); draw(); return; }
  if (D.acref) { s.err = null; await refresh(REPO); }
});
window.Activity = { render };
})();
