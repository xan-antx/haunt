// Screenshot path safety and URL resolution. A run file may only point at files inside its own folder.

/**
 * True when `path` is a plain relative path inside the run folder:
 * not empty, not absolute, no `..`, no backslash, and no URL scheme (`:`).
 */
export function isSafeScreenshotPath(path: string): boolean {
  if (path.trim() === '') return false;
  if (path.startsWith('/')) return false;
  if (path.includes('\\')) return false;
  if (path.includes(':')) return false;
  if (path.includes('..')) return false;
  return true;
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .map(encodeURIComponent)
    .join('/');
}

/**
 * URL for a screenshot of the run in `folder`, relative to `base` (Vite's BASE_URL).
 * Returns null for unsafe paths, so a run file can never point outside its folder.
 */
export function resolveScreenshotUrl(base: string, folder: string, path: string): string | null {
  if (!isSafeScreenshotPath(path)) return null;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}runs/${encodePath(folder)}/${encodePath(path)}`;
}
