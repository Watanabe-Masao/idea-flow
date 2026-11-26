-- 作業の記録：マージした PR（頼んだこと・変えたファイル・Claude が書いた申告）
CREATE TABLE IF NOT EXISTS pr_activity (
  repo       TEXT NOT NULL,
  number     INTEGER NOT NULL,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,
  merged_at  TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  files      TEXT NOT NULL DEFAULT '[]',   -- 変えたファイルのパス（JSON 配列）
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (repo, number)
);
CREATE INDEX IF NOT EXISTS pr_activity_merged ON pr_activity(repo, merged_at);
