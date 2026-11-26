export interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  /** 読むだけのトークン（公開リポジトリなら無くてよい） */
  GITHUB_TOKEN?: string;
  /** 書き出し（ブランチを作って PR を出す）用のトークン */
  GITHUB_WRITE_TOKEN?: string;
  ADMIN_TOKEN: string;
  /** Claude のコネクタ（MCP）用の合言葉。URL の /mcp/<MCP_TOKEN> に入れる */
  MCP_TOKEN?: string;
}
