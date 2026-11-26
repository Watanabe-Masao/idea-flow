# idea-flow

Linear の課題と GitHub のコミットを、テーマ・課題ごとの時系列に並べる。
番号のないコミットは、Workers AI の bge‑m3 で意味の近さを計算して振り分けを**提案**する。決めるのは人。

## 考え方

| 層 | どこにあるか | 役割 |
|---|---|---|
| 構造（正本） | Linear | テーマ（ラベル `C01 …`）、親子、関連・重複、状態、「決めたこと」 |
| 活動 | GitHub | コミットと PR |
| 提案 | Workers AI（bge‑m3） | 意味の近さで候補を出すだけ。文章を生成する AI は使わない |
| 記録 | D1 | 写し・埋め込み・提案・人の判断（追記だけ） |

- 状態（進行中・止まっているなど）は保存せず、表示のたびに計算する。
- 人の判断は `events` に追記するだけで、上書きしない。
- コミットの振り分けの優先順：手で振り分け ＞ 番号で確定（`#369`・`WAT-9`）＞ 承認済み ＞ 自動 ＞ 確認待ち ＞ 本流。

## 提案の種類

| 種類 | 内容 |
|---|---|
| コミット → 課題 | 手本（番号で確定・承認・手で振り分けたコミットと課題そのもの）のうち近い上位7件が多数決。見出し（「予報の履歴：」など）が同じ手本は票が2倍。票の割合が `issue_auto` 以上なら自動、`issue_ask` 以上なら確認待ち。いちばん近い手本が `min_sim` 未満なら提案しない |
| コミット → テーマ | 課題が決まらないとき、同じ多数決をテーマで行う（`theme_auto` / `theme_ask`） |
| 新しいテーマの候補 | どこにも近くないコミットどうしが `cluster_link` 以上でつながり、`cluster_min` 件以上の塊になったもの |
| テーマの前提 | 意味が近く（`premise_min` 以上）、かつ先に生まれたテーマ |

## 答え合わせ

番号で確定しているコミットを正解にして、多数決で同じ課題・テーマを当てられるかを測る（画面の「答え合わせ」、または `GET /api/eval`）。
1件ずつ、自分と同じPRのコミットを手本から外して当てる。親子・兄弟・関係のある課題に当たったものは「ほぼ正解」として別に数え、前の方式（課題の文との近さだけ）の正解率も並べて出す。
票の割合ごとの「カバー」と「当たり」の表が出るので、それを見てしきい値を決める。初期値は仮。

## スマホだけで動かす（Cloudflare の Workers Builds）

1. D1 に `idea-flow` を作る（作成済み。ID は `wrangler.jsonc` に記入済み）
2. Workers & Pages →「作成」→「リポジトリをインポート」→ このリポジトリ。デプロイコマンドは `npm run deploy`
   （表の作成〔マイグレーション〕→ デプロイの順に自動で行う）
3. 最初のデプロイの後、Worker の「設定」→「変数とシークレット」で `LINEAR_API_KEY` と `ADMIN_TOKEN` をシークレットとして追加
4. Worker の URL を開き、合言葉を入れて「取り込み直す」

マイグレーションがビルドで失敗したときは、D1 の「コンソール」に `migrations/0001_init.sql` の中身を貼って実行してもよい。

## はじめかた（PC から）

```sh
npm install
npx wrangler login
npx wrangler d1 create idea-flow          # 出てきた database_id を wrangler.jsonc に書く
npm run db:migrate                         # 本番の D1 に表を作る
npx wrangler secret put LINEAR_API_KEY     # Linear → Settings → Security & access → Personal API keys
npx wrangler secret put ADMIN_TOKEN        # 画面で使う合言葉（長めの乱数）
npx wrangler secret put GITHUB_TOKEN       # 任意。公開リポジトリなら無くても動く（1時間60回の制限あり）
npm run deploy
```

デプロイしたら、画面を開いて合言葉を入れ、「取り込み直す」を押す。
初回は Linear の課題と GitHub のコミット（約600件）を取り込み、埋め込みを作る。

`GET /api/selftest`（合言葉つき）で、bge‑m3 が動くか・次元数を確かめられる。

## 注意：D1 の上限

初回の取り込み（約600件）では、1回の実行で D1 の文を数百回使う。Workers の有料プラン（1回の実行あたり 1000 回まで）を前提にしている。無料プランでは途中で止まるので、その場合は `POST /api/sync` を何回かに分けて実行する（取り込み済みの分は飛ばされる）。

## 毎日の動き

`wrangler.jsonc` の cron で、日本時間 6:10 に「取り込み → 埋め込み（変わったものだけ）→ 提案の計算」を行う。

## Linear への書き戻し

`WRITE_BACK` を `"true"` にすると、承認した「コミット → 課題」を Linear の課題にリンクとして残す。
初期値は `"false"`（書き戻さない）。動きを確かめてから切り替える。

## API（すべて `Authorization: Bearer <ADMIN_TOKEN>` が必要）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/map` | 画面用のデータ |
| GET | `/api/pending` | 確認待ちの提案 |
| GET | `/api/eval` | 答え合わせ |
| GET | `/api/settings` | しきい値 |
| GET | `/api/events` | 判断の記録（新しい順 100件） |
| GET | `/api/selftest` | bge‑m3 の動作確認 |
| POST | `/api/sync` | 取り込み → 埋め込み → 提案 |
| POST | `/api/suggest` | 提案だけ計算し直す |
| POST | `/api/decide` | `{id, decision: "accept"｜"reject", target?}` |
| POST | `/api/assign` | `{sha, issue?, theme?}` 手で振り分け |
| POST | `/api/settings` | しきい値を保存（記録にも残る） |

## 開発

```sh
npm run typecheck
npm test            # 計算部分（vec.ts など）のテスト
npm run dev         # ローカル。Workers AI はリモートを使う
```

## 決まりの見える化（#8）

画面の「決まり」タブ。リポジトリの CLAUDE.md・AGENTS.md・ROLE.md・SKILL.md・決まりの文書（`docs/*.md` など、人が選ぶ）を**読むだけ**で取り込み、どこに効いているかと問題を表示する。GitHub には書き込まない。

- 文書ごとに「どう読まれるか」を出す：自動で読まれる（CLAUDE.md・AGENTS.md）／役割として（ROLE.md）／説明文で読まれる（スキル）／参照されたときだけ
- 見つける問題：重複・食い違いの候補・一時的な決まりの残り・読み込まれ方が重なるスキル・どこからも読まれない文書
- 人が「問題ではない」にしたものは、取り込み直しても出さない
- ルールの寿命は、人が仕分けるまで「未分類」（#7 の設計の原則）
- しきい値：`rule_dup`（重複）・`rule_conflict`（食い違いの候補）・`rule_skill`（スキルの重なり）
- 取り込みは人がボタンで行う（毎朝の自動取り込みには入れない）。読むリポジトリが GITHUB_TOKEN の対象外なら、公開リポジトリだけ読める
