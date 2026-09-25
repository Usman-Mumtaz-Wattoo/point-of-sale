import "server-only";
import { Prisma, PurchaseStatus } from "@prisma/client";
import { db } from "./db";
import { SYSTEM_ROLES, type SystemRoleName } from "./roles";
import { getCurrentAppUser } from "./auth";
import {
  checkBranchAccess,
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
} from "./memberships";
import { PurchaseNotFoundError, type AppUserContext } from "./purchases";
import {
  applyStockOutflowTransaction,
  InsufficientStockError,
  InventoryBranchAccessError,
} from "./inventory";

// ============================================================================
// ROLE ACCESS DEFINITIONS
// ============================================================================

export const PURCHASE_RETURN_MUTATION_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
];

export const PURCHASE_RETURN_READ_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
];

// ============================================================================
// DOMAIN ERROR HIERARCHY
// ============================================================================

export class PurchaseReturnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseReturnError";
  }
}

export class PurchaseReturnValidationError extends PurchaseReturnError {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseReturnValidationError";
  }
}

export class PurchaseReturnNotFoundError extends PurchaseReturnError {
  constructor(message = "Purchase return not found.") {
    super(message);
    this.name = "PurchaseReturnNotFoundError";
  }
}

export class PurchaseReturnStateError extends PurchaseReturnError {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseReturnStateError";
  }
}

export class PurchaseReturnOverReturnError extends PurchaseReturnError {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseReturnOverReturnError";
  }
}

export {
  InsufficientStockError,
  UnauthorizedRoleError,
  MembershipNotFoundError,
  PurchaseNotFoundError,
  CrossTenantViolationError,
  InventoryBranchAccessError,
};

// ============================================================================
// INPUT & OUTPUT INTERFACES
// ============================================================================

export interface CreatePurchaseReturnItemInput {
  purchaseItemId: string;
  quantityReturned: number | string | Prisma.Decimal;
  reason?: string | null;
}

export interface CreatePurchaseReturnInput {
  purchaseId: string;
  branchId?: string | null;
  items: CreatePurchaseReturnItemInput[];
  reason?: string | null;
  notes?: string | null;
  returnDate?: Date | string | null;
}

export interface PurchaseReturnServiceOptions {
  organizationId?: string;
  actorUser?: AppUserContext | null;
}

export interface ListPurchaseReturnsOptions extends PurchaseReturnServiceOptions {
  limit?: number;
  offset?: number;
}

export interface PurchaseReturnSummary {
  purchaseId: string;
  purchaseNumber: string;
  returnCount: number;
  totalQuantityReturned: Prisma.Decimal;
  totalReturnedAmount: Prisma.Decimal;
}

export interface AuthorizedReturnContext {
  user: AppUserContext;
  organizationId: string;
  role: SystemRoleName;
}

// ============================================================================
// CONTEXT RESOLUTION & VALIDATION
// ============================================================================

/**
 * Resolves and verifies the authenticated user's organization context and return permissions.
 * Never trusts a client-supplied organizationId.
 */
export async function resolveAuthorizedReturnContext(params?: {
  organizationId?: string;
  requireMutation?: boolean;
  actorUser?: AppUserContext | null;
}): Promise<AuthorizedReturnContext> {
  const user = params?.actorUser !== undefined ? params.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  const requestedOrgId = params?.organizationId;
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

  const roleName = membership.role.name as SystemRoleName;

  if (params?.requireMutation) {
    if (!PURCHASE_RETURN_MUTATION_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to create purchase returns. Required one of: ${PURCHASE_RETURN_MUTATION_ROLES.join(
          ", "
        )}.`
      );
    }
  } else {
    if (!PURCHASE_RETURN_READ_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to view purchase returns.`
      );
    }
  }

  return {
    user,
    organizationId: membership.organizationId,
    role: roleName,
  };
}

function parseReturnQuantity(value: unknown, fieldName: string): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    throw new PurchaseReturnValidationError(`${fieldName} is required.`);
  }

  let dec: Prisma.Decimal;
  try {
    dec = new Prisma.Decimal(value as Prisma.Decimal.Value);
  } catch {
    throw new PurchaseReturnValidationError(`${fieldName} must be a valid numeric quantity.`);
  }

  if (dec.isNaN() || !dec.isFinite()) {
    throw new PurchaseReturnValidationError(`${fieldName} must be a finite number.`);
  }

  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 3) {
    throw new PurchaseReturnValidationError(`${fieldName} cannot exceed 3 decimal places.`);
  }

  if (dec.lessThanOrEqualTo(0)) {
    throw new PurchaseReturnValidationError(`${fieldName} must be strictly greater than 0.`);
  }

  if (dec.greaterThan("999999999.999")) {
    throw new PurchaseReturnValidationError(`${fieldName} exceeds maximum supported capacity.`);
  }

  return dec;
}

function parseOptionalDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = new Date(value as string | number | Date);
  if (isNaN(date.getTime())) {
    throw new PurchaseReturnValidationError(`Invalid date format for ${fieldName}.`);
  }
  return date;
}

// ============================================================================
// CONCURRENCY-SAFE RETURN NUMBER GENERATOR
// ============================================================================

/**
 * Generates an organization-unique, sequential return number (e.g. PR-202609-0001).
 * Uses a PostgreSQL transaction-scoped advisory lock to serialize number generation per organization.
 */
async function generateReturnNumber(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<string> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('purchase_return_number'), hashtext(${organizationId}))
  `;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PR-${yearMonth}-`;

  const latest = await tx.purchaseReturn.findFirst({
    where: {
      organizationId,
      returnNumber: { startsWith: prefix },
    },
    orderBy: { returnNumber: "desc" },
    select: { returnNumber: true },
  });

  let nextSeq = 1;
  if (latest?.returnNumber) {
    const parts = latest.returnNumber.split("-");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  let candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  while (
    await tx.purchaseReturn.findFirst({
      where: { organizationId, returnNumber: candidate },
      select: { id: true },
    })
  ) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  return candidate;
}

// ============================================================================
// MUTATION SERVICES
// ============================================================================

/**
 * Atomically records a purchase return against an existing received or partially received purchase order.
 *
 * Sequence inside ONE database transaction:
 * 1. Locks Purchase row via SELECT FOR UPDATE.
 * 2. Validates purchase status (PARTIALLY_RECEIVED or RECEIVED).
 * 3. Validates branch ownership and authorized branch access.
 * 4. Sorts target PurchaseItem IDs lexicographically to prevent circular deadlocks.
 * 5. Locks each target PurchaseItem row via SELECT FOR UPDATE in sorted order.
 * 6. Validates quantityReceived > 0 and requestedQuantity <= (quantityReceived - quantityReturned).
 * 7. Generates sequential returnNumber using transaction advisory lock.
 * 8. Creates PurchaseReturn header.
 * 9. For each item: creates PurchaseReturnItem, calls applyStockOutflowTransaction, and increments PurchaseItem.quantityReturned.
 * 10. Returns created return record with populated relations.
 */
