"use server";

import { revalidatePath } from "next/cache";
import { Prisma, SaleStatus as PrismaSaleStatus, SalePaymentStatus as PrismaSalePaymentStatus } from "@prisma/client";
import { getCurrentAppUser } from "@/lib/auth";
import { type SystemRoleName } from "@/lib/roles";
import {
  listSales,
  getSaleById,
  voidSale,
  SALE_READ_ROLES,
  SALE_VOID_ROLES,
  SaleValidationError,
  SaleNotFoundError,
  SaleStateError,
  SaleBranchAccessError,
  SaleHasReturnsError,
  SalePaymentError,
  SaleCustomerInactiveError,
  type AppUserContext,
  type SaleServiceOptions,
  type ListSalesInput,
} from "@/lib/sales";
import {
  MembershipNotFoundError,
  CrossTenantViolationError,
  UnauthorizedRoleError,
  BranchNotFoundError,
} from "@/lib/memberships";
import {
  resolveTenantContext,
  TenantContextError,
  AuthRequiredError,
} from "@/lib/tenant-context";
import type {
  SerializedPaginatedSales,
  SerializedSaleDetail,
  SerializedVoidSaleResult,
  SaleActionResult,
  ListSalesActionParams,
  VoidSaleActionInput,
} from "./types";

export type {
  SerializedPaginatedSales,
  SerializedSaleDetail,
  SerializedVoidSaleResult,
  SaleActionResult,
  ListSalesActionParams,
  VoidSaleActionInput,
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
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    })
  );
}

// ============================================================================
// TENANT CONTEXT VERIFICATION (SERVER-ACTION BOUNDARY)
// ============================================================================

export interface VerifiedServerActionSalesContext {
  user: AppUserContext;
  organizationId: string;
  role: SystemRoleName;
  membership: AppUserContext["memberships"][0];
}

/**
 * Validates caller authentication session and organization membership via shared tenant resolver.
 */
async function verifyServerActionSalesContext(
  requestedOrgId?: string,
  options?: SaleServiceOptions,
  requireVoidPermission: boolean = false
): Promise<VerifiedServerActionSalesContext> {
  const candidateOrgId = requestedOrgId?.trim() || options?.organizationId?.trim() || undefined;
  const requiredRoles = requireVoidPermission ? SALE_VOID_ROLES : SALE_READ_ROLES;

  const tenantContext = await resolveTenantContext(candidateOrgId, {
    requireRoles: requiredRoles,
    actorUser: options?.actorUser,
  });

  const user = options?.actorUser !== undefined ? options.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new AuthRequiredError();
  }

  const membership =
    user.memberships.find((m) => m.id === tenantContext.membershipId) ||
    user.memberships.find((m) => m.organizationId === tenantContext.organizationId)!;

  return {
    user: user as AppUserContext,
    organizationId: tenantContext.organizationId,
    role: tenantContext.role,
    membership,
  };
}

function translateSalesError(error: unknown, fallbackMessage: string): string {
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
      return "Your role does not have permission to perform this sales operation.";
    }
    if (error.code === "AUTH_REQUIRED") {
      return "Authentication required. Please sign in.";
    }
    return error.message;
  }

  if (
    error instanceof SaleValidationError ||
    error instanceof SaleNotFoundError ||
    error instanceof SaleBranchAccessError ||
    error instanceof SaleStateError ||
    error instanceof SaleHasReturnsError ||
    error instanceof SalePaymentError ||
    error instanceof SaleCustomerInactiveError ||
    error instanceof UnauthorizedRoleError ||
    error instanceof MembershipNotFoundError ||
    error instanceof CrossTenantViolationError ||
    error instanceof BranchNotFoundError
  ) {
    return error.message;
  }

  console.error("Sales action error:", error);
  return fallbackMessage;
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Lists sales with deterministic pagination, multi-attribute filtering, and KPI aggregations.
 * Enforces server-side tenant isolation and branch authorization.
 */
