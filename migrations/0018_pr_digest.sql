-- PR の説明の要る所だけ（つながる番号・タグ・「関連：なし」・申告）。地図では説明の全文を読まない（#44）
ALTER TABLE pr_activity ADD COLUMN digest TEXT;
