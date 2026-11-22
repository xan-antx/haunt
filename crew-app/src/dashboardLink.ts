export const DEFAULT_DASHBOARD_URL = 'http://localhost:3001';

/** HAUNT_DASHBOARD_URL when set and non-empty, else http://localhost:3001. */
export function dashboardBaseUrl(env: Record<string, string | undefined>): string {
  const value = env.HAUNT_DASHBOARD_URL;
  return value !== undefined && value !== '' ? value : DEFAULT_DASHBOARD_URL;
}

/** `<base without trailing slashes>/#/run/<encoded run id>` */
export function dashboardRunUrl(base: string, runId: string): string {
  return `${base.replace(/\/+$/, '')}/#/run/${encodeURIComponent(runId)}`;
}
