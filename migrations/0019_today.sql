-- 「今日」の画面（#69）：人が片づけたもの（それでいい・決まりにする・違う・まだ）と、前に開いた時刻
CREATE TABLE IF NOT EXISTS today_marks (
  repo TEXT NOT NULL,
  key TEXT NOT NULL,
  decision TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (repo, key)
);
CREATE TABLE IF NOT EXISTS today_seen (
  repo TEXT PRIMARY KEY,
  prev TEXT,
  last TEXT
);
