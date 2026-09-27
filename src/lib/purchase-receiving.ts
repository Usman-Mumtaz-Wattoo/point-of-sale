import "server-only";
import { Prisma, PurchaseStatus } from "@prisma/client";
import { db } from "./db";
import {
  resolveAuthorizedPurchaseContext,
  type AppUserContext,
  PurchaseNotFoundError,
  PurchaseStateError,
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
} from "./purchases";
import { applyStockInflowTransaction } from "./inventory";
import { checkBranchAccess } from "./memberships";

// ============================================================================
// DOMAIN ERROR HIERARCHY
// ============================================================================

export class PurchaseReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseReceiptError";
  }
}

export class PurchaseReceiptValidationError extends PurchaseReceiptError {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseReceiptValidationError";
  }
}

export class PurchaseReceiptNotFoundError extends PurchaseReceiptError {
  constructor(message = "Purchase receipt not found.") {
    super(message);
    this.name = "PurchaseReceiptNotFoundError";
  }
}

export class PurchaseReceiptConflictError extends PurchaseReceiptError {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseReceiptConflictError";
  }
}

export {
  PurchaseNotFoundError,
  PurchaseStateError,
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
};

// ============================================================================
// INPUT & OUTPUT INTERFACES
// ============================================================================

export interface ReceivePurchaseOrderItemInput {
  purchaseItemId: string;
  quantityReceived: number | string | Prisma.Decimal;
}

export interface ReceivePurchaseOrderInput {
  purchaseId: string;
  items: ReceivePurchaseOrderItemInput[];
  receivedAt?: Date | string | null;
  notes?: string | null;
}

export interface ReceivePurchaseOrderOptions {
  organizationId?: string;
  actorUser?: AppUserContext | null;
}

export interface ListReceiptsOptions {
  organizationId?: string;
  actorUser?: AppUserContext | null;
  limit?: number;
  offset?: number;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function parseReceivedQuantity(value: unknown, fieldName: string): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    throw new PurchaseReceiptValidationError(`${fieldName} is required.`);
  }

  let dec: Prisma.Decimal;
  try {
    dec = new Prisma.Decimal(value as Prisma.Decimal.Value);
  } catch {
    throw new PurchaseReceiptValidationError(`${fieldName} must be a valid numeric quantity.`);
  }

  if (dec.isNaN() || !dec.isFinite()) {
    throw new PurchaseReceiptValidationError(`${fieldName} must be a finite number.`);
  }

  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 3) {
    throw new PurchaseReceiptValidationError(`${fieldName} cannot exceed 3 decimal places.`);
  }

  if (dec.lessThanOrEqualTo(0)) {
    throw new PurchaseReceiptValidationError(`${fieldName} must be strictly greater than 0.`);
  }

  if (dec.greaterThan("999999999.999")) {
    throw new PurchaseReceiptValidationError(`${fieldName} exceeds maximum capacity.`);
  }

  return dec;
}

function parseOptionalDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = new Date(value as string | number | Date);
  if (isNaN(date.getTime())) {
    throw new PurchaseReceiptValidationError(`Invalid date format for ${fieldName}.`);
  }
  return date;
}

// ============================================================================
// CONCURRENCY-SAFE RECEIPT NUMBER GENERATOR
// ============================================================================

/**
 * Generates an organization-unique, sequential receipt number (e.g. REC-202609-0001).
 * Uses a PostgreSQL transaction advisory lock to serialize number generation per organization.
 */
