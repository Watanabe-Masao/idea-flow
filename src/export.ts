// 届ける：範囲の木から CLAUDE.md の「道案内」を作り、承認した書き換えといっしょに PR として出す。
// マージは人がする。CLAUDE.md の中で、idea-flow が書き換えるのは印（idea-flow:start〜end）の間だけ。
// claude.ai の会話用には、範囲ごとの「プロジェクトの指示文」を作る（コネクタで契約を読ませる）。
import type { Env } from './types.ts';
import { b64, gh, ghWrite } from './gh.ts';
import { chain, ITEM_SEP, scopeTree, type Op, type Tree } from './scopes.ts';
import { newId, nowIso } from './util.ts';

export const START = '<!-- idea-flow:start -->';
export const END = '<!-- idea-flow:end -->';
const TARGET = 'CLAUDE.md';

type DocRow = { path: string; title: string | null; applies: string };

/** CLAUDE.md に入れる道案内（印の間に入る中身） */
export function guideText(repo: string, tree: Tree, docs: DocRow[], summaries: Record<string, string>) {
  const info = (p: string) => { const d = docs.find(x => x.path === p); return { title: d?.title ?? p.split('/').pop()!.replace(/\.md$/i, ''), skill: d?.applies === 'skill' }; };
  const exText = (e: { path: string; heading: string; why?: string }) => {
    const what = e.heading === '*' ? '全体' : e.heading.includes(ITEM_SEP) ? `「${e.heading.split(ITEM_SEP)[0] || '見出しの前'}」の決まり「${e.heading.split(ITEM_SEP)[1]}…」` : `「${e.heading}」`;
    return `- 使わない：\`${e.path}\` の${what}${e.why ? `（${e.why}）` : ''}`;
  };
  const L = [
    START,
    '<!-- このまとまりは idea-flow が範囲の木から作ります。直すときは idea-flow の「範囲」で直してください（ここを手で直すと、次の書き出しで上書きされます） -->',
    '## 決まりの道案内（idea-flow）',
    '',
    '- 作業を始める前に、その作業がどの範囲に入るかを決め、その範囲の「読む」を読んでから進める。範囲が分からないときは、作業の前に聞く。',
    '- 範囲の決まりは、その範囲と下の範囲に効く。横の範囲の決まりは持ち込まない。',
    '- 「使わない」と書いた部分は、その範囲（と下）では従わない。',
  ];
  const root = tree.find(s => !s.parent_id);
  const walk = (s: Tree[number], depth: number) => {
    const isRoot = s === root;
    const name = isRoot ? 'すべての作業' : chain(tree, s.id).slice(1).map(x => x.name).join(' › ');
    const when = s.note || summaries[`scope|${s.id}`] || '';
    L.push('', `${depth <= 1 ? '###' : '####'} ${name}`);
    if (when && !isRoot) L.push(`どんなとき：${when}`);
    const plain = s.docs.filter(p => !info(p).skill), skills = s.docs.filter(p => info(p).skill);
    for (const p of plain) L.push(`- 読む：\`${p}\`（${info(p).title}）`);
    if (skills.length) L.push(`- スキル（場面に合えば読み込まれる）：${skills.map(p => info(p).title).join('、')}`);
    for (const e of s.exceptions) L.push(exText(e));
    if (!isRoot && depth > 1) L.push('- 上の範囲の決まりも守る');
    if (!plain.length && !skills.length && !s.exceptions.length) L.push('- （この範囲だけの決まりはまだない。上の範囲の決まりを守る）');
    for (const k of tree.filter(x => x.parent_id === s.id)) walk(k, depth + 1);
  };
  if (root) walk(root, 0);
  L.push('', '### 決まりで足りないとき', '- 決まりでまかなえないこと、決まりとぶつかることが出たら、勝手に決めずに知らせる（決まりを広げるかは人が決める）。');
  L.push('', '### PR に書くこと（作業の記録）',
    '- PR の説明の最後に、次の3つの見出しを、この名前のまま書く。無いときは「- なし」と書く。人が、あとで何を確かめたかを見るため。',
    '```',
    '## 確かめた決まり',
    '- `docs/〇〇.md`「見出し」（読んで従った決まり。1行に1つ）',
    '## 決まりになく、自分で判断した所',
    '- 何をどう決めたか',
    '## 足りなかった決まり',
    '- 決まりがあれば迷わなかった所',
    '```', END);
  return L.join('\n');
}

