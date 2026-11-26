// 相談のプロンプトを組み立てる。人のピン・書き換え・範囲の変更を、Claude がそのまま考え始められる形にまとめる。
// 中身：守ること／依頼（原文・書き換えたあと・人のメモ）／効いている範囲／意味の近い決まり／答え方。
// 画面の「Claude に聞く」とコネクタの consult で同じものを使う。
import type { Env } from './types.ts';
import { embedMany, loadVectors } from './embed.ts';
import { dot } from './vec.ts';
import { chain, effective, excluded, itemHead, preview, scopeTree, type Op, type Tree } from './scopes.ts';

const HEAD = [
  'あなたは idea-flow の相談役です。決まりの文書（CLAUDE.md・スキル・docs）の変更について、人と相談します。',
  '',
  '守ること：',
  '- 決めるのは人です。あなたは案を出し、承認はしません。',
  '- 事実（どの文書のどこに何が書いてあるか）と、あなたの見立て（なぜ問題か・どう直すか）を分けて書く。',
  '- 案は、どの文書のどの部分をどう変えるかまで具体的に。複数あれば比べ、おすすめを1つ選ぶ。',
  '- 「意味の近い決まり」は機械で拾った候補です。関係のないものは無視し、足りなければ自分で探す（idea_flow の search・read_doc）。',
  '- 決まりの寿命（短期／長期）は人が決めていないので、決めつけない。',
  '- やさしい言葉で、結論から。',
];
const TAIL = [
  '',
  '## 答え方（この順で）',
  '1. 事実：関わる決まりと、その場所',
  '2. 見立て：依頼の意図をどう読んだか、問題はどこか',
  '3. 案：A・B…（具体的に、おすすめを1つ）',
  '4. 副作用：範囲ごとに、何が変わるか・何が壊れうるか',
  '5. 決めてほしいこと：人に返す問い（1〜3個）',
];

type ItemRow = { id: string; doc: string; heading: string; text: string; line: number };
type DocRow = { id: string; path: string; title: string | null };
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + '…（以下略）' : t);

/** 見出し（と決まりの頭）に当たる決まり */
function target(items: ItemRow[], docId: string, heading: string, item?: string) {
  return items.filter(i => i.doc === docId && i.heading === heading && (!item || itemHead(i.text).startsWith(item)));
}

/** その決まりが効いている範囲・外している範囲（範囲の木から） */
function reach(tree: Tree, path: string, heading: string, text: string) {
  const on: string[] = [], off: string[] = [];
  for (const s of tree) {
    const e = effective(tree, s.id);
    if (!e.docs.some(d => d.path === path)) continue;
    const name = chain(tree, s.id).map(x => x.name).join(' › ');
    if (excluded(e.exceptions, path, heading, text)) { const by = e.exceptions.find(x => excluded([x], path, heading, text)); off.push(`${name}（「${by?.from}」で使わない設定）`); }
    else on.push(name);
  }
  return { on, off };
}

