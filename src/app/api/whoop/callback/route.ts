import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserId, getPublicOrigin } from "@/lib/auth";
import { exchangeWhoopCode } from "@/lib/whoop";

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  const appUrl = getPublicOrigin(request);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      `${appUrl}/?whoop=error&reason=${encodeURIComponent(errorParam)}`
    );
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("whoop_oauth_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/?whoop=error&reason=invalid_state`);
  }

  try {
    await exchangeWhoopCode(code, userId, appUrl);
    const response = NextResponse.redirect(`${appUrl}/?whoop=connected`);
    response.cookies.delete("whoop_oauth_state");
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "token_exchange_failed";
    const response = NextResponse.redirect(
      `${appUrl}/?whoop=error&reason=${encodeURIComponent(reason)}`
    );
    response.cookies.delete("whoop_oauth_state");
    return response;
  }
}
