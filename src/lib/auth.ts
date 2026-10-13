import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { db } from "./db";
import { claimPendingInvitationsForUser } from "./invitation-claim";

/**
 * Retrieves the currently authenticated Supabase Auth user.
 *
 * Uses `supabase.auth.getUser()` which strictly validates the session token
 * with Supabase Auth, avoiding unverified client-side session tampering.
 * Wrapped in React `cache()` for per-request deduplication.
 */
export const getCurrentAuthUser = cache(async function getCurrentAuthUser(): Promise<SupabaseAuthUser | null> {
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
});

/**
 * Resolves the authenticated Supabase user to our internal Prisma User record.
 * Wrapped in React `cache()` for per-request deduplication.
 * Accepts optional pre-resolved authUser to eliminate redundant network calls.
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
export const getCurrentAppUser = cache(async function getCurrentAppUser(
  preResolvedAuthUser?: SupabaseAuthUser | null
) {
  const authUser = preResolvedAuthUser !== undefined ? preResolvedAuthUser : await getCurrentAuthUser();
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

    // Immediately resolve and claim any pending organization invitations for this verified user
    if (existingAppUser.memberships.length === 0) {
      const claimed = await claimPendingInvitationsForUser(existingAppUser);
      if (claimed.length > 0) {
        const reloadedUser = await db.user.findUnique({
          where: { id: existingAppUser.id },
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
        if (reloadedUser && reloadedUser.isActive) {
          return reloadedUser;
        }
      }
    }

    return existingAppUser;
  }

  // 2. Check if an unlinked user already exists with this email
  const existingEmailUser = await db.user.findUnique({
    where: { email: authUser.email },
  });

  if (existingEmailUser) {
    // If the account has no supabaseAuthId and auth email is confirmed, safely link it
    if (!existingEmailUser.supabaseAuthId && authUser.email_confirmed_at) {
      await db.user.update({
        where: { id: existingEmailUser.id },
        data: { supabaseAuthId: authUser.id },
      });
      await claimPendingInvitationsForUser(existingEmailUser);
      return db.user.findUnique({
        where: { id: existingEmailUser.id },
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
    }

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

    // Immediately resolve and claim any pending invitations for the newly provisioned user
    const claimed = await claimPendingInvitationsForUser(newUser);
    if (claimed.length > 0) {
      const reloadedNewUser = await db.user.findUnique({
        where: { id: newUser.id },
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
      if (reloadedNewUser && reloadedNewUser.isActive) {
        return reloadedNewUser;
      }
    }

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
});

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
