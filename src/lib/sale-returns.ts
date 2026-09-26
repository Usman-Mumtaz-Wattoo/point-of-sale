import "server-only";
import crypto from "crypto";
import { Prisma, SalePaymentMethod, SalePaymentStatus, SaleStatus } from "@prisma/client";
import { db } from "./db";
import { SYSTEM_ROLES, type SystemRoleName } from "./roles";
import { getCurrentAppUser } from "./auth";
import {
  checkBranchAccess,
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
} from "./memberships";
import {
  applyStockInflowTransaction,
  InsufficientStockError,
  InventoryBranchAccessError,
} from "./inventory";

// ============================================================================
// ROLE ACCESS DEFINITIONS
// ============================================================================

export const SALE_RETURN_MUTATION_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
];

export const SALE_RETURN_READ_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.ACCOUNTANT,
];

// ============================================================================
// DOMAIN ERROR HIERARCHY
// ============================================================================

export class SaleReturnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleReturnError";
  }
}

export class SaleReturnValidationError extends SaleReturnError {
  constructor(message: string) {
    super(message);
    this.name = "SaleReturnValidationError";
  }
}

export class SaleReturnNotFoundError extends SaleReturnError {
  constructor(message = "Sale return not found.") {
    super(message);
    this.name = "SaleReturnNotFoundError";
  }
}

export class SaleReturnStateError extends SaleReturnError {
  constructor(message: string) {
    super(message);
    this.name = "SaleReturnStateError";
  }
}

export class SaleReturnOverReturnError extends SaleReturnError {
  constructor(message: string) {
    super(message);
    this.name = "SaleReturnOverReturnError";
  }
}

export class SaleRefundCeilingExceededError extends SaleReturnError {
  constructor(message: string) {
    super(message);
    this.name = "SaleRefundCeilingExceededError";
  }
}

export class SaleReturnIdempotencyConflictError extends SaleReturnError {
  constructor(
    message = "Idempotency key was previously used with a different request payload."
  ) {
    super(message);
    this.name = "SaleReturnIdempotencyConflictError";
  }
}

export class SaleReturnBranchAccessError extends SaleReturnError {
  constructor(message = "User does not have authorized access to branch.") {
    super(message);
    this.name = "SaleReturnBranchAccessError";
  }
}

export {
  InsufficientStockError,
  UnauthorizedRoleError,
  MembershipNotFoundError,
  CrossTenantViolationError,
  InventoryBranchAccessError,
};

// ============================================================================
// INPUT & OUTPUT INTERFACES
// ============================================================================

export interface AppUserContext {
  id: string;
  email: string;
  name: string;
  memberships: Array<{
    id: string;
    organizationId: string;
    role: { id: string; name: string };
    isActive: boolean;
    branchMemberships: Array<{
      id: string;
      branchId: string;
      branch: { id: string; isActive: boolean };
    }>;
  }>;
}

export interface CreateSaleReturnItemInput {
  saleItemId: string;
  quantityReturned: number | string | Prisma.Decimal;
  reason?: string | null;
}

export interface CreateSaleReturnRefundInput {
  paymentMethod: SalePaymentMethod;
  reference?: string | null;
  notes?: string | null;
}

export interface CreateSaleReturnInput {
  saleId: string;
  items: CreateSaleReturnItemInput[];
  refund: CreateSaleReturnRefundInput;
  idempotencyKey?: string | null;
  reason?: string | null;
  notes?: string | null;
  returnDate?: Date | string | null;
}

export interface SaleReturnServiceOptions {
  organizationId?: string;
  actorUser?: AppUserContext | null;
}

export interface ListSaleReturnsInput {
  branchId?: string | null;
  saleId?: string | null;
  invoiceNumber?: string | null;
  returnNumber?: string | null;
  dateFrom?: Date | string | null;
  dateTo?: Date | string | null;
  search?: string | null;
  page?: number | null;
  pageSize?: number | null;
}

export interface SaleReturnItemDetailDTO {
  id: string;
  returnId: string;
  saleItemId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string | null;
  quantityReturned: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  reason: string | null;
  createdAt: Date;
}

export interface SaleRefundDetailDTO {
  id: string;
  organizationId: string;
  saleId: string;
  returnId: string | null;
  refundNumber: string;
  paymentMethod: SalePaymentMethod;
  amount: Prisma.Decimal;
  reference: string | null;
  notes: string | null;
  refundedAt: Date;
  processedById: string | null;
  createdAt: Date;
}

export interface SaleReturnDetailDTO {
  id: string;
  organizationId: string;
  saleId: string;
  branchId: string;
  returnNumber: string;
  idempotencyKey: string | null;
  returnDate: Date;
  returnedById: string | null;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  refundedAmount: Prisma.Decimal;
  reason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  sale: {
    id: string;
    invoiceNumber: string;
    saleDate: Date;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
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
  items: SaleReturnItemDetailDTO[];
  refunds: SaleRefundDetailDTO[];
}

export interface PaginatedSaleReturnsResult {
  items: SaleReturnDetailDTO[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface SaleReturnableItemDTO {
  saleItemId: string;
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string | null;
  quantitySold: Prisma.Decimal;
  quantityAlreadyReturned: Prisma.Decimal;
  quantityReturnable: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  totalRefundableAmount: Prisma.Decimal;
  amountAlreadyReturned: Prisma.Decimal;
  amountRemainingRefundable: Prisma.Decimal;
}

export interface SaleReturnableInfoDTO {
  saleId: string;
  invoiceNumber: string;
  saleDate: Date;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  totalRefundedAmount: Prisma.Decimal;
  remainingRefundCeiling: Prisma.Decimal;
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
  items: SaleReturnableItemDTO[];
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
    if (!SALE_RETURN_MUTATION_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to create sales returns. Required one of: ${SALE_RETURN_MUTATION_ROLES.join(
          ", "
        )}.`
      );
    }
  } else {
    if (!SALE_RETURN_READ_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to view sales returns. Required one of: ${SALE_RETURN_READ_ROLES.join(
          ", "
        )}.`
      );
    }
  }

