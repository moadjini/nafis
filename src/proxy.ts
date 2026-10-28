import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Signed-in areas. Pages and server actions still re-check the session and
// every database call is protected by RLS; this is only the first gate.
const PROTECTED_PREFIXES = [
  "/home",
  "/explore",
  "/post",
  "/listening",
  "/sessions",
  "/saved",
  "/journal",
  "/profile",
  "/settings",
  "/notifications",
  "/admin",
  "/onboarding",
];

const GUEST_ONLY = ["/auth/sign-in", "/auth/sign-up"];

function matches(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}

export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!userId && matches(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return redirectWithCookies(url, response);
  }

  if (userId && matches(pathname, GUEST_ONLY)) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, image optimisation and public files.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
