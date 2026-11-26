-- GitHub の親子（サブ Issue）の親の番号と、Issue を最後まで読めたか（上限で止まったら 1）
ALTER TABLE map_issues ADD COLUMN parent INTEGER;
ALTER TABLE map_sync ADD COLUMN issues_more INTEGER NOT NULL DEFAULT 0;
