import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { SYSTEM_ROLES, type SystemRoleName } from "./roles";

export class CrossTenantViolationError extends Error {
  constructor(message = "Multi-tenant violation: Cannot assign a branch from a different organization.") {
    super(message);
    this.name = "CrossTenantViolationError";
  }
}

export class MembershipNotFoundError extends Error {
  constructor(message = "Organization membership not found.") {
    super(message);
    this.name = "MembershipNotFoundError";
  }
}

export class BranchNotFoundError extends Error {
  constructor(message = "Branch not found.") {
    super(message);
    this.name = "BranchNotFoundError";
  }
}

export class UnauthorizedRoleError extends Error {
  constructor(message = "User does not have the required role.") {
    super(message);
    this.name = "UnauthorizedRoleError";
  }
}

/**
 * Assigns a branch to an organization membership after strictly verifying
 * that both the membership and the branch belong to the same organization.
 *
 * This server-side validation guarantees that cross-tenant branch assignments are impossible.
 */
export async function assignBranchMembership(params: {
  organizationMembershipId: string;
  branchId: string;
}) {
  const { organizationMembershipId, branchId } = params;

  // 1. Fetch the organization membership to determine its tenant (organizationId)
  const membership = await db.organizationMembership.findUnique({
    where: { id: organizationMembershipId },
    select: { id: true, organizationId: true, isActive: true },
  });

  if (!membership) {
    throw new MembershipNotFoundError(`Membership with id "${organizationMembershipId}" does not exist.`);
  }

  // 2. Fetch the target branch to determine its tenant (organizationId)
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { id: true, organizationId: true, isActive: true },
  });

  if (!branch) {
    throw new BranchNotFoundError(`Branch with id "${branchId}" does not exist.`);
  }

  // 3. ENFORCE MULTI-TENANT BOUNDARY:
  // An organization membership can NEVER be granted access to a branch belonging to another organization.
  if (membership.organizationId !== branch.organizationId) {
    throw new CrossTenantViolationError(
      `Multi-tenant violation: Membership organization (${membership.organizationId}) does not match Branch organization (${branch.organizationId}).`
    );
  }

  // 4. Create the branch membership record (or return existing if already assigned)
  return db.branchMembership.upsert({
    where: {
      organizationMembershipId_branchId: {
        organizationMembershipId,
        branchId,
      },
    },
    create: {
      organizationMembershipId,
      branchId,
    },
    update: {},
    include: {
      branch: true,
      organizationMembership: {
        include: {
          role: true,
          user: true,
        },
      },
    },
  });
}

/**
 * Removes branch access for an organization membership.
 */
export async function removeBranchMembership(params: {
  organizationMembershipId: string;
  branchId: string;
}) {
  return db.branchMembership.deleteMany({
    where: {
      organizationMembershipId: params.organizationMembershipId,
      branchId: params.branchId,
    },
  });
}

/**
 * Retrieves a user's active membership in an organization, including their role and branch memberships.
 */
export async function getOrganizationMembership(params: {
  userId: string;
  organizationId: string;
  tx?: Prisma.TransactionClient;
}) {
  const client = params.tx ?? db;
  return client.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: params.userId,
        organizationId: params.organizationId,
      },
    },
    include: {
      role: true,
      organization: true,
      branchMemberships: {
        include: {
          branch: true,
        },
      },
    },
  });
}

/**
 * Asserts that a user has an active membership in the target organization.
 * Throws MembershipNotFoundError if not found or inactive.
 */
export async function requireOrganizationMembership(params: {
  userId: string;
  organizationId: string;
  tx?: Prisma.TransactionClient;
}) {
  const membership = await getOrganizationMembership(params);

  if (!membership || !membership.isActive) {
    throw new MembershipNotFoundError(
      `User "${params.userId}" has no active membership in organization "${params.organizationId}".`
    );
  }

  return membership;
}

/**
 * Asserts that a user holds one of the allowed roles within the organization.
 */
export async function requireRole(params: {
  userId: string;
  organizationId: string;
  allowedRoles: readonly (SystemRoleName | string)[];
  tx?: Prisma.TransactionClient;
}) {
  const membership = await requireOrganizationMembership({
    userId: params.userId,
    organizationId: params.organizationId,
    tx: params.tx,
  });

  if (!params.allowedRoles.includes(membership.role.name)) {
    throw new UnauthorizedRoleError(
      `Role "${membership.role.name}" is not permitted. Required one of: ${params.allowedRoles.join(", ")}.`
    );
  }

  return membership;
}

/**
 * Checks if a user has access to a specific branch within an organization.
 * Owners have automatic organization-wide access; other roles require an explicit BranchMembership.
 */
export async function checkBranchAccess(params: {
  userId: string;
  organizationId: string;
  branchId: string;
  tx?: Prisma.TransactionClient;
}): Promise<boolean> {
  const client = params.tx ?? db;
  const membership = await getOrganizationMembership({
    userId: params.userId,
    organizationId: params.organizationId,
    tx: client,
  });

  if (!membership || !membership.isActive) {
    return false;
  }

  // System OWNER role has organization-wide access across all branches
  if (membership.role.name === SYSTEM_ROLES.OWNER) {
    // Verify branch belongs to this organization
    const branch = await client.branch.findUnique({
      where: { id: params.branchId },
      select: { organizationId: true, isActive: true },
    });
    return branch?.organizationId === params.organizationId && branch.isActive;
  }

  // Other roles must have an explicit BranchMembership
  const hasBranchMembership = membership.branchMemberships.some(
    (bm) => bm.branchId === params.branchId && bm.branch.isActive
  );

  return hasBranchMembership;
}
