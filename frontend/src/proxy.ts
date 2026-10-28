import { NextResponse, type NextRequest } from "next/server";

// Fast UX redirect for signed-out visitors. This only checks that a session
// cookie exists; Django still authorises every API call (and an expired cookie
// gets a 401 there, which the client turns into a redirect to /login).
export function proxy(request: NextRequest) {
  if (!request.cookies.has("sessionid")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/session/:path*", "/dashboard"],
};
