-- 書き出し：承認した書き換えを、どの PR で出したか（まだなら NULL）
ALTER TABLE change_requests ADD COLUMN exported TEXT;
