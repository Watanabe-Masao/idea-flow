-- 同期のロック（画面とコネクタが重なっても、古いデータで上書きしない）と、
-- 新しく動いた PR の読み直しの続きの位置（前回の境界に届くまで保つ。届いたら最終成功の時刻を進める）
ALTER TABLE map_sync ADD COLUMN sync_id TEXT;
ALTER TABLE map_sync ADD COLUMN sync_until TEXT;
ALTER TABLE map_sync ADD COLUMN upd_cursor TEXT;
ALTER TABLE map_sync ADD COLUMN upd_boundary TEXT;
ALTER TABLE map_sync ADD COLUMN upd_started TEXT;
