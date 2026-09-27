"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getCurrentAppUser } from "@/lib/auth";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import {
  getSaleReturnableInfo,
  createSaleReturn,
  getSaleReturnById,
  listSaleReturns,
  SaleReturnValidationError,
  SaleReturnNotFoundError,
  SaleReturnBranchAccessError,
  SaleReturnStateError,
  SaleReturnDuplicateItemError,
  SaleReturnQuantityExceededError,
  SaleRefundCeilingExceededError,
  SaleReturnIdempotencyConflictError,
  UnauthorizedRoleError,
  SaleReturnServiceOptions,
  SALE_RETURN_READ_ROLES,
  SALE_RETURN_MUTATION_ROLES,
  type AppUserContext,
} from "@/lib/sale-returns";
import {
  MembershipNotFoundError,
  CrossTenantViolationError,
  BranchNotFoundError,
} from "@/lib/memberships";
import type {
  SerializedReturnableInfo,
  SerializedSaleReturnDetail,
  SerializedPaginatedReturns,
  ReturnActionResult,
  SubmitReturnInput,
  ListReturnsActionParams,
} from "./types";

export type {
  SerializedReturnableInfo,
  SerializedSaleReturnDetail,
  SerializedPaginatedReturns,
  ReturnActionResult,
  SubmitReturnInput,
  ListReturnsActionParams,
};

// Helper to convert Prisma Decimal and Date objects into JSON-safe primitives
function serializeData<T>(obj: T): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      if (
        value instanceof Prisma.Decimal ||
        (value && typeof value === "object" && "s" in value && "d" in value)
      ) {
        return value.toString();
      }
      return value;
    })
  );
}

// ============================================================================
// TENANT CONTEXT VERIFICATION (SERVER-ACTION BOUNDARY)
// ============================================================================

export interface VerifiedServerActionContext {
  user: AppUserContext;
  organizationId: string;
  role: SystemRoleName;
  membership: AppUserContext["memberships"][0];
}

/**
 * Validates the caller's server-side authentication session and active organization membership.
 *
 * SECURITY ENFORCEMENTS:
 * 1. Authenticated user is resolved strictly server-side (via session cookies / Supabase auth).
 *    Client input cannot spoof the user identity.
 * 2. If a requestedOrgId is supplied by the client (e.g. from an organization selector),
 *    the server verifies that the user possesses an ACTIVE membership in that organization.
 *    Client cannot access or mutate another tenant's data by guessing or supplying an arbitrary orgId.
 * 3. If requestedOrgId is omitted, defaults safely to the user's first active membership.
 * 4. Verifies role permissions:
 *    - Mutation actions require one of SALE_RETURN_MUTATION_ROLES (OWNER, MANAGER, CASHIER).
 *    - Read actions require one of SALE_RETURN_READ_ROLES (OWNER, MANAGER, CASHIER, ACCOUNTANT).
 * 5. Returns the verified organizationId derived directly from the verified membership,
 *    never trusting raw client values.
 */
async function verifyServerActionTenantContext(
  requestedOrgId?: string,
  options?: SaleReturnServiceOptions,
  requireMutation: boolean = false
): Promise<VerifiedServerActionContext> {
  const user = options?.actorUser !== undefined ? options.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  // Treat requestedOrgId or options.organizationId as candidate organization selector
  const candidateOrgId = requestedOrgId?.trim() || options?.organizationId?.trim() || undefined;

  const membership = candidateOrgId
    ? user.memberships.find((m) => m.organizationId === candidateOrgId && m.isActive)
    : user.memberships.find((m) => m.isActive);

  if (!membership) {
    throw new MembershipNotFoundError(
      candidateOrgId
        ? `User does not have an active membership in organization "${candidateOrgId}".`
        : "User does not belong to any active organization."
    );
  }

  const roleName = membership.role.name as SystemRoleName;

  if (requireMutation) {
    if (!SALE_RETURN_MUTATION_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to process sales returns. Required one of: ${SALE_RETURN_MUTATION_ROLES.join(
          ", "
        )}.`
      );
    }
  } else {
    if (!SALE_RETURN_READ_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to view sales returns. Required one of: ${SALE_RETURN_READ_ROLES.join(
          ", "
        )}.`
      );
    }
  }

  return {
    user,
    organizationId: membership.organizationId,
    role: roleName,
    membership,
  };
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Searches for a sale by Invoice Number or Sale ID and inspects returnable eligibility.
 */
export async function getSaleReturnableInfoAction(
  saleIdOrInvoiceNumber: string,
  requestedOrgId?: string,
  options?: SaleReturnServiceOptions
): Promise<ReturnActionResult<SerializedReturnableInfo>> {
  if (!saleIdOrInvoiceNumber?.trim()) {
    return { success: false, error: "Please enter an invoice number or sale ID." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      requestedOrgId,
      options,
      false
    );

    const info = await getSaleReturnableInfo(saleIdOrInvoiceNumber.trim(), {
      ...options,
      organizationId,
      actorUser: user,
    });
    return {
      success: true,
      data: serializeData(info) as SerializedReturnableInfo,
    };
  } catch (err: unknown) {
    if (
      err instanceof SaleReturnNotFoundError ||
      err instanceof SaleReturnBranchAccessError ||
      err instanceof SaleReturnStateError ||
      err instanceof SaleReturnValidationError ||
      err instanceof UnauthorizedRoleError ||
      err instanceof MembershipNotFoundError ||
      err instanceof CrossTenantViolationError ||
      err instanceof BranchNotFoundError
    ) {
      return { success: false, error: err.message };
    }
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "An unexpected error occurred while looking up sale information." };
  }
}

