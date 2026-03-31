import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = ["/analyze"];
// Public report pages — accessible without sign-in
const publicPaths = [
  "/analyze/demo-instagram-reel",
  "/analyze/demo-youtube-preroll",
  "/analyze/b5c2b795-3db7-4454-af30-48e7c237d375",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths bypass auth
  if (publicPaths.some((p) => pathname.startsWith(p))) {
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
