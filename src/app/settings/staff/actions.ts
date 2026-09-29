"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import {
  ASSIGNABLE_STAFF_ROLES,
  type StaffMemberDTO,
  type InvitationDTO,
  type CreateInvitationInput,
  type UpdateStaffRoleInput,
  type UpdateStaffBranchAccessInput,
  type ToggleStaffStatusInput,
  type StaffActionResult,
  type PublicInvitationDetailDTO,
} from "./types";

/**
 * Resolves the authenticated user's organization context strictly enforcing
 * the OWNER role and multi-tenant isolation.
 */
async function resolveOwnerStaffContext(requestedOrgId?: string): Promise<{
  userId: string;
  organizationId: string;
  organizationName: string;
  membershipId: string;
}> {
  const user = await getCurrentAppUser();
  if (!user || !user.isActive) {
    throw new Error("AUTH_REQUIRED");
  }

  const activeMemberships = user.memberships.filter(
    (m) => m.isActive && m.organization && m.organization.isActive
  );

  if (activeMemberships.length === 0) {
    throw new Error("NO_ACTIVE_MEMBERSHIP");
  }

  let selectedMembership = activeMemberships[0];

  if (requestedOrgId?.trim()) {
    const match = activeMemberships.find((m) => m.organizationId === requestedOrgId.trim());
    if (!match) {
      throw new Error("MEMBERSHIP_NOT_FOUND");
    }
    selectedMembership = match;
  } else {
    // Prevent silent defaulting if user belongs to multiple organizations
    if (activeMemberships.length > 1) {
      throw new Error("MULTIPLE_ORGS_SPECIFY_REQUIRED");
    }
    selectedMembership = activeMemberships[0];
  }

  // Strictly enforce OWNER role
  if (selectedMembership.role.name !== SYSTEM_ROLES.OWNER) {
    throw new Error("OWNER_ROLE_REQUIRED");
  }

  return {
    userId: user.id,
    organizationId: selectedMembership.organizationId,
    organizationName: selectedMembership.organization.name,
    membershipId: selectedMembership.id,
  };
}

/**
 * Hashes a plaintext invitation token with SHA-256 for secure lookup.
 */
function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Lists all active and inactive staff members for the organization.
 */
export async function listStaffAction(
  requestedOrgId?: string
): Promise<StaffActionResult<StaffMemberDTO[]>> {
  try {
    const { userId, organizationId } = await resolveOwnerStaffContext(requestedOrgId);

    const memberships = await db.organizationMembership.findMany({
      where: { organizationId },
      include: {
        user: true,
        role: true,
        branchMemberships: {
          include: {
            branch: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });

    const serialized: StaffMemberDTO[] = memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: {
        id: m.role.id,
        name: m.role.name,
        description: m.role.description,
      },
      isActive: m.isActive,
      isSelf: m.userId === userId,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      branchMemberships: m.branchMemberships.map((bm) => ({
        branchId: bm.branchId,
        branchName: bm.branch.name,
        branchCode: bm.branch.code,
        branchIsActive: bm.branch.isActive,
      })),
    }));

    return {
      success: true,
      data: serialized,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to view staff." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can manage staff." };
      }
      if (error.message === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        return { success: false, error: "Multiple organizations found. Please select an organization." };
      }
    }
    return {
      success: false,
      error: "An unexpected error occurred while loading staff members.",
    };
  }
}

/**
 * Lists all invitations for the organization, lazily updating expired ones.
 */
