import "server-only";

import { getCurrentAppUser } from "./auth";
import { SYSTEM_ROLES, type SystemRoleName } from "./roles";

// ============================================================================
// TYPED ERROR CLASSES & CODES
// ============================================================================

export type TenantContextErrorCode =
  | "AUTH_REQUIRED"
  | "NO_ACTIVE_MEMBERSHIP"
  | "MEMBERSHIP_NOT_FOUND"
  | "INACTIVE_MEMBERSHIP"
  | "MULTIPLE_ORGS_SPECIFY_REQUIRED"
  | "UNAUTHORIZED_ROLE"
  | "OWNER_ROLE_REQUIRED";

/**
 * Base error class for tenant context resolution errors.
 * Preserves the error code both as `code` property and as the standard message
 * for complete interoperability across string-based and class-based error checks.
 */
export class TenantContextError extends Error {
  readonly code: TenantContextErrorCode;

  constructor(code: TenantContextErrorCode, message?: string) {
    super(message || code);
    this.name = "TenantContextError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthRequiredError extends TenantContextError {
  constructor(message = "AUTH_REQUIRED") {
    super("AUTH_REQUIRED", message);
    this.name = "AuthRequiredError";
  }
}

export class NoActiveMembershipError extends TenantContextError {
  constructor(message = "NO_ACTIVE_MEMBERSHIP") {
    super("NO_ACTIVE_MEMBERSHIP", message);
    this.name = "NoActiveMembershipError";
  }
}

export class MembershipNotFoundError extends TenantContextError {
  constructor(message = "MEMBERSHIP_NOT_FOUND") {
    super("MEMBERSHIP_NOT_FOUND", message);
    this.name = "MembershipNotFoundError";
  }
}

export class InactiveMembershipError extends TenantContextError {
  constructor(message = "INACTIVE_MEMBERSHIP") {
    super("INACTIVE_MEMBERSHIP", message);
    this.name = "InactiveMembershipError";
  }
}

export class MultipleOrganizationsError extends TenantContextError {
  constructor(message = "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
    super("MULTIPLE_ORGS_SPECIFY_REQUIRED", message);
    this.name = "MultipleOrganizationsError";
  }
}

export class UnauthorizedRoleError extends TenantContextError {
  constructor(
    code: "UNAUTHORIZED_ROLE" | "OWNER_ROLE_REQUIRED" = "UNAUTHORIZED_ROLE",
    message?: string
  ) {
    super(code, message || code);
    this.name = "UnauthorizedRoleError";
  }
}

// ============================================================================
// CONTEXT INTERFACES
// ============================================================================

export interface TenantMembership {
  id: string;
  organizationId: string;
  role: { id?: string; name: string };
  isActive: boolean;
  organization?: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    currency?: string | null;
    timezone?: string | null;
  } | null;
}

export interface TenantUserContext {
  id: string;
  email: string;
  name: string;
  isActive?: boolean;
  memberships: TenantMembership[];
}

export interface VerifiedTenantContext {
  userId: string;
  userEmail: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  membershipId: string;
  role: SystemRoleName;
  organization: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    currency: string | null;
    timezone: string | null;
  };
}

export interface ResolveTenantContextOptions {
  /**
   * One or more roles required in the resolved organization.
   * If specified, the user's membership in the resolved organization must hold one of these roles.
   */
  requireRoles?: readonly SystemRoleName[];

  /**
   * When true, if no requestedOrgId is provided, fallback filtering considers
   * only active memberships that satisfy `requireRoles`.
   * (e.g. for Settings where a user who is Owner in 1 org and Cashier in another
   * can safely fall back to their sole owned organization).
   * Default: false (evaluates all active organizations).
   */
  filterRolesForFallback?: boolean;

  /**
   * Optional pre-resolved user context. When omitted, resolves via `getCurrentAppUser()`.
   * Essential for isolated unit tests and internal services.
   */
  actorUser?: TenantUserContext | null;
}

// ============================================================================
// SHARED RESOLVER IMPLEMENTATION
// ============================================================================

