import "server-only";
import { Prisma, type StockMovementType } from "@prisma/client";
import { db } from "./db";
import { SYSTEM_ROLES, type SystemRoleName } from "./roles";
import { getCurrentAppUser } from "./auth";
import {
  checkBranchAccess,
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
  BranchNotFoundError,
} from "./memberships";

// ============================================================================
// ROLE ACCESS CONSTANTS
// ============================================================================

export const INVENTORY_MUTATION_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
];

export const INVENTORY_READ_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.ACCOUNTANT,
];

// ============================================================================
// TYPED DOMAIN ERRORS
// ============================================================================

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

export class InventoryValidationError extends InventoryError {
  constructor(message: string) {
    super(message);
    this.name = "InventoryValidationError";
  }
}

export class InventoryNotFoundError extends InventoryError {
  constructor(message = "Inventory stock record not found.") {
    super(message);
    this.name = "InventoryNotFoundError";
  }
}

export class InsufficientStockError extends InventoryError {
  constructor(message = "Insufficient stock available.") {
    super(message);
    this.name = "InsufficientStockError";
  }
}

export class InventoryBranchAccessError extends InventoryError {
  constructor(message = "User does not have authorized access to this branch.") {
    super(message);
    this.name = "InventoryBranchAccessError";
  }
}

export class InventoryConflictError extends InventoryError {
  constructor(message: string) {
    super(message);
    this.name = "InventoryConflictError";
  }
}

// Re-export membership / tenant error classes for convenience
export {
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
  BranchNotFoundError,
};

// ============================================================================
// DECIMAL PARSING & VALIDATION
// ============================================================================

export function parseQuantity(
  value: number | string | Prisma.Decimal | undefined | null,
  fieldName = "Quantity",
  allowZero = false
): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    throw new InventoryValidationError(`${fieldName} is required.`);
  }

  let dec: Prisma.Decimal;
  if (value instanceof Prisma.Decimal) {
    dec = value;
  } else {
    const str = String(value).trim();
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
      throw new InventoryValidationError(`${fieldName} must be a valid numeric value.`);
    }
    dec = new Prisma.Decimal(str);
  }

  if (isNaN(dec.toNumber()) || !isFinite(dec.toNumber())) {
    throw new InventoryValidationError(`${fieldName} must be a finite number.`);
  }

  // Validate maximum 3 decimal places
  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 3) {
    throw new InventoryValidationError(`${fieldName} cannot exceed 3 decimal places.`);
  }

  if (allowZero ? dec.lessThan(0) : dec.lessThanOrEqualTo(0)) {
    throw new InventoryValidationError(
      `${fieldName} must be ${allowZero ? "greater than or equal to 0" : "strictly greater than 0"}.`
    );
  }

  if (dec.greaterThan("999999999.999")) {
    throw new InventoryValidationError(`${fieldName} exceeds maximum supported capacity.`);
  }

  return dec;
}

function parseOptionalThreshold(
  value: number | string | Prisma.Decimal | null | undefined,
  fieldName: string
): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return parseQuantity(value, fieldName, true);
}

// ============================================================================
// CONTEXT RESOLUTION & VALIDATION
// ============================================================================

export type AppUserContext = Prisma.UserGetPayload<{
  include: {
    memberships: {
      include: {
        organization: true;
        role: true;
        branchMemberships: {
          include: {
            branch: true;
          };
        };
      };
    };
  };
}>;

export async function resolveAuthorizedInventoryContext(params: {
  organizationId?: string;
  branchId: string;
  requireMutation?: boolean;
  actorUser?: AppUserContext | null;
}) {
  const user = params.actorUser !== undefined ? params.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  const requestedOrgId = params.organizationId;
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

  const organizationId = membership.organizationId;
  const roleName = membership.role.name as SystemRoleName;

  if (params.requireMutation) {
    if (!INVENTORY_MUTATION_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to mutate inventory. Required one of: ${INVENTORY_MUTATION_ROLES.join(", ")}.`
      );
    }
  } else {
    if (!INVENTORY_READ_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to view inventory.`
      );
    }
  }

  const hasAccess = await checkBranchAccess({
    userId: user.id,
    organizationId,
    branchId: params.branchId,
  });

  if (!hasAccess) {
    const targetBranch = await db.branch.findUnique({
      where: { id: params.branchId },
      select: { id: true, organizationId: true, isActive: true },
    });
    if (!targetBranch) {
      throw new BranchNotFoundError(`Branch "${params.branchId}" does not exist.`);
    }
    if (targetBranch.organizationId !== organizationId) {
      throw new CrossTenantViolationError(
        `Multi-tenant violation: Branch "${params.branchId}" belongs to another organization.`
      );
    }
    throw new InventoryBranchAccessError(
      `User does not have authorized access to branch "${params.branchId}".`
    );
  }

  return {
    user,
    membership,
    organizationId,
    branchId: params.branchId,
    role: roleName,
  };
}

