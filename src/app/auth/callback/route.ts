import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase Auth PKCE Callback Route Handler
 * Exchanges authorization code for session cookies and securely redirects.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  // Prevent open redirect vulnerabilities:
  // Target path must be a relative URI starting with a single '/'
  const isSafeRelativeUrl = next.startsWith("/") && !next.startsWith("//");
  const safeRedirectPath = isSafeRelativeUrl ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(safeRedirectPath, requestUrl.origin));
    }
  }

  // If code exchange failed or no code present, redirect to login with error parameter
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", requestUrl.origin)
  );
}
