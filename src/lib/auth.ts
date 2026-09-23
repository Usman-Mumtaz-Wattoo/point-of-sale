import "server-only";
import { redirect } from "next/navigation";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { db } from "./db";

/**
 * Retrieves the currently authenticated Supabase Auth user.
 *
 * Uses `supabase.auth.getUser()` which strictly validates the session token
 * with Supabase Auth, avoiding unverified client-side session tampering.
 */
export async function getCurrentAuthUser(): Promise<SupabaseAuthUser | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    return data.user;
  } catch {
    return null;
  }
}

/**
 * Resolves the authenticated Supabase user to our internal Prisma User record.
 *
 * CRITICAL IDENTITY-LINKING SECURITY RULES:
 * 1. Look up existing application User strictly by `supabaseAuthId`.
 * 2. If found, verify `isActive` status and return.
 * 3. If NOT found:
 *    - Check if a User already exists with the same email.
 *    - If an unlinked User with the same email exists:
 *      DO NOT automatically link it. Email-matching alone must never be treated
 *      as authorization for account takeover/linking. Pre-created users (e.g. from
 *      invitations) will be linked via future explicit onboarding/invitation verification.
 *      In this scenario, throw or return null to prevent unauthorized account attachment.
 *    - If no User exists with either `supabaseAuthId` or `email`, safely create a new
 *      application User record with `supabaseAuthId = authUser.id`.
 * 4. NEVER create an Organization or assign roles automatically.
 */
export async function getCurrentAppUser() {
  const authUser = await getCurrentAuthUser();
  if (!authUser || !authUser.email) {
    return null;
  }

  // 1. Authoritative lookup by supabaseAuthId
  const existingAppUser = await db.user.findUnique({
    where: { supabaseAuthId: authUser.id },
    include: {
      memberships: {
        include: {
          organization: true,
          role: true,
          branchMemberships: {
            include: {
              branch: true,
            },
          },
        },
      },
    },
  });

  if (existingAppUser) {
    if (!existingAppUser.isActive) {
      return null; // Inactive / disabled account
    }
    return existingAppUser;
  }

  // 2. Check if an unlinked user already exists with this email
  const existingEmailUser = await db.user.findUnique({
    where: { email: authUser.email },
  });

  if (existingEmailUser) {
    // SECURITY RESTRICTION:
    // Email matching alone is NOT sufficient authorization for account linking.
    // Automatic linking is strictly forbidden here to prevent account takeover risks.
    // Linking pre-existing accounts must go through an explicit invitation/verification flow.
    throw new Error(
      "An application user already exists with this email address, but is not linked to this authentication account. Account linking requires an explicit verification flow."
    );
  }

  // 3. Brand-new user: Safely provision application User record
  const displayName =
    (typeof authUser.user_metadata?.name === "string" && authUser.user_metadata.name.trim()) ||
    authUser.email.split("@")[0] ||
    "User";

  try {
    const newUser = await db.user.create({
      data: {
        supabaseAuthId: authUser.id,
        email: authUser.email,
        name: displayName,
        isActive: true,
      },
      include: {
        memberships: {
          include: {
            organization: true,
            role: true,
            branchMemberships: {
              include: {
                branch: true,
              },
            },
          },
        },
      },
    });

    return newUser;
  } catch (error) {
    // Handle potential concurrency/race condition if created concurrently
    const raceUser = await db.user.findUnique({
      where: { supabaseAuthId: authUser.id },
      include: {
        memberships: {
          include: {
            organization: true,
            role: true,
            branchMemberships: {
              include: {
                branch: true,
              },
            },
          },
        },
      },
    });

    if (raceUser && raceUser.isActive) {
      return raceUser;
    }

    throw error;
  }
}

/**
 * Enforces server-side authentication.
 * If the user is unauthenticated or inactive, redirects to `/login`.
 */
export async function requireAuth(redirectTo = "/login") {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect(redirectTo);
  }

  return user;
}
