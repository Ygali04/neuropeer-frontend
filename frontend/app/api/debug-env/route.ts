import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    has_auth_google_id: !!process.env.AUTH_GOOGLE_ID,
    has_auth_google_secret: !!process.env.AUTH_GOOGLE_SECRET,
    has_google_client_id: !!process.env.GOOGLE_CLIENT_ID,
    has_auth_secret: !!process.env.AUTH_SECRET,
    nextauth_url: process.env.NEXTAUTH_URL ?? "NOT SET",
    auth_google_id_prefix: (process.env.AUTH_GOOGLE_ID ?? "EMPTY").slice(0, 15),
  });
}