export async function listInvitationsAction(
  requestedOrgId?: string
): Promise<StaffActionResult<InvitationDTO[]>> {
  try {
    const { organizationId } = await resolveOwnerStaffContext(requestedOrgId);

    // Lazily mark expired invitations
    const now = new Date();
    await db.organizationInvitation.updateMany({
      where: {
        organizationId,
        status: "PENDING",
        expiresAt: { lt: now },
      },
      data: {
        status: "EXPIRED",
      },
    });

    const invitations = await db.organizationInvitation.findMany({
      where: { organizationId },
      include: {
        role: true,
        invitedBy: true,
        branches: {
          include: {
            branch: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const serialized: InvitationDTO[] = invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: {
        id: inv.role.id,
        name: inv.role.name,
      },
      status: inv.status as InvitationDTO["status"],
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
      invitedBy: inv.invitedBy
        ? {
            id: inv.invitedBy.id,
            name: inv.invitedBy.name,
            email: inv.invitedBy.email,
          }
        : null,
      branches: inv.branches.map((b) => ({
        branchId: b.branchId,
        branchName: b.branch.name,
        branchCode: b.branch.code,
      })),
    }));

    return {
      success: true,
      data: serialized,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to view invitations." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can manage invitations." };
      }
    }
    return {
      success: false,
      error: "An unexpected error occurred while loading invitations.",
    };
  }
}

/**
 * Creates and dispatches a new staff invitation with a cryptographic token.
 */
export async function createInvitationAction(
  input: CreateInvitationInput,
  requestedOrgId?: string
): Promise<StaffActionResult<{ invitationId: string; inviteUrl: string }>> {
  try {
    const { userId, organizationId } = await resolveOwnerStaffContext(requestedOrgId);

    const fieldErrors: Record<string, string> = {};

    // 1. Email validation
    const email = input.email?.trim().toLowerCase();
    if (!email) {
      fieldErrors.email = "Email address is required.";
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email) || email.length > 120) {
        fieldErrors.email = "Please enter a valid email address.";
      }
    }

    // 2. Role validation (OWNER strictly forbidden)
    const roleName = input.roleName?.trim() as SystemRoleName;
    if (!roleName) {
      fieldErrors.roleName = "A role must be selected.";
    } else if (!ASSIGNABLE_STAFF_ROLES.includes(roleName)) {
      if (roleName === SYSTEM_ROLES.OWNER) {
        fieldErrors.roleName = "The OWNER role cannot be assigned through staff invitations.";
      } else {
        fieldErrors.roleName = `Invalid role. Allowed roles: ${ASSIGNABLE_STAFF_ROLES.join(", ")}.`;
      }
    }

    // 3. Branches validation (must belong to this organization)
    const branchIds = Array.isArray(input.branchIds)
      ? Array.from(new Set(input.branchIds.map((b) => b.trim()).filter(Boolean)))
      : [];

    if (branchIds.length > 0) {
      const existingBranches = await db.branch.findMany({
        where: {
          id: { in: branchIds },
          organizationId,
          isActive: true,
        },
        select: { id: true },
      });

      if (existingBranches.length !== branchIds.length) {
        fieldErrors.branches = "One or more selected branches do not belong to your organization or are inactive.";
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        error: "Please correct the highlighted validation errors.",
        fieldErrors,
      };
    }

    // 4. Duplicate checks
    // 4a. Check if user already has active membership in this organization
    const existingActiveMember = await db.organizationMembership.findFirst({
      where: {
        organizationId,
        user: { email },
        isActive: true,
      },
    });

    if (existingActiveMember) {
      return {
        success: false,
        error: "A user with this email address is already an active member of your organization.",
        fieldErrors: {
          email: "This email address is already an active staff member.",
        },
      };
    }

    // 4b. Check if a pending, unexpired invitation already exists for this email
    const existingPendingInvitation = await db.organizationInvitation.findFirst({
      where: {
        organizationId,
        email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingPendingInvitation) {
      return {
        success: false,
        error: "A pending invitation already exists for this email. You can resend it instead.",
        fieldErrors: {
          email: "A pending invitation already exists for this email.",
        },
      };
    }

    // 5. Look up Role record
    const targetRole = await db.role.findUnique({
      where: { name: roleName },
      select: { id: true },
    });

    if (!targetRole) {
      return { success: false, error: `Role record for "${roleName}" was not found.` };
    }

    // 6. Generate cryptographically secure token and hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day expiration

    // 7. Atomic transaction
    const newInvitation = await db.$transaction(async (tx) => {
      const invitation = await tx.organizationInvitation.create({
        data: {
          organizationId,
          email,
          roleId: targetRole.id,
          tokenHash,
          status: "PENDING",
          expiresAt,
          invitedById: userId,
        },
      });

      if (branchIds.length > 0) {
        await tx.invitationBranch.createMany({
          data: branchIds.map((branchId) => ({
            invitationId: invitation.id,
            branchId,
          })),
        });
      }

      return invitation;
    });

    revalidatePath("/settings/staff");

    const inviteUrl = `/invite/${rawToken}`;

    return {
      success: true,
      data: {
        invitationId: newInvitation.id,
        inviteUrl,
      },
      message: `Invitation created for ${email}.`,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to invite staff." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can invite staff." };
      }
    }
    return {
      success: false,
      error: "An unexpected error occurred while creating the invitation.",
    };
  }
}

