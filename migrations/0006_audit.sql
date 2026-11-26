-- 機能していない・意味がなさそうな文書の候補（取り込みのときに GitHub から調べた結果。問題を探し直すときに使う）
CREATE TABLE IF NOT EXISTS rule_audit (
  key TEXT PRIMARY KEY,         -- kind|repo|path
  repo TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,           -- dead_ref | skill_unused | orphan
  detail TEXT NOT NULL,         -- JSON
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rule_audit_repo ON rule_audit (repo);
