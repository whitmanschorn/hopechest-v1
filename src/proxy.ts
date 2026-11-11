import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "hopechest_session";

/** Pages anyone may open. Everything else needs a session. */
const PUBLIC = [/^\/$/, /^\/login$/, /^\/join(\/|$)/, /^\/try$/];

/**
 * A fast first gate: no session cookie, no entry. It only checks that the
 * cookie exists; pages and services verify it against the database
 * (`requireUser`), so a forged cookie gets no further than this redirect.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((pattern) => pattern.test(pathname))) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // API routes authenticate themselves (sessions or API keys) and answer 401, not a redirect.
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.[a-z0-9]+$).*)"],
};