/**
 * Resends an invitation with a fresh cryptographic token and extended expiration.
 */
export async function resendInvitationAction(
  invitationId: string,
  requestedOrgId?: string
): Promise<StaffActionResult<{ inviteUrl: string }>> {
  try {
    const { organizationId } = await resolveOwnerStaffContext(requestedOrgId);

    const invitation = await db.organizationInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.organizationId !== organizationId) {
      return { success: false, error: "Invitation not found." };
    }

    if (invitation.status === "ACCEPTED") {
      return { success: false, error: "Cannot resend an invitation that has already been accepted." };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        tokenHash,
        expiresAt,
        status: "PENDING",
        updatedAt: new Date(),
      },
    });

    revalidatePath("/settings/staff");

    return {
      success: true,
      data: { inviteUrl: `/invite/${rawToken}` },
      message: `Invitation resent to ${invitation.email}.`,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to resend invitations." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can resend invitations." };
      }
    }
    return {
      success: false,
      error: "An unexpected error occurred while resending the invitation.",
    };
  }
}

/**
 * Cancels a pending invitation immediately, invalidating its token.
 */
export async function cancelInvitationAction(
  invitationId: string,
  requestedOrgId?: string
): Promise<StaffActionResult<{ id: string }>> {
  try {
    const { organizationId } = await resolveOwnerStaffContext(requestedOrgId);

    const invitation = await db.organizationInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.organizationId !== organizationId) {
      return { success: false, error: "Invitation not found." };
    }

    if (invitation.status === "ACCEPTED") {
      return { success: false, error: "Cannot cancel an invitation that has already been accepted." };
    }

    await db.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "CANCELLED",
      },
    });

    revalidatePath("/settings/staff");

    return {
      success: true,
      data: { id: invitation.id },
      message: `Invitation for ${invitation.email} cancelled.`,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to cancel invitations." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can cancel invitations." };
      }
    }
    return {
      success: false,
      error: "An unexpected error occurred while cancelling the invitation.",
    };
  }
}

/**
 * Updates a staff member's role (OWNER role cannot be modified or assigned).
 */