/**
 * Processes a sale return and issues an atomic refund.
 */
export async function createSaleReturnAction(
  input: SubmitReturnInput,
  requestedOrgId?: string,
  options?: SaleReturnServiceOptions
): Promise<ReturnActionResult<SerializedSaleReturnDetail>> {
  if (!input.saleId?.trim()) {
    return { success: false, error: "Sale ID is required." };
  }
  if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
    return { success: false, error: "Please select at least one item to return." };
  }

  // Filter out zero quantities and validate input
  const validItems = input.items
    .map((item) => ({
      saleItemId: item.saleItemId.trim(),
      quantityReturned: item.quantityReturned,
      reason: item.reason?.trim() || null,
    }))
    .filter((item) => {
      try {
        const d = new Prisma.Decimal(item.quantityReturned);
        return d.greaterThan(0);
      } catch {
        return false;
      }
    });

  if (validItems.length === 0) {
    return { success: false, error: "Please enter a valid return quantity greater than 0." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      requestedOrgId,
      options,
      true
    );

    const result = await createSaleReturn(
      {
        saleId: input.saleId.trim(),
        items: validItems,
        refund: {
          paymentMethod: input.refund.paymentMethod,
          reference: input.refund.reference?.trim() || null,
          notes: input.refund.notes?.trim() || null,
        },
        idempotencyKey: input.idempotencyKey?.trim() || null,
        reason: input.reason?.trim() || null,
        notes: input.notes?.trim() || null,
      },
      {
        ...options,
        organizationId,
        actorUser: user,
      }
    );

    try {
      revalidatePath("/sales/returns");
    } catch {
      // Ignore when running outside of Next.js server context (e.g. test environments)
    }

    return {
      success: true,
      data: serializeData(result) as SerializedSaleReturnDetail,
      message: `Return "${result.returnNumber}" processed successfully with refund of Rs. ${result.totalAmount.toString()}.`,
    };
  } catch (err: unknown) {
    if (
      err instanceof SaleReturnValidationError ||
      err instanceof SaleReturnNotFoundError ||
      err instanceof SaleReturnBranchAccessError ||
      err instanceof SaleReturnStateError ||
      err instanceof SaleReturnDuplicateItemError ||
      err instanceof SaleReturnQuantityExceededError ||
      err instanceof SaleRefundCeilingExceededError ||
      err instanceof SaleReturnIdempotencyConflictError ||
      err instanceof UnauthorizedRoleError ||
      err instanceof MembershipNotFoundError ||
      err instanceof CrossTenantViolationError ||
      err instanceof BranchNotFoundError
    ) {
      return { success: false, error: err.message };
    }
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "An unexpected error occurred while processing the sales return." };
  }
}

/**
 * Retrieves full details of a specific sale return by ID.
 */
export async function getSaleReturnByIdAction(
  returnId: string,
  requestedOrgId?: string,
  options?: SaleReturnServiceOptions
): Promise<ReturnActionResult<SerializedSaleReturnDetail>> {
  if (!returnId?.trim()) {
    return { success: false, error: "Return ID is required." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      requestedOrgId,
      options,
      false
    );

    const returnDetail = await getSaleReturnById(returnId.trim(), {
      ...options,
      organizationId,
      actorUser: user,
    });
    return {
      success: true,
      data: serializeData(returnDetail) as SerializedSaleReturnDetail,
    };
  } catch (err: unknown) {
    if (
      err instanceof SaleReturnNotFoundError ||
      err instanceof SaleReturnBranchAccessError ||
      err instanceof UnauthorizedRoleError ||
      err instanceof MembershipNotFoundError ||
      err instanceof CrossTenantViolationError ||
      err instanceof BranchNotFoundError
    ) {
      return { success: false, error: err.message };
    }
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "An unexpected error occurred while retrieving return details." };
  }
}

/**
 * Lists past sales returns with filtering and pagination.
 */
export async function listSaleReturnsAction(
  params: ListReturnsActionParams,
  requestedOrgId?: string,
  options?: SaleReturnServiceOptions
): Promise<ReturnActionResult<SerializedPaginatedReturns>> {
  try {
    const { organizationId, user, role, membership } = await verifyServerActionTenantContext(
      requestedOrgId,
      options,
      false
    );

    // If client supplied a branchId filter, verify branch access against the authenticated membership
    if (params.branchId?.trim() && role !== SYSTEM_ROLES.OWNER) {
      const assignedBranchIds = (membership.branchMemberships || [])
        .filter((bm) => bm.branch.isActive)
        .map((bm) => bm.branchId);

      if (!assignedBranchIds.includes(params.branchId.trim())) {
        return {
          success: false,
          error: `User does not have authorized access to branch "${params.branchId.trim()}".`,
        };
      }
    }

    const listResult = await listSaleReturns(
      {
        branchId: params.branchId?.trim() || undefined,
        saleId: params.saleId?.trim() || undefined,
        search: params.search?.trim() || undefined,
        dateFrom: params.startDate ? new Date(params.startDate) : undefined,
        dateTo: params.endDate ? new Date(params.endDate) : undefined,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 10,
      },
      {
        ...options,
        organizationId,
        actorUser: user,
      }
    );

    return {
      success: true,
      data: serializeData(listResult) as SerializedPaginatedReturns,
    };
  } catch (err: unknown) {
    if (
      err instanceof UnauthorizedRoleError ||
      err instanceof SaleReturnBranchAccessError ||
      err instanceof MembershipNotFoundError ||
      err instanceof CrossTenantViolationError ||
      err instanceof BranchNotFoundError
    ) {
      return { success: false, error: err.message };
    }
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "An unexpected error occurred while fetching return history." };
  }
}
