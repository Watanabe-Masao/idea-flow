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
| コミット → 課題 | 近さが `issue_auto` 以上なら自動、`issue_ask` 以上なら確認待ち |
| コミット → テーマ | 課題に近くないとき、テーマの重心と比べる（`theme_auto` / `theme_ask`） |
| 新しいテーマの候補 | どこにも近くないコミットどうしが `cluster_link` 以上でつながり、`cluster_min` 件以上の塊になったもの |
| テーマの前提 | 意味が近く（`premise_min` 以上）、かつ先に生まれたテーマ |

## 答え合わせ

番号で確定しているコミットを正解にして、bge‑m3 の近さだけで同じ課題・テーマを当てられるかを測る（画面の「答え合わせ」、または `GET /api/eval`）。
しきい値ごとの「カバー」と「当たり」の表が出るので、それを見てしきい値を決める。初期値は仮。

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
