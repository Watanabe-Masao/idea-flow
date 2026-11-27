-- PR の説明の要る行（digest）を作り直す（#77）：前の作り方は、別のリポジトリへの参照（Refs owner/name#n・URL）の行を落としていた。
-- 説明の全文（body）は残っているので、地図を開いたときに全文から作り直して書き戻す（消えるのは作り直せる写しだけ）
UPDATE pr_activity SET digest = NULL;
