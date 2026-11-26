// 決まりの文書を「決まりの単位」に分ける。D1 や GitHub に依存しない純粋な部分（テストしやすいように）。

export type DocKind = 'claude' | 'agents' | 'role' | 'skill' | 'doc';
export type Applies = 'always' | 'role' | 'skill' | 'referenced';
export type ParsedItem = { n: number; heading: string; text: string; line: number; kind: 'item' | 'para' | 'row' | 'desc' };

const base = (p: string) => p.split('/').pop() ?? p;
const dir = (p: string) => p.split('/').slice(0, -1).join('/');

/** ファイルの種類と、Claude にどう読まれるか、効く範囲 */
export function classify(path: string): { kind: DocKind; applies: Applies; scope: string } {
  const b = base(path).toUpperCase();
  if (b === 'CLAUDE.MD') return { kind: 'claude', applies: 'always', scope: dir(path).replace(/(^|\/)\.claude$/, '') };
  if (b === 'AGENTS.MD') return { kind: 'agents', applies: 'always', scope: dir(path) };
  if (b === 'ROLE.MD') return { kind: 'role', applies: 'role', scope: dir(path) };
  if (b === 'SKILL.MD') return { kind: 'skill', applies: 'skill', scope: dir(path) };
  return { kind: 'doc', applies: 'referenced', scope: dir(path) };
}

/** 人が選ぶ前の、最初の選び方（決まりらしいファイル） */
export function defaultPick(path: string): boolean {
  if (!/\.md$/i.test(path)) return false;
  const b = base(path).toUpperCase();
  if (['CLAUDE.MD', 'AGENTS.MD', 'ROLE.MD', 'SKILL.MD'].includes(b)) return true;
  if (/(^|\/)\.claude\//.test(path) && !/license/i.test(path)) return true;
  return /^docs\/[^/]+\.md$/i.test(path);
}

/** 先頭の --- で囲まれた部分（スキルの name / description） */
export function frontmatter(src: string): { meta: Record<string, string>; body: string; offset: number } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: src, offset: 0 };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) { const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/); if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim(); }
  return { meta, body: src.slice(m[0].length), offset: m[0].split('\n').length - 1 };
}

const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();

/** 見出しの下の箇条書き・段落・表の行を、決まりの単位にする。コードの囲みは飛ばす */
export function parseRules(src: string, kind: DocKind): { title: string | null; description: string | null; items: ParsedItem[]; refs: string[] } {
  const fm = frontmatter(src);
  const lines = fm.body.split(/\r?\n/);
  const items: ParsedItem[] = [];
  const stack: string[] = [];
  let title: string | null = fm.meta.name ?? null, fence = false, para: string[] = [], paraLine = 0, cur: ParsedItem | null = null, tableHead: string[] | null = null;
  const push = (text: string, line: number, k: ParsedItem['kind']) => { const t = clean(text); if (t.length >= 4) items.push({ n: items.length, heading: stack.filter(Boolean).join(' › '), text: t, line, kind: k }); };
  const flushPara = () => { if (para.length) push(para.join(' '), paraLine, 'para'); para = []; };
  const flushItem = () => { if (cur) { push(cur.text, cur.line, 'item'); cur = null; } };
  if (kind === 'skill' && fm.meta.description) items.push({ n: 0, heading: '説明文（これで読み込まれる）', text: clean(fm.meta.description), line: 1, kind: 'desc' });
  lines.forEach((raw, i) => {
    const ln = i + 1 + fm.offset, line = raw.replace(/\s+$/, '');
    if (/^\s*(```|~~~)/.test(line)) { flushPara(); flushItem(); fence = !fence; return; }
    if (fence) return;
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flushPara(); flushItem(); tableHead = null;
      const lv = h[1].length, txt = clean(h[2]);
      if (lv === 1 && !title) title = txt;
      stack.length = Math.max(0, lv - 1); stack[lv - 1] = lv === 1 ? '' : txt;
      return;
    }
    if (/^\s*\|/.test(line)) {
      flushPara(); flushItem();
      const cells = line.replace(/^\s*\||\|\s*$/g, '').split('|').map(c => clean(c));
      if (cells.every(c => /^:?-{2,}:?$/.test(c) || c === '')) return;
      if (!tableHead) { tableHead = cells; return; }
      push(cells.map((c, k) => (tableHead![k] ? `${tableHead![k]}：${c}` : c)).filter(c => !/：$/.test(c)).join(' / '), ln, 'row');
      return;
    }
    tableHead = null;
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
    if (li) {
      flushPara();
      if (li[1].length >= 2 && cur) { cur.text += ' ' + li[3]; return; } // 入れ子は親の項目に含める
      flushItem(); cur = { n: 0, heading: '', text: li[3], line: ln, kind: 'item' };
      return;
    }
    if (!line.trim()) { flushPara(); flushItem(); return; }
    if (cur && /^\s{2,}/.test(raw)) { cur.text += ' ' + line.trim(); return; }
    flushItem();
    if (!para.length) paraLine = ln;
    para.push(line.replace(/^\s*>\s?/, ''));
  });
  flushPara(); flushItem();
  const refs = [...new Set([...src.matchAll(/(?:^|[^\w./-])((?:[\w.-]+\/)*[\w.-]+\.md)\b/g)].map(m => m[1]))];
  return { title, description: fm.meta.description ?? null, items: items.map((it, k) => ({ ...it, n: k })), refs };
}

/** 一時的な決まりらしい言葉。ドメインの言葉（気象の「暫定値」など）にも当たるので、候補として人が確かめる */
export const TEMP_WORDS = /今回|当面|一旦|いったん|暫定|とりあえず|しばらく|まずは|今は|仮に|あとで|TODO|FIXME/;
export const NEG_WORDS = /ない|しない|使わない|禁止|やめる|不要|避ける|書かない|入れない/;

/** 決まりの中の「言葉」（識別子・かぎかっこの言葉）。同じ言葉が別の文書で説明されていないかを見る */
export function termsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/「([^」]{2,20})」/g)) out.add(m[1]);
  for (const m of text.matchAll(/[A-Za-z][\w.-]*[\w]/g)) { const t = m[0]; if (t.length >= 2 && (/[\d._-]/.test(t) || t.length >= 4) && !/^(the|and|for|with|from|this|that|true|false|null|http|https|www|com)$/i.test(t)) out.add(t); }
  return out;
}
