"use server";

import { Prisma, PurchaseStatus } from "@prisma/client";
import { getCurrentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import {
  createSupplier,
  updateSupplier,
  listSuppliers,
  SUPPLIER_MUTATION_ROLES,
  SUPPLIER_READ_ROLES,
  SupplierDuplicateError,
  SupplierValidationError,
  SupplierNotFoundError,
} from "@/lib/suppliers";
import {
  listPurchases,
  PURCHASE_READ_ROLES,
  PurchaseValidationError,
  PurchaseNotFoundError,
  type AppUserContext,
} from "@/lib/purchases";
import {
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
} from "@/lib/memberships";
import {
  type SerializedSupplier,
  type SupplierListResult,
  type SupplierActionResult,
  type CreateSupplierInputDTO,
  type UpdateSupplierInputDTO,
  type SerializedPurchaseListItem,
  type PurchaseListResult,
  type PurchaseListFilterParams,
  type PurchaseKPIs,
} from "./types";

// ============================================================================
// SERIALIZATION HELPER
// ============================================================================

function serializeData<T>(obj: unknown): T {
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
  ) as T;
}

// ============================================================================
// CONTEXT VERIFICATION (SERVER-ACTION BOUNDARY)
// ============================================================================

interface VerifiedPurchasingContext {
  user: AppUserContext;
  organizationId: string;
  role: SystemRoleName;
}

async function verifyPurchasingContext(params: {
  requestedOrgId?: string;
  requireSupplierMutation?: boolean;
}): Promise<VerifiedPurchasingContext> {
  const user = await getCurrentAppUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  const requestedOrgId = params.requestedOrgId;
  const membership = requestedOrgId
    ? user.memberships.find((m) => m.organizationId === requestedOrgId && m.isActive)
    : user.memberships.find((m) => m.isActive);

  if (!membership) {
    throw new MembershipNotFoundError(
      requestedOrgId
        ? `User has no active membership in organization "${requestedOrgId}".`
        : "User does not belong to any active organization."
    );
  }

  const role = membership.role.name as SystemRoleName;

  if (params.requireSupplierMutation) {
    if (!SUPPLIER_MUTATION_ROLES.includes(role)) {
      throw new UnauthorizedRoleError(
        `Role "${role}" is not permitted to modify suppliers. Required one of: ${SUPPLIER_MUTATION_ROLES.join(", ")}.`
      );
    }
  } else {
    if (!PURCHASE_READ_ROLES.includes(role) && !SUPPLIER_READ_ROLES.includes(role)) {
      throw new UnauthorizedRoleError(
        `Role "${role}" is not permitted to view purchasing data.`
      );
    }
  }

  return {
    user,
    organizationId: membership.organizationId,
    role,
  };
}

function translatePurchasingError(error: unknown, fallbackMessage: string): string {
  if (error instanceof SupplierDuplicateError) {
    return error.message;
  }
  if (error instanceof SupplierValidationError || error instanceof PurchaseValidationError) {
    return error.message;
  }
  if (error instanceof SupplierNotFoundError || error instanceof PurchaseNotFoundError) {
    return error.message;
  }
  if (
    error instanceof UnauthorizedRoleError ||
    error instanceof MembershipNotFoundError ||
    error instanceof CrossTenantViolationError
  ) {
    return error.message;
  }

  console.error("Purchasing action error:", error);
  return fallbackMessage;
}

// ============================================================================
// SUPPLIER ACTIONS
// ============================================================================

