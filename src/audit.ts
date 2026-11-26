// 機能していない・意味がなさそうな文書を探す（GitHub にも D1 にも依存しない部分。テストしやすいように）
//
// 見るもの：
//  - dead_ref     もう無いファイルを指している（説明だけが残っている）
//  - skill_unused 使っていない技術向けのスキル（説明文の技術がリポジトリに無い）
//  - orphan       どの文書からも案内されず、範囲にも置かれていない文書
// どれも「候補」。決めるのは人。

export type AuditHit = { kind: 'dead_ref' | 'skill_unused' | 'orphan'; path: string; detail: Record<string, unknown> };
export type DeadRef = { ref: string; line: number; heading: string; text: string };

const ROOTS = 'src|shared|worker|workers|scripts|test|tests|e2e|public|docs|research|design-src|lib|app|apps|packages|server|client|\\.claude|\\.github';
const PATH_RE = new RegExp(`(?<![\\w/.-])((?:${ROOTS})/[\\w./-]+)`, 'g');
/** 同じ行で「消した」と言っているなら、意図した記録（問題ではない） */
export const GONE_WORDS = /消した|消しました|削除した|削除しました|なくした|置き換えた|置き換えました|廃止|やめた|removed|deleted/i;
/** 作られる物・入れる物（リポジトリに無くて当たり前） */
const BUILT = /node_modules|(^|\/)(out|dist|build|coverage|\.wrangler)(\/|$)|\/\.bin\//;

const base = (p: string) => p.split('/').pop() ?? p;
const dirOf = (p: string) => p.split('/').slice(0, -1).join('/');

export function dirsOf(all: string[]) {
  const s = new Set<string>();
  for (const f of all) { const parts = f.split('/'); for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join('/')); }
  return s;
}

