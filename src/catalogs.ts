// 機能の一覧（カタログ）。地図はこれと、マージした PR・Issue から自動で作る。
// files は、その機能のファイルに当たる正規表現。aliases は PR・Issue の題の頭の言葉（「満月の物語：…」）。
// issues は、本文に「機能：」が無い Issue を人が結び付けたもの（2026-11-27 時点で開いていたもの）。words は題の言葉からの割り振り。
// 新しい機能を作ったら、ここに足す PR を出す（マージは人）。
import type { Catalog } from './workmap.ts';

export const CATALOGS: Record<string, Catalog> = {
  'Watanabe-Masao/weather-note-cf': {
 "features": [
  {
   "id": "story",
   "group": "ロゴ",
   "name": "満月の物語（絵本）",
   "desc": "満月の夜の絵本",
   "files": [
    "(MoonStory|design/story|design-src/story|moon-story|storyPager|story-)"
   ],
   "data": [
    "calc"
   ],
   "aliases": [
    "満月の物語",
    "ビーバームーン",
    "コールドムーン",
    "絵本"
   ]
  },
  {
   "id": "event",
   "group": "ロゴ",
   "name": "空のイベント",
   "desc": "二十四節気・満月などの日にロゴを絵と見出しに",
   "files": [
    "(EventSheet|EventInfo|EventPath|eventBits|eventPreview|skyEvents|event-banner|Brand\\.tsx|eventAssets|eventLogo)"
   ],
   "data": [
    "calc"
   ],
   "aliases": [
    "空のイベント",
    "イベントの見出し"
   ]
  },
  {
   "id": "moon",
   "group": "ロゴ",
   "name": "月のこよみ",
   "desc": "月の出入り・満ち欠け・雲で見えにくい時間",
   "files": [
    "(MoonSheet|FullMoonSheet|moonParts|windowMoon|moonLook|shared/moon\\.ts|fullMoonNames)"
   ],
   "data": [
    "calc",
    "jma",
    "om"
   ],
   "aliases": [
    "月のこよみ"
   ]
  },
  {
   "id": "typhoon",
   "group": "いつも",
   "name": "台風のカード",
   "desc": "近づく台風と、似た条件の日を選ぶ入口",
   "files": [
    "(TyphoonCard|TyphoonSheet|TyphoonTag|typhoonNow|typhoonDays|ConditionSheet|shared/conditions)"
   ],
   "data": [
    "jmaty",
    "sTy"
   ],
   "aliases": [
    "台風",
    "条件から選ぶ"
   ]
  },
  {
   "id": "table",
   "group": "いつも",
   "name": "比較の表",
   "desc": "対象日と比較日の表",
   "files": [
    "(CompareBoard|NoValue|Strip\\.tsx|DateNav|src/compare\\.ts)"
   ],
   "data": [
    "jma",
    "om"
   ],
   "aliases": [
    "比較の表"
   ]
  },
  {
   "id": "line",
   "group": "いつも",
   "name": "比較の1行",
   "desc": "2日の違いを1行で",
   "files": [
    "(CompareSummary|ItemBar)"
   ],
   "data": [
    "jma",
    "om"
   ],
   "aliases": [
    "比較の1行"
   ]
  },
  {
   "id": "chart",
   "group": "比較",
   "name": "日別のグラフ",
   "desc": "前後の日の並び",
   "files": [
    "(ui/Chart\\.tsx|chartMetrics|GraphSheet|PartsWeather)"
   ],
   "data": [
    "jma",
    "om"
   ],
   "aliases": [
    "日別のグラフ"
   ]
  },
  {
   "id": "hour",
   "group": "比較",
   "name": "時間帯",
   "desc": "時間ごとの比較・風配図・視程",
   "files": [
    "(HourFace|HourCompare|WindRose|VisibilityBars|hourAverage)"
   ],
   "data": [
    "jma",
    "om"
   ],
   "aliases": [
    "時間帯",
    "比較の時間帯シート"
   ]
  },
  {
   "id": "light",
   "group": "比較",
   "name": "移り変わり（日の長さ・光）",
   "desc": "日の長さと光の移り変わり",
   "files": [
    "(LightTrend|src/light\\.ts|lightShift)"
   ],
   "data": [
    "calc"
   ],
   "aliases": [
    "移り変わり",
    "明るさ"
   ]
  },
  {
   "id": "sky",
   "group": "比較",
   "name": "太陽と月のシート・空を見上げる",
   "desc": "カメラに太陽と月の位置を重ねる",
   "files": [
    "(SunSheet|CompassTrim|useCamera|useSkyLook|skyLook|sunTimes)"
   ],
   "data": [
    "calc"
   ],
   "aliases": [
    "空を見上げる",
    "太陽と月のシート",
    "太陽と月"
   ]
  },
  {
   "id": "day",
   "group": "1日",
   "name": "1日の画面",
   "desc": "その日の時間帯・今日の分け方・まとめ",
   "files": [
    "(DayDetail|TodaySplit|dayDetail|daySummaryLines|todaySplit)"
   ],
   "data": [
    "jma",
    "om"
   ],
   "aliases": [
    "1日モード",
    "1日の画面",
    "1日"
   ]
  },
  {
   "id": "air",
   "group": "1日",
   "name": "空気の質",
   "desc": "PM2.5・黄砂・視程と、ふだんとの比べ",
   "files": [
    "(AirQualityCard|AirBreakdown|AirCompare|airSummary|airVerdict|airBreakdown|shared/air)"
   ],
   "data": [
    "sAir",
    "sSora"
   ],
   "aliases": [
    "空気",
    "空気質",
    "そらまめくん"
   ]
  },
  {
   "id": "fhist",
   "group": "1日",
   "name": "予報の移り変わり",
   "desc": "その日の予報が発表ごとにどう変わったか",
   "files": [
    "(ui/forecastHistory/|forecastChanges|forecastHistory)"
   ],
   "data": [
    "sFc"
   ],
   "aliases": [
    "予報の履歴",
    "予報の移り変わり"
   ]
  },
  {
   "id": "wx",
   "group": "1日",
   "name": "天気図",
   "desc": "その日の天気図",
   "files": [
    "(WxChart|wxchart)"
   ],
   "data": [
    "sWx"
   ],
   "aliases": [
    "天気図"
   ]
  },
  {
   "id": "rain",
   "group": "1日",
   "name": "今の雨",
   "desc": "雨雲の動きの地図とグラフ",
   "files": [
    "(ui/rainNow/|rainNow|shared/radar)"
   ],
   "data": [
    "jmaRad"
   ],
   "aliases": [
    "今の雨",
    "雨雲"
   ]
  },
  {
   "id": "cal",
   "group": "カレンダー",
   "name": "カレンダー・月と年の概要",
   "desc": "日を選ぶ。月と年のまとめ",
   "files": [
    "(CalendarModal|MonthReview|YearReview)"
   ],
   "data": [
    "jma",
    "om"
   ],
   "aliases": [
    "カレンダー",
    "月の概要",
    "年の概要",
    "月の振り返り"
   ]
  },
  {
   "id": "report",
   "group": "肌感",
   "name": "感じ方の記録",
   "desc": "今の感じ方を記録する",
   "files": [
    "(ReportSheet|AfterAnswer|beta/reports|useReports|beta/sync|useSync)"
   ],
   "data": [
    "me"
   ],
   "aliases": [
    "感じ方の記録"
   ]
  },
  {
   "id": "feel",
   "group": "肌感",
   "name": "肌感の帯の地図",
   "desc": "日なた・日かげの体感の帯",
   "files": [
    "(FeelSheet|BandMap|BandTrend|FeelBar|shared/feel|feelSeason|feelSettings|src/core/)"
   ],
   "data": [
    "jma",
    "om",
    "calc"
   ],
   "aliases": [
    "肌感"
   ]
  },
  {
   "id": "basis",
   "group": "肌感",
   "name": "根拠のシート",
   "desc": "肌感の予測の根拠と、自分の傾き",
   "files": [
    "(BasisSheet|PreferenceDay|preference|beta/engine|beta/comfort)"
   ],
   "data": [
    "me",
    "calc"
   ],
   "aliases": [
    "β",
    "βモデル",
    "選好モデル"
   ]
  },
  {
   "id": "account",
   "group": "設定",
   "name": "アカウント・通知",
   "desc": "ログイン・同期・通知",
   "files": [
    "(AccountSection|NotifySection|ReauthForm|account/account|account/push)"
   ],
   "data": [
    "me"
   ],
   "aliases": [
    "アカウント",
    "通知"
   ]
  },
  {
   "id": "admin",
   "group": "設定",
   "name": "管理者ページ（運用・保守）",
   "desc": "取得の様子・欠けの取り直し・障害の手順",
   "files": [
    "(AdminPage|AdminSheet|MaintenanceSheet|healthJudge|runbook)"
   ],
   "data": [
    "log"
   ],
   "aliases": [
    "監視と管理",
    "管理者",
    "監視"
   ]
  },
  {
   "id": "checks",
   "group": "設定",
   "name": "確認用の板（4つ）",
   "desc": "開発で確かめるための画面",
   "files": [
    "(SunTestBoard|HistoryCompareBoard|ShortHistoryBoard|LearnedCompareBoard|EventPreviewSheet)"
   ],
   "data": [],
   "aliases": [
    "確認用"
   ]
  },
{
 "id": "store",
 "group": "裏方",
 "name": "データの取得と保存",
 "desc": "Worker の定時処理と API、端末のデータの取り込み・保存",
 "files": [
  "(^worker/|^src/data/|^shared/(dates|fixed|availability|corrections|types|amedasWeather|jmaOfficial|versions|stationPlaces)|wrangler\\.jsonc)"
 ],
 "data": [
  "jma",
  "om",
  "log"
 ],
 "aliases": [
  "データの形",
  "データ",
  "取り込み",
  "予報の取り込み",
  "予報の電文",
  "原本の控え"
 ]
},
{
 "id": "research",
 "group": "裏方",
 "name": "研究",
 "desc": "research/ の下調べと検証（アプリの動きには影響しない）",
 "files": [
  "^research/"
 ],
 "data": [],
 "aliases": [
  "研究"
 ]
},
{
 "id": "look",
 "group": "裏方",
 "name": "見た目の決まり",
 "desc": "色・文字・部品・テーマ（ほかの機能に当たらない作業だけを数える）",
 "files": [
  "(src/styles\\.css|^src/design/|docs/design-system\\.md|src/ui/kit\\.tsx|src/ui/icons\\.tsx)"
 ],
 "data": [],
 "aliases": [
  "配色",
  "テーマ",
  "デザイン"
 ],
 "fallback": true
},
{
 "id": "rules",
 "group": "裏方",
 "name": "決まりと文書",
 "desc": "README・docs の決まり（ほかの機能に当たらない作業だけを数える）",
 "files": [
  "(^README\\.md|^docs/|^CLAUDE\\.md|^AGENTS\\.md|^\\.claude/)"
 ],
 "data": [],
 "aliases": [
  "決まり",
  "docs"
 ],
 "fallback": true
},
{
 "id": "ci",
 "group": "裏方",
 "name": "テスト・CI",
 "desc": "テスト・e2e・GitHub Actions・脚本（ほかの機能に当たらない作業だけを数える）",
 "files": [
  "(^\\.github/|^e2e/|^test/|^scripts/|package(-lock)?\\.json)"
 ],
 "data": [],
 "aliases": [
  "e2e",
  "CI",
  "テスト"
 ],
 "fallback": true
}
],
 "nodes": {
  "jma": {
   "col": 0,
   "name": "気象庁の実績・アメダス",
   "note": "開いたとき取る"
  },
  "om": {
   "col": 0,
   "name": "Open-Meteo の予報",
   "note": "開いたとき取る"
  },
  "jmaty": {
   "col": 0,
   "name": "気象庁の台風 JSON",
   "note": "今の分だけ"
  },
  "jmaRad": {
   "col": 0,
   "name": "気象庁の雨雲タイル",
   "note": "見るだけ"
  },
  "calc": {
   "col": 0,
   "name": "アプリの計算（太陽・月・暦）",
   "note": "取らない"
  },
  "me": {
   "col": 0,
   "name": "自分の記録（ログイン）",
   "note": "サーバーの D1"
  },
  "sFc": {
   "col": 1,
   "name": "予報の電文・予報の記録",
   "note": "画面で使う"
  },
  "sTy": {
   "col": 1,
   "name": "台風の電文",
   "note": "当時の発表で使う"
  },
  "sWx": {
   "col": 1,
   "name": "天気図",
   "note": "画面で使う"
  },
  "sAir": {
   "col": 1,
   "name": "空気（CAMS モデル・予測）",
   "note": "画面で使う"
  },
  "sSora": {
   "col": 1,
   "name": "そらまめくん（実測）",
   "note": "画面で使う"
  },
  "sWarn": {
   "col": 1,
   "name": "警報・注意報・防災速報",
   "note": "画面なし"
  },
  "sRad": {
   "col": 1,
   "name": "雨雲レーダー・解析雨量",
   "note": "画面なし"
  },
  "sAmd": {
   "col": 1,
   "name": "アメダス10分ごと",
   "note": "画面なし"
  },
  "sLong": {
   "col": 1,
   "name": "長い先の予報",
   "note": "画面なし"
  },
  "log": {
   "col": 1,
   "name": "処理の記録",
   "note": "管理で使う"
  }
 },
 "issues": {
  "495": {
   "features": [
    "day",
    "table"
   ],
   "nodes": []
  },
  "494": {
   "features": [
    "fhist"
   ],
   "nodes": []
  },
  "412": {
   "features": [],
   "nodes": [
    "sLong",
    "sWarn",
    "sFc"
   ]
  },
  "411": {
   "features": [
    "story",
    "event"
   ],
   "nodes": []
  },
  "369": {
   "features": [
    "sky",
    "moon"
   ],
   "nodes": []
  },
  "266": {
   "features": [],
   "nodes": []
  },
  "250": {
   "features": [
    "fhist"
   ],
   "nodes": [
    "sFc"
   ]
  },
  "208": {
   "features": [
    "basis",
    "feel"
   ],
   "nodes": []
  },
  "207": {
   "features": [
    "basis",
    "feel"
   ],
   "nodes": []
  },
  "189": {
   "features": [
    "basis",
    "feel"
   ],
   "nodes": []
  },
  "117": {
   "features": [
    "basis"
   ],
   "nodes": []
  },
  "114": {
   "features": [
    "basis",
    "report"
   ],
   "nodes": []
  },
  "68": {
   "features": [
    "basis"
   ],
   "nodes": []
  },
  "54": {
   "features": [
    "basis",
    "feel"
   ],
   "nodes": []
  },
  "37": {
   "features": [
    "basis"
   ],
   "nodes": []
  }
 },
 "words": [
  [
   "天気図",
   [
    "wx"
   ]
  ],
  [
   "台風|強風|条件から選ぶ",
   [
    "typhoon"
   ]
  ],
  [
   "1日モード",
   [
    "day"
   ]
  ],
  [
   "予報の履歴|予報の当たり",
   [
    "fhist"
   ]
  ],
  [
   "明るさ|空の色|薄明|時間区分",
   [
    "light",
    "sky"
   ]
  ],
  [
   "CI|e2e|監視|欠損|整合性|管理者",
   [
    "admin"
   ]
  ],
  [
   "要約カード|晴れ間|天気の絵",
   [
    "table"
   ]
  ],
  [
   "月の振り返り|天気の型",
   [
    "cal"
   ]
  ],
  [
   "日なた|肌感|段の境目|慣れ",
   [
    "feel"
   ]
  ],
  [
   "β|モデル|選好|P\\d|研究|評価|判断待ち|データの偏り",
   [
    "basis"
   ]
  ]
 ],
 "topics": [
  { "name": "コールドムーン", "feature": "story", "words": ["コールドムーン", "Cold Moon"] },
  { "name": "ビーバームーン", "feature": "story", "words": ["ビーバームーン", "Beaver Moon"] }
 ]
},
  'Watanabe-Masao/idea-flow': {
 "features": [
  {
   "id": "map-ui",
   "group": "画面",
   "name": "地図の画面",
   "desc": "機能ごとの稼働・Issue の経過・つながり・データの流れ（public/map.js）",
   "files": [
    "^public/map\\.js",
    "^public/lineage\\.js"
   ],
   "data": [
    "d1"
   ],
   "aliases": [
    "地図の画面",
    "地図"
   ]
  },
  {
   "id": "today-ui",
   "group": "画面",
   "name": "今日の画面",
   "desc": "開いたら最初に出る、人が決めること（判断の受信箱・閉じてよさそうな Issue・気になる所・前回から変わったこと）（public/today.js・src/today.ts）",
   "files": [
    "^public/today\\.js$",
    "^src/today\\.ts$"
   ],
   "data": [
    "d1"
   ],
   "aliases": [
    "今日の画面",
    "今日"
   ]
  },
  {
   "id": "docs-ui",
   "group": "画面",
   "name": "文書の画面",
   "desc": "決まりの文書の一覧と気になる所・画面の土台（public/index.html）",
   "files": [
    "^public/index\\.html"
   ],
   "data": [
    "d1"
   ],
   "aliases": [
    "文書の画面",
    "文書",
    "画面"
   ]
  },
  {
   "id": "map-core",
   "group": "しくみ",
   "name": "地図の計算と取り込み",
   "desc": "PR・Issue の取り込み、機能への割り振り、状態、つながりと根拠、機能の一覧（カタログ）",
   "files": [
    "(^src/workmap\\.ts|^src/catalogs\\.ts)"
   ],
   "data": [
    "gh",
    "d1"
   ],
   "aliases": [
    "地図の計算",
    "カタログ",
    "取り込み"
   ]
  },
  {
   "id": "rules",
   "group": "しくみ",
   "name": "文書の取り込みと診断",
   "desc": "決まりの文書を条項に分け、重複・食い違い・古い決まり・読まれない文書を見つける",
   "files": [
    "(^src/rules|^src/audit\\.ts|^src/diagnosis\\.ts|^src/embed\\.ts|^src/vec\\.ts)"
   ],
   "data": [
    "gh",
    "ai",
    "d1"
   ],
   "aliases": [
    "診断",
    "決まりの見える化"
   ]
  },
  {
   "id": "mcp",
   "group": "しくみ",
   "name": "コネクタ（MCP）",
   "desc": "Claude が地図と文書を読む入口（idea_flow の action）",
   "files": [
    "^src/mcp",
    "^src/selfcheck\\.ts$"
   ],
   "data": [
    "d1"
   ],
   "aliases": [
    "コネクタ",
    "MCP"
   ]
  },
  {
   "id": "base",
   "group": "裏方",
   "name": "土台（API・GitHub・設定）",
   "desc": "API の入口・GitHub とのやり取り・Worker の設定（画面のファイルの配り方を含む）・表（マイグレーション）",
   "files": [
    "(^src/api\\.ts|^src/gh\\.ts|^src/index\\.ts|^src/util\\.ts|^src/types\\.ts|^wrangler\\.jsonc|^migrations/|^public/_headers$)"
   ],
   "data": [
    "gh",
    "d1"
   ],
   "aliases": [
    "土台",
    "削ぎ落とし"
   ]
  },
  {
   "id": "rules-doc",
   "group": "裏方",
   "name": "決まりと文書",
   "desc": "README・CLAUDE.md・Issue のひな形（ほかの機能に当たらない作業だけを数える）",
   "files": [
    "(^README\\.md|^CLAUDE\\.md|^\\.github/|^docs/)"
   ],
   "data": [],
   "aliases": [
    "決まり",
    "書き方"
   ],
   "fallback": true
  },
  {
   "id": "ci",
   "group": "裏方",
   "name": "テスト",
   "desc": "テストと package.json（ほかの機能に当たらない作業だけを数える）",
   "files": [
    "(^test/|package(-lock)?\\.json|tsconfig\\.json)"
   ],
   "data": [],
   "aliases": [
    "テスト"
   ],
   "fallback": true
  }
 ],
 "nodes": {
  "gh": {
   "col": 0,
   "name": "GitHub の PR・Issue・ファイル",
   "note": "開いたときに取る"
  },
  "ai": {
   "col": 0,
   "name": "Workers AI（埋め込み）",
   "note": "取り込みのとき"
  },
  "d1": {
   "col": 1,
   "name": "D1（写し・診断・取り込みの位置）",
   "note": "画面で使う"
  }
 },
 "issues": {},
 "words": []
},
  // 統計検定アプリ（#77 のプロジェクト）：講座の中身（stats2-course）とサイト・実験（knowledge-net）を1つの地図に。files の「名前:」はそのリポジトリだけ
  'Watanabe-Masao/stats2-course': {
 "repos": [
  "Watanabe-Masao/stats2-course",
  "Watanabe-Masao/knowledge-net"
 ],
 "features": [
  {
   "id": "unit",
   "group": "講座",
   "name": "単元の本文",
   "desc": "単元ごとの本文（content/units/U01〜）",
   "files": [
    "stats2-course:^content/units/U\\d"
   ],
   "data": [],
   "aliases": [
    "単元の本文",
    "単元",
    "本文"
   ]
  },
  {
   "id": "labtext",
   "group": "講座",
   "name": "実験の解説",
   "desc": "実験（ラボ）の解説の文（content/units/*_lab・tools/*_lab）",
   "files": [
    "stats2-course:^content/units/[a-z]+_lab",
    "stats2-course:^tools/[a-z_]+_lab"
   ],
   "data": [],
   "aliases": [
    "実験の解説",
    "ラボの解説"
   ]
  },
  {
   "id": "problem",
   "group": "講座",
   "name": "問題",
   "desc": "練習問題（content/problems）",
   "files": [
    "stats2-course:^content/problems"
   ],
   "data": [],
   "aliases": [
    "問題"
   ]
  },
  {
   "id": "skeleton",
   "group": "講座",
   "name": "知識の骨格",
   "desc": "用語・関係・主張・導出・段階（content/*.yaml）",
   "files": [
    "stats2-course:^content/(terms|relations|claims|derivations|powers|stages|learning|shared|apply-texts|walk-texts|experiments)\\.yaml"
   ],
   "data": [],
   "aliases": [
    "知識の骨格",
    "用語",
    "関係",
    "概念のページの概要",
    "概念のページ"
   ]
  },
  {
   "id": "formula",
   "group": "講座",
   "name": "数式の正しさ",
   "desc": "数式の契約と見直し（content/formula-*・docs/formula-correctness）",
   "files": [
    "stats2-course:^content/formula-",
    "stats2-course:^docs/formula-correctness"
   ],
   "data": [],
   "aliases": [
    "数式の正しさ",
    "数式"
   ]
  },
  {
   "id": "figure",
   "group": "講座",
   "name": "図",
   "desc": "図と図の元（assets/figures・tools/figure-src）",
   "files": [
    "stats2-course:^assets/figures",
    "stats2-course:figure-src",
    "stats2-course:^content/assets\\.yaml"
   ],
   "data": [],
   "aliases": [
    "図"
   ]
  },
  {
   "id": "build",
   "group": "講座",
   "name": "作る仕組みと公開",
   "desc": "作る・確かめる・公開する（build/・publish/）",
   "files": [
    "stats2-course:^build/",
    "stats2-course:^publish/",
    "stats2-course:^(package(-lock)?\\.json|requirements\\.txt|templates/|tools/)"
   ],
   "data": [],
   "aliases": [
    "作る仕組み",
    "公開",
    "公開確認の記録",
    "公開確認"
   ]
  },
  {
   "id": "migration",
   "group": "講座",
   "name": "移行（旧 Notion）",
   "desc": "旧 Notion からの移行（migration/）",
   "files": [
    "stats2-course:^migration/"
   ],
   "data": [],
   "aliases": [
    "移行"
   ],
   "fallback": true
  },
  {
   "id": "engine",
   "group": "サイト",
   "name": "実験の仕組み",
   "desc": "実験の計算（math-lab/packages/engine）",
   "files": [
    "knowledge-net:^math-lab/packages/engine",
    "knowledge-net:^math-lab/(?!packages/ui)"
   ],
   "data": [],
   "aliases": [
    "実験の仕組み",
    "エンジン"
   ]
  },
  {
   "id": "labui",
   "group": "サイト",
   "name": "実験の部品",
   "desc": "実験の画面の部品（math-lab/packages/ui）",
   "files": [
    "knowledge-net:^math-lab/packages/ui"
   ],
   "data": [],
   "aliases": [
    "実験の部品",
    "作業台"
   ]
  },
  {
   "id": "relmap",
   "group": "サイト",
   "name": "関係図",
   "desc": "概念のつながりの図（src/RelationMap・Relation・relationMap）",
   "files": [
    "knowledge-net:^src/(RelationMap|RelMap|Relation|relationMap)",
    "knowledge-net:^scripts/measure-relmap"
   ],
   "data": [],
   "aliases": [
    "関係図",
    "関係の段",
    "路線図"
   ]
  },
  {
   "id": "glance",
   "group": "サイト",
   "name": "語のひと目と一覧",
   "desc": "語のひと目・一覧・分類・探す（src/Glance・Library・CategoryList・Search）",
   "files": [
    "knowledge-net:^src/(Glance|Library|CategoryList|Search|Claims|Conditions|Detail)"
   ],
   "data": [],
   "aliases": [
    "語のひと目",
    "一覧",
    "図書館"
   ]
  },
  {
   "id": "unitpage",
   "group": "サイト",
   "name": "単元のページ",
   "desc": "単元のページと道すじ（src/UnitPage・Route・PathList）",
   "files": [
    "knowledge-net:^src/(UnitPage|Route|PathList)"
   ],
   "data": [],
   "aliases": [
    "単元のページ",
    "道すじ"
   ]
  },
  {
   "id": "icons",
   "group": "サイト",
   "name": "概念のアイコン",
   "desc": "概念ごとのアイコン（src/conceptIcons・icons）",
   "files": [
    "knowledge-net:^src/(conceptIcons|icons)"
   ],
   "data": [],
   "aliases": [
    "概念のアイコン",
    "アイコン"
   ]
  },
  {
   "id": "schema",
   "group": "サイト",
   "name": "データの形",
   "desc": "スキーマと生成（schema/・scripts/gen.mjs・src/data.ts）",
   "files": [
    "knowledge-net:^schema/",
    "knowledge-net:^scripts/gen\\.mjs",
    "knowledge-net:^src/data\\.ts"
   ],
   "data": [],
   "aliases": [
    "データの形",
    "スキーマ"
   ]
  },
  {
   "id": "site",
   "group": "サイト",
   "name": "サイトの土台",
   "desc": "画面の枠・URL・見本（src/App・Shell・Panel・urlState・main）",
   "files": [
    "knowledge-net:^src/(App|Shell|Panel|urlState|main|kinds|screen-kinds|Redraw)",
    "knowledge-net:^public/",
    "knowledge-net:^(index\\.html|vite\\.config|package\\.json)",
    "knowledge-net:^(scripts/(check-design|sync-sample)|tsconfig|\\.prettier|sample\\.lock|package-lock|\\.git-blame)"
   ],
   "data": [],
   "aliases": [
    "サイトの土台",
    "見本",
    "決定"
   ]
  },
  {
   "id": "rules",
   "group": "裏方",
   "name": "決まりと文書",
   "desc": "決まり・計画・決定の記録（docs/・CLAUDE.md）",
   "files": [
    "^docs/",
    "(^|/)CLAUDE\\.md$",
    "^README",
    "stats2-course:^content/guide\\.md"
   ],
   "data": [],
   "aliases": [
    "決まりと文書",
    "決まり",
    "設計書",
    "計画書",
    "決定の記録",
    "準備の文書"
   ],
   "fallback": true
  },
  {
   "id": "ci",
   "group": "裏方",
   "name": "テスト・CI",
   "desc": "テストと CI（tests/・.github）",
   "files": [
    "^tests?/",
    "^\\.github/",
    "\\.test\\.",
    "^playwright"
   ],
   "data": [],
   "aliases": [
    "テスト・CI",
    "テスト",
    "画面のテスト",
    "CI",
    "test-plan"
   ],
   "fallback": true
  }
 ],
 "nodes": {},
 "issues": {},
 "words": []
},
};