async function resolveStockItem(params: {
  organizationId: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
}) {
  const { organizationId, branchId, productId, variantId } = params;

  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        select: { id: true, name: true, organizationId: true },
      },
    },
  });

  if (!product) {
    throw new InventoryValidationError(`Product "${productId}" does not exist.`);
  }

  if (product.organizationId !== organizationId) {
    throw new CrossTenantViolationError(
      `Multi-tenant violation: Product "${productId}" does not belong to authorized organization.`
    );
  }

  if (product.variants.length > 0) {
    // Variable product
    if (!variantId) {
      throw new InventoryValidationError(
        `Product "${product.name}" has variants. Inventory must be assigned to a specific variant.`
      );
    }
    const matchedVariant = product.variants.find((v) => v.id === variantId);
    if (!matchedVariant) {
      throw new InventoryValidationError(
        `Variant "${variantId}" does not belong to product "${product.name}".`
      );
    }
    if (matchedVariant.organizationId !== organizationId) {
      throw new CrossTenantViolationError(
        `Multi-tenant violation: Variant "${variantId}" belongs to another organization.`
      );
    }

    // Invariant & Transition Guard: Check if base stock exists
    const existingBaseStock = await db.inventoryStock.findFirst({
      where: {
        branchId,
        productId,
        variantId: null,
      },
    });
    if (existingBaseStock && !existingBaseStock.quantity.isZero()) {
      throw new InventoryConflictError(
        `Product "${product.name}" has existing base stock (${existingBaseStock.quantity.toString()}) at this branch. ` +
        `Base stock must be reconciled before managing variant inventory.`
      );
    }

    return { product, variantId: matchedVariant.id };
  } else {
    // Simple product
    if (variantId) {
      throw new InventoryValidationError(
        `Product "${product.name}" has no variants. Variant ID must not be provided.`
      );
    }

    const existingVariantStock = await db.inventoryStock.findFirst({
      where: {
        branchId,
        productId,
        variantId: { not: null },
      },
    });
    if (existingVariantStock && !existingVariantStock.quantity.isZero()) {
      throw new InventoryConflictError(
        `Product "${product.name}" has existing variant stock records. ` +
        `Variant stock must be reconciled before managing base-product inventory.`
      );
    }

    return { product, variantId: null };
  }
}

// ============================================================================
// CONCURRENCY & LOCKING HELPERS
// ============================================================================

interface RawStockRecord {
  id: string;
  organizationId: string;
  branchId: string;
  productId: string;
  variantId: string | null;
  quantity: Prisma.Decimal;
  reorderLevel: Prisma.Decimal | null;
  reorderQuantity: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
}

