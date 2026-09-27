"use server";

import { Prisma, type StockMovementType } from "@prisma/client";
import { getCurrentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { type SystemRoleName } from "@/lib/roles";
import {
  getInventorySummary,
  getBranchInventory,
  getInventoryHistory,
  recordOpeningBalance,
  recordStockInflow,
  recordStockOutflow,
  adjustStock,
  updateStockThresholds,
  INVENTORY_READ_ROLES,
  INVENTORY_MUTATION_ROLES,
  InventoryValidationError,
  InventoryNotFoundError,
  InventoryBranchAccessError,
  InventoryConflictError,
  InsufficientStockError,
  UnauthorizedRoleError,
  CrossTenantViolationError,
  MembershipNotFoundError,
  BranchNotFoundError,
  type AppUserContext,
  type InventoryServiceOptions,
} from "@/lib/inventory";
import { checkBranchAccess } from "@/lib/memberships";
import {
  computeStockStatus,
  type InventorySummaryDTO,
  type InventoryStockListResult,
  type InventoryActionResult,
  type SerializedInventoryStock,
  type SerializedInventoryMovement,
  type InventoryHistoryListResult,
  type StockMovementTypeValue,
  type RecordOpeningBalanceInput,
  type RecordStockInflowInput,
  type RecordStockOutflowInput,
  type AdjustStockInput,
  type UpdateStockThresholdsInput,
  type SerializedStockMutationResult,
  type SerializedThresholdResult,
  type SelectableCatalogItem,
} from "./types";

// Helper to convert Prisma Decimal and Date objects into JSON-safe primitives
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

function translateInventoryError(error: unknown, fallbackMessage: string): string {
  if (error instanceof InsufficientStockError) {
    return "Not enough stock available. The current stock may have changed. Refresh and try again.";
  }
  if (error instanceof InventoryConflictError) {
    return error.message || "A conflict occurred with the existing inventory record.";
  }
  if (
    error instanceof InventoryValidationError ||
    error instanceof InventoryNotFoundError ||
    error instanceof InventoryBranchAccessError ||
    error instanceof CrossTenantViolationError ||
    error instanceof MembershipNotFoundError ||
    error instanceof UnauthorizedRoleError ||
    error instanceof BranchNotFoundError
  ) {
    return error.message;
  }

  console.error("Inventory action error:", error);
  return fallbackMessage;
}

// ============================================================================
// TENANT & BRANCH CONTEXT VERIFICATION (SERVER-ACTION BOUNDARY)
// ============================================================================

interface VerifiedInventoryServerContext {
  user: AppUserContext;
  organizationId: string;
  role: SystemRoleName;
  membership: AppUserContext["memberships"][0];
}

async function verifyServerActionTenantContext(
  branchId: string,
  requestedOrgId?: string,
  options?: InventoryServiceOptions,
  requireMutation = false
): Promise<VerifiedInventoryServerContext> {
  const user = options?.actorUser !== undefined ? options.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  // Treat requestedOrgId or options.organizationId as untrusted candidate selector
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
    if (!INVENTORY_MUTATION_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to mutate inventory. Required one of: ${INVENTORY_MUTATION_ROLES.join(
          ", "
        )}.`
      );
    }
  } else {
    if (!INVENTORY_READ_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to view inventory. Required one of: ${INVENTORY_READ_ROLES.join(
          ", "
        )}.`
      );
    }
  }

  // Verify branch access
  const hasAccess = await checkBranchAccess({
    userId: user.id,
    organizationId: membership.organizationId,
    branchId,
  });

  if (!hasAccess) {
    throw new InventoryBranchAccessError(
      `User does not have authorized access to branch "${branchId}".`
    );
  }

  return {
    user,
    organizationId: membership.organizationId,
    role: roleName,
    membership,
  };
}

// ============================================================================
// READ ACTIONS
// ============================================================================

/**
 * Retrieves aggregate inventory summary metrics for a branch:
 * totalTracked, inStockCount, lowStockCount, outOfStockCount.
 */
export async function getInventorySummaryAction(
  branchId: string,
  requestedOrgId?: string,
  options?: InventoryServiceOptions
): Promise<InventoryActionResult<InventorySummaryDTO>> {
  if (!branchId?.trim()) {
    return { success: false, error: "Branch ID is required." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      branchId.trim(),
      requestedOrgId,
      options,
      false
    );

    const summary = await getInventorySummary({
      organizationId,
      branchId: branchId.trim(),
      actorUser: user,
    });

    return {
      success: true,
      data: summary,
    };
  } catch (error) {
    return {
      success: false,
      error: translateInventoryError(
        error,
        "An unexpected error occurred while retrieving the inventory summary."
      ),
    };
  }
}