export async function createPurchaseReturn(
  input: CreatePurchaseReturnInput,
  options?: PurchaseReturnServiceOptions
) {
  // 1. Resolve authorized user and organization context (Requires mutation role: OWNER, MANAGER, INVENTORY_MANAGER)
  const { organizationId, user } = await resolveAuthorizedReturnContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  // 2. Validate input parameters
  if (!input.purchaseId || typeof input.purchaseId !== "string" || input.purchaseId.trim().length === 0) {
    throw new PurchaseReturnValidationError("Purchase ID is required.");
  }
  const cleanPurchaseId = input.purchaseId.trim();

  if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
    throw new PurchaseReturnValidationError("Purchase return must contain at least one item.");
  }

  // Reject duplicate items in single request
  const seenPurchaseItemIds = new Set<string>();
  const sanitizedItems: {
    purchaseItemId: string;
    quantityReturned: Prisma.Decimal;
    reason: string | null;
  }[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    if (
      !item.purchaseItemId ||
      typeof item.purchaseItemId !== "string" ||
      item.purchaseItemId.trim().length === 0
    ) {
      throw new PurchaseReturnValidationError(`Item at index ${i}: Purchase Item ID is required.`);
    }
    const cleanItemId = item.purchaseItemId.trim();
    if (seenPurchaseItemIds.has(cleanItemId)) {
      throw new PurchaseReturnValidationError(
        `Duplicate purchase item ID "${cleanItemId}" in return request. Each item can only be returned once per return.`
      );
    }
    seenPurchaseItemIds.add(cleanItemId);

    const parsedQty = parseReturnQuantity(
      item.quantityReturned,
      `Item at index ${i} return quantity`
    );
    sanitizedItems.push({
      purchaseItemId: cleanItemId,
      quantityReturned: parsedQty,
      reason: item.reason?.trim() || null,
    });
  }

  const returnDate = parseOptionalDate(input.returnDate, "Return date") || new Date();
  const cleanReason = input.reason?.trim() || null;
  const cleanNotes = input.notes?.trim() || null;

  if (cleanReason && cleanReason.length > 255) {
    throw new PurchaseReturnValidationError("Reason cannot exceed 255 characters.");
  }
  if (cleanNotes && cleanNotes.length > 1000) {
    throw new PurchaseReturnValidationError("Notes cannot exceed 1000 characters.");
  }

  // 3. Execute atomic transaction
  return db.$transaction(async (tx) => {
    // a. Lock Purchase row for update
    const rawPurchases = await tx.$queryRaw<
      {
        id: string;
        organizationId: string;
        branchId: string;
        status: PurchaseStatus;
        purchaseNumber: string;
      }[]
    >`
      SELECT id, "organizationId", "branchId", status, "purchaseNumber"
      FROM "Purchase"
      WHERE id = ${cleanPurchaseId}
      FOR UPDATE
    `;
    const lockedPurchase = rawPurchases[0];

    if (!lockedPurchase || lockedPurchase.organizationId !== organizationId) {
      throw new PurchaseNotFoundError(`Purchase order with ID "${cleanPurchaseId}" not found.`);
    }

    // Validate branch consistency if branchId supplied
    if (input.branchId && input.branchId.trim() !== lockedPurchase.branchId) {
      throw new PurchaseReturnValidationError(
        `Purchase return branch "${input.branchId.trim()}" does not match purchase order branch "${lockedPurchase.branchId}". ` +
        `Returns must be processed against the branch where the purchase order was received.`
      );
    }

    // Verify authorized branch access for the user
    const hasBranchAccess = await checkBranchAccess({
      userId: user.id,
      organizationId,
      branchId: lockedPurchase.branchId,
    });
    if (!hasBranchAccess) {
      throw new InventoryBranchAccessError(
        `User does not have authorized access to branch "${lockedPurchase.branchId}".`
      );
    }

    // b. Validate purchase status: strictly allowed only on PARTIALLY_RECEIVED or RECEIVED
    if (
      lockedPurchase.status !== PurchaseStatus.PARTIALLY_RECEIVED &&
      lockedPurchase.status !== PurchaseStatus.RECEIVED
    ) {
      throw new PurchaseReturnStateError(
        `Cannot record return for purchase "${lockedPurchase.purchaseNumber}" in ${lockedPurchase.status} status. ` +
        `Purchase returns are allowed only on PARTIALLY_RECEIVED or RECEIVED purchase orders.`
      );
    }

    // c. Deterministic lock ordering: sort items lexicographically by purchaseItemId
    const sortedItems = [...sanitizedItems].sort((a, b) =>
      a.purchaseItemId.localeCompare(b.purchaseItemId)
    );

    const itemContexts: {
      quantityReturned: Prisma.Decimal;
      reason: string | null;
      unitCost: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      qtyAlreadyReturned: Prisma.Decimal;
      lockedItem: {
        id: string;
        organizationId: string;
        purchaseId: string;
        productId: string;
        variantId: string | null;
        quantityOrdered: Prisma.Decimal;
        quantityReceived: Prisma.Decimal;
        quantityReturned: Prisma.Decimal;
        unitCost: Prisma.Decimal;
      };
    }[] = [];

    // d. Lock all target PurchaseItems in sorted order and validate returnable quantities
    for (const item of sortedItems) {
      const rawItems = await tx.$queryRaw<
        {
          id: string;
          organizationId: string;
          purchaseId: string;
          productId: string;
          variantId: string | null;
          quantityOrdered: Prisma.Decimal;
          quantityReceived: Prisma.Decimal;
          quantityReturned: Prisma.Decimal;
          unitCost: Prisma.Decimal;
        }[]
      >`
        SELECT id, "organizationId", "purchaseId", "productId", "variantId", "quantityOrdered", "quantityReceived", "quantityReturned", "unitCost"
        FROM "PurchaseItem"
        WHERE id = ${item.purchaseItemId}
        FOR UPDATE
      `;
      const lockedItem = rawItems[0];

      if (
        !lockedItem ||
        lockedItem.organizationId !== organizationId ||
        lockedItem.purchaseId !== lockedPurchase.id
      ) {
        throw new PurchaseReturnValidationError(
          `Purchase item "${item.purchaseItemId}" does not belong to purchase order "${lockedPurchase.purchaseNumber}".`
        );
      }

      const qtyReceived = new Prisma.Decimal(lockedItem.quantityReceived);
      const qtyAlreadyReturned = new Prisma.Decimal(lockedItem.quantityReturned);
      const unitCost = new Prisma.Decimal(lockedItem.unitCost);

      if (qtyReceived.lessThanOrEqualTo(0)) {
        throw new PurchaseReturnValidationError(
          `Cannot return purchase item "${lockedItem.id}": No goods have been received for this item (received: ${qtyReceived.toString()}).`
        );
      }

      const remainingReturnable = qtyReceived.minus(qtyAlreadyReturned);
      if (item.quantityReturned.greaterThan(remainingReturnable)) {
        throw new PurchaseReturnOverReturnError(
          `Return quantity (${item.quantityReturned.toString()}) exceeds remaining returnable quantity (${remainingReturnable.toString()}) ` +
          `for purchase item "${lockedItem.id}". Total Received: ${qtyReceived.toString()}, Already Returned: ${qtyAlreadyReturned.toString()}.`
        );
      }

      const lineTotal = item.quantityReturned.mul(unitCost);

      itemContexts.push({
        quantityReturned: item.quantityReturned,
        reason: item.reason,
        unitCost,
        lineTotal,
        qtyAlreadyReturned,
        lockedItem: {
          id: lockedItem.id,
          organizationId: lockedItem.organizationId,
          purchaseId: lockedItem.purchaseId,
          productId: lockedItem.productId,
          variantId: lockedItem.variantId,
          quantityOrdered: new Prisma.Decimal(lockedItem.quantityOrdered),
          quantityReceived: qtyReceived,
          quantityReturned: qtyAlreadyReturned,
          unitCost,
        },
      });
    }

    // e. Generate unique sequential return number
    const returnNumber = await generateReturnNumber(tx, organizationId);

    // f. Create PurchaseReturn header
    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        organizationId,
        purchaseId: lockedPurchase.id,
        branchId: lockedPurchase.branchId,
        returnNumber,
        returnDate,
        returnedById: user.id,
        reason: cleanReason,
        notes: cleanNotes,
      },
    });

    // g. Process each return item: PurchaseReturnItem -> applyStockOutflowTransaction -> update PurchaseItem.quantityReturned
    for (const ctx of itemContexts) {
      const returnItem = await tx.purchaseReturnItem.create({
        data: {
          organizationId,
          returnId: purchaseReturn.id,
          purchaseItemId: ctx.lockedItem.id,
          quantityReturned: ctx.quantityReturned,
          unitCost: ctx.unitCost,
          lineTotal: ctx.lineTotal,
          reason: ctx.reason,
        },
      });

      // Apply atomic inventory outflow via extracted helper (strictly checks inventory existence)
      await applyStockOutflowTransaction(tx, {
        organizationId,
        branchId: lockedPurchase.branchId,
        productId: ctx.lockedItem.productId,
        variantId: ctx.lockedItem.variantId,
        quantity: ctx.quantityReturned,
        movementType: "PURCHASE_RETURN",
        referenceType: "PURCHASE_RETURN_ITEM",
        referenceId: returnItem.id,
        reason: ctx.reason || cleanReason || `Purchase Return ${returnNumber}`,
        notes: cleanNotes,
        performedByUserId: user.id,
      });

      // Increment PurchaseItem cumulative quantityReturned
      const newQtyReturned = ctx.qtyAlreadyReturned.add(ctx.quantityReturned);
      await tx.purchaseItem.update({
        where: { id: ctx.lockedItem.id },
        data: { quantityReturned: newQtyReturned },
      });
    }

    // Note: Purchase.status is explicitly preserved and NOT modified.
    // Financial values (totalAmount, paidAmount, paymentStatus) are explicitly preserved.

    // h. Fetch and return complete return record with populated relations
    return tx.purchaseReturn.findUniqueOrThrow({
      where: { id: purchaseReturn.id },
      include: {
        purchase: {
          select: {
            id: true,
            purchaseNumber: true,
            status: true,
            paymentStatus: true,
            totalAmount: true,
            paidAmount: true,
            orderDate: true,
            supplier: {
              select: {
                id: true,
                name: true,
                contactPerson: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
          },
        },
        returnedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          include: {
            purchaseItem: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    unit: true,
                  },
                },
                variant: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  });
}

// ============================================================================
// READ SERVICES
// ============================================================================

/**
 * Retrieves a single purchase return by ID within the authenticated user's organization.
 */
export async function getPurchaseReturnById(
  returnId: string,
  options?: PurchaseReturnServiceOptions
) {
  const { organizationId, user } = await resolveAuthorizedReturnContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  if (!returnId || typeof returnId !== "string" || returnId.trim().length === 0) {
    throw new PurchaseReturnValidationError("Return ID is required.");
  }

  const purchaseReturn = await db.purchaseReturn.findFirst({
    where: {
      id: returnId.trim(),
      organizationId,
    },
    include: {
      purchase: {
        select: {
          id: true,
          purchaseNumber: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          paidAmount: true,
          orderDate: true,
          supplier: {
            select: {
              id: true,
              name: true,
              contactPerson: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
        },
      },
      returnedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        include: {
          purchaseItem: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  unit: true,
                },
              },
              variant: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!purchaseReturn) {
    throw new PurchaseReturnNotFoundError(`Purchase return with ID "${returnId}" not found.`);
  }

  // Branch access check for the user
  const hasBranchAccess = await checkBranchAccess({
    userId: user.id,
    organizationId,
    branchId: purchaseReturn.branchId,
  });
  if (!hasBranchAccess) {
    throw new InventoryBranchAccessError(
      `User does not have authorized access to branch "${purchaseReturn.branchId}".`
    );
  }

  return purchaseReturn;
}

/**
 * Lists all purchase returns recorded for a specific Purchase Order.
 */
export async function listPurchaseReturnsForPurchase(
  purchaseId: string,
  options?: ListPurchaseReturnsOptions
) {
  const { organizationId, user } = await resolveAuthorizedReturnContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
    throw new PurchaseReturnValidationError("Purchase ID is required.");
  }
  const cleanPurchaseId = purchaseId.trim();

  // Verify purchase exists in active organization
  const purchase = await db.purchase.findFirst({
    where: {
      id: cleanPurchaseId,
      organizationId,
    },
    select: { id: true, branchId: true },
  });

  if (!purchase) {
    throw new PurchaseNotFoundError(`Purchase order with ID "${cleanPurchaseId}" not found.`);
  }

  // Verify branch access
  const hasBranchAccess = await checkBranchAccess({
    userId: user.id,
    organizationId,
    branchId: purchase.branchId,
  });
  if (!hasBranchAccess) {
    throw new InventoryBranchAccessError(
      `User does not have authorized access to branch "${purchase.branchId}".`
    );
  }

  const limit = Math.min(Math.max(Number(options?.limit) || 50, 1), 200);
  const offset = Math.max(Number(options?.offset) || 0, 0);

  const whereClause: Prisma.PurchaseReturnWhereInput = {
    organizationId,
    purchaseId: cleanPurchaseId,
  };

  const [returns, totalCount] = await Promise.all([
    db.purchaseReturn.findMany({
      where: whereClause,
      include: {
        returnedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          include: {
            purchaseItem: {
              include: {
                product: { select: { id: true, name: true, sku: true, unit: true } },
                variant: { select: { id: true, name: true, sku: true } },
              },
            },
          },
        },
      },
      orderBy: [{ returnDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: offset,
    }),
    db.purchaseReturn.count({ where: whereClause }),
  ]);

  return {
    returns,
    totalCount,
    limit,
    offset,
  };
}

/**
 * Returns an aggregate summary of all returns processed against a Purchase Order.
 */
export async function getPurchaseReturnSummary(
  purchaseId: string,
  options?: PurchaseReturnServiceOptions
): Promise<PurchaseReturnSummary> {
  const { organizationId, user } = await resolveAuthorizedReturnContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
    throw new PurchaseReturnValidationError("Purchase ID is required.");
  }
  const cleanPurchaseId = purchaseId.trim();

  const purchase = await db.purchase.findFirst({
    where: {
      id: cleanPurchaseId,
      organizationId,
    },
    select: {
      id: true,
      purchaseNumber: true,
      branchId: true,
      returns: {
        select: {
          items: {
            select: {
              quantityReturned: true,
              lineTotal: true,
            },
          },
        },
      },
    },
  });

  if (!purchase) {
    throw new PurchaseNotFoundError(`Purchase order with ID "${cleanPurchaseId}" not found.`);
  }

  const hasBranchAccess = await checkBranchAccess({
    userId: user.id,
    organizationId,
    branchId: purchase.branchId,
  });
  if (!hasBranchAccess) {
    throw new InventoryBranchAccessError(
      `User does not have authorized access to branch "${purchase.branchId}".`
    );
  }

  let totalQuantityReturned = new Prisma.Decimal("0.000");
  let totalReturnedAmount = new Prisma.Decimal("0.00");

  for (const ret of purchase.returns) {
    for (const item of ret.items) {
      totalQuantityReturned = totalQuantityReturned.add(new Prisma.Decimal(item.quantityReturned));
      totalReturnedAmount = totalReturnedAmount.add(new Prisma.Decimal(item.lineTotal));
    }
  }

  return {
    purchaseId: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    returnCount: purchase.returns.length,
    totalQuantityReturned,
    totalReturnedAmount,
  };
}