/**
 * Resolves the authenticated user's organization context strictly enforcing
 * multi-tenant boundaries and role authorization.
 *
 * Core Security & Resolution Guarantees:
 * 1. Authenticates strictly server-side (never trusts client headers or spoofed IDs).
 * 2. If `requestedOrgId` is provided, verifies active membership in that exact organization.
 * 3. Enforces that both the membership AND the organization itself are active.
 * 4. Never uses memberships or roles from other organizations to authorize the request.
 * 5. If `requestedOrgId` is omitted:
 *    - Allows fallback if user has exactly one active organization (or one active owned org when filterRolesForFallback is true).
 *    - Rejects with `MULTIPLE_ORGS_SPECIFY_REQUIRED` if user belongs to multiple active organizations.
 *    - Rejects with `NO_ACTIVE_MEMBERSHIP` (or `OWNER_ROLE_REQUIRED`) if user has no active organizations.
 * 6. Never silently falls back to an arbitrary organization when an explicit ID is invalid or inaccessible.
 */
export async function resolveTenantContext(
  requestedOrgId?: string | null,
  options?: ResolveTenantContextOptions
): Promise<VerifiedTenantContext> {
  const user = options?.actorUser !== undefined ? options.actorUser : await getCurrentAppUser();
  if (!user || user.isActive === false) {
    throw new AuthRequiredError();
  }

  const rawCandidate = requestedOrgId !== undefined && requestedOrgId !== null ? String(requestedOrgId).trim() : "";
  const candidateOrgId = rawCandidate.length > 0 ? rawCandidate : undefined;

  let selectedMembership: TenantMembership;

  if (candidateOrgId) {
    // 1. Explicit organization requested: lookup strictly within user's memberships
    const membership = user.memberships.find((m) => m.organizationId === candidateOrgId);
    if (!membership) {
      throw new MembershipNotFoundError();
    }

    if (!membership.isActive || !membership.organization || !membership.organization.isActive) {
      throw new InactiveMembershipError();
    }

    selectedMembership = membership;
  } else {
    // 2. No organization specified: evaluate active memberships in active organizations
    const allActiveMemberships = user.memberships.filter(
      (m) => m.isActive && m.organization && m.organization.isActive
    );

    if (allActiveMemberships.length === 0) {
      throw new NoActiveMembershipError();
    }

    if (options?.filterRolesForFallback && options.requireRoles && options.requireRoles.length > 0) {
      // Filter active memberships that satisfy required roles for fallback
      const roleMatchingMemberships = allActiveMemberships.filter((m) =>
        options.requireRoles!.includes(m.role.name as SystemRoleName)
      );

      if (roleMatchingMemberships.length === 0) {
        const isOwnerOnly =
          options.requireRoles.length === 1 && options.requireRoles.includes(SYSTEM_ROLES.OWNER);
        throw new UnauthorizedRoleError(
          isOwnerOnly ? "OWNER_ROLE_REQUIRED" : "UNAUTHORIZED_ROLE"
        );
      }

      if (roleMatchingMemberships.length > 1) {
        throw new MultipleOrganizationsError();
      }

      selectedMembership = roleMatchingMemberships[0];
    } else {
      // Standard resolution: evaluate all active memberships
      if (allActiveMemberships.length > 1) {
        throw new MultipleOrganizationsError();
      }

      selectedMembership = allActiveMemberships[0];
    }
  }

  // 3. Enforce required roles against the selected organization's membership
  const userRole = selectedMembership.role.name as SystemRoleName;
  if (options?.requireRoles && options.requireRoles.length > 0) {
    if (!options.requireRoles.includes(userRole)) {
      const isOwnerOnly =
        options.requireRoles.length === 1 && options.requireRoles.includes(SYSTEM_ROLES.OWNER);
      throw new UnauthorizedRoleError(
        isOwnerOnly ? "OWNER_ROLE_REQUIRED" : "UNAUTHORIZED_ROLE"
      );
    }
  }

  const org = selectedMembership.organization!;

  return {
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    organizationId: selectedMembership.organizationId,
    organizationName: org.name,
    organizationSlug: org.slug,
    membershipId: selectedMembership.id,
    role: userRole,
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      isActive: org.isActive,
      currency: org.currency ?? null,
      timezone: org.timezone ?? null,
    },
  };
}

/**
 * Convenient wrapper for owner-authorized actions (e.g. Organization Settings, Staff Management).
 * Enforces the OWNER role and preserves single-owned organization fallback for multi-org users.
 */
export async function resolveOwnerTenantContext(
  requestedOrgId?: string | null,
  options?: Omit<ResolveTenantContextOptions, "requireRoles" | "filterRolesForFallback">
): Promise<VerifiedTenantContext> {
  return resolveTenantContext(requestedOrgId, {
    ...options,
    requireRoles: [SYSTEM_ROLES.OWNER],
    filterRolesForFallback: true,
  });
}
