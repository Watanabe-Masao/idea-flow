-- 文書の中身の写し。GitHub の blob の SHA が変わっていなければ、取り込みで読み直さない（#45）
CREATE TABLE IF NOT EXISTS rule_texts (
  repo TEXT NOT NULL,
  path TEXT NOT NULL,
  sha TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (repo, path)
);