/** いまの CLAUDE.md に、道案内を入れた中身（印があれば間だけ差し替え、無ければ末尾に足す） */
export function mergeGuide(current: string | null, guide: string) {
  if (!current) return `# このリポジトリで Claude が守ること\n\n${guide}\n`;
  const a = current.indexOf(START), b = current.indexOf(END);
  if (a >= 0 && b > a) return current.slice(0, a) + guide + current.slice(b + END.length);
  return current.replace(/\s*$/, '') + '\n\n' + guide + '\n';
}

/** 承認したけれど、まだ出していない書き換え */
async function pendingEdits(env: Env, repo: string) {
  const rows = (await env.DB.prepare("SELECT id, title, ops FROM change_requests WHERE repo = ? AND status = 'accepted' AND exported IS NULL ORDER BY decided_at").bind(repo).all<{ id: string; title: string; ops: string }>()).results;
  return rows.flatMap(r => (JSON.parse(r.ops) as Op[]).filter(o => o.op === 'edit').map(o => ({ request: r.id, title: r.title, op: o as Extract<Op, { op: 'edit' }> })));
}

async function readFile(env: Env, repo: string, branch: string, path: string) {
  try { return await gh<string>(env, `/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`, true); }
  catch (e) { if (String(e).includes(' 404')) return null; throw e; }
}

async function branchOf(env: Env, repo: string) {
  const s = await env.DB.prepare('SELECT branch FROM rule_sources WHERE repo = ?').bind(repo).first<{ branch: string }>();
  return s?.branch ?? 'main';
}

/** 書き出したらどうなるか（ファイルごとの前と後、当てはまらない書き換え） */
export async function exportPreview(env: Env, repo: string) {
  const branch = await branchOf(env, repo);
  const tree = await scopeTree(env, repo);
  const docs = (await env.DB.prepare('SELECT path, title, applies FROM rule_docs WHERE repo = ?').bind(repo).all<DocRow>()).results;
  const sums = Object.fromEntries((await env.DB.prepare("SELECT key, text FROM rule_summaries WHERE key LIKE 'scope|%'").all<{ key: string; text: string }>()).results.map(r => [r.key, r.text]));
  const files = new Map<string, { before: string | null; after: string }>();
  const notes: string[] = [];
  if (tree.length) {
    const cur = await readFile(env, repo, branch, TARGET);
    const next = mergeGuide(cur, guideText(repo, tree, docs, sums));
    if (next !== cur) files.set(TARGET, { before: cur, after: next });
  } else notes.push('範囲の木がまだないので、CLAUDE.md の道案内は作りません。');
  const edits = await pendingEdits(env, repo);
  const results: { request: string; path: string; heading: string; ok: boolean; reason?: string }[] = [];
  for (const e of edits) {
    const f = files.get(e.op.path) ?? { before: await readFile(env, repo, branch, e.op.path), after: '' };
    const base = files.has(e.op.path) ? f.after : f.before;
    if (base == null) { results.push({ request: e.request, path: e.op.path, heading: e.op.heading, ok: false, reason: 'ファイルが見つかりません' }); continue; }
    const n = base.split(e.op.before).length - 1;
    if (n !== 1) { results.push({ request: e.request, path: e.op.path, heading: e.op.heading, ok: false, reason: n ? '書き換える前の文が2か所以上あります' : '書き換える前の文が見つかりません（ファイルが変わったかもしれません）' }); continue; }
    files.set(e.op.path, { before: f.before, after: base.replace(e.op.before, e.op.after) });
    results.push({ request: e.request, path: e.op.path, heading: e.op.heading, ok: true });
  }
  return { repo, branch, files: [...files].map(([path, v]) => ({ path, before: v.before, after: v.after })), edits: results, notes, canWrite: !!env.GITHUB_WRITE_TOKEN };
}

