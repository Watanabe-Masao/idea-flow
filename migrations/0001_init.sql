-- 事実（Linear・GitHub から写したもの）と、人の判断の記録だけを保存する。
-- 「進行中」「止まっている」などの状態は保存せず、表示のたびに計算する。

-- テーマ（Linear のラベル「C01 データの土台」など）
CREATE TABLE themes (
  key        TEXT PRIMARY KEY,          -- 'C11'
  name       TEXT NOT NULL,             -- '満月の物語'
  label_id   TEXT,                      -- Linear のラベル ID
  synced_at  TEXT NOT NULL
);

-- 課題（Linear の写し）
CREATE TABLE issues (
  id           TEXT PRIMARY KEY,        -- 'WAT-58'
  uuid         TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  state        TEXT NOT NULL,           -- 'In Progress' など
  state_type   TEXT NOT NULL,           -- started / unstarted / backlog / completed / canceled / duplicate
  theme_key    TEXT,                    -- 'C11'（テーマのラベルが無ければ NULL）
  parent_id    TEXT,                    -- 親の課題 'WAT-58'
  labels       TEXT NOT NULL DEFAULT '[]', -- JSON 配列
  gh_number    INTEGER,                 -- 題名の先頭の '#369' などから取り出した GitHub の番号
  url          TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  completed_at TEXT,
  synced_at    TEXT NOT NULL
);
CREATE INDEX issues_theme ON issues(theme_key);
CREATE INDEX issues_gh ON issues(gh_number);

-- 課題どうしの関係（Linear の写し）。type: related / duplicate / blocks
CREATE TABLE relations (
  a     TEXT NOT NULL,
  b     TEXT NOT NULL,
  type  TEXT NOT NULL,
  PRIMARY KEY (a, b, type)
);

-- コミット（GitHub の写し）
CREATE TABLE commits (
  sha         TEXT PRIMARY KEY,
  committed_at TEXT NOT NULL,           -- ISO 8601（UTC）
  message     TEXT NOT NULL,            -- 1行目
  body        TEXT NOT NULL DEFAULT '', -- 2行目以降
  pr_number   INTEGER,                  -- '(#518)' や 'Merge pull request #283' から
  refs        TEXT NOT NULL DEFAULT '[]', -- 本文中の '#数字'（JSON 配列）
  is_merge    INTEGER NOT NULL DEFAULT 0,
  url         TEXT NOT NULL,
  synced_at   TEXT NOT NULL
);
CREATE INDEX commits_time ON commits(committed_at);

-- 埋め込み（bge-m3）。kind: issue / commit。text_hash が変わったときだけ計算し直す
CREATE TABLE embeddings (
  kind       TEXT NOT NULL,
  ref        TEXT NOT NULL,
  model      TEXT NOT NULL,
  dim        INTEGER NOT NULL,
  vec        BLOB NOT NULL,             -- Float32Array のバイト列
  text_hash  TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, ref)
);

-- 機械の提案。kind:
--   commit_issue  … コミット → 課題
--   commit_theme  … コミット → テーマ
--   new_cluster   … どこにも近くない作業の塊 → 新しいテーマの候補
--   theme_premise … テーマ → 前提のテーマ
-- status: auto（しきい値以上で自動） / pending（確認待ち） / accepted / rejected
CREATE TABLE suggestions (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  subject     TEXT NOT NULL,            -- コミットの sha やテーマの key
  target      TEXT,                     -- 課題 ID やテーマの key
  score       REAL NOT NULL,
  detail      TEXT NOT NULL DEFAULT '{}', -- JSON（候補の2位・3位や、塊の中身）
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  decided_at  TEXT,
  UNIQUE (kind, subject)
);
CREATE INDEX suggestions_status ON suggestions(status, kind);

-- 人の判断の記録（追記だけ。上書きしない）
-- kind: accept / reject / assign（手で振り分け）/ theme_premise / threshold
CREATE TABLE events (
  id      TEXT PRIMARY KEY,
  at      TEXT NOT NULL,
  kind    TEXT NOT NULL,
  subject TEXT NOT NULL,
  value   TEXT,
  by      TEXT NOT NULL,                -- human / machine
  reason  TEXT
);
CREATE INDEX events_subject ON events(subject, at);

-- しきい値などの設定（答え合わせの結果を見て人が決める）
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('issue_auto', '0.80'),     -- コミット→課題：これ以上なら自動
  ('issue_ask', '0.66'),      -- これ以上なら確認待ち
  ('theme_auto', '0.72'),     -- コミット→テーマ：これ以上なら自動
  ('theme_ask', '0.60'),
  ('cluster_link', '0.70'),   -- 新しい塊：この近さ以上をつなぐ
  ('cluster_min', '3'),       -- 塊と認める最小の件数
  ('premise_min', '0.70'),    -- テーマの前提の候補にする近さ
  ('sync_cursor_github', ''); -- 取り込み済みの最新コミットの時刻
