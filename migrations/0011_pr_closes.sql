-- PR が閉じると書いた Issue（GitHub の closingIssuesReferences）。Issue の経過で使う
ALTER TABLE pr_activity ADD COLUMN closes TEXT NOT NULL DEFAULT '[]';