/**
 * Retrieves paginated branch inventory items with deterministic sorting and stock statuses.
 */
export async function getBranchInventoryAction(
  params: {
    branchId: string;
    search?: string;
    lowStockOnly?: boolean;
    page?: number;
    pageSize?: number;
  },
  requestedOrgId?: string,
  options?: InventoryServiceOptions
): Promise<InventoryActionResult<InventoryStockListResult>> {
  if (!params.branchId?.trim()) {
    return { success: false, error: "Branch ID is required." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      params.branchId.trim(),
      requestedOrgId,
      options,
      false
    );

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 50));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const result = await getBranchInventory({
      organizationId,
      branchId: params.branchId.trim(),
      search: params.search?.trim() || undefined,
      lowStockOnly: params.lowStockOnly,
      take,
      skip,
      actorUser: user,
    });

    const totalPages = Math.ceil(result.totalCount / pageSize) || 1;

    const serializedItems: SerializedInventoryStock[] = result.items.map((item) => {
      const status = computeStockStatus(
        item.quantity.toString(),
        item.reorderLevel ? item.reorderLevel.toString() : null
      );

      return {
        id: item.id,
        organizationId: item.organizationId,
        branchId: item.branchId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity.toString(),
        reorderLevel: item.reorderLevel ? item.reorderLevel.toString() : null,
        reorderQuantity: item.reorderQuantity ? item.reorderQuantity.toString() : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        product: {
          id: item.product.id,
          name: item.product.name,
          sku: item.product.sku,
          barcode: item.product.barcode,
          unit: item.product.unit,
          costPrice: item.product.costPrice ? item.product.costPrice.toString() : null,
          sellingPrice: item.product.sellingPrice ? item.product.sellingPrice.toString() : null,
          isActive: item.product.isActive,
        },
        variant: item.variant
          ? {
              id: item.variant.id,
              name: item.variant.name,
              sku: item.variant.sku,
              barcode: item.variant.barcode,
              costPrice: item.variant.costPrice ? item.variant.costPrice.toString() : null,
              sellingPrice: item.variant.sellingPrice ? item.variant.sellingPrice.toString() : null,
              isActive: item.variant.isActive,
            }
          : null,
        status,
      };
    });

    return {
      success: true,
      data: serializeData({
        items: serializedItems,
        totalCount: result.totalCount,
        page,
        pageSize,
        totalPages,
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: translateInventoryError(
        error,
        "An unexpected error occurred while retrieving branch inventory."
      ),
    };
  }
}

/**
 * Retrieves paginated branch inventory movements with deterministic sorting.
 */
