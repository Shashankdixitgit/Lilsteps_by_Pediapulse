// Where razorpay-return may send the family back to. Without this check the
// function would be an open redirect on our domain.
//
//   lilsteps://…            the installed app (app.json "scheme")
//   PAYMENT_RETURN_ORIGINS  comma-separated web origins of the web app,
//                           e.g. "https://lilstepsclinics.com"
//   PAYMENT_RETURN_ALLOW_DEV=true  also Expo Go (exp://, exp+lilsteps://)
//                           and http://localhost — test projects only

const APP_SCHEMES = ['lilsteps:'];
const DEV_SCHEMES = ['exp:', 'exps:', 'exp+lilsteps:'];

export function isAllowedReturnUrl(raw: string): boolean {
  if (raw.length > 500) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (APP_SCHEMES.includes(url.protocol)) return true;

  const dev = Deno.env.get('PAYMENT_RETURN_ALLOW_DEV') === 'true';
  if (dev && DEV_SCHEMES.includes(url.protocol)) return true;
  if (dev && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return true;
  }

  if (url.protocol !== 'https:') return false;
  const origins = (Deno.env.get('PAYMENT_RETURN_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.includes(url.origin);
}
