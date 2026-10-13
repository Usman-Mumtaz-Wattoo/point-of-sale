import { db } from "./db";
import { revalidatePath } from "next/cache";

import { getDefaultRouteForRole } from "./invitation-routing";
export { getDefaultRouteForRole };

export interface ClaimedInvitationResult {
  invitationId: string;
  organizationId: string;
  organizationName: string;
  roleName: string;
  redirectUrl: string;
}

/**
 * Authoritatively claims any pending, valid invitations matching the user's verified email.
 * Runs atomically inside a database transaction with concurrency locking.
 */
export async function claimPendingInvitationsForUser(user: {
  id: string;
  email: string;
}): Promise<ClaimedInvitationResult[]> {
  if (!user?.id || !user?.email) {
    return [];
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  const now = new Date();

  // Find all pending, unexpired invitations matching this email
  const pendingInvitations = await db.organizationInvitation.findMany({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
      status: "PENDING",
      expiresAt: { gt: now },
      organization: { isActive: true },
    },
    include: {
      organization: true,
      role: true,
      branches: true,
    },
  });

  if (pendingInvitations.length === 0) {
    return [];
  }

  const claimedResults: ClaimedInvitationResult[] = [];

  for (const invitation of pendingInvitations) {
    try {
      const claimResult = await db.$transaction(async (tx) => {
        // Advisory transaction lock per invitation id
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invitation_claim'), hashtext(${invitation.id}))`;

        // Re-verify current invitation status under lock
        const freshInv = await tx.organizationInvitation.findUnique({
          where: { id: invitation.id },
          include: {
            organization: true,
            role: true,
            branches: true,
          },
        });

        if (!freshInv || freshInv.status !== "PENDING" || freshInv.expiresAt < new Date()) {
          return null;
        }

        // 1. Transition invitation status to ACCEPTED
        const updatedCount = await tx.organizationInvitation.updateMany({
          where: {
            id: freshInv.id,
            status: "PENDING",
          },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
          },
        });

        if (updatedCount.count === 0) {
          return null;
        }

        // 2. Upsert OrganizationMembership
        const existingMembership = await tx.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: freshInv.organizationId,
            },
          },
        });

        let membershipId: string;

        if (existingMembership) {
          const updated = await tx.organizationMembership.update({
            where: { id: existingMembership.id },
            data: {
              isActive: true,
              roleId: freshInv.roleId,
            },
          });
          membershipId = updated.id;
        } else {
          const created = await tx.organizationMembership.create({
            data: {
              userId: user.id,
              organizationId: freshInv.organizationId,
              roleId: freshInv.roleId,
              isActive: true,
            },
          });
          membershipId = created.id;
        }

        // 3. Assign branches if configured on the invitation
        if (freshInv.branches.length > 0) {
          for (const b of freshInv.branches) {
            await tx.branchMembership.upsert({
              where: {
                organizationMembershipId_branchId: {
                  organizationMembershipId: membershipId,
                  branchId: b.branchId,
                },
              },
              create: {
                organizationMembershipId: membershipId,
                branchId: b.branchId,
              },
              update: {},
            });
          }
        }

        return {
          invitationId: freshInv.id,
          organizationId: freshInv.organizationId,
          organizationName: freshInv.organization.name,
          roleName: freshInv.role.name,
          redirectUrl: getDefaultRouteForRole(freshInv.role.name, freshInv.organizationId),
        };
      });

      if (claimResult) {
        claimedResults.push(claimResult);
      }
    } catch (err) {
      console.error(`[claimPendingInvitationsForUser] Error claiming invitation ${invitation.id}:`, err);
    }
  }

  if (claimedResults.length > 0) {
    try {
      revalidatePath("/dashboard");
      revalidatePath("/settings/staff");
      revalidatePath("/pos");
    } catch {
      // Ignored if called outside Next.js request context (e.g. background or tests)
    }
  }

  return claimedResults;
}
