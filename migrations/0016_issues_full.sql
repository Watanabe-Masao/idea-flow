-- Issue を全部読み直した時刻（ふだんは前回から動いた Issue だけを読む。1日1回は全部読み直す）#44
ALTER TABLE map_sync ADD COLUMN issues_full_at TEXT;
