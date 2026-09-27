"use server";

import { Prisma } from "@prisma/client";
import { getCurrentAppUser } from "@/lib/auth";
import { type SystemRoleName } from "@/lib/roles";
import {
  getInventorySummary,
  getBranchInventory,
  INVENTORY_READ_ROLES,
  INVENTORY_MUTATION_ROLES,
  InventoryValidationError,
  InventoryNotFoundError,
  InventoryBranchAccessError,
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
} from "./types";

// Helper to convert Prisma Decimal and Date objects into JSON-safe primitives
function serializeData<T>(obj: T): T {
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
// SERVER ACTIONS
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
    if (
      error instanceof InventoryValidationError ||
      error instanceof InventoryNotFoundError ||
      error instanceof InventoryBranchAccessError ||
      error instanceof CrossTenantViolationError ||
      error instanceof MembershipNotFoundError ||
      error instanceof UnauthorizedRoleError ||
      error instanceof BranchNotFoundError
    ) {
      return { success: false, error: error.message };
    }

    console.error("getInventorySummaryAction error:", error);
    return {
      success: false,
      error: "An unexpected error occurred while retrieving the inventory summary.",
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
    if (
      error instanceof InventoryValidationError ||
      error instanceof InventoryNotFoundError ||
      error instanceof InventoryBranchAccessError ||
      error instanceof CrossTenantViolationError ||
      error instanceof MembershipNotFoundError ||
      error instanceof UnauthorizedRoleError ||
      error instanceof BranchNotFoundError
    ) {
      return { success: false, error: error.message };
    }

    console.error("getBranchInventoryAction error:", error);
    return {
      success: false,
      error: "An unexpected error occurred while retrieving branch inventory.",
    };
  }
}
