// 診断書：見つかった問題を、ふだんの言葉の「結論・なぜ困るか・次の一手」にまとめる。画面とコネクタで同じものを使う。

export const PLAIN_APPLIES: Record<string, string> = {
  always: '自動で届く', role: '役割として届く', skill: '場面に合えば届く（スキル）', referenced: '渡さないと届かない',
};

type F = { kind: string; a: string; b: string | null; detail: any };
type D = { id: string; repo: string; path: string; external: number };
type I = { id: string; doc: string };

export type Conclusion = { kind: string; title: string; why: string; next: string; count: number };

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
  skill_overlap: n => ({ title: `似た場面で呼ばれるスキル（${n}組）`, why: '説明文が似ていると、意図しない場面で呼ばれやすくなります。', next: '説明文に「いつ使わないか」を書き足すか、まとめる' }),
};
const ORDER = ['no_entry', 'unreferenced', 'duplicate', 'definition', 'conflict', 'temporary', 'skill_overlap'];

/** リポジトリの診断書。重いものから並べる。外から入れた文書の数も返す */
export function diagnose(repo: string, findings: F[], docs: D[], items: I[]) {
  const docRepo = (id: string) => docs.find(d => d.id === id)?.repo ?? docs.find(d => d.id === items.find(i => i.id === id)?.doc)?.repo ?? (id.endsWith('|') ? id.slice(0, -1) : null);
  const fs = findings.filter(f => docRepo(f.a) === repo || (f.b && docRepo(f.b) === repo));
  const out: Conclusion[] = [];
  for (const k of ORDER) {
    const xs = fs.filter(f => f.kind === k);
    if (!xs.length) continue;
    out.push({ kind: k, count: xs.length, ...T[k](xs.length, xs) });
  }
  const ext = docs.filter(d => d.repo === repo && d.external);
  return { conclusions: out, external: ext.map(d => d.path) };
}
