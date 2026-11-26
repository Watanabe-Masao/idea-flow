-- 範囲のボード：見出しごとの原文、要約、変更リクエストへの返事

-- 見出しごとの原文（markdown のまま）。heading は rule_items.heading と同じ書き方（見出しの道筋を ' › ' でつなぐ）
CREATE TABLE IF NOT EXISTS rule_sections (
  doc     TEXT NOT NULL,
  heading TEXT NOT NULL,
  line    INTEGER NOT NULL,   -- 見出しの行（見出しの前の部分は 0）
  md      TEXT NOT NULL,      -- 見出しの下の本文（次の見出しまで）
  PRIMARY KEY (doc, heading, line)
);

-- 要約（文書・見出し・範囲）。hash は要約した中身のハッシュ。変わったときだけ作り直す
CREATE TABLE IF NOT EXISTS rule_summaries (
  key  TEXT PRIMARY KEY,      -- doc|<doc id> / head|<doc id>|<heading> / scope|<scope id>
  hash TEXT NOT NULL,
  text TEXT NOT NULL,
  by   TEXT NOT NULL,         -- ai（Workers AI）/ lead（先頭の文で代用）/ claude（コネクタから）
  at   TEXT NOT NULL
);

-- 変更リクエストへの返事（人・Claude）。Claude は差分を読んで、影響と副作用をここに書く
CREATE TABLE IF NOT EXISTS request_comments (
  id         TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  by         TEXT NOT NULL,   -- human / ai
  text       TEXT NOT NULL,
  at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS request_comments_req ON request_comments(request_id);