export async function listSalesAction(
  params?: ListSalesActionParams,
  requestedOrgId?: string,
  options?: SaleServiceOptions
): Promise<SaleActionResult<SerializedPaginatedSales>> {
  try {
    const { organizationId, user } = await verifyServerActionSalesContext(
      requestedOrgId,
      options,
      false
    );

    // Validate and sanitize input params
    const sanitizedInput: ListSalesInput = {};

    if (params?.branchId?.trim()) {
      sanitizedInput.branchId = params.branchId.trim();
    }

    if (params?.status) {
      const validStatuses = Object.values(PrismaSaleStatus);
      if (!validStatuses.includes(params.status as PrismaSaleStatus)) {
        return {
          success: false,
          error: `Invalid status "${params.status}". Allowed values: ${validStatuses.join(", ")}.`,
        };
      }
      sanitizedInput.status = params.status as PrismaSaleStatus;
    }

    if (params?.paymentStatus) {
      const validPaymentStatuses = Object.values(PrismaSalePaymentStatus);
      if (!validPaymentStatuses.includes(params.paymentStatus as PrismaSalePaymentStatus)) {
        return {
          success: false,
          error: `Invalid paymentStatus "${params.paymentStatus}". Allowed values: ${validPaymentStatuses.join(", ")}.`,
        };
      }
      sanitizedInput.paymentStatus = params.paymentStatus as PrismaSalePaymentStatus;
    }

    if (params?.cashierId?.trim()) {
      sanitizedInput.cashierId = params.cashierId.trim();
    }

    if (params?.customerId?.trim()) {
      sanitizedInput.customerId = params.customerId.trim();
    }

    if (params?.startDate?.trim()) {
      const parsedStart = new Date(params.startDate.trim());
      if (isNaN(parsedStart.getTime())) {
        return { success: false, error: "Invalid start date format." };
      }
      sanitizedInput.dateFrom = parsedStart;
    }

    if (params?.endDate?.trim()) {
      const parsedEnd = new Date(params.endDate.trim());
      if (isNaN(parsedEnd.getTime())) {
        return { success: false, error: "Invalid end date format." };
      }
      sanitizedInput.dateTo = parsedEnd;
    }

    if (params?.search?.trim()) {
      const searchClean = params.search.trim();
      if (searchClean.length > 100) {
        return { success: false, error: "Search query cannot exceed 100 characters." };
      }
      sanitizedInput.search = searchClean;
    }

    if (params?.page !== undefined && params?.page !== null) {
      const parsedPage = Math.floor(Number(params.page));
      if (isNaN(parsedPage) || parsedPage < 1) {
        return { success: false, error: "Page must be an integer greater than or equal to 1." };
      }
      sanitizedInput.page = parsedPage;
    }

    if (params?.pageSize !== undefined && params?.pageSize !== null) {
      const parsedPageSize = Math.floor(Number(params.pageSize));
      if (isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
        return { success: false, error: "PageSize must be an integer between 1 and 100." };
      }
      sanitizedInput.pageSize = parsedPageSize;
    }

    const result = await listSales(sanitizedInput, {
      ...options,
      organizationId,
      actorUser: user,
    });

    return {
      success: true,
      data: serializeData(result) as SerializedPaginatedSales,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: translateSalesError(
        err,
        "An unexpected error occurred while listing sales orders. Please try again."
      ),
    };
  }
}

/**
 * Retrieves comprehensive sale details for the inspection drawer and receipt view.
 * Strictly scopes query to authenticated organization and verifies branch authorization.
 */
export async function getSaleDetailAction(
  saleId: string,
  requestedOrgId?: string,
  options?: SaleServiceOptions
): Promise<SaleActionResult<SerializedSaleDetail>> {
  if (!saleId || typeof saleId !== "string" || !saleId.trim()) {
    return { success: false, error: "Sale ID is required." };
  }

  const cleanSaleId = saleId.trim();
  if (cleanSaleId.length > 100) {
    return { success: false, error: "Invalid Sale ID." };
  }

  try {
    const { organizationId, user } = await verifyServerActionSalesContext(
      requestedOrgId,
      options,
      false
    );

    const sale = await getSaleById(cleanSaleId, {
      ...options,
      organizationId,
      actorUser: user,
    });

    return {
      success: true,
      data: serializeData(sale) as SerializedSaleDetail,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: translateSalesError(
        err,
        "An unexpected error occurred while loading the sale details. Please try again."
      ),
    };
  }
}

/**
 * Safely voids an already COMPLETED sale.
 *
 * SAFEGUARDS ENFORCED:
 * 1. Role must be OWNER or MANAGER (CASHIER and ACCOUNTANT are rejected).
 * 2. Caller must have authorized access to the sale's branch.
 * 3. Sale status must currently be COMPLETED (cannot void DRAFT or VOIDED sales).
 * 4. Must NOT have any existing SaleReturn records (prevents inventory/accounting double-refund).
 * 5. Restores inventory stock deterministically via ADJUSTMENT_IN movements.
 * 6. Preserves original SaleItem and SalePayment historical financial records intact.
 * 7. Revalidates relevant Next.js cache paths.
 */
export async function voidSaleAction(
  input: VoidSaleActionInput,
  requestedOrgId?: string,
  options?: SaleServiceOptions
): Promise<SaleActionResult<SerializedVoidSaleResult>> {
  if (!input || typeof input !== "object") {
    return { success: false, error: "Invalid void sale request payload." };
  }

  if (!input.saleId || typeof input.saleId !== "string" || !input.saleId.trim()) {
    return { success: false, error: "Sale ID is required to void a sale." };
  }

  const cleanSaleId = input.saleId.trim();
  if (cleanSaleId.length > 100) {
    return { success: false, error: "Invalid Sale ID." };
  }

  const cleanReason = input.reason?.trim() || undefined;
  if (cleanReason && cleanReason.length > 255) {
    return { success: false, error: "Void reason cannot exceed 255 characters." };
  }

  try {
    const { organizationId, user } = await verifyServerActionSalesContext(
      requestedOrgId,
      options,
      true // Requires OWNER or MANAGER
    );

    const voidResult = await voidSale(cleanSaleId, {
      ...options,
      organizationId,
      actorUser: user,
      reason: cleanReason,
    });

    // Revalidate affected views
    try {
      revalidatePath("/sales");
      revalidatePath("/inventory");
      revalidatePath("/pos");
      revalidatePath("/dashboard");
    } catch {
      // Revalidation may fail in test environments where next/cache headers are not present
    }

    return {
      success: true,
      data: serializeData(voidResult) as SerializedVoidSaleResult,
      message: `Sale ${voidResult.invoiceNumber} has been successfully voided. Stock has been restored.`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: translateSalesError(
        err,
        "An unexpected error occurred while voiding the sale. Please try again."
      ),
    };
  }
}