  return {
    user,
    organizationId: membership.organizationId,
    role: roleName,
  };
}

export function parseReturnQuantity(value: unknown, fieldName = "Quantity"): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    throw new SaleReturnValidationError(`${fieldName} is required.`);
  }

  let dec: Prisma.Decimal;
  try {
    dec = new Prisma.Decimal(value as Prisma.Decimal.Value);
  } catch {
    throw new SaleReturnValidationError(`${fieldName} must be a valid numeric quantity.`);
  }

  if (dec.isNaN() || !dec.isFinite()) {
    throw new SaleReturnValidationError(`${fieldName} must be a finite number.`);
  }

  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 3) {
    throw new SaleReturnValidationError(`${fieldName} cannot exceed 3 decimal places.`);
  }

  if (dec.lessThanOrEqualTo(0)) {
    throw new SaleReturnValidationError(`${fieldName} must be strictly greater than 0.`);
  }

  if (dec.greaterThan("999999999.999")) {
    throw new SaleReturnValidationError(`${fieldName} exceeds maximum supported capacity.`);
  }

  return dec;
}

function parseOptionalDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = new Date(value as string | number | Date);
  if (isNaN(date.getTime())) {
    throw new SaleReturnValidationError(`Invalid date format for ${fieldName}.`);
  }
  return date;
}

// ============================================================================
// CONCURRENCY-SAFE DOCUMENT NUMBER GENERATORS
// ============================================================================

async function generateSaleReturnNumber(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<string> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('sale_return_number'), hashtext(${organizationId}))
  `;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `SR-${yearMonth}-`;

  const latest = await tx.saleReturn.findFirst({
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
    await tx.saleReturn.findFirst({
      where: { organizationId, returnNumber: candidate },
      select: { id: true },
    })
  ) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  return candidate;
}

async function generateSaleRefundNumber(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<string> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('sale_refund_number'), hashtext(${organizationId}))
  `;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `REF-${yearMonth}-`;

  const latest = await tx.saleRefund.findFirst({
    where: {
      organizationId,
      refundNumber: { startsWith: prefix },
    },
    orderBy: { refundNumber: "desc" },
    select: { refundNumber: true },
  });

  let nextSeq = 1;
  if (latest?.refundNumber) {
    const parts = latest.refundNumber.split("-");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  let candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  while (
    await tx.saleRefund.findFirst({
      where: { organizationId, refundNumber: candidate },
      select: { id: true },
    })
  ) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  return candidate;
}

// ============================================================================
// IDEMPOTENCY REQUEST HASHING
// ============================================================================

export function computeSaleReturnRequestHash(input: CreateSaleReturnInput): string {
  const canonicalItems = [...input.items]
    .map((item) => ({
      saleItemId: item.saleItemId.trim(),
      quantityReturned: parseReturnQuantity(item.quantityReturned, "Item quantity").toString(),
      reason: item.reason?.trim() || null,
    }))
    .sort((a, b) => a.saleItemId.localeCompare(b.saleItemId));

  const canonicalPayload = {
    saleId: input.saleId.trim(),
    items: canonicalItems,
    refund: {
      paymentMethod: input.refund.paymentMethod,
      reference: input.refund.reference?.trim() || null,
      notes: input.refund.notes?.trim() || null,
    },
    reason: input.reason?.trim() || null,
    notes: input.notes?.trim() || null,
  };

  return crypto.createHash("sha256").update(JSON.stringify(canonicalPayload)).digest("hex");
}

// ============================================================================
// MUTATION SERVICES
// ============================================================================

/**
 * Atomically records a sale return and corresponding refund against a COMPLETED sale:
 * 1. Resolves authorized caller and tenant context.
 * 2. Validates inputs, rejecting duplicates, negative/zero quantities, or invalid payment methods.
 * 3. Locks Sale row via SELECT FOR UPDATE.
 * 4. Verifies sale status is COMPLETED and belongs to caller organization/branch.
 * 5. Handles idempotency: matching hash returns existing record; mismatch throws conflict error.
 * 6. Locks target SaleItem rows in deterministic lexicographical order via SELECT FOR UPDATE.
 * 7. Calculates exact order-discount allocations and line financials with zero rounding drift.
 * 8. Enforces refund ceiling: returnTotal <= (paidAmount - priorRefunds).
 * 9. Creates SaleReturn header and SaleReturnItem rows.
 * 10. Updates SaleItem.quantityReturned and SaleItem.amountReturned.
 * 11. Restores inventory stock via applyStockInflowTransaction() (movementType: SALE_RETURN).
 * 12. Creates append-only SaleRefund with amount = returnTotal.
 * 13. Commits atomically.
 */
