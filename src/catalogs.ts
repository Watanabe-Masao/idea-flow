// 機能の一覧（カタログ）。地図はこれと、マージした PR・Issue から自動で作る。
// files は、その機能のファイルに当たる正規表現。aliases は PR・Issue の題の頭の言葉（「満月の物語：…」）。
// issues は、本文に「機能：」が無い Issue を人が結び付けたもの（2026-11-27 時点で開いていたもの）。words は題の言葉からの割り振り。
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
 ]
},
};