export async function getInventoryHistoryAction(
  params: {
    branchId: string;
    productId?: string;
    variantId?: string;
    movementType?: StockMovementTypeValue;
    page?: number;
    pageSize?: number;
    take?: number;
    skip?: number;
  },
  requestedOrgId?: string,
  options?: InventoryServiceOptions
): Promise<InventoryActionResult<InventoryHistoryListResult>> {
  if (!params.branchId?.trim()) {
    return { success: false, error: "Branch ID is required." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      params.branchId.trim(),
      requestedOrgId,
      options,
      false // Read permission check
    );

    const pageSize = params.pageSize
      ? Math.min(100, Math.max(1, params.pageSize))
      : params.take
      ? Math.min(100, Math.max(1, params.take))
      : 50;

    const page = params.page
      ? Math.max(1, params.page)
      : params.skip !== undefined
      ? Math.floor(params.skip / pageSize) + 1
      : 1;

    const skip =
      params.skip !== undefined ? Math.max(0, params.skip) : (page - 1) * pageSize;
    const take =
      params.take !== undefined ? Math.min(100, Math.max(1, params.take)) : pageSize;

    const result = await getInventoryHistory({
      organizationId,
      branchId: params.branchId.trim(),
      productId: params.productId?.trim() || undefined,
      variantId: params.variantId?.trim() || undefined,
      movementType: params.movementType as StockMovementType | undefined,
      take,
      skip,
      actorUser: user,
    });

    const totalPages = Math.ceil(result.totalCount / pageSize) || 1;

    const serializedItems: SerializedInventoryMovement[] = result.movements.map((m) => {
      return {
        id: m.id,
        organizationId: m.organizationId,
        branchId: m.branchId,
        productId: m.productId,
        variantId: m.variantId,
        movementType: m.movementType as StockMovementTypeValue,
        quantityDelta: m.quantityDelta.toString(),
        quantityBefore: m.quantityBefore.toString(),
        quantityAfter: m.quantityAfter.toString(),
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        reason: m.reason,
        notes: m.notes,
        performedByUserId: m.performedByUserId,
        createdAt: m.createdAt.toISOString(),
        product: m.product
          ? {
              id: m.product.id,
              name: m.product.name,
              sku: m.product.sku,
            }
          : undefined,
        variant: m.variant
          ? {
              id: m.variant.id,
              name: m.variant.name,
              sku: m.variant.sku,
            }
          : null,
        performedBy: m.performedBy
          ? {
              id: m.performedBy.id,
              name: m.performedBy.name,
              email: m.performedBy.email,
            }
          : null,
      };
    });

    return {
      success: true,
      data: serializeData({
        items: serializedItems,
        totalCount: result.totalCount,
        page,
        pageSize,
        totalPages,
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: translateInventoryError(
        error,
        "An unexpected error occurred while retrieving inventory history."
      ),
    };
  }
}

/**
 * Searches active catalog items (products and variants) in the verified organization
 * for use in product selectors and mutation modals.
 */
export async function searchCatalogItemsAction(
  branchId: string,
  search?: string,
  requestedOrgId?: string,
  options?: InventoryServiceOptions
): Promise<InventoryActionResult<SelectableCatalogItem[]>> {
  if (!branchId?.trim()) {
    return { success: false, error: "Branch ID is required." };
  }

  try {
    const { organizationId } = await verifyServerActionTenantContext(
      branchId.trim(),
      requestedOrgId,
      options,
      false
    );

    const term = search?.trim();
    const products = await db.product.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { sku: { contains: term, mode: "insensitive" } },
                { variants: { some: { name: { contains: term, mode: "insensitive" } } } },
                { variants: { some: { sku: { contains: term, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
        inventoryStocks: {
          where: { branchId: branchId.trim() },
          select: { variantId: true, quantity: true },
        },
      },
      orderBy: { name: "asc" },
      take: 25,
    });

    const items: SelectableCatalogItem[] = [];

    for (const prod of products) {
      if (prod.variants.length > 0) {
        for (const variant of prod.variants) {
          const matchingStock = prod.inventoryStocks.find((s) => s.variantId === variant.id);
          items.push({
            productId: prod.id,
            variantId: variant.id,
            productName: prod.name,
            variantName: variant.name,
            sku: variant.sku || prod.sku,
            isVariable: true,
            unit: prod.unit,
            currentStockInBranch: matchingStock ? matchingStock.quantity.toString() : null,
          });
        }
      } else {
        const matchingStock = prod.inventoryStocks.find((s) => s.variantId === null);
        items.push({
          productId: prod.id,
          variantId: null,
          productName: prod.name,
          variantName: null,
          sku: prod.sku,
          isVariable: false,
          unit: prod.unit,
          currentStockInBranch: matchingStock ? matchingStock.quantity.toString() : null,
        });
      }
    }

    return { success: true, data: items };
  } catch (error) {
    return {
      success: false,
      error: translateInventoryError(error, "Failed to search catalog items."),
    };
  }
}

// ============================================================================
// MUTATION ACTIONS
// ============================================================================

/**
 * Establishes initial stock balance for a product/variant at a branch.
 */
export async function recordOpeningBalanceAction(
  input: RecordOpeningBalanceInput,
  requestedOrgId?: string,
  options?: InventoryServiceOptions
): Promise<InventoryActionResult<SerializedStockMutationResult>> {
  if (!input.branchId?.trim() || !input.productId?.trim()) {
    return { success: false, error: "Branch ID and Product ID are required." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      input.branchId.trim(),
      requestedOrgId,
      options,
      true
    );

    const result = await recordOpeningBalance({
      organizationId,
      branchId: input.branchId.trim(),
      productId: input.productId.trim(),
      variantId: input.variantId?.trim() || null,
      quantity: input.quantity,
      reorderLevel: input.reorderLevel?.trim() ? input.reorderLevel.trim() : null,
      reorderQuantity: input.reorderQuantity?.trim() ? input.reorderQuantity.trim() : null,
      reason: input.reason?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      actorUser: user,
    });

    return {
      success: true,
      data: serializeData(result),
    };
  } catch (error) {
    return {
      success: false,
      error: translateInventoryError(
        error,
        "An unexpected error occurred while recording the opening balance."
      ),
    };
  }
}

/**
 * Records manual stock inflow (ADJUSTMENT_IN).
 */
export async function recordStockInflowAction(
  input: RecordStockInflowInput,
  requestedOrgId?: string,
  options?: InventoryServiceOptions
): Promise<InventoryActionResult<SerializedStockMutationResult>> {
  if (!input.branchId?.trim() || !input.productId?.trim()) {
    return { success: false, error: "Branch ID and Product ID are required." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      input.branchId.trim(),
      requestedOrgId,
      options,
      true
    );

    const result = await recordStockInflow({
      organizationId,
      branchId: input.branchId.trim(),
      productId: input.productId.trim(),
      variantId: input.variantId?.trim() || null,
      quantity: input.quantity,
      movementType: "ADJUSTMENT_IN",
      reason: input.reason?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      actorUser: user,
    });

    return {
      success: true,
      data: serializeData(result),
    };
  } catch (error) {
    return {
      success: false,
      error: translateInventoryError(
        error,
        "An unexpected error occurred while recording stock inflow."
      ),
    };
  }
}

/**
 * Records manual stock outflow (ADJUSTMENT_OUT, DAMAGE, WASTE).
 */
export async function recordStockOutflowAction(
  input: RecordStockOutflowInput,
  requestedOrgId?: string,
  options?: InventoryServiceOptions
): Promise<InventoryActionResult<SerializedStockMutationResult>> {
  if (!input.branchId?.trim() || !input.productId?.trim()) {
    return { success: false, error: "Branch ID and Product ID are required." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      input.branchId.trim(),
      requestedOrgId,
      options,
      true
    );

    const result = await recordStockOutflow({
      organizationId,
      branchId: input.branchId.trim(),
      productId: input.productId.trim(),
      variantId: input.variantId?.trim() || null,
      quantity: input.quantity,
      movementType: input.movementType,
      reason: input.reason?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      actorUser: user,
    });

    return {
      success: true,
      data: serializeData(result),
    };
  } catch (error) {
    return {
      success: false,
      error: translateInventoryError(
        error,
        "An unexpected error occurred while recording stock outflow."
      ),
    };
  }
}

/**
 * Reconciles stock to a target counted quantity (Stocktake / physical count).
 */
export async function adjustStockAction(
  input: AdjustStockInput,
  requestedOrgId?: string,
  options?: InventoryServiceOptions
): Promise<InventoryActionResult<SerializedStockMutationResult>> {
  if (!input.branchId?.trim() || !input.productId?.trim()) {
    return { success: false, error: "Branch ID and Product ID are required." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      input.branchId.trim(),
      requestedOrgId,
      options,
      true
    );

    const result = await adjustStock({
      organizationId,
      branchId: input.branchId.trim(),
      productId: input.productId.trim(),
      variantId: input.variantId?.trim() || null,
      newQuantity: input.newQuantity,
      reason: input.reason?.trim() || "Stock Reconciliation",
      notes: input.notes?.trim() || undefined,
      actorUser: user,
    });

    return {
      success: true,
      data: serializeData(result),
    };
  } catch (error) {
    return {
      success: false,
      error: translateInventoryError(
        error,
        "An unexpected error occurred while adjusting stock."
      ),
    };
  }
}

/**
 * Updates reorder level and reorder quantity thresholds for a stock item.
 */
export async function updateStockThresholdsAction(
  input: UpdateStockThresholdsInput,
  requestedOrgId?: string,
  options?: InventoryServiceOptions
): Promise<InventoryActionResult<SerializedThresholdResult>> {
  if (!input.branchId?.trim() || !input.stockId?.trim()) {
    return { success: false, error: "Branch ID and Stock ID are required." };
  }

  try {
    const { organizationId, user } = await verifyServerActionTenantContext(
      input.branchId.trim(),
      requestedOrgId,
      options,
      true
    );

    const result = await updateStockThresholds({
      organizationId,
      branchId: input.branchId.trim(),
      stockId: input.stockId.trim(),
      reorderLevel: input.reorderLevel !== undefined ? input.reorderLevel : undefined,
      reorderQuantity: input.reorderQuantity !== undefined ? input.reorderQuantity : undefined,
      actorUser: user,
    });

    return {
      success: true,
      data: serializeData({
        id: result.id,
        reorderLevel: result.reorderLevel ? result.reorderLevel.toString() : null,
        reorderQuantity: result.reorderQuantity ? result.reorderQuantity.toString() : null,
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: translateInventoryError(
        error,
        "An unexpected error occurred while updating thresholds."
      ),
    };
  }
}