export async function updateStaffRoleAction(
  input: UpdateStaffRoleInput,
  requestedOrgId?: string
): Promise<StaffActionResult<StaffMemberDTO>> {
  try {
    const { userId, organizationId } = await resolveOwnerStaffContext(requestedOrgId);

    const membershipId = input.membershipId?.trim();
    if (!membershipId) {
      return { success: false, error: "Membership ID is required." };
    }

    const newRoleName = input.newRoleName?.trim() as SystemRoleName;
    if (!newRoleName || !ASSIGNABLE_STAFF_ROLES.includes(newRoleName)) {
      return {
        success: false,
        error: `Invalid role selected. Allowed roles: ${ASSIGNABLE_STAFF_ROLES.join(", ")}.`,
      };
    }

    const targetMembership = await db.organizationMembership.findUnique({
      where: { id: membershipId },
      include: { role: true, user: true },
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      return { success: false, error: "Staff member not found." };
    }

    // Prevent OWNER role manipulation
    if (targetMembership.role.name === SYSTEM_ROLES.OWNER) {
      return {
        success: false,
        error: "The organization OWNER role cannot be modified through staff administration.",
      };
    }

    const newRole = await db.role.findUnique({
      where: { name: newRoleName },
    });

    if (!newRole) {
      return { success: false, error: `Role record for "${newRoleName}" was not found.` };
    }

    const updated = await db.organizationMembership.update({
      where: { id: membershipId },
      data: { roleId: newRole.id },
      include: {
        user: true,
        role: true,
        branchMemberships: {
          include: { branch: true },
        },
      },
    });

    revalidatePath("/settings/staff");

    return {
      success: true,
      data: {
        id: updated.id,
        userId: updated.userId,
        name: updated.user.name,
        email: updated.user.email,
        role: {
          id: updated.role.id,
          name: updated.role.name,
          description: updated.role.description,
        },
        isActive: updated.isActive,
        isSelf: updated.userId === userId,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        branchMemberships: updated.branchMemberships.map((bm) => ({
          branchId: bm.branchId,
          branchName: bm.branch.name,
          branchCode: bm.branch.code,
          branchIsActive: bm.branch.isActive,
        })),
      },
      message: `Role for ${updated.user.name} changed to ${updated.role.name}.`,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to change staff role." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can change roles." };
      }
    }
    return {
      success: false,
      error: "An unexpected error occurred while updating staff role.",
    };
  }
}

/**
 * Updates an employee's assigned branches atomically.
 */
export async function updateStaffBranchAccessAction(
  input: UpdateStaffBranchAccessInput,
  requestedOrgId?: string
): Promise<StaffActionResult<StaffMemberDTO>> {
  try {
    const { userId, organizationId } = await resolveOwnerStaffContext(requestedOrgId);

    const membershipId = input.membershipId?.trim();
    if (!membershipId) {
      return { success: false, error: "Membership ID is required." };
    }

    const targetMembership = await db.organizationMembership.findUnique({
      where: { id: membershipId },
      include: { role: true },
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      return { success: false, error: "Staff member not found." };
    }

    // Owner has automatic organization-wide access
    if (targetMembership.role.name === SYSTEM_ROLES.OWNER) {
      return {
        success: false,
        error: "Organization owners have organization-wide access; individual branch assignment is not applicable.",
      };
    }

    const targetBranchIds = Array.isArray(input.branchIds)
      ? Array.from(new Set(input.branchIds.map((b) => b.trim()).filter(Boolean)))
      : [];

    // Verify all branches belong to the caller's organization
    if (targetBranchIds.length > 0) {
      const branches = await db.branch.findMany({
        where: {
          id: { in: targetBranchIds },
          organizationId,
        },
        select: { id: true },
      });

      if (branches.length !== targetBranchIds.length) {
        return {
          success: false,
          error: "Multi-tenant violation: One or more selected branches do not belong to this organization.",
        };
      }
    }

    const updated = await db.$transaction(async (tx) => {
      // 1. Remove existing branch memberships for this organization membership
      await tx.branchMembership.deleteMany({
        where: { organizationMembershipId: membershipId },
      });

      // 2. Insert new branch memberships
      if (targetBranchIds.length > 0) {
        await tx.branchMembership.createMany({
          data: targetBranchIds.map((branchId) => ({
            organizationMembershipId: membershipId,
            branchId,
          })),
        });
      }

      return tx.organizationMembership.findUnique({
        where: { id: membershipId },
        include: {
          user: true,
          role: true,
          branchMemberships: {
            include: { branch: true },
          },
        },
      });
    });

    if (!updated) {
      return { success: false, error: "Staff member not found after update." };
    }

    revalidatePath("/settings/staff");

    return {
      success: true,
      data: {
        id: updated.id,
        userId: updated.userId,
        name: updated.user.name,
        email: updated.user.email,
        role: {
          id: updated.role.id,
          name: updated.role.name,
          description: updated.role.description,
        },
        isActive: updated.isActive,
        isSelf: updated.userId === userId,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        branchMemberships: updated.branchMemberships.map((bm) => ({
          branchId: bm.branchId,
          branchName: bm.branch.name,
          branchCode: bm.branch.code,
          branchIsActive: bm.branch.isActive,
        })),
      },
      message: `Branch access updated for ${updated.user.name}.`,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to update branch access." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can manage branch access." };
      }
    }
    return {
      success: false,
      error: "An unexpected error occurred while updating branch access.",
    };
  }
}

