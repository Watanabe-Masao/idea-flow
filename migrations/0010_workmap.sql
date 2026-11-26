-- 地図：Issue の写しと、PR を過去までさかのぼって取り込むときの続きの位置
CREATE TABLE IF NOT EXISTS map_issues (repo TEXT NOT NULL, number INTEGER NOT NULL, open INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL, closed TEXT, PRIMARY KEY (repo, number));
CREATE TABLE IF NOT EXISTS map_sync (repo TEXT PRIMARY KEY, pr_cursor TEXT, pr_done INTEGER NOT NULL DEFAULT 0, issues_at TEXT, prs_at TEXT);
