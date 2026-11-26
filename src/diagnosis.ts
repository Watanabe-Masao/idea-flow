// 診断書：見つかった問題を、ふだんの言葉の「結論・なぜ困るか・次の一手」にまとめる。画面とコネクタで同じものを使う。

export const PLAIN_APPLIES: Record<string, string> = {
  always: '自動で届く', role: '役割として届く', skill: '場面に合えば届く（スキル）', referenced: '渡さないと届かない',
};

type F = { kind: string; a: string; b: string | null; detail: any };
type D = { id: string; repo: string; path: string; external: number };
type I = { id: string; doc: string };

export type Conclusion = { kind: string; title: string; why: string; next: string; count: number; list?: string[] };

const T: Record<string, (n: number, f: F[]) => Omit<Conclusion, 'kind' | 'count'>> = {
  no_entry: (_, f) => ({
    title: '決まりが Claude に自動では届いていません',
    why: `入口になる文書（CLAUDE.md など）が無いので、${f[0].detail.items}件の決まりはどれも、会話で渡したときにしか効きません。新しいスレッドで渡し忘れると、守られません。`,
    next: f[0].detail.candidates?.length ? `入口から読ませる文書を1つ決める（候補：${f[0].detail.candidates.map((c: any) => `${c.path}（そこから ${c.reaches.length}件に届く）`).join('、')}）` : '入口から読ませる文書を決める',
  }),
  unreferenced: n => ({ title: `入口からたどれない文書があります（${n}件）`, why: '入口から参照されていないので、会話で渡さない限り効きません。', next: '入口から参照するか、もう要らないかを決める' }),
  duplicate: n => ({ title: `同じことが2か所に書かれています（${n}組）`, why: '片方だけ直すと、食い違いが生まれます。', next: '組ごとに、どちらを正本にするかを決める' }),
  definition: n => ({ title: `同じ言葉を2か所で説明しています（${n}組）`, why: '片方だけ直すと、言葉の意味がずれます。', next: '説明をどちらか1か所にまとめ、もう片方からは参照する' }),
  conflict: n => ({ title: `食い違っているかもしれない決まり（${n}組）`, why: '近い話題で、片方だけが「しない」と言っています（違う場面の話かもしれません）。', next: '組ごとに、同じ場面の話か、どちらが正しいかを確かめる' }),
  temporary: n => ({ title: `もう終わったかもしれない決まり（${n}件）`, why: '「今回は」「当面」などが付いたまま残っています（「暫定値」のような普通の言葉にも当たります）。', next: '1件ずつ「終わった／まだ有効／問題ではない」を選ぶ' }),
  dead_ref: (_, f) => ({
    title: `もう無いファイルを指している文書（${f.length}件）`,
    why: 'ファイルが消えたあとも説明だけが残っています。Claude がこれを読むと、無い仕組みを前提に作業します。',
    next: '消したコミットを見て、説明を直すか消すかを決める',
  }),
  skill_unused: (_, f) => ({
    title: `使っていない技術向けのスキル（${f.length}件）`,
    why: '説明文に出てくる技術が、このリポジトリにありません。役に立たないまま、似た場面で読み込まれることがあります。',
    next: 'スキルを外すか、残す理由を書く',
  }),
  orphan: (_, f) => ({
    title: `どこからも案内されていない文書（${f.length}件）`,
    why: 'どの文書からも参照されず、範囲にも置かれていません。あることを知っている人しか読みません。',
    next: f.some(x => x.detail.record) ? '記録なら一覧（README など）から案内する。要らなければ消す' : '案内するか、範囲に置くか、要らなければ消す',
  }),
  skill_overlap: n => ({ title: `似た場面で呼ばれるスキル（${n}組）`, why: '説明文が似ていると、意図しない場面で呼ばれやすくなります。', next: '説明文に「いつ使わないか」を書き足すか、まとめる' }),
};
/** 一覧で見せる1行（ファイル単位の問題だけ） */
export const LIST: Record<string, (f: F) => string[]> = {
  dead_ref: f => (f.detail.refs as any[]).map(r => `${f.detail.path} ${r.line}行目${r.heading ? `「${r.heading}」` : ''} → ${r.ref}${r.gone ? `（${r.gone.date} ${r.gone.sha}「${r.gone.message}」で消えた）` : '（無い）'}`),
  skill_unused: f => [`${f.detail.path}（説明文の技術：${(f.detail.techs as string[]).join('・')}。どれも package.json に無い）`],
  orphan: f => [`${f.detail.path}${f.detail.record ? '（記録・結果の文書）' : ''}・${f.detail.lines}行`],
};
const ORDER = ['no_entry', 'dead_ref', 'unreferenced', 'duplicate', 'definition', 'conflict', 'temporary', 'skill_overlap', 'skill_unused', 'orphan'];

/** リポジトリの診断書。重いものから並べる。外から入れた文書の数も返す */
export function diagnose(repo: string, findings: F[], docs: D[], items: I[]) {
  const docRepo = (id: string) => docs.find(d => d.id === id)?.repo ?? docs.find(d => d.id === items.find(i => i.id === id)?.doc)?.repo ?? (id.includes('|') ? id.split('|')[0] : null);
  const fs = findings.filter(f => docRepo(f.a) === repo || (f.b && docRepo(f.b) === repo));
  const out: Conclusion[] = [];
  for (const k of ORDER) {
    const xs = fs.filter(f => f.kind === k);
    if (!xs.length) continue;
    out.push({ kind: k, count: xs.length, ...T[k](xs.length, xs), ...(LIST[k] ? { list: xs.flatMap(LIST[k]) } : {}) });
  }
  const ext = docs.filter(d => d.repo === repo && d.external);
  return { conclusions: out, external: ext.map(d => d.path) };
}
