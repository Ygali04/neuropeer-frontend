import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const protectedPaths = ["/analyze"];
const DEMO_PATHS = ["/analyze/demo-instagram-reel", "/analyze/demo-youtube-preroll"];

export function proxy(request: NextRequest) {
  if (IS_MOCK) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Demo reports are always public
  if (DEMO_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected) {
    const token =
      request.cookies.get("authjs.session-token")?.value ||
      request.cookies.get("__Secure-authjs.session-token")?.value;

    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.svg|brain-models|.*\\.png$).*)",
  ],
};