/** ops（まだ出していない変更でもよい）から、相談のプロンプトを作る */
export async function consultPrompt(env: Env, repo: string, ops: Op[], meta: { id?: string; title?: string; reason?: string; by?: string; comments?: { by: string; text: string }[] } = {}) {
  const docs = (await env.DB.prepare('SELECT id, path, title FROM rule_docs WHERE repo = ?').bind(repo).all<DocRow>()).results;
  const items = (await env.DB.prepare('SELECT i.id, i.doc, i.heading, i.text, i.line FROM rule_items i JOIN rule_docs d ON d.id = i.doc WHERE d.repo = ?').bind(repo).all<ItemRow>()).results;
  const tree = await scopeTree(env, repo);
  const L = [...HEAD, '', `## 依頼（${repo}）`];
  if (meta.id) L.push(`- 変更リクエスト id=${meta.id}（${meta.by === 'ai' ? 'Claude' : '人'}が出した）${meta.title ? `「${meta.title}」` : ''}`);
  if (meta.reason) L.push(`- 理由：${meta.reason}`);

  const content = ops.filter(o => o.op === 'pin' || o.op === 'edit') as Extract<Op, { op: 'pin' | 'edit' }>[];
  const vecs = content.length ? await loadVectors(env, 'rule') : new Map();
  for (const o of content) {
    const d = docs.find(x => x.path === o.path);
    const hits = d ? target(items, d.id, o.heading, o.item) : [];
    const cur = hits.map(h => h.text).join('\n');
    L.push('', `### ${o.op === 'edit' ? '書き換え' : '見直しのピン'}：${d?.title ?? o.path}「${o.heading || '（見出しの前）'}${o.item ? '：' + o.item + '…' : ''}」`);
    L.push(`- 文書：${o.path}${hits[0] ? `（${hits[0].line}行目あたり）` : o.line ? `（${o.line}行目あたり）` : ''}`);
    if (o.note) L.push(`- 人のメモ：${o.note}`);
    if (o.op === 'edit') L.push('', '書き換える前：', '```', clip(o.before, 2000), '```', '', '書き換えたあと：', '```', clip(o.after, 2000), '```');
    else L.push('', '原文：', '```', clip(cur || '（見つかりません。取り込み直しが要るかもしれません）', 2000), '```');
    const r = reach(tree, o.path, o.heading, hits[0]?.text ?? '');
    L.push('', 'この決まりが効いている範囲：', ...(tree.length ? (r.on.length ? r.on.map(x => '- ' + x) : ['- （どの範囲にも置かれていない。会話で渡したときだけ効く）']) : ['- （範囲の木はまだない）']));
    if (r.off.length) L.push('この決まりを使わない設定の範囲：', ...r.off.map(x => '- ' + x));
    // 意味の近い決まり（同じ見出しの中は除く）
    const q = [o.op === 'edit' ? o.after : cur, o.note ?? ''].join('\n').trim();
    if (q) {
      const [qv] = await embedMany(env, [q.slice(0, 1500)]);
      const near = items.filter(i => vecs.has(i.id) && !(d && i.doc === d.id && i.heading === o.heading))
        .map(i => ({ i, s: dot(qv, vecs.get(i.id)!) })).sort((a, b) => b.s - a.s).slice(0, 6).filter(x => x.s >= 0.45);
      L.push('', '意味の近い決まり（機械で拾った候補）：', ...(near.length ? near.map(({ i, s }, k) => { const dd = docs.find(x => x.id === i.doc)!; return `${k + 1}. ${dd.path}:${i.line}「${i.heading || '（見出しの前）'}」（近さ ${s.toFixed(2)}）：${clip(i.text, 160)}`; }) : ['- （見つかりません）']));
    }
  }

  const scopeOps = ops.filter(o => o.op !== 'pin' && o.op !== 'edit');
  if (scopeOps.length) {
    L.push('', '### 範囲の変更', ...scopeOps.map(o => '- ' + JSON.stringify(o)));
    try {
      const pv = await preview(env, repo, scopeOps);
      if (pv.length) L.push('承認したら変わること：', ...pv.map(p => `- ${p.chain.join(' › ')}${p.isNew ? '（新しい範囲）' : ''}${p.starts.length ? `／効き始める：${p.starts.join('、')}` : ''}${p.stops.length ? `／効かなくなる：${p.stops.join('、')}` : ''}${p.newExceptions.length ? `／例外が増える：${p.newExceptions.join('、')}` : ''}${p.droppedExceptions.length ? `／例外がなくなる：${p.droppedExceptions.join('、')}` : ''}`));
    } catch (e) { L.push(`（この変更はそのままでは反映できません：${e instanceof Error ? e.message : String(e)}）`); }
  }
  if (meta.comments?.length) L.push('', '## これまでのやり取り', ...meta.comments.map(c => `- ${c.by === 'ai' ? 'Claude' : '人'}：${clip(c.text, 600)}`));
  L.push(...TAIL);
  if (meta.id) L.push('', `答えは、idea_flow の action="comment"（args: id="${meta.id}", text=答え）で、この変更リクエストに書いてください。人がアプリで読んで、承認するか決めます。`);
  return L.join('\n');
}

/** 出した変更リクエストから */
export async function consultFor(env: Env, id: string) {
  const r = await env.DB.prepare('SELECT * FROM change_requests WHERE id = ?').bind(id).first<{ id: string; repo: string; by: string; title: string; reason: string; ops: string }>();
  if (!r) throw new Error('変更リクエストが見つかりません');
  const comments = (await env.DB.prepare('SELECT by, text FROM request_comments WHERE request_id = ? ORDER BY at').bind(id).all<{ by: string; text: string }>()).results;
  return consultPrompt(env, r.repo, JSON.parse(r.ops), { id: r.id, title: r.title, reason: r.reason, by: r.by, comments });
}