/**
 * Toggles a staff member's organization membership active status (activate/deactivate).
 * CRITICAL: Never modifies global User.isActive! Protects against self-lockout and owner deactivation.
 */
export async function toggleStaffStatusAction(
  input: ToggleStaffStatusInput,
  requestedOrgId?: string
): Promise<StaffActionResult<{ id: string; isActive: boolean }>> {
  try {
    const { userId, organizationId } = await resolveOwnerStaffContext(requestedOrgId);

    const membershipId = input.membershipId?.trim();
    if (!membershipId) {
      return { success: false, error: "Membership ID is required." };
    }

    const targetMembership = await db.organizationMembership.findUnique({
      where: { id: membershipId },
      include: { role: true, user: true },
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      return { success: false, error: "Staff member not found." };
    }

    // 1. SELF-LOCKOUT PREVENTION: Owner cannot deactivate their own membership
    if (targetMembership.userId === userId) {
      return {
        success: false,
        error: "You cannot deactivate your own access to the organization.",
      };
    }

    // 2. OWNER PROTECTION: Owners cannot be deactivated through staff management
    if (targetMembership.role.name === SYSTEM_ROLES.OWNER) {
      return {
        success: false,
        error: "Organization owners cannot be deactivated through staff administration.",
      };
    }

    const nextStatus = !targetMembership.isActive;

    // 3. Update ONLY the OrganizationMembership record. NEVER mutate User.isActive!
    const updated = await db.organizationMembership.update({
      where: { id: membershipId },
      data: { isActive: nextStatus },
      select: { id: true, isActive: true, user: { select: { name: true } } },
    });

    revalidatePath("/settings/staff");

    const statusWord = updated.isActive ? "activated" : "deactivated";

    return {
      success: true,
      data: { id: updated.id, isActive: updated.isActive },
      message: `Staff member ${updated.user.name} has been ${statusWord}.`,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to toggle staff status." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can modify staff status." };
      }
    }
    return {
      success: false,
      error: "An unexpected error occurred while toggling staff status.",
    };
  }
}

/**
 * Public/authenticated view helper: Retrieves invitation metadata by token hash without accepting it.
 */
export async function getPublicInvitationAction(
  token: string
): Promise<StaffActionResult<PublicInvitationDetailDTO>> {
  try {
    if (!token?.trim()) {
      return { success: false, error: "Invitation token is required." };
    }

    const tokenHash = hashToken(token.trim());

    const invitation = await db.organizationInvitation.findUnique({
      where: { tokenHash },
      include: {
        organization: true,
        role: true,
        branches: {
          include: { branch: true },
        },
      },
    });

    if (!invitation) {
      return { success: false, error: "Invitation not found or invalid token." };
    }

    if (invitation.status !== "PENDING") {
      return {
        success: false,
        error: `This invitation has already been ${invitation.status.toLowerCase()}.`,
      };
    }

    if (new Date() > invitation.expiresAt) {
      return { success: false, error: "This invitation has expired." };
    }

    if (!invitation.organization.isActive) {
      return { success: false, error: "The inviting organization is currently inactive." };
    }

    return {
      success: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        organizationName: invitation.organization.name,
        roleName: invitation.role.name,
        expiresAt: invitation.expiresAt.toISOString(),
        branches: invitation.branches.map((b) => ({
          branchName: b.branch.name,
          branchCode: b.branch.code,
        })),
      },
    };
  } catch {
    return {
      success: false,
      error: "An error occurred while verifying the invitation.",
    };
  }
}

