-- Issue の本文に出てくる「#番号」と、その行（本文は4,000字で切るので、切る前に取り出す）
ALTER TABLE map_issues ADD COLUMN refs TEXT NOT NULL DEFAULT '[]';
