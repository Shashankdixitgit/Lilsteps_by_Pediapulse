import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { safeNext } from '@/lib/safe-next';

/**
 * Refresh the auth session on every request and gate all routes except
 * /login. A logged-in user who is NOT a doctor (no row in public.doctor_auth)
 * is signed out and redirected to /login with an error.
 */
export async function proxy(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // nextUrl.pathname excludes the basePath ('/doctor/login' -> '/login'), and
  // redirects built from req.nextUrl.clone() put it back. Never build a
  // redirect with new URL('/x', req.url): that drops the basePath.
  const path = req.nextUrl.pathname;
  const isLoginRoute = path.startsWith('/login');
  // /v/<code> is the public video room (used by parents via the mobile app),
  // no auth required — the room code itself is the access token.
  const isPublicVideo = path.startsWith('/v/');

  if (isPublicVideo) return res;

  if (!user && !isLoginRoute) {
    // Remember where the doctor was going; sign-in sends them back there.
    const url = req.nextUrl.clone();
    const back = path + req.nextUrl.search;
    url.pathname = '/login';
    url.search = '';
    if (back !== '/') url.searchParams.set('next', back);
    return NextResponse.redirect(url);
  }

  if (user && !isLoginRoute) {
    const { data: doctorAuth } = await supabase
      .from('doctor_auth')
      .select('doctor_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!doctorAuth) {
      await supabase.auth.signOut();
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'not_a_doctor');
      return NextResponse.redirect(url);
    }
  }

  if (user && isLoginRoute) {
    // Clone keeps the basePath (/doctor); new URL(target, origin) would drop it.
    const target = new URL(safeNext(req.nextUrl.searchParams.get('next')), 'http://n');
    const url = req.nextUrl.clone();
    url.pathname = target.pathname;
    url.search = target.search;
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
};
