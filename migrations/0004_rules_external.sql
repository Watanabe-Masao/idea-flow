-- 外から入れた決まり（ライセンスつきのスキルなど、書き換えないもの）を診断から外す（#7）
ALTER TABLE rule_docs ADD COLUMN external INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rule_docs ADD COLUMN external_by TEXT;   -- auto（ライセンスのファイルから判定）/ human

-- 人が決めた「外から入れたもの／このリポジトリの決まり」（取り込み直しても残る）
CREATE TABLE rule_external (
  repo     TEXT NOT NULL,
  path     TEXT NOT NULL,
  external INTEGER NOT NULL,
  at       TEXT NOT NULL,
  PRIMARY KEY (repo, path)
);
