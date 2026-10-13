"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth";
import { getDefaultRouteForRole } from "@/lib/invitation-claim";

export interface AuthActionResult {
  error?: string;
  success?: boolean;
  message?: string;
}

export async function loginAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();
  const redirectTo = formData.get("redirectTo")?.toString().trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Load application user with pre-resolved auth user to eliminate duplicate Supabase Auth roundtrip
  const appUser = await getCurrentAppUser(data.user);

  // Validate redirectTo path against open redirect vulnerabilities
  if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    redirect(redirectTo);
  }

  // Route staff directly to their authorized page
  if (appUser && appUser.memberships.length > 0) {
    const primaryMembership = appUser.memberships[0];
    redirect(getDefaultRouteForRole(primaryMembership.role.name, primaryMembership.organizationId));
  }

  redirect("/dashboard");
}

export async function signupAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();
  const passwordConfirmation = formData.get("passwordConfirmation")?.toString();
  const redirectTo = formData.get("redirectTo")?.toString().trim();

  if (!name || !email || !password) {
    return { error: "Name, email, and password are required." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  if (password !== passwordConfirmation) {
    return { error: "Passwords do not match." };
  }

  const headerList = await headers();
  const origin = headerList.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const safeNext =
    redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/dashboard";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // If Supabase has email confirmation enabled, data.session will be null
  if (data.user && !data.session) {
    return {
      success: true,
      message: "Registration successful. Please check your email to verify your account.",
    };
  }

  // Load application user to resolve memberships and claim any pending invitations
  const appUser = await getCurrentAppUser();

  if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    redirect(redirectTo);
  }

  if (appUser && appUser.memberships.length > 0) {
    const primaryMembership = appUser.memberships[0];
    redirect(getDefaultRouteForRole(primaryMembership.role.name, primaryMembership.organizationId));
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email")?.toString().trim();

  if (!email) {
    return { error: "Email is required." };
  }

  const headerList = await headers();
  const origin = headerList.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password/update`,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    message: "Password reset instructions have been sent to your email address.",
  };
}

export async function updatePasswordAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const password = formData.get("password")?.toString();
  const passwordConfirmation = formData.get("passwordConfirmation")?.toString();

  if (!password || password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  if (password !== passwordConfirmation) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}
