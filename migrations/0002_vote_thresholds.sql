-- 判定を「課題の文との近さ」から「手本のコミットとの多数決（票の割合）」に変えたので、しきい値の意味が変わる。
-- 票の割合 0〜1 に合わせて初期値を入れ直し、手本との近さの下限 min_sim を足す。
UPDATE settings SET value = '0.75' WHERE key = 'issue_auto';
UPDATE settings SET value = '0.50' WHERE key = 'issue_ask';
UPDATE settings SET value = '0.80' WHERE key = 'theme_auto';
UPDATE settings SET value = '0.55' WHERE key = 'theme_ask';
INSERT OR IGNORE INTO settings (key, value) VALUES ('min_sim', '0.50');
