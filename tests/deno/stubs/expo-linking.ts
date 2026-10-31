export function createURL(path: string): string {
  return `lilsteps://${path}`;
}
export function parse(url: string): { queryParams: Record<string, string> } {
  return { queryParams: Object.fromEntries(new URL(url).searchParams) };
}