/** PR を出す（ブランチを作り、ファイルを書き、PR を開く）。マージはしない */
export async function exportPr(env: Env, repo: string) {
  const pv = await exportPreview(env, repo);
  if (!pv.files.length) throw new Error('書き出すものがありません（CLAUDE.md はもう最新で、承認した書き換えもありません）');
  const head = `idea-flow/export-${nowIso().replace(/[-:]/g, '').slice(0, 13)}`;
  const ref = await gh<{ object: { sha: string } }>(env, `/repos/${repo}/git/ref/heads/${encodeURIComponent(pv.branch)}`);
  await ghWrite(env, 'POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${head}`, sha: ref.object.sha });
  for (const f of pv.files) {
    const path = f.path.split('/').map(encodeURIComponent).join('/');
    let sha: string | undefined;
    if (f.before != null) sha = (await gh<{ sha: string }>(env, `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(head)}`)).sha;
    await ghWrite(env, 'PUT', `/repos/${repo}/contents/${path}`, { message: f.path === TARGET ? 'CLAUDE.md の道案内を範囲の木から作り直す（idea-flow）' : `決まりの書き換え：${f.path}（idea-flow で承認）`, content: b64(f.after), branch: head, ...(sha ? { sha } : {}) });
  }
  const okEdits = pv.edits.filter(e => e.ok), ngEdits = pv.edits.filter(e => !e.ok);
  const body = [
    'idea-flow から書き出しました。マージするかは人が決めます。',
    '',
    ...(pv.files.some(f => f.path === TARGET) ? ['- `CLAUDE.md`：範囲の木から作った「決まりの道案内」（`idea-flow:start`〜`end` の間だけを書き換えています）'] : []),
    ...okEdits.map(e => `- \`${e.path}\`「${e.heading || '見出しの前'}」：承認した書き換え（変更リクエスト ${e.request}）`),
    ...(ngEdits.length ? ['', '当てはまらなかった書き換え（このPRには入れていません）：', ...ngEdits.map(e => `- \`${e.path}\`「${e.heading}」：${e.reason}`)] : []),
  ].join('\n');
  const pr = await ghWrite<{ html_url: string; number: number }>(env, 'POST', `/repos/${repo}/pulls`, { title: 'Claude への決まりの道案内を更新（idea-flow）', head, base: pv.branch, body });
  const reqs = [...new Set(okEdits.map(e => e.request))];
  const now = nowIso();
  await env.DB.batch([
    ...reqs.map(id => env.DB.prepare('UPDATE change_requests SET exported = ? WHERE id = ?').bind(pr.html_url, id)),
    env.DB.prepare('INSERT INTO events (id, at, kind, subject, value, by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(newId('ev'), now, 'export_pr', repo, pr.html_url, 'human', null),
  ]);
  return { url: pr.html_url, number: pr.number, files: pv.files.map(f => f.path), skipped: ngEdits };
}

/** claude.ai の会話用：範囲ごとのプロジェクトの指示文（契約はコネクタで読むので、決まりが変わっても貼り直さなくてよい） */
export async function projectInstruction(env: Env, repo: string, scopeKey: string) {
  const tree = await scopeTree(env, repo);
  const s = tree.find(x => x.key === scopeKey);
  if (!s) throw new Error('範囲が見つかりません');
  const name = chain(tree, s.id).map(x => x.name).join(' › ');
  return [
    `このプロジェクトでは、${repo} の範囲「${name}」の話をします。`,
    '',
    `- 会話を始めたら、まず idea-flow のコネクタで action="contract"（args: repo="${repo}", scope="${s.key}"）を読み、その決まりに従う。`,
    '- その範囲の外の話題や、メモリにある関係のない話（ほかの仕事・ほかのアプリなど）は、こちらから持ち込まない。必要そうなら、持ち込んでよいか先に聞く。',
    '- 決まりで足りないこと、決まりとぶつかることが出たら、勝手に決めずに知らせる。決まりを変えたほうがよければ、idea-flow に変更リクエストとして提案する（反映は人の承認）。',
  ].join('\n');
}