async function lockAndFetchStockRecord(
  tx: Prisma.TransactionClient,
  branchId: string,
  productId: string,
  variantId: string | null
): Promise<RawStockRecord | null> {
  // 1. Transaction-level PostgreSQL advisory lock on logical stock key
  // Guarantees atomic first-stock creation under concurrent requests.
  const itemKey = variantId ? `v_${variantId}` : `p_${productId}`;
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${branchId}), hashtext(${itemKey}))
  `;

  // 2. Fetch and acquire row-level lock if row exists
  if (variantId) {
    const rows = await tx.$queryRaw<RawStockRecord[]>`
      SELECT * FROM "InventoryStock"
      WHERE "branchId" = ${branchId} AND "variantId" = ${variantId}
      FOR UPDATE
    `;
    return rows[0] || null;
  } else {
    const rows = await tx.$queryRaw<RawStockRecord[]>`
      SELECT * FROM "InventoryStock"
      WHERE "branchId" = ${branchId} AND "productId" = ${productId} AND "variantId" IS NULL
      FOR UPDATE
    `;
    return rows[0] || null;
  }
}

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export interface StockMutationResult {
  stock: {
    id: string;
    organizationId: string;
    branchId: string;
    productId: string;
    variantId: string | null;
    quantity: Prisma.Decimal;
    reorderLevel: Prisma.Decimal | null;
    reorderQuantity: Prisma.Decimal | null;
  };
  movement: {
    id: string;
    organizationId: string;
    branchId: string;
    productId: string;
    variantId: string | null;
    movementType: StockMovementType;
    quantityDelta: Prisma.Decimal;
    quantityBefore: Prisma.Decimal;
    quantityAfter: Prisma.Decimal;
    referenceType: string | null;
    referenceId: string | null;
    reason: string | null;
    notes: string | null;
    performedByUserId: string | null;
    createdAt: Date;
  };
}

// ============================================================================
// READ SERVICES
// ============================================================================

export async function getBranchInventory(params: {
  organizationId?: string;
  branchId: string;
  search?: string;
  lowStockOnly?: boolean;
  take?: number;
  skip?: number;
  actorUser?: AppUserContext | null;
}) {
  const { organizationId, branchId } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: false,
    actorUser: params.actorUser,
  });

  const search = params.search?.trim();

  const whereClause: Prisma.InventoryStockWhereInput = {
    organizationId,
    branchId,
    ...(search
      ? {
          OR: [
            { product: { name: { contains: search, mode: "insensitive" } } },
            { product: { sku: { contains: search, mode: "insensitive" } } },
            { variant: { name: { contains: search, mode: "insensitive" } } },
            { variant: { sku: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, totalCount] = await Promise.all([
    db.inventoryStock.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            unit: true,
            costPrice: true,
            sellingPrice: true,
            isActive: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            costPrice: true,
            sellingPrice: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ product: { name: "asc" } }, { createdAt: "desc" }],
      take: params.take ?? 50,
      skip: params.skip ?? 0,
    }),
    db.inventoryStock.count({ where: whereClause }),
  ]);

  if (params.lowStockOnly) {
    const lowStockItems = items.filter(
      (item) => item.reorderLevel !== null && item.quantity.lessThanOrEqualTo(item.reorderLevel)
    );
    return { items: lowStockItems, totalCount: lowStockItems.length };
  }

  return { items, totalCount };
}

export async function getStockByProduct(params: {
  organizationId?: string;
  branchId: string;
  productId: string;
  actorUser?: AppUserContext | null;
}) {
  const { organizationId, branchId } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: false,
    actorUser: params.actorUser,
  });

  return db.inventoryStock.findMany({
    where: {
      organizationId,
      branchId,
      productId: params.productId,
    },
    include: {
      product: true,
      variant: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getStockByVariant(params: {
  organizationId?: string;
  branchId: string;
  variantId: string;
  actorUser?: AppUserContext | null;
}) {
  const { organizationId, branchId } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: false,
    actorUser: params.actorUser,
  });

  return db.inventoryStock.findFirst({
    where: {
      organizationId,
      branchId,
      variantId: params.variantId,
    },
    include: {
      product: true,
      variant: true,
    },
  });
}

export async function getInventoryHistory(params: {
  organizationId?: string;
  branchId: string;
  productId?: string;
  variantId?: string;
  movementType?: StockMovementType;
  take?: number;
  skip?: number;
  actorUser?: AppUserContext | null;
}) {
  const { organizationId, branchId } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: false,
    actorUser: params.actorUser,
  });

  const whereClause: Prisma.InventoryMovementWhereInput = {
    organizationId,
    branchId,
    ...(params.productId ? { productId: params.productId } : {}),
    ...(params.variantId ? { variantId: params.variantId } : {}),
    ...(params.movementType ? { movementType: params.movementType } : {}),
  };

  const [movements, totalCount] = await Promise.all([
    db.inventoryMovement.findMany({
      where: whereClause,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        variant: { select: { id: true, name: true, sku: true } },
        performedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: params.take ?? 50,
      skip: params.skip ?? 0,
    }),
    db.inventoryMovement.count({ where: whereClause }),
  ]);

  return { movements, totalCount };
}

export async function getLowStockAlerts(params: {
  organizationId?: string;
  branchId: string;
  actorUser?: AppUserContext | null;
}) {
  const { organizationId, branchId } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: false,
    actorUser: params.actorUser,
  });

  const items = await db.inventoryStock.findMany({
    where: {
      organizationId,
      branchId,
      reorderLevel: { not: null },
    },
    include: {
      product: true,
      variant: true,
    },
    orderBy: { quantity: "asc" },
  });

  return items.filter(
    (item) => item.reorderLevel !== null && item.quantity.lessThanOrEqualTo(item.reorderLevel)
  );
}

// ============================================================================
// MUTATION SERVICES
// ============================================================================

/**
 * Establishes initial stock for a product/variant at a branch.
 * Rejects if stock records or movement history already exist.
 */
export async function recordOpeningBalance(params: {
  organizationId?: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
  quantity: number | string | Prisma.Decimal;
  reorderLevel?: number | string | Prisma.Decimal | null;
  reorderQuantity?: number | string | Prisma.Decimal | null;
  reason?: string;
  notes?: string;
  actorUser?: AppUserContext | null;
}): Promise<StockMutationResult> {
  const { organizationId, branchId, user } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: true,
    actorUser: params.actorUser,
  });

  const { variantId } = await resolveStockItem({
    organizationId,
    branchId,
    productId: params.productId,
    variantId: params.variantId,
  });

  const initialQuantity = parseQuantity(params.quantity, "Opening Balance Quantity", true);
  const reorderLevel = parseOptionalThreshold(params.reorderLevel, "Reorder Level");
  const reorderQuantity = parseOptionalThreshold(params.reorderQuantity, "Reorder Quantity");

  return db.$transaction(async (tx) => {
    // Lock and check existing stock
    const existingStock = await lockAndFetchStockRecord(tx, branchId, params.productId, variantId);
    if (existingStock) {
      throw new InventoryConflictError(
        "Opening balance already established for this item at this branch. Use adjustment operations for subsequent changes."
      );
    }

    // Check if any movements exist
    const existingMovement = await tx.inventoryMovement.findFirst({
      where: {
        branchId,
        productId: params.productId,
        variantId: variantId ?? undefined,
      },
    });
    if (existingMovement) {
      throw new InventoryConflictError(
        "Movement history already exists for this item at this branch. Opening balance cannot be re-applied."
      );
    }

    const stock = await tx.inventoryStock.create({
      data: {
        organizationId,
        branchId,
        productId: params.productId,
        variantId,
        quantity: initialQuantity,
        reorderLevel,
        reorderQuantity,
      },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        organizationId,
        branchId,
        productId: params.productId,
        variantId,
        movementType: "OPENING_BALANCE",
        quantityDelta: initialQuantity,
        quantityBefore: new Prisma.Decimal("0.000"),
        quantityAfter: initialQuantity,
        reason: params.reason?.trim() || "Initial Stock Balance",
        notes: params.notes?.trim() || null,
        performedByUserId: user.id,
      },
    });

    return { stock, movement };
  });
}

/**
 * Records an inventory inflow (PURCHASE_RECEIPT, SALE_RETURN, ADJUSTMENT_IN, TRANSFER_IN).
 * Increases stock balance and writes a positive movement record atomically.
 */
export async function recordStockInflow(params: {
  organizationId?: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
  quantity: number | string | Prisma.Decimal;
  movementType: "PURCHASE_RECEIPT" | "SALE_RETURN" | "ADJUSTMENT_IN" | "TRANSFER_IN";
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  notes?: string;
  actorUser?: AppUserContext | null;
}): Promise<StockMutationResult> {
  const validInflowTypes: readonly string[] = [
    "PURCHASE_RECEIPT",
    "SALE_RETURN",
    "ADJUSTMENT_IN",
    "TRANSFER_IN",
  ];
  if (!validInflowTypes.includes(params.movementType)) {
    throw new InventoryValidationError(
      `Invalid inflow movement type "${params.movementType}". Expected one of: ${validInflowTypes.join(", ")}.`
    );
  }

  const { organizationId, branchId, user } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: true,
    actorUser: params.actorUser,
  });

  const { variantId } = await resolveStockItem({
    organizationId,
    branchId,
    productId: params.productId,
    variantId: params.variantId,
  });

  const deltaMagnitude = parseQuantity(params.quantity, "Inflow Quantity", false);

  return db.$transaction(async (tx) => {
    // Concurrency lock on reference if provided (Idempotency protection)
    if (params.referenceType && params.referenceId) {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${`ref_${params.referenceType}_${params.referenceId}`}))
      `;
      const existing = await tx.inventoryMovement.findFirst({
        where: {
          organizationId,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
        },
      });
      if (existing) {
        // Return existing stock and movement idempotently
        const currentStock = await tx.inventoryStock.findFirst({
          where: { branchId, productId: params.productId, variantId: variantId ?? undefined },
        });
        if (!currentStock) {
          throw new InventoryNotFoundError("Associated stock record not found for idempotent reference.");
        }
        return { stock: currentStock, movement: existing };
      }
    }

    // Lock and fetch current stock
    const existingStock = await lockAndFetchStockRecord(tx, branchId, params.productId, variantId);
    const quantityBefore = existingStock ? new Prisma.Decimal(existingStock.quantity) : new Prisma.Decimal("0.000");
    const quantityAfter = quantityBefore.add(deltaMagnitude);

    let stock;
    if (!existingStock) {
      stock = await tx.inventoryStock.create({
        data: {
          organizationId,
          branchId,
          productId: params.productId,
          variantId,
          quantity: quantityAfter,
        },
      });
    } else {
      stock = await tx.inventoryStock.update({
        where: { id: existingStock.id },
        data: { quantity: quantityAfter },
      });
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        organizationId,
        branchId,
        productId: params.productId,
        variantId,
        movementType: params.movementType as StockMovementType,
        quantityDelta: deltaMagnitude,
        quantityBefore,
        quantityAfter,
        referenceType: params.referenceType?.trim() || null,
        referenceId: params.referenceId?.trim() || null,
        reason: params.reason?.trim() || null,
        notes: params.notes?.trim() || null,
        performedByUserId: user.id,
      },
    });

    return { stock, movement };
  });
}

