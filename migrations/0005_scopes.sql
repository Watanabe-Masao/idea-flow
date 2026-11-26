-- 範囲の木（#10）：決まりの文書を「中身で分けた範囲」に付け、下の範囲へ引き継ぐ。例外で一部を外す。
-- 変更は「変更リクエスト」として出し、人が承認すると反映する（Claude からの提案も同じ）。

CREATE TABLE scopes (
  id         TEXT PRIMARY KEY,           -- repo|key
  repo       TEXT NOT NULL,
  key        TEXT NOT NULL,              -- 英数字の短い名前（root は全体）
  name       TEXT NOT NULL,
  parent_id  TEXT,
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX scopes_repo ON scopes(repo);

-- 範囲に付けた文書（スキルは複数の範囲に付けられる）
CREATE TABLE scope_docs (
  scope_id TEXT NOT NULL,
  path     TEXT NOT NULL,
  PRIMARY KEY (scope_id, path)
);

-- 例外：この範囲（とその下）では、ある文書のある見出しの決まりを使わない
CREATE TABLE scope_exceptions (
  scope_id TEXT NOT NULL,
  path     TEXT NOT NULL,
  heading  TEXT NOT NULL,                -- 見出し（前方一致）。'*' は文書まるごと
  why      TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (scope_id, path, heading)
);

-- 変更リクエスト。by は human / ai。ops は変更の中身（JSON 配列）
CREATE TABLE change_requests (
  id           TEXT PRIMARY KEY,
  repo         TEXT NOT NULL,
  by           TEXT NOT NULL,
  title        TEXT NOT NULL,
  reason       TEXT NOT NULL DEFAULT '',
  ops          TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending / accepted / rejected
  created_at   TEXT NOT NULL,
  decided_at   TEXT,
  decided_note TEXT
);
CREATE INDEX change_requests_status ON change_requests(repo, status);
