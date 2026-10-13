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
      let finalRedirectPath = safeRedirectPath;
      try {
        const { getCurrentAppUser } = await import("@/lib/auth");
        const { getDefaultRouteForRole } = await import("@/lib/invitation-claim");
        const appUser = await getCurrentAppUser();
        if (appUser && appUser.memberships.length > 0 && safeRedirectPath === "/dashboard") {
          const primary = appUser.memberships[0];
          finalRedirectPath = getDefaultRouteForRole(primary.role.name, primary.organizationId);
        }
      } catch {
        // Continue with safeRedirectPath
      }
      return NextResponse.redirect(new URL(finalRedirectPath, requestUrl.origin));
    }
  }

  // If code exchange failed or no code present, redirect to login with error parameter
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", requestUrl.origin)
  );
}
