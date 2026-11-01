/**
 * The app's URL prefix (next.config basePath, e.g. '/doctor'; '' at root).
 * <Link>, router.push/replace and redirect() add it on their own. Use
 * withBasePath only for URLs Next does not handle: raw <a href>, absolute
 * URLs handed to third parties (OAuth redirectTo), window.location.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}

/** Drop a leading basePath, so '/doctor/settings' becomes '/settings'. */
export function stripBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (path === BASE_PATH) return '/';
  if (path.startsWith(`${BASE_PATH}/`) || path.startsWith(`${BASE_PATH}?`) || path.startsWith(`${BASE_PATH}#`)) {
    const rest = path.slice(BASE_PATH.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return path;
}
