// Records every auth-session open; tests decide what it returns.
// `holdOpen`: the session stays open until dismissAuthSession() (the app
// closing the page itself), then resolves { type: 'dismiss' }.
export const opened: string[] = [];
export const openedOptions: unknown[] = [];
export let dismissed = 0;
export let nextResult: { type: 'success'; url: string } | { type: 'cancel' } | 'holdOpen' = { type: 'cancel' };
let release: (() => void) | null = null;
export function setNextResult(r: typeof nextResult) {
  nextResult = r;
}
export function resetBrowser() {
  opened.length = 0;
  openedOptions.length = 0;
  dismissed = 0;
}
export function openAuthSessionAsync(url: string, _redirect: string, options?: unknown) {
  opened.push(url);
  openedOptions.push(options);
  if (nextResult === 'holdOpen') {
    return new Promise((resolve) => {
      release = () => resolve({ type: 'dismiss' });
    });
  }
  return Promise.resolve(nextResult);
}
export function dismissAuthSession() {
  dismissed++;
  release?.();
  release = null;
}
export function maybeCompleteAuthSession() {}