export async function createSaleReturn(
  input: CreateSaleReturnInput,
  options?: SaleReturnServiceOptions
): Promise<SaleReturnDetailDTO> {
  // 1. Resolve authorized user and organization context
  const { organizationId, user } = await resolveAuthorizedReturnContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  // 2. Validate input parameters
  if (!input.saleId || typeof input.saleId !== "string" || input.saleId.trim().length === 0) {
    throw new SaleReturnValidationError("Sale ID is required.");
  }
  const cleanSaleId = input.saleId.trim();

  if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
    throw new SaleReturnValidationError("Sale return must contain at least one item.");
  }

  if (!input.refund || typeof input.refund !== "object") {
    throw new SaleReturnValidationError("Refund details are required.");
  }

  const validPaymentMethods = Object.values(SalePaymentMethod);
  if (!validPaymentMethods.includes(input.refund.paymentMethod)) {
    throw new SaleReturnValidationError(
      `Invalid refund payment method "${input.refund.paymentMethod}". Expected one of: ${validPaymentMethods.join(
        ", "
      )}.`
    );
  }

  // Reject duplicate items in single request
  const seenSaleItemIds = new Set<string>();
  const sanitizedItems: {
    saleItemId: string;
    quantityReturned: Prisma.Decimal;
    reason: string | null;
  }[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    if (
      !item.saleItemId ||
      typeof item.saleItemId !== "string" ||
      item.saleItemId.trim().length === 0
    ) {
      throw new SaleReturnValidationError(`Item at index ${i}: Sale Item ID is required.`);
    }
    const cleanItemId = item.saleItemId.trim();
    if (seenSaleItemIds.has(cleanItemId)) {
      throw new SaleReturnValidationError(
        `Duplicate sale item ID "${cleanItemId}" in return request. Each item can only be returned once per return.`
      );
    }
    seenSaleItemIds.add(cleanItemId);

    const parsedQty = parseReturnQuantity(
      item.quantityReturned,
      `Item at index ${i} return quantity`
    );
    sanitizedItems.push({
      saleItemId: cleanItemId,
      quantityReturned: parsedQty,
      reason: item.reason?.trim() || null,
    });
  }

  const returnDate = parseOptionalDate(input.returnDate, "Return date") || new Date();
  const cleanReason = input.reason?.trim() || null;
  const cleanNotes = input.notes?.trim() || null;
  const cleanIdempotencyKey = input.idempotencyKey?.trim() || null;
  const computedHash = cleanIdempotencyKey ? computeSaleReturnRequestHash(input) : null;

  if (cleanReason && cleanReason.length > 255) {
    throw new SaleReturnValidationError("Reason cannot exceed 255 characters.");
  }
  if (cleanNotes && cleanNotes.length > 1000) {
    throw new SaleReturnValidationError("Notes cannot exceed 1000 characters.");
  }

  // 3. Execute atomic transaction
  return db.$transaction(
    async (tx) => {
      // 3a. Lock Sale row for update
      const rawSales = await tx.$queryRaw<
        {
          id: string;
          organizationId: string;
          branchId: string;
          status: SaleStatus;
          paymentStatus: SalePaymentStatus;
          invoiceNumber: string;
          paidAmount: Prisma.Decimal;
          discountAmount: Prisma.Decimal;
          subtotal: Prisma.Decimal;
          taxAmount: Prisma.Decimal;
          totalAmount: Prisma.Decimal;
        }[]
      >`
        SELECT id, "organizationId", "branchId", status, "paymentStatus", "invoiceNumber",
               "paidAmount", "discountAmount", subtotal, "taxAmount", "totalAmount"
        FROM "Sale"
        WHERE id = ${cleanSaleId}
          AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;
      const lockedSale = rawSales[0];

      if (!lockedSale) {
        throw new SaleReturnNotFoundError(`Sale with ID "${cleanSaleId}" not found.`);
      }

      // Verify authorized branch access for the user
      const hasBranchAccess = await checkBranchAccess({
        userId: user.id,
        organizationId,
        branchId: lockedSale.branchId,
      });
      if (!hasBranchAccess) {
        throw new SaleReturnBranchAccessError(
          `User does not have authorized access to branch "${lockedSale.branchId}".`
        );
      }

      // 3b. Validate sale status: strictly allowed only on COMPLETED sales
      if (lockedSale.status !== SaleStatus.COMPLETED) {
        throw new SaleReturnStateError(
          `Cannot record return for sale "${lockedSale.invoiceNumber}" in ${lockedSale.status} status. ` +
          `Returns are allowed only on COMPLETED sales.`
        );
      }

      // 3c. Idempotency Check under transaction lock
      if (cleanIdempotencyKey) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${`sale_return_${cleanIdempotencyKey}`}))
        `;

        const existingReturn = await tx.saleReturn.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId,
              idempotencyKey: cleanIdempotencyKey,
            },
          },
          include: {
            sale: {
              select: {
                id: true,
                invoiceNumber: true,
                saleDate: true,
                totalAmount: true,
                paidAmount: true,
                customerId: true,
                customer: {
                  select: { id: true, name: true, code: true, phone: true },
                },
              },
            },
            branch: {
              select: { id: true, name: true, code: true },
            },
            returnedBy: {
              select: { id: true, name: true, email: true },
            },
            items: {
              orderBy: { id: "asc" },
            },
            refunds: {
              orderBy: { createdAt: "asc" },
            },
          },
        });

        if (existingReturn) {
          if (existingReturn.idempotencyHash !== computedHash) {
            throw new SaleReturnIdempotencyConflictError(
              `Idempotency key "${cleanIdempotencyKey}" was previously used with a different request payload.`
            );
          }
          return existingReturn as unknown as SaleReturnDetailDTO;
        }
      }

      // 3d. Fetch ALL sale items for this sale (ordered deterministically by id asc) to compute order discount allocations
      const allSaleItems = await tx.saleItem.findMany({
        where: { saleId: lockedSale.id, organizationId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          subtotal: true,
          discountAmount: true,
          lineTotal: true,
          taxAmount: true,
        },
      });

      const sumItemDiscounts = allSaleItems.reduce(
        (acc, item) => acc.add(new Prisma.Decimal(item.discountAmount)),
        new Prisma.Decimal("0.00")
      );
      const totalSaleDiscount = new Prisma.Decimal(lockedSale.discountAmount);
      const orderDiscount = totalSaleDiscount.greaterThan(sumItemDiscounts)
        ? totalSaleDiscount.minus(sumItemDiscounts)
        : new Prisma.Decimal("0.00");

      // Compute taxable/net bases for all items: Vi = subtotal - lineDiscount
      const itemNetBases = allSaleItems.map((item) => {
        const sub = new Prisma.Decimal(item.subtotal);
        const disc = new Prisma.Decimal(item.discountAmount);
        const netBase = sub.greaterThan(disc) ? sub.minus(disc) : new Prisma.Decimal("0.00");
        return { id: item.id, netBase, lineTotal: new Prisma.Decimal(item.lineTotal) };
      });

      const totalNetBase = itemNetBases.reduce(
        (acc, item) => acc.add(item.netBase),
        new Prisma.Decimal("0.00")
      );

      // Allocate order discount across all items deterministically
      const lineOrderDiscountMap = new Map<string, Prisma.Decimal>();
      const lineTotalRefundableMap = new Map<string, Prisma.Decimal>();

      if (orderDiscount.greaterThan(0) && totalNetBase.greaterThan(0)) {
        let allocatedOrderDiscount = new Prisma.Decimal("0.00");

        for (let i = 0; i < itemNetBases.length; i++) {
          const item = itemNetBases[i];
          let share: Prisma.Decimal;

          if (i === itemNetBases.length - 1) {
            // Final residual item absorbs rounding remainder
            share = orderDiscount.minus(allocatedOrderDiscount);
          } else {
            share = orderDiscount
              .times(item.netBase)
              .dividedBy(totalNetBase)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            allocatedOrderDiscount = allocatedOrderDiscount.add(share);
          }

          lineOrderDiscountMap.set(item.id, share);
          const totalRefundable = item.lineTotal.minus(share);
          lineTotalRefundableMap.set(
            item.id,
            totalRefundable.greaterThan(0) ? totalRefundable : new Prisma.Decimal("0.00")
          );
        }
      } else {
        for (const item of itemNetBases) {
          lineOrderDiscountMap.set(item.id, new Prisma.Decimal("0.00"));
          lineTotalRefundableMap.set(item.id, item.lineTotal);
        }
      }

      // 3e. Deterministic lock ordering: sort items lexicographically by saleItemId
      const sortedItems = [...sanitizedItems].sort((a, b) =>
        a.saleItemId.localeCompare(b.saleItemId)
      );

      interface PreparedReturnItem {
        saleItemId: string;
        productId: string;
        variantId: string | null;
        productName: string;
        productSku: string | null;
        quantityReturned: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        discountAmount: Prisma.Decimal;
        taxRate: Prisma.Decimal;
        taxAmount: Prisma.Decimal;
        subtotal: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
        reason: string | null;
        inventoryKey: string;
        lockedItem: {
          id: string;
          productId: string;
          variantId: string | null;
          quantity: Prisma.Decimal;
          quantityReturned: Prisma.Decimal;
          amountReturned: Prisma.Decimal;
        };
      }

      const preparedLines: PreparedReturnItem[] = [];
      let sumReturnSubtotal = new Prisma.Decimal("0.00");
      let sumReturnDiscount = new Prisma.Decimal("0.00");
      let sumReturnTax = new Prisma.Decimal("0.00");
      let sumReturnTotal = new Prisma.Decimal("0.00");

      for (const reqItem of sortedItems) {
        const rawItems = await tx.$queryRaw<
          {
            id: string;
            organizationId: string;
            saleId: string;
            productId: string;
            variantId: string | null;
            productName: string;
            productSku: string | null;
            quantity: Prisma.Decimal;
            unitPrice: Prisma.Decimal;
            unitCost: Prisma.Decimal;
            discountAmount: Prisma.Decimal;
            taxRate: Prisma.Decimal;
            taxAmount: Prisma.Decimal;
            subtotal: Prisma.Decimal;
            lineTotal: Prisma.Decimal;
            quantityReturned: Prisma.Decimal;
            amountReturned: Prisma.Decimal;
          }[]
        >`
          SELECT id, "organizationId", "saleId", "productId", "variantId", "productName", "productSku",
                 quantity, "unitPrice", "unitCost", "discountAmount", "taxRate", "taxAmount",
                 subtotal, "lineTotal", "quantityReturned", "amountReturned"
          FROM "SaleItem"
          WHERE id = ${reqItem.saleItemId}
            AND "organizationId" = ${organizationId}
            AND "saleId" = ${lockedSale.id}
          FOR UPDATE
        `;
        const lockedItem = rawItems[0];

        if (!lockedItem) {
          throw new SaleReturnValidationError(
            `Sale item "${reqItem.saleItemId}" does not belong to sale "${lockedSale.invoiceNumber}".`
          );
        }

        const qtySold = new Prisma.Decimal(lockedItem.quantity);
        const qtyAlreadyReturned = new Prisma.Decimal(lockedItem.quantityReturned);
        const amountAlreadyReturned = new Prisma.Decimal(lockedItem.amountReturned);
        const remainingQty = qtySold.minus(qtyAlreadyReturned);

        if (reqItem.quantityReturned.greaterThan(remainingQty)) {
          throw new SaleReturnOverReturnError(
            `Return quantity (${reqItem.quantityReturned.toString()}) exceeds remaining returnable quantity (${remainingQty.toString()}) ` +
            `for sale item "${lockedItem.id}". Total Sold: ${qtySold.toString()}, Already Returned: ${qtyAlreadyReturned.toString()}.`
          );
        }

        const qtyNew = qtyAlreadyReturned.add(reqItem.quantityReturned);
        const totalRefundableForLine =
          lineTotalRefundableMap.get(lockedItem.id) ?? new Prisma.Decimal(lockedItem.lineTotal);
        const unitPrice = new Prisma.Decimal(lockedItem.unitPrice);
        const unitCost = new Prisma.Decimal(lockedItem.unitCost);
        const itemLineDiscount = new Prisma.Decimal(lockedItem.discountAmount);
        const orderLineDiscount =
          lineOrderDiscountMap.get(lockedItem.id) ?? new Prisma.Decimal("0.00");
        const totalLineDiscount = itemLineDiscount.add(orderLineDiscount);

        let lineDiscountRet: Prisma.Decimal;
        let lineTaxRet: Prisma.Decimal;
        let lineTotalRet: Prisma.Decimal;

        const lineSubtotalRet = reqItem.quantityReturned
          .times(unitPrice)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        if (qtyNew.equals(qtySold)) {
          // Final return of remaining quantity: absorbs residual rounding difference
          lineTotalRet = totalRefundableForLine.minus(amountAlreadyReturned);

          // Calculate prior returned discounts for this line
          const priorReturns = await tx.saleReturnItem.findMany({
            where: { saleItemId: lockedItem.id },
            select: { discountAmount: true },
          });
          const priorReturnedDiscount = priorReturns.reduce(
            (acc, ret) => acc.add(new Prisma.Decimal(ret.discountAmount)),
            new Prisma.Decimal("0.00")
          );

          let discResidual = totalLineDiscount.minus(priorReturnedDiscount);
          if (discResidual.lessThan(0)) discResidual = new Prisma.Decimal("0.00");
          if (discResidual.greaterThan(lineSubtotalRet)) discResidual = lineSubtotalRet;
          lineDiscountRet = discResidual;

          const taxableRet = lineSubtotalRet.minus(lineDiscountRet);
          lineTaxRet = lineTotalRet.minus(taxableRet);
          if (lineTaxRet.lessThan(0)) {
            lineTaxRet = new Prisma.Decimal("0.00");
          }
          // Re-balance identity: lineTotal = subtotal - discount + tax
          lineTotalRet = lineSubtotalRet.minus(lineDiscountRet).plus(lineTaxRet);
        } else {
          // Proportional partial return
          const returnRatio = reqItem.quantityReturned.dividedBy(qtySold);
          lineTotalRet = totalRefundableForLine
            .times(returnRatio)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

          const propItemDisc = itemLineDiscount
            .times(returnRatio)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          const propOrderDisc = orderLineDiscount
            .times(returnRatio)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          let propTotalDisc = propItemDisc.add(propOrderDisc);
          if (propTotalDisc.greaterThan(lineSubtotalRet)) {
            propTotalDisc = lineSubtotalRet;
          }
          lineDiscountRet = propTotalDisc;

          const taxableRet = lineSubtotalRet.minus(lineDiscountRet);
          lineTaxRet = lineTotalRet.minus(taxableRet);
          if (lineTaxRet.lessThan(0)) {
            lineTaxRet = new Prisma.Decimal("0.00");
          }
          lineTotalRet = lineSubtotalRet.minus(lineDiscountRet).plus(lineTaxRet);
        }

        sumReturnSubtotal = sumReturnSubtotal.add(lineSubtotalRet);
        sumReturnDiscount = sumReturnDiscount.add(lineDiscountRet);
        sumReturnTax = sumReturnTax.add(lineTaxRet);
        sumReturnTotal = sumReturnTotal.add(lineTotalRet);

        preparedLines.push({
          saleItemId: lockedItem.id,
          productId: lockedItem.productId,
          variantId: lockedItem.variantId,
          productName: lockedItem.productName,
          productSku: lockedItem.productSku,
          quantityReturned: reqItem.quantityReturned,
          unitPrice,
          unitCost,
          discountAmount: lineDiscountRet,
          taxRate: new Prisma.Decimal(lockedItem.taxRate),
          taxAmount: lineTaxRet,
          subtotal: lineSubtotalRet,
          lineTotal: lineTotalRet,
          reason: reqItem.reason,
          inventoryKey: `${lockedItem.productId}:${lockedItem.variantId ?? "null"}`,
          lockedItem: {
            id: lockedItem.id,
            productId: lockedItem.productId,
            variantId: lockedItem.variantId,
            quantity: qtySold,
            quantityReturned: qtyAlreadyReturned,
            amountReturned: amountAlreadyReturned,
          },
        });
      }

      // 3f. Enforce refund ceiling against actual net payments
      const priorRefundAgg = await tx.saleRefund.aggregate({
        where: { saleId: lockedSale.id, organizationId },
        _sum: { amount: true },
      });
      const priorRefunds = priorRefundAgg._sum.amount
        ? new Prisma.Decimal(priorRefundAgg._sum.amount)
        : new Prisma.Decimal("0.00");
      const remainingRefundCeiling = new Prisma.Decimal(lockedSale.paidAmount).minus(priorRefunds);

      if (sumReturnTotal.greaterThan(remainingRefundCeiling)) {
        throw new SaleRefundCeilingExceededError(
          `Return total (${sumReturnTotal.toString()}) exceeds remaining refundable ceiling (${remainingRefundCeiling.toString()}) ` +
          `for sale "${lockedSale.invoiceNumber}". Total Paid: ${lockedSale.paidAmount.toString()}, Prior Refunds: ${priorRefunds.toString()}.`
        );
      }

      // 3g. Generate concurrency-safe sequential document numbers
      const returnNumber = await generateSaleReturnNumber(tx, organizationId);
      const refundNumber = await generateSaleRefundNumber(tx, organizationId);

      // 3h. Create SaleReturn header record
      const saleReturn = await tx.saleReturn.create({
        data: {
          organizationId,
          saleId: lockedSale.id,
          branchId: lockedSale.branchId,
          returnNumber,
          idempotencyKey: cleanIdempotencyKey,
          idempotencyHash: computedHash,
          returnDate,
          returnedById: user.id,
          subtotal: sumReturnSubtotal,
          discountAmount: sumReturnDiscount,
          taxAmount: sumReturnTax,
          totalAmount: sumReturnTotal,
          refundedAmount: sumReturnTotal,
          reason: cleanReason,
          notes: cleanNotes,
        },
      });

      // 3i. Deterministic inventory lock ordering: sort by inventoryKey to avoid circular deadlocks
      const sortedForInventory = [...preparedLines].sort((a, b) =>
        a.inventoryKey.localeCompare(b.inventoryKey)
      );

      for (const line of sortedForInventory) {
        // Create SaleReturnItem
        const createdReturnItem = await tx.saleReturnItem.create({
          data: {
            organizationId,
            returnId: saleReturn.id,
            saleItemId: line.saleItemId,
            productId: line.productId,
            variantId: line.variantId,
            productName: line.productName,
            productSku: line.productSku,
            quantityReturned: line.quantityReturned,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            discountAmount: line.discountAmount,
            taxRate: line.taxRate,
            taxAmount: line.taxAmount,
            subtotal: line.subtotal,
            lineTotal: line.lineTotal,
            reason: line.reason,
          },
        });

        // Update SaleItem aggregate counters
        await tx.saleItem.update({
          where: { id: line.saleItemId },
          data: {
            quantityReturned: line.lockedItem.quantityReturned.add(line.quantityReturned),
            amountReturned: line.lockedItem.amountReturned.add(line.lineTotal),
          },
        });

        // Apply inventory stock inflow
        await applyStockInflowTransaction(tx, {
          organizationId,
          branchId: lockedSale.branchId,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantityReturned,
          movementType: "SALE_RETURN",
          referenceType: "SALE_RETURN_ITEM",
          referenceId: createdReturnItem.id,
          reason: `Sale Return ${returnNumber}`,
          notes: line.reason,
          performedByUserId: user.id,
        });
      }

      // 3j. Create atomic SaleRefund disbursement
      await tx.saleRefund.create({
        data: {
          organizationId,
          saleId: lockedSale.id,
          returnId: saleReturn.id,
          refundNumber,
          paymentMethod: input.refund.paymentMethod,
          amount: sumReturnTotal,
          reference: input.refund.reference?.trim() || null,
          notes: input.refund.notes?.trim() || null,
          processedById: user.id,
        },
      });

      // 3k. Return complete populated DTO
      const result = await tx.saleReturn.findUnique({
        where: { id: saleReturn.id },
        include: {
          sale: {
            select: {
              id: true,
              invoiceNumber: true,
              saleDate: true,
              totalAmount: true,
              paidAmount: true,
              customerId: true,
              customer: {
                select: { id: true, name: true, code: true, phone: true },
              },
            },
          },
          branch: {
            select: { id: true, name: true, code: true },
          },
          returnedBy: {
            select: { id: true, name: true, email: true },
          },
          items: {
            orderBy: { id: "asc" },
          },
          refunds: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      return result as unknown as SaleReturnDetailDTO;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}

// ============================================================================
// READ SERVICES
// ============================================================================

/**
 * Retrieves a single sale return by ID with strict tenant and branch access enforcement.
 */
export async function getSaleReturnById(
  returnId: string,
  options?: SaleReturnServiceOptions
): Promise<SaleReturnDetailDTO> {
  if (!returnId?.trim()) {
    throw new SaleReturnValidationError("returnId is required.");
  }

  const { organizationId, user } = await resolveAuthorizedReturnContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  const saleReturn = await db.saleReturn.findFirst({
    where: {
      id: returnId.trim(),
      organizationId,
    },
    include: {
      sale: {
        select: {
          id: true,
          invoiceNumber: true,
          saleDate: true,
          totalAmount: true,
          paidAmount: true,
          customerId: true,
          customer: {
            select: { id: true, name: true, code: true, phone: true },
          },
        },
      },
      branch: {
        select: { id: true, name: true, code: true },
      },
      returnedBy: {
        select: { id: true, name: true, email: true },
      },
      items: {
        orderBy: { id: "asc" },
      },
      refunds: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!saleReturn) {
    throw new SaleReturnNotFoundError(`Sale return with ID "${returnId}" not found.`);
  }

  // Branch access authorization
  const hasBranchAccess = await checkBranchAccess({
    userId: user.id,
    organizationId,
    branchId: saleReturn.branchId,
  });

  if (!hasBranchAccess) {
    throw new SaleReturnBranchAccessError(
      `User does not have authorized access to branch "${saleReturn.branchId}".`
    );
  }

  return saleReturn as unknown as SaleReturnDetailDTO;
}

/**
 * Lists sales returns with deterministic pagination, filtering, and multi-tenant scoping.
 */
export async function listSaleReturns(
  input: ListSaleReturnsInput = {},
  options?: SaleReturnServiceOptions
): Promise<PaginatedSaleReturnsResult> {
  const { organizationId, user, role } = await resolveAuthorizedReturnContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  const where: Prisma.SaleReturnWhereInput = {
    organizationId,
  };

  // Branch scoping: If user is not OWNER, restrict to assigned branch memberships
  if (role !== SYSTEM_ROLES.OWNER) {
    const activeMembership = user.memberships.find(
      (m) => m.organizationId === organizationId && m.isActive
    );
    const assignedBranchIds = (activeMembership?.branchMemberships || [])
      .filter((bm) => bm.branch.isActive)
      .map((bm) => bm.branchId);

    if (input.branchId?.trim()) {
      if (!assignedBranchIds.includes(input.branchId.trim())) {
        throw new SaleReturnBranchAccessError(
          `User does not have authorized access to branch "${input.branchId.trim()}".`
        );
      }
      where.branchId = input.branchId.trim();
    } else {
      where.branchId = { in: assignedBranchIds };
    }
  } else if (input.branchId?.trim()) {
    where.branchId = input.branchId.trim();
  }

  if (input.saleId?.trim()) {
    where.saleId = input.saleId.trim();
  }

  if (input.returnNumber?.trim()) {
    where.returnNumber = {
      contains: input.returnNumber.trim(),
      mode: "insensitive",
    };
  }

  if (input.invoiceNumber?.trim()) {
    where.sale = {
      invoiceNumber: {
        contains: input.invoiceNumber.trim(),
        mode: "insensitive",
      },
    };
  }

  const dateFrom = parseOptionalDate(input.dateFrom, "Date from");
  const dateTo = parseOptionalDate(input.dateTo, "Date to");
  if (dateFrom || dateTo) {
    where.returnDate = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  if (input.search?.trim()) {
    const q = input.search.trim();
    where.OR = [
      { returnNumber: { contains: q, mode: "insensitive" } },
      { sale: { invoiceNumber: { contains: q, mode: "insensitive" } } },
      { reason: { contains: q, mode: "insensitive" } },
    ];
  }

  // Pagination validation
  const page = input.page !== undefined && input.page !== null ? Math.floor(Number(input.page)) : 1;
  if (isNaN(page) || page < 1) {
    throw new SaleReturnValidationError("Page must be an integer greater than or equal to 1.");
  }

  const pageSize =
    input.pageSize !== undefined && input.pageSize !== null ? Math.floor(Number(input.pageSize)) : 25;
  if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new SaleReturnValidationError("PageSize must be an integer between 1 and 100.");
  }

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const orderBy: Prisma.SaleReturnOrderByWithRelationInput[] = [
    { returnDate: "desc" },
    { createdAt: "desc" },
    { id: "desc" },
  ];

  const [totalItems, rows] = await Promise.all([
    db.saleReturn.count({ where }),
    db.saleReturn.findMany({
      where,
      include: {
        sale: {
          select: {
            id: true,
            invoiceNumber: true,
            saleDate: true,
            totalAmount: true,
            paidAmount: true,
            customerId: true,
            customer: {
              select: { id: true, name: true, code: true, phone: true },
            },
          },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
        returnedBy: {
          select: { id: true, name: true, email: true },
        },
        items: {
          orderBy: { id: "asc" },
        },
        refunds: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy,
      skip,
      take,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    items: rows as unknown as SaleReturnDetailDTO[],
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}

/**
 * Inspection API for POS cashier UI:
 * Given a sale ID or invoice number, verifies eligibility and returns
 * all items with their sold, already-returned, and remaining returnable quantities and amounts.
 */
export async function getSaleReturnableInfo(
  saleIdOrInvoiceNumber: string,
  options?: SaleReturnServiceOptions
): Promise<SaleReturnableInfoDTO> {
  if (!saleIdOrInvoiceNumber?.trim()) {
    throw new SaleReturnValidationError("Sale ID or invoice number is required.");
  }
  const cleanQuery = saleIdOrInvoiceNumber.trim();

  const { organizationId, user } = await resolveAuthorizedReturnContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  const sale = await db.sale.findFirst({
    where: {
      organizationId,
      OR: [{ id: cleanQuery }, { invoiceNumber: { equals: cleanQuery, mode: "insensitive" } }],
    },
    include: {
      branch: {
        select: { id: true, name: true, code: true },
      },
      customer: {
        select: { id: true, name: true, code: true, phone: true },
      },
      cashier: {
        select: { id: true, name: true },
      },
      items: {
        orderBy: { id: "asc" },
      },
      refunds: {
        select: { amount: true },
      },
    },
  });

  if (!sale) {
    throw new SaleReturnNotFoundError(`Sale "${cleanQuery}" not found.`);
  }

  const hasBranchAccess = await checkBranchAccess({
    userId: user.id,
    organizationId,
    branchId: sale.branchId,
  });

  if (!hasBranchAccess) {
    throw new SaleReturnBranchAccessError(
      `User does not have authorized access to branch "${sale.branchId}".`
    );
  }

  // Calculate prior refunds and remaining ceiling
  const totalRefundedAmount = sale.refunds.reduce(
    (acc, r) => acc.add(new Prisma.Decimal(r.amount)),
    new Prisma.Decimal("0.00")
  );
  const paidAmount = new Prisma.Decimal(sale.paidAmount);
  const remainingRefundCeiling = paidAmount.greaterThan(totalRefundedAmount)
    ? paidAmount.minus(totalRefundedAmount)
    : new Prisma.Decimal("0.00");

  // Determine order-level discount allocations
  const sumItemDiscounts = sale.items.reduce(
    (acc, item) => acc.add(new Prisma.Decimal(item.discountAmount)),
    new Prisma.Decimal("0.00")
  );
  const totalSaleDiscount = new Prisma.Decimal(sale.discountAmount);
  const orderDiscount = totalSaleDiscount.greaterThan(sumItemDiscounts)
    ? totalSaleDiscount.minus(sumItemDiscounts)
    : new Prisma.Decimal("0.00");

  const itemNetBases = sale.items.map((item) => {
    const sub = new Prisma.Decimal(item.subtotal);
    const disc = new Prisma.Decimal(item.discountAmount);
    const netBase = sub.greaterThan(disc) ? sub.minus(disc) : new Prisma.Decimal("0.00");
    return { id: item.id, netBase, lineTotal: new Prisma.Decimal(item.lineTotal) };
  });

  const totalNetBase = itemNetBases.reduce(
    (acc, item) => acc.add(item.netBase),
    new Prisma.Decimal("0.00")
  );

  const lineTotalRefundableMap = new Map<string, Prisma.Decimal>();
  if (orderDiscount.greaterThan(0) && totalNetBase.greaterThan(0)) {
    let allocatedOrderDiscount = new Prisma.Decimal("0.00");
    for (let i = 0; i < itemNetBases.length; i++) {
      const item = itemNetBases[i];
      let share: Prisma.Decimal;
      if (i === itemNetBases.length - 1) {
        share = orderDiscount.minus(allocatedOrderDiscount);
      } else {
        share = orderDiscount
          .times(item.netBase)
          .dividedBy(totalNetBase)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        allocatedOrderDiscount = allocatedOrderDiscount.add(share);
      }
      const totalRefundable = item.lineTotal.minus(share);
      lineTotalRefundableMap.set(
        item.id,
        totalRefundable.greaterThan(0) ? totalRefundable : new Prisma.Decimal("0.00")
      );
    }
  } else {
    for (const item of itemNetBases) {
      lineTotalRefundableMap.set(item.id, item.lineTotal);
    }
  }

  // Map items to DTO
  let totalRemainingQuantity = new Prisma.Decimal("0.000");
  const returnableItems: SaleReturnableItemDTO[] = sale.items.map((item) => {
    const qtySold = new Prisma.Decimal(item.quantity);
    const qtyReturned = new Prisma.Decimal(item.quantityReturned);
    const qtyReturnable = qtySold.greaterThan(qtyReturned)
      ? qtySold.minus(qtyReturned)
      : new Prisma.Decimal("0.000");

    totalRemainingQuantity = totalRemainingQuantity.add(qtyReturnable);

    const totalRefundableAmount =
      lineTotalRefundableMap.get(item.id) ?? new Prisma.Decimal(item.lineTotal);
    const amountAlreadyReturned = new Prisma.Decimal(item.amountReturned);
    const amountRemainingRefundable = totalRefundableAmount.greaterThan(amountAlreadyReturned)
      ? totalRefundableAmount.minus(amountAlreadyReturned)
      : new Prisma.Decimal("0.00");

    return {
      saleItemId: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      productSku: item.productSku,
      quantitySold: qtySold,
      quantityAlreadyReturned: qtyReturned,
      quantityReturnable: qtyReturnable,
      unitPrice: new Prisma.Decimal(item.unitPrice),
      unitCost: new Prisma.Decimal(item.unitCost),
      discountAmount: new Prisma.Decimal(item.discountAmount),
      taxRate: new Prisma.Decimal(item.taxRate),
      taxAmount: new Prisma.Decimal(item.taxAmount),
      lineTotal: new Prisma.Decimal(item.lineTotal),
      totalRefundableAmount,
      amountAlreadyReturned,
      amountRemainingRefundable,
    };
  });

  // Evaluate eligibility
  let isEligibleForReturn = true;
  let ineligibilityReason: string | null = null;

  if (sale.status === SaleStatus.VOIDED) {
    isEligibleForReturn = false;
    ineligibilityReason = "Cannot record returns against a VOIDED sale.";
  } else if (sale.status === SaleStatus.DRAFT) {
    isEligibleForReturn = false;
    ineligibilityReason = "Cannot record returns against a DRAFT sale.";
  } else if (totalRemainingQuantity.lessThanOrEqualTo(0)) {
    isEligibleForReturn = false;
    ineligibilityReason = "All items in this sale have already been returned.";
  } else if (remainingRefundCeiling.lessThanOrEqualTo(0)) {
    isEligibleForReturn = false;
    ineligibilityReason = "Sale has reached its maximum refundable payment ceiling.";
  }

  return {
    saleId: sale.id,
    invoiceNumber: sale.invoiceNumber,
    saleDate: sale.saleDate,
    status: sale.status,
    paymentStatus: sale.paymentStatus,
    totalAmount: new Prisma.Decimal(sale.totalAmount),
    paidAmount,
    totalRefundedAmount,
    remainingRefundCeiling,
    isEligibleForReturn,
    ineligibilityReason,
    branch: sale.branch,
    customer: sale.customer,
    cashier: sale.cashier,
    items: returnableItems,
  };
}
