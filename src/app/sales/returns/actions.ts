"use server";

import { revalidatePath } from "next/cache";
import { Prisma, SalePaymentMethod, SaleStatus, SalePaymentStatus } from "@prisma/client";
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
} from "@/lib/sale-returns";
import {
  MembershipNotFoundError,
  CrossTenantViolationError,
  BranchNotFoundError,
} from "@/lib/memberships";

// ============================================================================
// SERIALIZED ACTION TYPES
// ============================================================================

export interface SerializedReturnableItem {
  saleItemId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string | null;
  quantitySold: string;
  quantityAlreadyReturned: string;
  quantityReturnable: string;
  unitPrice: string;
  unitCost: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
  totalRefundableAmount: string;
  amountAlreadyReturned: string;
  amountRemainingRefundable: string;
}

export interface SerializedReturnableInfo {
  saleId: string;
  invoiceNumber: string;
  saleDate: string;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  totalAmount: string;
  paidAmount: string;
  totalRefundedAmount: string;
  remainingRefundCeiling: string;
  isEligibleForReturn: boolean;
  ineligibilityReason: string | null;
  branch: {
    id: string;
    name: string;
    code: string;
  };
  customer: {
    id: string;
    name: string;
    code: string | null;
    phone: string | null;
  } | null;
  cashier: {
    id: string;
    name: string;
  } | null;
  items: SerializedReturnableItem[];
}

export interface SerializedReturnItemDetail {
  id: string;
  saleItemId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string | null;
  quantityReturned: string;
  unitPrice: string;
  unitCost: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  subtotal: string;
  lineTotal: string;
  reason: string | null;
}

export interface SerializedRefundDetail {
  id: string;
  refundNumber: string;
  amount: string;
  paymentMethod: SalePaymentMethod;
  reference: string | null;
  notes: string | null;
  refundedAt: string;
  processedBy: {
    id: string;
    name: string;
    email: string;
  };
}

export interface SerializedSaleReturnDetail {
  id: string;
  returnNumber: string;
  organizationId: string;
  branchId: string;
  saleId: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  refundedAmount: string;
  reason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  sale: {
    id: string;
    invoiceNumber: string;
    saleDate: string;
    totalAmount: string;
    paidAmount: string;
    customerId: string | null;
    customer: {
      id: string;
      name: string;
      code: string | null;
      phone: string | null;
    } | null;
  };
  branch: {
    id: string;
    name: string;
    code: string;
  };
  returnedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  items: SerializedReturnItemDetail[];
  refunds: SerializedRefundDetail[];
}

export interface SerializedPaginatedReturns {
  items: SerializedSaleReturnDetail[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ReturnActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SubmitReturnItemInput {
  saleItemId: string;
  quantityReturned: string | number;
  reason?: string | null;
}

export interface SubmitReturnInput {
  saleId: string;
  items: SubmitReturnItemInput[];
  refund: {
    paymentMethod: SalePaymentMethod;
    reference?: string | null;
    notes?: string | null;
  };
  idempotencyKey?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface ListReturnsActionParams {
  branchId?: string;
  saleId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

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
// SERVER ACTIONS
// ============================================================================

/**
 * Searches for a sale by Invoice Number or Sale ID and inspects returnable eligibility.
 */
export async function getSaleReturnableInfoAction(
  saleIdOrInvoiceNumber: string,
  organizationId?: string,
  options?: SaleReturnServiceOptions
): Promise<ReturnActionResult<SerializedReturnableInfo>> {
  if (!saleIdOrInvoiceNumber?.trim()) {
    return { success: false, error: "Please enter an invoice number or sale ID." };
  }

  try {
    const info = await getSaleReturnableInfo(saleIdOrInvoiceNumber.trim(), {
      ...options,
      organizationId,
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
  organizationId?: string,
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
      { ...options, organizationId }
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
  organizationId?: string,
  options?: SaleReturnServiceOptions
): Promise<ReturnActionResult<SerializedSaleReturnDetail>> {
  if (!returnId?.trim()) {
    return { success: false, error: "Return ID is required." };
  }

  try {
    const returnDetail = await getSaleReturnById(returnId.trim(), {
      ...options,
      organizationId,
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
  organizationId?: string,
  options?: SaleReturnServiceOptions
): Promise<ReturnActionResult<SerializedPaginatedReturns>> {
  try {
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
      { ...options, organizationId }
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