/**
 * Accepts an invitation:
 * Verifies authenticated caller, validates email match, creates/reactivates OrganizationMembership,
 * applies branch assignments, and marks the invitation accepted within an atomic transaction.
 */
export async function acceptInvitationAction(
  token: string
): Promise<StaffActionResult<{ organizationId: string }>> {
  try {
    const user = await getCurrentAppUser();
    if (!user || !user.isActive) {
      return {
        success: false,
        error: "Please sign in or create an account to accept this invitation.",
      };
    }

    if (!token?.trim()) {
      return { success: false, error: "Invitation token is required." };
    }

    const tokenHash = hashToken(token.trim());

    const result = await db.$transaction(async (tx) => {
      // 1. Authoritative lookup by token hash
      const invitation = await tx.organizationInvitation.findUnique({
        where: { tokenHash },
        include: {
          organization: true,
          role: true,
          branches: true,
        },
      });

      if (!invitation) {
        throw new Error("INVITATION_NOT_FOUND");
      }

      if (invitation.status !== "PENDING") {
        throw new Error(`INVITATION_ALREADY_${invitation.status}`);
      }

      if (new Date() > invitation.expiresAt) {
        throw new Error("INVITATION_EXPIRED");
      }

      if (!invitation.organization.isActive) {
        throw new Error("ORGANIZATION_INACTIVE");
      }

      // 2. Strict identity verification: Authenticated user email must match invited email
      if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new Error("EMAIL_MISMATCH");
      }

      // 3. Upsert OrganizationMembership
      const existingMembership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: invitation.organizationId,
          },
        },
      });

      let membershipId: string;

      if (existingMembership) {
        // Reactivate membership and apply invitation's role
        const updatedMem = await tx.organizationMembership.update({
          where: { id: existingMembership.id },
          data: {
            isActive: true,
            roleId: invitation.roleId,
          },
        });
        membershipId = updatedMem.id;
      } else {
        // Create new membership with invitation's role
        const newMem = await tx.organizationMembership.create({
          data: {
            userId: user.id,
            organizationId: invitation.organizationId,
            roleId: invitation.roleId,
            isActive: true,
          },
        });
        membershipId = newMem.id;
      }

      // 4. Assign intended branches if specified
      if (invitation.branches.length > 0) {
        for (const b of invitation.branches) {
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

      // 5. Mark invitation accepted (single-use guarantee)
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
        },
      });

      return { organizationId: invitation.organizationId };
    });

    revalidatePath("/dashboard");
    revalidatePath("/settings/staff");

    return {
      success: true,
      data: result,
      message: "Invitation accepted successfully! Welcome to the team.",
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "INVITATION_NOT_FOUND") {
        return { success: false, error: "Invitation not found or invalid token." };
      }
      if (error.message.startsWith("INVITATION_ALREADY_")) {
        return { success: false, error: "This invitation is no longer valid." };
      }
      if (error.message === "INVITATION_EXPIRED") {
        return { success: false, error: "This invitation has expired." };
      }
      if (error.message === "ORGANIZATION_INACTIVE") {
        return { success: false, error: "The inviting organization is currently inactive." };
      }
      if (error.message === "EMAIL_MISMATCH") {
        return {
          success: false,
          error: "Your authenticated email does not match the email address this invitation was sent to.",
        };
      }
    }
    return {
      success: false,
      error: "An unexpected error occurred while accepting the invitation.",
    };
  }
}
