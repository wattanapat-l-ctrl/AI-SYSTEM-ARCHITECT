import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, requirePublicEnv } from "./lib/supabase/env";

/**
 * Next.js 16 Proxy (formerly middleware).
 *
 * Two jobs:
 *   1. Refresh the Supabase auth cookie so Server Components always see a
 *      current session.
 *   2. Redirect unauthenticated visitors away from the protected area.
 *
 * Authorization is NOT enforced here alone — every Server Action and data
 * helper re-checks access, because Proxy can be bypassed for server functions.
 *
 * When Supabase is not configured there is no session to read. Rather than
 * letting the SDK throw on every request, public pages are served as-is and
 * anything protected is sent to the setup screen.
 */

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/setup",
];

const SETUP_PATH = "/setup";

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    // The landing page and the setup screen are the only pages that do not need
    // a database. Everything else, including the auth forms, would fail on
    // submit, so send it to setup instead.
    if (pathname === "/" || pathname === SETUP_PATH) {
      return NextResponse.next({ request });
    }
    const setup = request.nextUrl.clone();
    setup.pathname = SETUP_PATH;
    setup.search = "";
    return NextResponse.redirect(setup);
  }

  let response = NextResponse.next({ request });

  const { url, publishableKey } = requirePublicEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANT: do not run code between createClient() and getUser() — it can
  // cause hard-to-debug session desync issues.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users should not sit on the login/signup screens.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   - /api        (route handlers do their own auth checks)
     *   - /_next      (build output)
     *   - static assets
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