async function generateReceiptNumber(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<string> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('receipt_number'), hashtext(${organizationId}))
  `;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `REC-${yearMonth}-`;

  const latest = await tx.purchaseReceipt.findFirst({
    where: {
      organizationId,
      receiptNumber: { startsWith: prefix },
    },
    orderBy: { receiptNumber: "desc" },
    select: { receiptNumber: true },
  });

  let nextSeq = 1;
  if (latest?.receiptNumber) {
    const parts = latest.receiptNumber.split("-");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  let candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  while (
    await tx.purchaseReceipt.findFirst({
      where: { organizationId, receiptNumber: candidate },
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
 * Receives physical goods against a Purchase Order atomically.
 *
 * Operations executed within ONE transaction:
 * 1. Locks Purchase row via SELECT FOR UPDATE and validates status (ORDERED or PARTIALLY_RECEIVED).
 * 2. Locks each specified PurchaseItem via SELECT FOR UPDATE and validates against over-receipt.
 * 3. Generates unique sequential receiptNumber via advisory locking.
 * 4. Creates PurchaseReceipt header.
 * 5. For each item: creates PurchaseReceiptItem, applies inventory inflow via applyStockInflowTransaction,
 *    and increments PurchaseItem.quantityReceived.
 * 6. Recalculates Purchase.status based on cumulative received quantities across all purchase items.
 */
export async function receivePurchaseOrder(
  input: ReceivePurchaseOrderInput,
  options?: ReceivePurchaseOrderOptions
) {
  // 1. Resolve authorized user and organization context (Requires mutation role: OWNER, MANAGER, INVENTORY_MANAGER)
  const { organizationId, user } = await resolveAuthorizedPurchaseContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  // 2. Validate input parameters
  if (!input.purchaseId || typeof input.purchaseId !== "string" || input.purchaseId.trim().length === 0) {
    throw new PurchaseReceiptValidationError("Purchase ID is required.");
  }
  const cleanPurchaseId = input.purchaseId.trim();

  if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
    throw new PurchaseReceiptValidationError("Receipt must contain at least one item.");
  }

  // Validate duplicate purchaseItemId in input
  const seenPurchaseItemIds = new Set<string>();
  const sanitizedItems: { purchaseItemId: string; quantityReceived: Prisma.Decimal }[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    if (
      !item.purchaseItemId ||
      typeof item.purchaseItemId !== "string" ||
      item.purchaseItemId.trim().length === 0
    ) {
      throw new PurchaseReceiptValidationError(`Item at index ${i}: Purchase Item ID is required.`);
    }
    const cleanItemId = item.purchaseItemId.trim();
    if (seenPurchaseItemIds.has(cleanItemId)) {
      throw new PurchaseReceiptValidationError(
        `Duplicate purchase item ID "${cleanItemId}" in receipt request. Each item can only be received once per receipt.`
      );
    }
    seenPurchaseItemIds.add(cleanItemId);

    const parsedQty = parseReceivedQuantity(item.quantityReceived, `Item at index ${i} quantity`);
    sanitizedItems.push({
      purchaseItemId: cleanItemId,
      quantityReceived: parsedQty,
    });
  }

  const receivedAt = parseOptionalDate(input.receivedAt, "Received date") || new Date();
  const notes = input.notes?.trim() || null;

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

    // Verify actor has authorized access to the purchase's branch at transaction execution time
    const hasBranchAccess = await checkBranchAccess({
      userId: user.id,
      organizationId,
      branchId: lockedPurchase.branchId,
      tx,
    });
    if (!hasBranchAccess) {
      throw new UnauthorizedRoleError(
        `User does not have authorized access to branch "${lockedPurchase.branchId}".`
      );
    }

    // b. Validate purchase status
    if (
      lockedPurchase.status !== PurchaseStatus.ORDERED &&
      lockedPurchase.status !== PurchaseStatus.PARTIALLY_RECEIVED
    ) {
      throw new PurchaseStateError(
        `Cannot receive goods for purchase "${lockedPurchase.purchaseNumber}" in ${lockedPurchase.status} status. ` +
        `Only ORDERED or PARTIALLY_RECEIVED purchase orders can be received.`
      );
    }

    // c. Lock all relevant PurchaseItems and validate quantities
    // Sort purchaseItemIds deterministically to prevent locking deadlocks
    const sortedItems = [...sanitizedItems].sort((a, b) =>
      a.purchaseItemId.localeCompare(b.purchaseItemId)
    );

    const itemContexts: {
      receiptQuantity: Prisma.Decimal;
      purchaseItem: {
        id: string;
        organizationId: string;
        purchaseId: string;
        productId: string;
        variantId: string | null;
        quantityOrdered: Prisma.Decimal;
        quantityReceived: Prisma.Decimal;
      };
    }[] = [];

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
        }[]
      >`
        SELECT id, "organizationId", "purchaseId", "productId", "variantId", "quantityOrdered", "quantityReceived"
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
        throw new PurchaseReceiptValidationError(
          `Purchase item "${item.purchaseItemId}" does not belong to purchase order "${lockedPurchase.purchaseNumber}".`
        );
      }

      const currentOrdered = new Prisma.Decimal(lockedItem.quantityOrdered);
      const currentReceived = new Prisma.Decimal(lockedItem.quantityReceived);
      const remaining = currentOrdered.minus(currentReceived);

      if (item.quantityReceived.greaterThan(remaining)) {
        throw new PurchaseReceiptValidationError(
          `Over-receipt rejected for item "${lockedItem.id}". Ordered: ${currentOrdered.toString()}, ` +
          `Already Received: ${currentReceived.toString()}, Remaining: ${remaining.toString()}, ` +
          `Attempted to Receive: ${item.quantityReceived.toString()}.`
        );
      }

      itemContexts.push({
        receiptQuantity: item.quantityReceived,
        purchaseItem: {
          id: lockedItem.id,
          organizationId: lockedItem.organizationId,
          purchaseId: lockedItem.purchaseId,
          productId: lockedItem.productId,
          variantId: lockedItem.variantId,
          quantityOrdered: currentOrdered,
          quantityReceived: currentReceived,
        },
      });
    }

    // d. Generate unique receipt number
    const receiptNumber = await generateReceiptNumber(tx, organizationId);

    // e. Create PurchaseReceipt header
    const receipt = await tx.purchaseReceipt.create({
      data: {
        organizationId,
        purchaseId: lockedPurchase.id,
        branchId: lockedPurchase.branchId,
        receiptNumber,
        receivedAt,
        receivedById: user.id,
        notes,
      },
    });

    // f. Process each item: PurchaseReceiptItem -> applyStockInflowTransaction -> PurchaseItem update
    // Sort items deterministically by inventory stock key (branchId:productId:variantId)
    // to guarantee consistent lock acquisition order and prevent inventory-level deadlocks
    const sortedItemContexts = [...itemContexts].sort((a, b) => {
      const keyA = `${lockedPurchase.branchId}:${a.purchaseItem.productId}:${a.purchaseItem.variantId ?? ""}`;
      const keyB = `${lockedPurchase.branchId}:${b.purchaseItem.productId}:${b.purchaseItem.variantId ?? ""}`;
      return keyA.localeCompare(keyB);
    });

    for (const ctx of sortedItemContexts) {
      const receiptItem = await tx.purchaseReceiptItem.create({
        data: {
          organizationId,
          receiptId: receipt.id,
          purchaseItemId: ctx.purchaseItem.id,
          quantityReceived: ctx.receiptQuantity,
        },
      });

      // Atomic inventory inflow via existing transaction-aware helper
      await applyStockInflowTransaction(tx, {
        organizationId,
        branchId: lockedPurchase.branchId,
        productId: ctx.purchaseItem.productId,
        variantId: ctx.purchaseItem.variantId,
        quantity: ctx.receiptQuantity,
        movementType: "PURCHASE_RECEIPT",
        referenceType: "PURCHASE_RECEIPT",
        referenceId: receiptItem.id,
        performedByUserId: user.id,
        notes: `Receipt ${receiptNumber} for Purchase ${lockedPurchase.purchaseNumber}`,
      });

      // Update PurchaseItem cumulative quantityReceived
      const newQtyReceived = ctx.purchaseItem.quantityReceived.add(ctx.receiptQuantity);
      await tx.purchaseItem.update({
        where: { id: ctx.purchaseItem.id },
        data: { quantityReceived: newQtyReceived },
      });
    }

    // g. Recalculate Purchase.status from all items on this purchase order
    const allPurchaseItems = await tx.purchaseItem.findMany({
      where: { purchaseId: lockedPurchase.id },
      select: { quantityOrdered: true, quantityReceived: true },
    });

    let allFullyReceived = true;
    let anyReceived = false;

    for (const pi of allPurchaseItems) {
      const ord = new Prisma.Decimal(pi.quantityOrdered);
      const rec = new Prisma.Decimal(pi.quantityReceived);

      if (!rec.equals(ord)) {
        allFullyReceived = false;
      }
      if (rec.greaterThan(0)) {
        anyReceived = true;
      }
    }

    let newStatus: PurchaseStatus;
    if (allFullyReceived) {
      newStatus = PurchaseStatus.RECEIVED;
    } else if (anyReceived) {
      newStatus = PurchaseStatus.PARTIALLY_RECEIVED;
    } else {
      newStatus = PurchaseStatus.ORDERED;
    }

    if (newStatus !== lockedPurchase.status) {
      await tx.purchase.update({
        where: { id: lockedPurchase.id },
        data: { status: newStatus },
      });
    }

    // h. Fetch and return complete receipt record with populated relations
    return tx.purchaseReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
      include: {
        purchase: {
          select: {
            id: true,
            purchaseNumber: true,
            status: true,
            orderDate: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        receivedBy: {
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
  }, { timeout: 45000, maxWait: 15000 });
}

// ============================================================================
// READ SERVICES
// ============================================================================

/**
 * Retrieves a single purchase receipt by ID within the authenticated user's organization.
 */
export async function getReceiptById(
  receiptId: string,
  options?: {
    organizationId?: string;
    actorUser?: AppUserContext | null;
  }
) {
  const { organizationId } = await resolveAuthorizedPurchaseContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  if (!receiptId || typeof receiptId !== "string" || receiptId.trim().length === 0) {
    throw new PurchaseReceiptValidationError("Receipt ID is required.");
  }

  const receipt = await db.purchaseReceipt.findFirst({
    where: {
      id: receiptId.trim(),
      organizationId,
    },
    include: {
      purchase: {
        select: {
          id: true,
          purchaseNumber: true,
          status: true,
          paymentStatus: true,
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
      receivedBy: {
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

  if (!receipt) {
    throw new PurchaseReceiptNotFoundError(`Purchase receipt with ID "${receiptId}" not found.`);
  }

  return receipt;
}

/**
 * Lists all purchase receipts associated with a specific Purchase Order.
 */
export async function listReceiptsForPurchase(
  purchaseId: string,
  options?: ListReceiptsOptions
) {
  const { organizationId } = await resolveAuthorizedPurchaseContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
    throw new PurchaseReceiptValidationError("Purchase ID is required.");
  }
  const cleanPurchaseId = purchaseId.trim();

  // Verify purchase exists in active organization
  const purchase = await db.purchase.findFirst({
    where: {
      id: cleanPurchaseId,
      organizationId,
    },
    select: { id: true },
  });

  if (!purchase) {
    throw new PurchaseNotFoundError(`Purchase order with ID "${cleanPurchaseId}" not found.`);
  }

  const limit = Math.min(Math.max(Number(options?.limit) || 50, 1), 200);
  const offset = Math.max(Number(options?.offset) || 0, 0);

  const whereClause: Prisma.PurchaseReceiptWhereInput = {
    organizationId,
    purchaseId: cleanPurchaseId,
  };

  const [receipts, totalCount] = await Promise.all([
    db.purchaseReceipt.findMany({
      where: whereClause,
      include: {
        receivedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: offset,
    }),
    db.purchaseReceipt.count({ where: whereClause }),
  ]);

  return {
    receipts,
    totalCount,
    limit,
    offset,
  };
}