export async function listSuppliersAction(options?: {
  organizationId?: string;
  search?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<SupplierListResult> {
  const { user, organizationId } = await verifyPurchasingContext({
    requestedOrgId: options?.organizationId,
    requireSupplierMutation: false,
  });

  const result = await listSuppliers({
    organizationId,
    actorUser: user,
    search: options?.search,
    isActive: options?.isActive,
    limit: options?.limit,
    offset: options?.offset,
  });

  return serializeData<SupplierListResult>(result);
}

export async function createSupplierAction(
  input: CreateSupplierInputDTO,
  options?: { organizationId?: string }
): Promise<SupplierActionResult> {
  try {
    const { user, organizationId } = await verifyPurchasingContext({
      requestedOrgId: options?.organizationId,
      requireSupplierMutation: true,
    });

    const supplier = await createSupplier(input, {
      organizationId,
      actorUser: user,
    });

    return {
      success: true,
      message: `Supplier "${supplier.name}" created successfully.`,
      supplier: serializeData<SerializedSupplier>(supplier),
    };
  } catch (error) {
    return {
      success: false,
      error: translatePurchasingError(error, "Failed to create supplier."),
    };
  }
}

export async function updateSupplierAction(
  supplierId: string,
  input: UpdateSupplierInputDTO,
  options?: { organizationId?: string }
): Promise<SupplierActionResult> {
  try {
    const { user, organizationId } = await verifyPurchasingContext({
      requestedOrgId: options?.organizationId,
      requireSupplierMutation: true,
    });

    const supplier = await updateSupplier(supplierId, input, {
      organizationId,
      actorUser: user,
    });

    const actionDescription =
      input.isActive === false
        ? `Supplier "${supplier.name}" has been deactivated.`
        : input.isActive === true
        ? `Supplier "${supplier.name}" has been reactivated.`
        : `Supplier "${supplier.name}" updated successfully.`;

    return {
      success: true,
      message: actionDescription,
      supplier: serializeData<SerializedSupplier>(supplier),
    };
  } catch (error) {
    return {
      success: false,
      error: translatePurchasingError(error, "Failed to update supplier."),
    };
  }
}

// ============================================================================
// PURCHASE LIST & KPI ACTIONS
// ============================================================================

export async function listPurchasesAction(
  filters: PurchaseListFilterParams,
  options?: { organizationId?: string }
): Promise<PurchaseListResult> {
  const { user, organizationId, role } = await verifyPurchasingContext({
    requestedOrgId: options?.organizationId,
    requireSupplierMutation: false,
  });

  // Verify branch access if branchId filter is applied
  const branchId = filters.branchId?.trim() || undefined;
  if (branchId) {
    if (role !== SYSTEM_ROLES.OWNER) {
      const activeMembership = user.memberships.find(
        (m) => m.organizationId === organizationId && m.isActive
      );
      const hasBranchAccess = activeMembership?.branchMemberships.some(
        (bm) => bm.branchId === branchId && bm.branch.isActive
      );
      if (!hasBranchAccess) {
        throw new UnauthorizedRoleError("You do not have access to the selected branch.");
      }
    }
  }

  // 1. Fetch paginated purchases via existing business service
  const listResult = await listPurchases({
    organizationId,
    actorUser: user,
    search: filters.search,
    status: filters.status,
    paymentStatus: filters.paymentStatus,
    supplierId: filters.supplierId,
    branchId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    limit: filters.limit ?? 25,
    offset: filters.offset ?? 0,
  });

  // 2. Fetch server-side KPIs for this organization
  const [totalOrders, openOrders, completedOrders, financialSums] = await Promise.all([
    db.purchase.count({ where: { organizationId } }),
    db.purchase.count({
      where: {
        organizationId,
        status: { in: [PurchaseStatus.ORDERED, PurchaseStatus.PARTIALLY_RECEIVED] },
      },
    }),
    db.purchase.count({
      where: {
        organizationId,
        status: PurchaseStatus.RECEIVED,
      },
    }),
    db.purchase.aggregate({
      where: {
        organizationId,
        status: { not: PurchaseStatus.CANCELLED },
      },
      _sum: {
        totalAmount: true,
        paidAmount: true,
      },
    }),
  ]);

  const totalAmountSum = financialSums._sum.totalAmount || new Prisma.Decimal("0.00");
  const paidAmountSum = financialSums._sum.paidAmount || new Prisma.Decimal("0.00");
  const totalOutstanding = totalAmountSum.sub(paidAmountSum);

  const kpis: PurchaseKPIs = {
    totalOrders,
    openOrders,
    completedOrders,
    totalOutstanding: totalOutstanding.greaterThan(0) ? totalOutstanding.toFixed(2) : "0.00",
  };

  // 3. Map serialized purchases with balanceDue
  const mappedPurchases: SerializedPurchaseListItem[] = listResult.purchases.map((p) => {
    const totalAmount = new Prisma.Decimal(p.totalAmount);
    const paidAmount = new Prisma.Decimal(p.paidAmount);
    const balanceDue = totalAmount.sub(paidAmount).toString();

    return {
      id: p.id,
      organizationId: p.organizationId,
      purchaseNumber: p.purchaseNumber,
      branchId: p.branchId,
      supplierId: p.supplierId,
      status: p.status,
      paymentStatus: p.paymentStatus,
      orderDate: p.orderDate.toISOString(),
      expectedDate: p.expectedDate ? p.expectedDate.toISOString() : null,
      subtotal: p.subtotal.toString(),
      discountAmount: p.discountAmount.toString(),
      taxAmount: p.taxAmount.toString(),
      shippingAmount: p.shippingAmount.toString(),
      totalAmount: p.totalAmount.toString(),
      paidAmount: p.paidAmount.toString(),
      balanceDue,
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
      supplier: {
        id: p.supplier.id,
        name: p.supplier.name,
        contactPerson: p.supplier.contactPerson,
      },
      branch: {
        id: p.branch.id,
        name: p.branch.name,
        code: p.branch.code,
      },
      itemCount: p._count.items,
    };
  });

  return serializeData<PurchaseListResult>({
    purchases: mappedPurchases,
    totalCount: listResult.totalCount,
    limit: listResult.limit,
    offset: listResult.offset,
    kpis,
  });
}
