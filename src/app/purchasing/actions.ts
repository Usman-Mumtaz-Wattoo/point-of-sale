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
  createPurchase,
  updatePurchase,
  getPurchaseById,
  markPurchaseOrdered,
  cancelPurchase,
  listPurchases,
  PURCHASE_READ_ROLES,
  PURCHASE_MUTATION_ROLES,
  PurchaseValidationError,
  PurchaseNotFoundError,
  PurchaseStateError,
  type AppUserContext,
} from "@/lib/purchases";
import { listReceiptsForPurchase } from "@/lib/purchase-receiving";
import { listPaymentsForPurchase } from "@/lib/purchase-payments";
import { listPurchaseReturnsForPurchase } from "@/lib/purchase-returns";
import {
  checkBranchAccess,
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
  type SelectablePurchasingCatalogItem,
  type CreatePurchaseInputDTO,
  type UpdatePurchaseInputDTO,
  type SerializedPurchaseDetailDTO,
  type PurchaseDetailActionResult,
  type PurchaseMutationActionResult,
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
  requirePurchaseMutation?: boolean;
  actorUser?: AppUserContext | null;
}): Promise<VerifiedPurchasingContext> {
  const user = params.actorUser !== undefined ? params.actorUser : await getCurrentAppUser();
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
  } else if (params.requirePurchaseMutation) {
    if (!PURCHASE_MUTATION_ROLES.includes(role)) {
      throw new UnauthorizedRoleError(
        `Role "${role}" is not permitted to modify purchase orders. Required one of: ${PURCHASE_MUTATION_ROLES.join(", ")}.`
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
  if (error instanceof PurchaseStateError) {
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

// ============================================================================
// STEP 17B: CATALOG SEARCH FOR PURCHASING
// ============================================================================

export async function searchPurchasingCatalogItemsAction(
  query: string,
  requestedOrgId?: string,
  options?: { actorUser?: AppUserContext }
): Promise<SelectablePurchasingCatalogItem[]> {
  try {
    const { organizationId } = await verifyPurchasingContext({
      requestedOrgId,
      requirePurchaseMutation: false,
      actorUser: options?.actorUser,
    });

    const search = query.trim() || undefined;
    const products = await db.product.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { barcode: { contains: search, mode: "insensitive" } },
                { brand: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        variants: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    const items: SelectablePurchasingCatalogItem[] = [];

    for (const product of products) {
      if (product.variants.length === 0) {
        items.push({
          productId: product.id,
          variantId: null,
          productName: product.name,
          variantName: null,
          sku: product.sku,
          unit: product.unit,
          costPrice: product.costPrice.toString(),
          isVariable: false,
        });
      } else {
        for (const variant of product.variants) {
          if (variant.isActive) {
            const cost = variant.costPrice ?? product.costPrice;
            items.push({
              productId: product.id,
              variantId: variant.id,
              productName: product.name,
              variantName: variant.name,
              sku: variant.sku || product.sku,
              unit: product.unit,
              costPrice: cost.toString(),
              isVariable: true,
            });
          }
        }
      }
    }

    return serializeData<SelectablePurchasingCatalogItem[]>(items);
  } catch (error) {
    console.error("searchPurchasingCatalogItemsAction error:", error);
    return [];
  }
}

// ============================================================================
// STEP 17B: PURCHASE ORDER MUTATION ACTIONS
// ============================================================================

export async function createPurchaseAction(
  input: CreatePurchaseInputDTO,
  options?: { organizationId?: string; actorUser?: AppUserContext }
): Promise<PurchaseMutationActionResult> {
  try {
    const { user, organizationId } = await verifyPurchasingContext({
      requestedOrgId: options?.organizationId,
      requirePurchaseMutation: true,
      actorUser: options?.actorUser,
    });

    if (!input.branchId || typeof input.branchId !== "string" || !input.branchId.trim()) {
      return { success: false, error: "Branch is required." };
    }

    // Verify authorized branch access for actor user
    const hasBranchAccess = await checkBranchAccess({
      userId: user.id,
      organizationId,
      branchId: input.branchId.trim(),
    });
    if (!hasBranchAccess) {
      return {
        success: false,
        error: `You do not have authorized access to branch "${input.branchId}".`,
      };
    }

    if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
      return { success: false, error: "At least one purchase line item is required." };
    }

    const created = await createPurchase(
      {
        branchId: input.branchId.trim(),
        supplierId: input.supplierId.trim(),
        orderDate: input.orderDate,
        expectedDate: input.expectedDate,
        notes: input.notes,
        discountAmount: input.discountAmount,
        taxAmount: input.taxAmount,
        shippingAmount: input.shippingAmount,
        items: input.items.map((i) => ({
          productId: i.productId.trim(),
          variantId: i.variantId ? i.variantId.trim() : null,
          quantityOrdered: i.quantity,
          unitCost: i.unitCost,
          taxRate: i.taxRate,
        })),
      },
      {
        organizationId,
        actorUser: user,
      }
    );

    return {
      success: true,
      message: `Purchase order ${created.purchaseNumber} created successfully.`,
      purchaseId: created.id,
      purchaseNumber: created.purchaseNumber,
    };
  } catch (error) {
    const errorMsg = translatePurchasingError(error, "Failed to create purchase order.");
    return {
      success: false,
      error: errorMsg,
    };
  }
}

export async function updatePurchaseAction(
  purchaseId: string,
  input: UpdatePurchaseInputDTO,
  options?: { organizationId?: string; actorUser?: AppUserContext }
): Promise<PurchaseMutationActionResult> {
  try {
    const { user, organizationId } = await verifyPurchasingContext({
      requestedOrgId: options?.organizationId,
      requirePurchaseMutation: true,
      actorUser: options?.actorUser,
    });

    if (!purchaseId || typeof purchaseId !== "string" || !purchaseId.trim()) {
      return { success: false, error: "Purchase ID is required." };
    }

    if (input.branchId) {
      const hasBranchAccess = await checkBranchAccess({
        userId: user.id,
        organizationId,
        branchId: input.branchId.trim(),
      });
      if (!hasBranchAccess) {
        return {
          success: false,
          error: `You do not have authorized access to branch "${input.branchId}".`,
        };
      }
    }

    if (input.items !== undefined && (!Array.isArray(input.items) || input.items.length === 0)) {
      return { success: false, error: "At least one purchase line item is required." };
    }

    const updated = await updatePurchase(
      purchaseId.trim(),
      {
        branchId: input.branchId?.trim(),
        supplierId: input.supplierId?.trim(),
        orderDate: input.orderDate,
        expectedDate: input.expectedDate,
        notes: input.notes,
        discountAmount: input.discountAmount,
        taxAmount: input.taxAmount,
        shippingAmount: input.shippingAmount,
        items: input.items
          ? input.items.map((i) => ({
              productId: i.productId.trim(),
              variantId: i.variantId ? i.variantId.trim() : null,
              quantityOrdered: i.quantity,
              unitCost: i.unitCost,
              taxRate: i.taxRate,
            }))
          : undefined,
      },
      {
        organizationId,
        actorUser: user,
      }
    );

    return {
      success: true,
      message: `Purchase order ${updated.purchaseNumber} updated successfully.`,
      purchaseId: updated.id,
      purchaseNumber: updated.purchaseNumber,
    };
  } catch (error) {
    if (error instanceof PurchaseStateError) {
      return {
        success: false,
        error:
          "This purchase order was modified by another user or is no longer in DRAFT status. Please refresh to view the latest status.",
      };
    }
    const errorMsg = translatePurchasingError(error, "Failed to update purchase order.");
    return {
      success: false,
      error: errorMsg,
    };
  }
}

export async function markPurchaseOrderedAction(
  purchaseId: string,
  options?: { organizationId?: string; actorUser?: AppUserContext }
): Promise<PurchaseMutationActionResult> {
  try {
    const { user, organizationId } = await verifyPurchasingContext({
      requestedOrgId: options?.organizationId,
      requirePurchaseMutation: true,
      actorUser: options?.actorUser,
    });

    if (!purchaseId || typeof purchaseId !== "string" || !purchaseId.trim()) {
      return { success: false, error: "Purchase ID is required." };
    }

    const ordered = await markPurchaseOrdered(purchaseId.trim(), {
      organizationId,
      actorUser: user,
    });

    return {
      success: true,
      message: `Purchase order ${ordered.purchaseNumber} marked as ordered.`,
      purchaseId: ordered.id,
      purchaseNumber: ordered.purchaseNumber,
    };
  } catch (error) {
    if (error instanceof PurchaseStateError) {
      return {
        success: false,
        error:
          "This purchase order was modified by another user or is no longer in DRAFT status. Please refresh to view the latest status.",
      };
    }
    const errorMsg = translatePurchasingError(error, "Failed to mark purchase order as ordered.");
    return {
      success: false,
      error: errorMsg,
    };
  }
}

export async function cancelPurchaseAction(
  purchaseId: string,
  reasonOrOptions?: string | { organizationId?: string; actorUser?: AppUserContext },
  options?: { organizationId?: string; actorUser?: AppUserContext }
): Promise<PurchaseMutationActionResult> {
  const actualOptions =
    typeof reasonOrOptions === "object" && reasonOrOptions !== null ? reasonOrOptions : options;

  try {
    const { user, organizationId } = await verifyPurchasingContext({
      requestedOrgId: actualOptions?.organizationId,
      requirePurchaseMutation: true,
      actorUser: actualOptions?.actorUser,
    });

    if (!purchaseId || typeof purchaseId !== "string" || !purchaseId.trim()) {
      return { success: false, error: "Purchase ID is required." };
    }

    const cancelled = await cancelPurchase(purchaseId.trim(), {
      organizationId,
      actorUser: user,
    });

    return {
      success: true,
      message: `Purchase order ${cancelled.purchaseNumber} has been cancelled.`,
      purchaseId: cancelled.id,
      purchaseNumber: cancelled.purchaseNumber,
    };
  } catch (error) {
    if (error instanceof PurchaseStateError) {
      return {
        success: false,
        error:
          "This purchase order was modified by another user or is no longer in DRAFT status. Please refresh to view the latest status.",
      };
    }
    const errorMsg = translatePurchasingError(error, "Failed to cancel purchase order.");
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ============================================================================
// STEP 17B: PURCHASE DETAIL ACTION
// ============================================================================

export async function getPurchaseDetailAction(
  purchaseId: string,
  options?: { organizationId?: string; actorUser?: AppUserContext }
): Promise<PurchaseDetailActionResult> {
  try {
    const { user, organizationId } = await verifyPurchasingContext({
      requestedOrgId: options?.organizationId,
      requirePurchaseMutation: false,
      actorUser: options?.actorUser,
    });

    if (!purchaseId || typeof purchaseId !== "string" || !purchaseId.trim()) {
      return { success: false, error: "Purchase ID is required." };
    }

    const cleanPurchaseId = purchaseId.trim();

    // Concurrently execute detail queries for header, receipts, payments, and returns
    const [purchase, receiptsResult, paymentsResult, returnsResult] = await Promise.all([
      getPurchaseById(cleanPurchaseId, { organizationId, actorUser: user }),
      listReceiptsForPurchase(cleanPurchaseId, { organizationId, actorUser: user, limit: 50 }).catch((err) => {
        console.warn("Could not load receipts for purchase:", err);
        return { receipts: [], totalCount: 0 };
      }),
      listPaymentsForPurchase(cleanPurchaseId, { organizationId, actorUser: user, limit: 50 }).catch((err) => {
        console.warn("Could not load payments for purchase:", err);
        return { payments: [], totalCount: 0 };
      }),
      listPurchaseReturnsForPurchase(cleanPurchaseId, { organizationId, actorUser: user, limit: 50 }).catch((err) => {
        console.warn("Could not load returns for purchase:", err);
        return { returns: [], totalCount: 0 };
      }),
    ]);

    const totalAmount = new Prisma.Decimal(purchase.totalAmount);
    const paidAmount = new Prisma.Decimal(purchase.paidAmount);
    const balanceDue = totalAmount.sub(paidAmount).toString();

    const detail: SerializedPurchaseDetailDTO = {
      id: purchase.id,
      organizationId: purchase.organizationId,
      purchaseNumber: purchase.purchaseNumber,
      branchId: purchase.branchId,
      supplierId: purchase.supplierId,
      status: purchase.status,
      paymentStatus: purchase.paymentStatus,
      orderDate: purchase.orderDate.toISOString(),
      expectedDate: purchase.expectedDate ? purchase.expectedDate.toISOString() : null,
      subtotal: purchase.subtotal.toString(),
      discountAmount: purchase.discountAmount.toString(),
      taxAmount: purchase.taxAmount.toString(),
      shippingAmount: purchase.shippingAmount.toString(),
      totalAmount: purchase.totalAmount.toString(),
      paidAmount: purchase.paidAmount.toString(),
      balanceDue,
      notes: purchase.notes,
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString(),
      supplier: {
        id: purchase.supplier.id,
        name: purchase.supplier.name,
        contactPerson: purchase.supplier.contactPerson,
        email: purchase.supplier.email,
        phone: purchase.supplier.phone,
        address: purchase.supplier.address,
        city: purchase.supplier.city,
        taxNumber: purchase.supplier.taxNumber,
      },
      branch: {
        id: purchase.branch.id,
        name: purchase.branch.name,
        code: purchase.branch.code,
      },
      createdBy: purchase.createdBy
        ? {
            id: purchase.createdBy.id,
            name: purchase.createdBy.name,
            email: purchase.createdBy.email,
          }
        : null,
      items: purchase.items.map((item) => {
        const qtyOrdered = new Prisma.Decimal(item.quantityOrdered);
        const qtyReceived = new Prisma.Decimal(item.quantityReceived);
        const remainingToReceive = qtyOrdered.greaterThan(qtyReceived)
          ? qtyOrdered.sub(qtyReceived).toString()
          : "0.000";

        return {
          id: item.id,
          purchaseId: item.purchaseId,
          productId: item.productId,
          variantId: item.variantId,
          quantityOrdered: item.quantityOrdered.toString(),
          quantityReceived: item.quantityReceived.toString(),
          quantityReturned: item.quantityReturned.toString(),
          remainingToReceive,
          unitCost: item.unitCost.toString(),
          taxRate: item.taxRate.toString(),
          lineTotal: item.lineTotal.toString(),
          product: {
            id: item.product.id,
            name: item.product.name,
            sku: item.product.sku,
            unit: item.product.unit,
          },
          variant: item.variant
            ? {
                id: item.variant.id,
                name: item.variant.name,
                sku: item.variant.sku,
              }
            : null,
        };
      }),
      receipts: receiptsResult.receipts.map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        receivedAt: r.receivedAt.toISOString(),
        notes: r.notes,
        itemCount: r._count.items,
        receivedBy: r.receivedBy
          ? {
              id: r.receivedBy.id,
              name: r.receivedBy.name,
              email: r.receivedBy.email,
            }
          : null,
      })),
      payments: paymentsResult.payments.map((p) => ({
        id: p.id,
        paymentMethod: p.paymentMethod,
        amount: p.amount.toString(),
        paidAt: p.paidAt.toISOString(),
        reference: p.reference,
        notes: p.notes,
        recordedBy: p.recordedBy
          ? {
              id: p.recordedBy.id,
              name: p.recordedBy.name,
              email: p.recordedBy.email,
            }
          : null,
      })),
      returns: returnsResult.returns.map((ret) => ({
        id: ret.id,
        returnNumber: ret.returnNumber,
        returnDate: ret.returnDate.toISOString(),
        reason: ret.reason,
        notes: ret.notes,
        itemCount: ret.items.length,
        returnedBy: ret.returnedBy
          ? {
              id: ret.returnedBy.id,
              name: ret.returnedBy.name,
              email: ret.returnedBy.email,
            }
          : null,
        items: ret.items.map((ri) => ({
          id: ri.id,
          productName: ri.purchaseItem.product.name,
          variantName: ri.purchaseItem.variant?.name || null,
          sku: ri.purchaseItem.variant?.sku || ri.purchaseItem.product.sku,
          quantityReturned: ri.quantityReturned.toString(),
          unitCost: ri.unitCost.toString(),
          lineTotal: ri.lineTotal.toString(),
        })),
      })),
    };

    return {
      success: true,
      purchase: serializeData<SerializedPurchaseDetailDTO>(detail),
    };
  } catch (error) {
    const errorMsg = translatePurchasingError(error, "Failed to load purchase details.");
    return {
      success: false,
      error: errorMsg,
    };
  }
}
