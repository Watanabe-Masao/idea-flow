export interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  LINEAR_TEAM_KEY: string;
  GITHUB_REPO: string;
  WRITE_BACK: string;
  LINEAR_API_KEY: string;
  GITHUB_TOKEN?: string;
  ADMIN_TOKEN: string;
  /** Claude のコネクタ（MCP）用の合言葉。URL の /mcp/<MCP_TOKEN> に入れる */
  MCP_TOKEN?: string;
}

export type IssueRow = {
  id: string; uuid: string; title: string; description: string | null;
  state: string; state_type: string; theme_key: string | null; parent_id: string | null;
  labels: string; gh_number: number | null; url: string;
  created_at: string; updated_at: string; completed_at: string | null;
};

export type CommitRow = {
  sha: string; committed_at: string; message: string; body: string;
  pr_number: number | null; refs: string; is_merge: number; url: string;
};

export type SuggestionKind = 'commit_issue' | 'commit_theme' | 'new_cluster' | 'theme_premise';
export type SuggestionStatus = 'auto' | 'pending' | 'accepted' | 'rejected';

export type Settings = {
  issue_auto: number; issue_ask: number;
  theme_auto: number; theme_ask: number;
  cluster_link: number; cluster_min: number;
  premise_min: number;
  min_sim: number;
  memo_auto: number; memo_ask: number;
};
