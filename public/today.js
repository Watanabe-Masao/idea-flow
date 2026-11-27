// 「今日」の画面（#69）：開いたら最初に出る。人が決めることだけを並べる。片づけたものは消え、全部片づくと一言だけ
(() => {
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = (p, o) => window.IF.api(p, o);
const GH = r => `https://github.com/${r}`;
const SEC = [
  ['判断の受信箱', ['own', 'lack'], '直近7日の PR で、Claude が決まりにないことを自分で判断した所と、足りなかった決まり。PR ごとに見て決めます。'],
  ['閉じてよさそうな Issue', ['close'], '番号で書かれた PR がマージ済みの、開いている Issue。閉じる条件と見比べてください（閉じるのは GitHub で）。'],
  ['気になる所', ['stale', 'unmatched', 'conflict', 'topic'], ''],
];
const LABEL = { own: 'Claude の判断', lack: '足りなかった決まり', close: '閉じてよさそう', stale: '古くなっている候補', unmatched: 'どの機能にも当たらない', conflict: '食い違いの候補', topic: '新しい話題' };
let EL = null, REPO = '', D = null, ERR = '', SEEN = new Set();

const draft = (it) => {
  const t = `決まりと文書：${it.title.replace(/^PR #(\d+).*/, '#$1')} の判断を決まりにする`;
  const b = `機能：決まりと文書\n閉じる条件：決まりの文書に足す PR がマージされる\n\n${it.title} から：\n${(it.own || []).map(x => `- 自分で判断：${x}`).join('\n')}\n${(it.lack || []).map(x => `- 足りなかった：${x}`).join('\n')}\n\n（決まりにしないものは消してから立ててください）`;
  return `${GH(REPO)}/issues/new?title=${encodeURIComponent(t)}&body=${encodeURIComponent(b)}`;
};
const btn = (it, d, l, href) => href
  ? `<a class="btn s" data-mark="${esc(it.key)}|${d}" href="${esc(href)}" target="_blank" rel="noopener">${l}</a>`
  : `<button class="btn s" data-mark="${esc(it.key)}|${d}">${l}</button>`;
function acts(it) {
  if (it.kind === 'own' || it.kind === 'lack') return btn(it, 'ok', 'それでいい') + btn(it, 'rule', '決まりにする', draft(it)) + btn(it, 'no', '違う（PR で伝える）', it.url);
  if (it.kind === 'close') return btn(it, 'done', 'GitHub で閉じる', it.url) + btn(it, 'later', 'まだ');
  return (it.url ? btn(it, 'ok', 'GitHub で見る', it.url) : '') + btn(it, 'ok', '見た');
}
function card(it) {
  const jl = (it.own || []).map(x => `<li>${esc(x)}</li>`).join('') + (it.lack || []).map(x => `<li class="td-lack">足りなかった決まり：${esc(x)}</li>`).join('');
  return `<li class="td-it"><div class="td-k">${LABEL[it.kind]}</div><div class="td-t">${it.url && jl ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : esc(it.title)}</div>${jl ? `<ul class="td-j">${jl}</ul>` : ''}<div class="sub">${it.url && it.kind !== 'close' ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.sub)}</a>` : esc(it.sub)}</div>
    ${it.links ? `<ul class="td-prs">${it.links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">PR #${l.n} ${esc(l.t)}</a></li>`).join('')}</ul>` : ''}
    <div class="row" style="margin-top:6px">${acts(it)}</div></li>`;
}
function draw() {
  if (!EL) return;
  if (ERR) { EL.innerHTML = `<p class="sub">読めませんでした：${esc(ERR)}</p>`; return; }
  if (!D) { EL.innerHTML = '<p class="sub">読み込み中…</p>'; return; }
  if (!D.catalog) { EL.innerHTML = `<p class="sub">${esc(REPO)} には機能の一覧（カタログ）がありません。</p>`; return; }
  const its = D.items;
  if (!its.length) { EL.innerHTML = `<div class="td-empty">今日は決めることはありません</div>`; return; }
  EL.innerHTML = `<style>.td-empty{padding:40px 8px;text-align:center;font-size:18px;color:var(--mute)}.td-h{margin:18px 0 4px;font-size:16px}.td-l{list-style:none;padding:0;margin:0}.td-it{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:8px;background:var(--panel)}.td-k{font-size:11.5px;color:var(--mute)}.td-t{font-weight:600;line-height:1.45;margin:2px 0}.td-prs{margin:6px 0 0;padding-left:18px;font-size:13px}.td-ch{margin:4px 0 0;padding-left:18px;font-size:14px}.td-j{margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.5}.td-j li{margin:3px 0}.td-lack{color:var(--red)}.td-it a.btn{display:inline-flex;align-items:center;text-decoration:none}.td-t a{color:var(--ink)}</style>
    <p style="margin:4px 0 0;font-size:18px;font-weight:700">今日決めること ${its.length}件</p>
    ${SEC.map(([h, ks, note]) => { const xs = its.filter(x => ks.includes(x.kind)); return xs.length ? `<h3 class="td-h">${h}（${xs.length}）</h3>${note ? `<p class="sub" style="margin:0">${note}</p>` : ''}<ul class="td-l">${xs.map(card).join('')}</ul>` : ''; }).join('')}
    ${D.changes.length ? `<h3 class="td-h">前回（${D.since.slice(5).replace('-', '/')}）から変わったこと</h3><ul class="td-ch">${D.changes.map(c => `<li>${esc(c.name)}：${c.n}件（${esc(c.last)}）</li>`).join('')}</ul>` : ''}`;
}
async function load() {
  try { D = await api(`/api/today?repo=${encodeURIComponent(REPO)}`); ERR = ''; } catch (e) { ERR = e.message; }
  draw();
  if (D?.catalog && !SEEN.has(REPO)) { SEEN.add(REPO); api('/api/today/seen', { method: 'POST', body: JSON.stringify({ repo: REPO }) }).catch(() => {}); }
}
function bind(el) {
  if (el.dataset.tdBound) return; el.dataset.tdBound = '1';
  el.addEventListener('click', e => {
    const m = e.target.closest('[data-mark]'); if (!m || !D) return;
    const [key, decision] = m.dataset.mark.split('|');
    D.items = D.items.filter(x => x.key !== key); // すぐ消す（印は後ろで残す）。リンクのものは GitHub も開く
    setTimeout(draw, 0);
    api('/api/today/mark', { method: 'POST', body: JSON.stringify({ repo: REPO, key, decision }) }).catch(err => { ERR = err.message; draw(); });
  });
}
async function render(el, repo) { EL = el; bind(el); if (REPO !== repo) { REPO = repo; D = null; } draw(); await load(); }
window.Today = { render };
})();
