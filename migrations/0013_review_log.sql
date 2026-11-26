-- 毎日の見直し：最後に見直した時刻（実装担当者がコネクタの review を読んだとき）
ALTER TABLE map_sync ADD COLUMN reviewed_at TEXT;
