// Records every auth-session open; tests decide what it returns.
export const opened: string[] = [];
export let nextResult: { type: 'success'; url: string } | { type: 'cancel' } = { type: 'cancel' };
export function setNextResult(r: typeof nextResult) {
  nextResult = r;
}
export function openAuthSessionAsync(url: string, _redirect: string) {
  opened.push(url);
  return Promise.resolve(nextResult);
}
export function maybeCompleteAuthSession() {}