/** 文書の中の、リポジトリに無いパス（行・見出しつき） */
export function deadRefs(text: string, all: Set<string>, dirs: Set<string>): DeadRef[] {
  const out: DeadRef[] = [], seen = new Set<string>();
  let heading = '';
  text.split(/\r?\n/).forEach((line, i) => {
    const h = line.match(/^#{1,6}\s+(.+)$/);
    if (h) heading = h[1].replace(/[`*]/g, '').trim();
    if (GONE_WORDS.test(line)) return;
    for (const m of line.matchAll(PATH_RE)) {
      const ref = m[1].replace(/[.,:;)\]）。、]+$/, '').replace(/\/$/, '');
      if (!ref || BUILT.test(ref) || seen.has(ref)) continue;
      if (all.has(ref) || dirs.has(ref)) continue;
      // 拡張子なしで書いたもの（src/ui/MoonStory など）
      if ([...all].some(a => a.startsWith(ref + '.') || a.startsWith(ref + '/'))) continue;
      seen.add(ref);
      out.push({ ref, line: i + 1, heading, text: line.trim().slice(0, 200) });
    }
  });
  return out;
}

/** 技術の名前 → それがあると分かる package.json の名前 */
const TECH: [string, RegExp, string[]][] = [
  ['Vue', /\bvue(\.js)?\b/i, ['vue']],
  ['Nuxt', /\bnuxt\b/i, ['nuxt']],
  ['Svelte', /\bsvelte(kit)?\b/i, ['svelte', '@sveltejs/kit']],
  ['Angular', /\bangular\b/i, ['@angular/core']],
  ['Solid', /\bsolid(js|\.js)?\b/i, ['solid-js']],
  ['Next.js', /\bnext\.js\b|\bnextjs\b/i, ['next']],
  ['React Native', /\breact native\b/i, ['react-native']],
  ['React', /\breact\b(?! native)/i, ['react']],
];

/** スキルの説明文に出てくる技術が、どれもリポジトリに無いか */
export function unusedTech(description: string, deps: Set<string>): string[] | null {
  // 「For React use gsap-react」「non-React」のような、別のスキルへ回す言い方は数えない
  const d = description.split(/(?<=[.;。])\s*/).filter(x => !/^for\b.*\buse\b/i.test(x.trim())).join(' ').replace(/\bnon-[\w.]+/gi, '');
  const named = TECH.filter(([, re]) => re.test(d));
  if (!named.length) return null;
  if (named.some(([, , pk]) => pk.some(p => deps.has(p)))) return null;
  return named.map(([n]) => n);
}

export function depsOf(pkgJson: string | undefined): Set<string> | null {
  if (!pkgJson) return null;
  try {
    const j = JSON.parse(pkgJson);
    return new Set([...Object.keys(j.dependencies ?? {}), ...Object.keys(j.devDependencies ?? {}), ...Object.keys(j.peerDependencies ?? {})]);
  } catch { return null; }
}

/** ほかの文書から案内されているか（パス・相対パス・ファイル名で） */
function mentioned(target: string, from: string, text: string) {
  if (text.includes(target)) return true;
  const fd = dirOf(from), td = dirOf(target);
  const up = fd ? fd.split('/').map(() => '..') : [];
  let rel = target;
  if (fd && target.startsWith(fd + '/')) rel = target.slice(fd.length + 1);
  else if (fd) { let k = 0; const a = fd.split('/'), b = td ? td.split('/') : []; while (k < a.length && a[k] === b[k]) k++; rel = [...up.slice(k), ...b.slice(k), base(target)].join('/'); }
  if (text.includes(rel)) return true;
  // README.md なら、そのフォルダの名前で案内されていることが多い（research/visibility/ など）
  if (/^readme\.md$/i.test(base(target)) && td) { const folder = base(td); if (new RegExp(`(^|[^\\w-])${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?([^\\w-]|$)`).test(text)) return true; }
  const b = base(target);
  return !/^(readme|skill|index|role|claude|agents)\.md$/i.test(b) && text.includes(b);
}

/** 置いてあるだけで読まれる・使われる文書（案内が無くてよいもの） */
function selfServed(path: string, all: string[]) {
  const b = base(path).toUpperCase();
  if (['CLAUDE.MD', 'AGENTS.MD', 'ROLE.MD', 'SKILL.MD'].includes(b)) return true;
  if (/^(README|LICENSE|CHANGELOG|CONTRIBUTING|SECURITY|CODE_OF_CONDUCT)/i.test(base(path)) && !path.includes('/')) return true;
  if (path.startsWith('.github/')) return true; // issue・PR のひな形は GitHub が使う
  // フォルダの説明の README（同じフォルダにコードやデータがある）は、フォルダを開けば読まれる
  if (/^readme\.md$/i.test(base(path))) { const d = dirOf(path); return all.some(f => dirOf(f) === d && !/\.md$/i.test(f)); }
  return false;
}

export const isRecord = (path: string) => /(^|[-_/])(results?|log|logs|history|notes?|minutes|report)\.md$/i.test(path) || /(^|\/)research\//.test(path) && !/^readme\.md$/i.test(base(path));

/** まとめて調べる。texts は読めた .md（と package.json）の中身 */
export function audit(input: { all: string[]; texts: Map<string, string>; deps: Set<string> | null; placed: Set<string>; descriptions: Map<string, string> }): AuditHit[] {
  const all = new Set(input.all), dirs = dirsOf(input.all);
  const md = input.all.filter(p => /\.md$/i.test(p) && input.texts.has(p));
  const hits: AuditHit[] = [];
  for (const p of md) {
    const refs = deadRefs(input.texts.get(p)!, all, dirs);
    if (refs.length) hits.push({ kind: 'dead_ref', path: p, detail: { refs: refs.slice(0, 20) } });
  }
  if (input.deps) for (const [p, desc] of input.descriptions) {
    const t = unusedTech(desc, input.deps);
    if (t) hits.push({ kind: 'skill_unused', path: p, detail: { techs: t } });
  }
  for (const p of md) {
    if (selfServed(p, input.all) || input.placed.has(p)) continue;
    if (md.some(o => o !== p && mentioned(p, o, input.texts.get(o)!))) continue;
    hits.push({ kind: 'orphan', path: p, detail: { record: isRecord(p), lines: input.texts.get(p)!.split('\n').length } });
  }
  return hits;
}
