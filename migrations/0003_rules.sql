-- 決まりの見える化（#8）：リポジトリの CLAUDE.md・ROLE.md・SKILL.md・決まりの文書を読み、どこに効いているかと問題を表示する。
-- GitHub には書き込まない（読むだけ）。

-- 取り込む元。files は人が選んだファイルの一覧（JSON 配列）
CREATE TABLE rule_sources (
  repo      TEXT PRIMARY KEY,           -- 'owner/name'
  branch    TEXT NOT NULL DEFAULT 'main',
  files     TEXT NOT NULL DEFAULT '[]',
  synced_at TEXT
);

-- 文書。applies は Claude にどう読まれるか（always：自動で読まれる / role / skill：説明文で読まれる / referenced：参照されたときだけ）
CREATE TABLE rule_docs (
  id          TEXT PRIMARY KEY,         -- repo|path
  repo        TEXT NOT NULL,
  path        TEXT NOT NULL,
  sha         TEXT,
  kind        TEXT NOT NULL,            -- claude / agents / role / skill / doc
  applies     TEXT NOT NULL,
  scope       TEXT NOT NULL,            -- 効く範囲のフォルダ（'' はリポジトリ全体）
  title       TEXT,
  description TEXT,                     -- スキルの説明文
  refs        TEXT NOT NULL DEFAULT '[]', -- 本文が参照している別の文書のパス
  synced_at   TEXT NOT NULL
);
CREATE INDEX rule_docs_repo ON rule_docs(repo);

-- 決まりの単位（見出しの下の箇条書き・段落・表の行・スキルの説明文）
CREATE TABLE rule_items (
  id      TEXT PRIMARY KEY,
  doc     TEXT NOT NULL,
  n       INTEGER NOT NULL,             -- 文書の中の順番
  heading TEXT NOT NULL DEFAULT '',     -- 見出しの道筋（「4. 部品 › 4.0 新しい画面を作るときの決まり」）
  text    TEXT NOT NULL,
  line    INTEGER NOT NULL,
  kind    TEXT NOT NULL                 -- item / para / row / desc
);
CREATE INDEX rule_items_doc ON rule_items(doc, n);

-- 見つかった問題（取り込みのたびに作り直す）
CREATE TABLE rule_findings (
  key    TEXT PRIMARY KEY,              -- 種類|項目A|項目B
  kind   TEXT NOT NULL,                 -- duplicate / conflict / temporary / skill_overlap / unreferenced
  a      TEXT NOT NULL,                 -- 項目または文書の id
  b      TEXT,
  score  REAL,
  detail TEXT NOT NULL DEFAULT '{}'
);

-- 人が「問題ではない」と決めたもの（作り直しても消えない）
CREATE TABLE rule_dismissed (
  key TEXT PRIMARY KEY,
  at  TEXT NOT NULL,
  why TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('rule_dup', '0.88'), ('rule_conflict', '0.78'), ('rule_skill', '0.75');
INSERT OR IGNORE INTO rule_sources (repo, branch) VALUES ('Watanabe-Masao/weather-note-cf', 'main'), ('Watanabe-Masao/idea-flow', 'main');
