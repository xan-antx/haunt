// Where Haunt's source lives. Ordinary links to GitHub are fine; the dashboard never calls it.

export const REPO_URL = 'https://github.com/xan-antx/haunt';

/** A link to a file on the main branch, for example ".kiro/steering/demo-site.md". */
export function repoFileUrl(path: string): string {
  return `${REPO_URL}/blob/main/${path.replace(/^\/+/, '')}`;
}
