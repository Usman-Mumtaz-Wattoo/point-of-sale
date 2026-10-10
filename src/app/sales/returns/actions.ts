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
import {
  resolveTenantContext,
  TenantContextError,
  AuthRequiredError,
} from "@/lib/tenant-context";
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
 * Validates the caller's server-side authentication session and active organization membership
 * via the shared tenant context resolver.
 */
async function verifyServerActionTenantContext(
  requestedOrgId?: string,
  options?: SaleReturnServiceOptions,
  requireMutation: boolean = false
): Promise<VerifiedServerActionContext> {
  const candidateOrgId = requestedOrgId?.trim() || options?.organizationId?.trim() || undefined;
  const allowedRoles = requireMutation ? SALE_RETURN_MUTATION_ROLES : SALE_RETURN_READ_ROLES;

  const tenantContext = await resolveTenantContext(candidateOrgId, {
    requireRoles: allowedRoles,
    actorUser: options?.actorUser,
  });

  const user = (options?.actorUser !== undefined ? options.actorUser : await getCurrentAppUser()) as AppUserContext;
  if (!user) {
    throw new AuthRequiredError();
  }

  const membership =
    user.memberships.find((m) => m.id === tenantContext.membershipId) ||
    user.memberships.find((m) => m.organizationId === tenantContext.organizationId)!;

  return {
    user,
    organizationId: tenantContext.organizationId,
    role: tenantContext.role,
    membership,
  };
}

function translateSaleReturnError(error: unknown, fallbackMessage: string): string {
  if (error instanceof TenantContextError) {
    if (error.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
      return "Multiple organizations found. Please specify an organization context.";
    }
    if (error.code === "NO_ACTIVE_MEMBERSHIP") {
      return "No active organization membership found for your account.";
    }
    if (error.code === "MEMBERSHIP_NOT_FOUND") {
      return "The requested organization was not found or you do not have an active membership in it.";
    }
    if (error.code === "INACTIVE_MEMBERSHIP") {
      return "Your membership in the requested organization is inactive or disabled.";
    }
    if (error.code === "UNAUTHORIZED_ROLE") {
      return "Your role does not have permission to perform this return operation.";
    }
    if (error.code === "AUTH_REQUIRED") {
      return "Authentication required. Please sign in.";
    }
    return error.message;
  }

  if (
    error instanceof SaleReturnValidationError ||
    error instanceof SaleReturnNotFoundError ||
    error instanceof SaleReturnBranchAccessError ||
    error instanceof SaleReturnStateError ||
    error instanceof SaleReturnDuplicateItemError ||
    error instanceof SaleReturnQuantityExceededError ||
    error instanceof SaleRefundCeilingExceededError ||
    error instanceof SaleReturnIdempotencyConflictError ||
    error instanceof UnauthorizedRoleError ||
    error instanceof MembershipNotFoundError ||
    error instanceof CrossTenantViolationError ||
    error instanceof BranchNotFoundError
  ) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  console.error("Sale return action error:", error);
  return fallbackMessage;
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
    return {
      success: false,
      error: translateSaleReturnError(
        err,
        "An unexpected error occurred while looking up sale information."
      ),
    };
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
    return {
      success: false,
      error: translateSaleReturnError(
        err,
        "An unexpected error occurred while processing the sales return."
      ),
    };
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
    return {
      success: false,
      error: translateSaleReturnError(
        err,
        "An unexpected error occurred while retrieving return details."
      ),
    };
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
    return {
      success: false,
      error: translateSaleReturnError(
        err,
        "An unexpected error occurred while fetching return history."
      ),
    };
  }
}
