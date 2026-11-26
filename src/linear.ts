import type { Env } from './types.ts';
import { ghNumberOfTitle, nowIso } from './util.ts';

const ENDPOINT = 'https://api.linear.app/graphql';

async function gql<T>(env: Env, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: env.LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json() as { data?: T; errors?: { message: string }[] };
  if (!res.ok || body.errors?.length) throw new Error(`Linear: ${res.status} ${body.errors?.map(e => e.message).join('; ') ?? ''}`);
  return body.data as T;
}

type LinearIssue = {
  id: string; identifier: string; title: string; description: string | null; url: string;
  createdAt: string; updatedAt: string; completedAt: string | null;
  state: { name: string; type: string };
  parent: { identifier: string } | null;
  labels: { nodes: { id: string; name: string }[] };
  relations: { nodes: { type: string; relatedIssue: { identifier: string } }[] };
};

const ISSUES = `
query Issues($teamKey: String!, $after: String) {
  issues(first: 100, after: $after, filter: { team: { key: { eq: $teamKey } } }) {
    nodes {
      id identifier title description url createdAt updatedAt completedAt
      state { name type }
      parent { identifier }
      labels { nodes { id name } }
      relations { nodes { type relatedIssue { identifier } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

/** テーマのラベル：'C11 満月の物語' → { key: 'C11', name: '満月の物語' } */
export function parseThemeLabel(name: string): { key: string; name: string } | null {
  const m = name.match(/^(C\d{2})\s+(.+)$/);
  return m ? { key: m[1], name: m[2].trim() } : null;
}

/** Linear の課題・テーマ・関係を D1 に写す（写しは毎回まるごと入れ替える） */
export async function syncLinear(env: Env): Promise<{ issues: number; themes: number; relations: number }> {
  const all: LinearIssue[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const data: { issues: { nodes: LinearIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
      await gql(env, ISSUES, { teamKey: env.LINEAR_TEAM_KEY, after });
    all.push(...data.issues.nodes);
    if (!data.issues.pageInfo.hasNextPage) break;
    after = data.issues.pageInfo.endCursor;
  }
  const now = nowIso();
  const themes = new Map<string, { name: string; labelId: string }>();
  const stmts: D1PreparedStatement[] = [env.DB.prepare('DELETE FROM relations')];
  const relSeen = new Set<string>();
  let relCount = 0;
  for (const i of all) {
    let themeKey: string | null = null;
    const labels: string[] = [];
    for (const l of i.labels.nodes) {
      const t = parseThemeLabel(l.name);
      if (t) { themeKey = themeKey ?? t.key; themes.set(t.key, { name: t.name, labelId: l.id }); }
      else labels.push(l.name);
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO issues (id, uuid, title, description, state, state_type, theme_key, parent_id, labels, gh_number, url, created_at, updated_at, completed_at, synced_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
       ON CONFLICT(id) DO UPDATE SET uuid=?2, title=?3, description=?4, state=?5, state_type=?6, theme_key=?7, parent_id=?8, labels=?9, gh_number=?10, url=?11, created_at=?12, updated_at=?13, completed_at=?14, synced_at=?15`,
    ).bind(i.identifier, i.id, i.title, i.description, i.state.name, i.state.type, themeKey, i.parent?.identifier ?? null,
      JSON.stringify(labels), ghNumberOfTitle(i.title), i.url, i.createdAt, i.updatedAt, i.completedAt, now));
    for (const r of i.relations.nodes) {
      const k = `${i.identifier}|${r.relatedIssue.identifier}|${r.type}`;
      if (relSeen.has(k)) continue;
      relSeen.add(k); relCount++;
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO relations (a, b, type) VALUES (?, ?, ?)').bind(i.identifier, r.relatedIssue.identifier, r.type));
    }
  }
  for (const [key, t] of themes) {
    stmts.push(env.DB.prepare(
      'INSERT INTO themes (key, name, label_id, synced_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET name=?2, label_id=?3, synced_at=?4',
    ).bind(key, t.name, t.labelId, now));
  }
  // Linear で消えた課題は写しからも外す
  stmts.push(env.DB.prepare('DELETE FROM issues WHERE synced_at <> ?').bind(now));
  for (let k = 0; k < stmts.length; k += 90) await env.DB.batch(stmts.slice(k, k + 90));
  return { issues: all.length, themes: themes.size, relations: relCount };
}

/** 承認したコミット→課題の対応を、Linear の課題にリンクとして残す（WRITE_BACK=true のときだけ） */
export async function attachCommit(env: Env, issueUuid: string, commitUrl: string, title: string): Promise<void> {
  await gql(env, `mutation($input: AttachmentCreateInput!) { attachmentCreate(input: $input) { success } }`, {
    input: { issueId: issueUuid, url: commitUrl, title: title.slice(0, 120), subtitle: 'idea-flow で対応づけ' },
  });
}
