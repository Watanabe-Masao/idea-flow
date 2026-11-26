-- アイデアや会話のメモ。企画（project）ごとにまとめ、時間の流れで見る。
-- GitHub・Linear（天気アプリ）とは別の取り込み口。

-- 企画。人が作ったもの、またはAIが「候補」として作ったもの
CREATE TABLE projects (
  key        TEXT PRIMARY KEY,           -- 'P01' など
  name       TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',   -- どんな企画か（意味の近さの手がかりにする）
  parent     TEXT,                       -- 前提になっている企画
  status     TEXT NOT NULL DEFAULT '進行中', -- 候補 / 進行中 / 判断待ち / 保留 / 完了 / 中止（決めるのは人）
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL               -- human / ai
);

-- メモ。AIが会話から書いたもの（source=ai）と、自分で書いたもの（source=human）
CREATE TABLE memos (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  source     TEXT NOT NULL,              -- ai / human
  kind       TEXT NOT NULL DEFAULT 'メモ', -- 決定 / 案 / 保留 / 疑問 / メモ
  heading    TEXT,
  body       TEXT NOT NULL,
  project    TEXT,                       -- 書き手が指定した企画（AIの指定は提案の扱い）
  ref        TEXT,                       -- 会話の URL など
  deleted_at TEXT
);
CREATE INDEX memos_at ON memos(at);
CREATE INDEX memos_project ON memos(project);

-- メモ → 企画の振り分けのしきい値（票の割合）。最初は自動なし
INSERT OR IGNORE INTO settings (key, value) VALUES ('memo_auto', '1.01'), ('memo_ask', '0.40');