/**
 * Records an inventory outflow (SALE, PURCHASE_RETURN, ADJUSTMENT_OUT, DAMAGE, WASTE, TRANSFER_OUT).
 * Decreases stock balance and writes a negative movement record atomically.
 * Strictly prevents negative stock balance.
 */
export async function recordStockOutflow(params: {
  organizationId?: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
  quantity: number | string | Prisma.Decimal;
  movementType: "SALE" | "PURCHASE_RETURN" | "ADJUSTMENT_OUT" | "DAMAGE" | "WASTE" | "TRANSFER_OUT";
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  notes?: string;
  actorUser?: AppUserContext | null;
}): Promise<StockMutationResult> {
  const validOutflowTypes: readonly string[] = [
    "SALE",
    "PURCHASE_RETURN",
    "ADJUSTMENT_OUT",
    "DAMAGE",
    "WASTE",
    "TRANSFER_OUT",
  ];
  if (!validOutflowTypes.includes(params.movementType)) {
    throw new InventoryValidationError(
      `Invalid outflow movement type "${params.movementType}". Expected one of: ${validOutflowTypes.join(", ")}.`
    );
  }

  const { organizationId, branchId, user } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: true,
    actorUser: params.actorUser,
  });

  const { variantId } = await resolveStockItem({
    organizationId,
    branchId,
    productId: params.productId,
    variantId: params.variantId,
  });

  const deductionMagnitude = parseQuantity(params.quantity, "Outflow Quantity", false);

  return db.$transaction(async (tx) => {
    // Idempotency lock if reference supplied
    if (params.referenceType && params.referenceId) {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${`ref_${params.referenceType}_${params.referenceId}`}))
      `;
      const existing = await tx.inventoryMovement.findFirst({
        where: {
          organizationId,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
        },
      });
      if (existing) {
        const currentStock = await tx.inventoryStock.findFirst({
          where: { branchId, productId: params.productId, variantId: variantId ?? undefined },
        });
        if (!currentStock) {
          throw new InventoryNotFoundError("Associated stock record not found for idempotent reference.");
        }
        return { stock: currentStock, movement: existing };
      }
    }

    // Lock and fetch current stock
    const existingStock = await lockAndFetchStockRecord(tx, branchId, params.productId, variantId);
    if (!existingStock) {
      throw new InsufficientStockError(
        `Cannot deduct stock: No inventory record exists for this item at branch "${branchId}". Available: 0.000, Requested: ${deductionMagnitude.toString()}`
      );
    }

    const quantityBefore = new Prisma.Decimal(existingStock.quantity);
    const quantityDelta = deductionMagnitude.negated(); // negative delta
    const quantityAfter = quantityBefore.add(quantityDelta);

    if (quantityAfter.lessThan(0)) {
      throw new InsufficientStockError(
        `Insufficient stock. Available: ${quantityBefore.toString()}, Requested: ${deductionMagnitude.toString()}`
      );
    }

    const stock = await tx.inventoryStock.update({
      where: { id: existingStock.id },
      data: { quantity: quantityAfter },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        organizationId,
        branchId,
        productId: params.productId,
        variantId,
        movementType: params.movementType as StockMovementType,
        quantityDelta,
        quantityBefore,
        quantityAfter,
        referenceType: params.referenceType?.trim() || null,
        referenceId: params.referenceId?.trim() || null,
        reason: params.reason?.trim() || null,
        notes: params.notes?.trim() || null,
        performedByUserId: user.id,
      },
    });

    return { stock, movement };
  });
}

/**
 * Reconciles stock to a specific target count (Stocktake / Physical inventory reconciliation).
 * Calculates delta = newQuantity - currentQuantity and creates ADJUSTMENT_IN or ADJUSTMENT_OUT.
 */
export async function adjustStock(params: {
  organizationId?: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
  newQuantity: number | string | Prisma.Decimal;
  reason: string;
  notes?: string;
  actorUser?: AppUserContext | null;
}): Promise<StockMutationResult> {
  const reason = params.reason?.trim();
  if (!reason || reason.length < 2) {
    throw new InventoryValidationError("Adjustment reason is required (minimum 2 characters).");
  }

  const { organizationId, branchId, user } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: true,
    actorUser: params.actorUser,
  });

  const { variantId } = await resolveStockItem({
    organizationId,
    branchId,
    productId: params.productId,
    variantId: params.variantId,
  });

  const targetQuantity = parseQuantity(params.newQuantity, "Target Adjustment Quantity", true);

  return db.$transaction(async (tx) => {
    const existingStock = await lockAndFetchStockRecord(tx, branchId, params.productId, variantId);
    const quantityBefore = existingStock ? new Prisma.Decimal(existingStock.quantity) : new Prisma.Decimal("0.000");

    const quantityDelta = targetQuantity.minus(quantityBefore);
    if (quantityDelta.isZero()) {
      throw new InventoryValidationError(
        `Target quantity (${targetQuantity.toString()}) is identical to current stock. Adjustment delta cannot be zero.`
      );
    }

    const movementType = quantityDelta.greaterThan(0) ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";

    let stock;
    if (!existingStock) {
      stock = await tx.inventoryStock.create({
        data: {
          organizationId,
          branchId,
          productId: params.productId,
          variantId,
          quantity: targetQuantity,
        },
      });
    } else {
      stock = await tx.inventoryStock.update({
        where: { id: existingStock.id },
        data: { quantity: targetQuantity },
      });
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        organizationId,
        branchId,
        productId: params.productId,
        variantId,
        movementType,
        quantityDelta,
        quantityBefore,
        quantityAfter: targetQuantity,
        reason,
        notes: params.notes?.trim() || null,
        performedByUserId: user.id,
      },
    });

    return { stock, movement };
  });
}

/**
 * Updates reorder level and reorder quantity thresholds for a stock item.
 */
export async function updateStockThresholds(params: {
  organizationId?: string;
  branchId: string;
  stockId: string;
  reorderLevel?: number | string | Prisma.Decimal | null;
  reorderQuantity?: number | string | Prisma.Decimal | null;
  actorUser?: AppUserContext | null;
}) {
  const { organizationId, branchId } = await resolveAuthorizedInventoryContext({
    organizationId: params.organizationId,
    branchId: params.branchId,
    requireMutation: true,
    actorUser: params.actorUser,
  });

  const stock = await db.inventoryStock.findUnique({
    where: { id: params.stockId },
  });

  if (!stock || stock.branchId !== branchId || stock.organizationId !== organizationId) {
    throw new InventoryNotFoundError("Inventory stock record not found in authorized branch.");
  }

  const reorderLevel =
    params.reorderLevel !== undefined
      ? parseOptionalThreshold(params.reorderLevel, "Reorder Level")
      : stock.reorderLevel;

  const reorderQuantity =
    params.reorderQuantity !== undefined
      ? parseOptionalThreshold(params.reorderQuantity, "Reorder Quantity")
      : stock.reorderQuantity;

  return db.inventoryStock.update({
    where: { id: stock.id },
    data: {
      reorderLevel,
      reorderQuantity,
    },
  });
}
