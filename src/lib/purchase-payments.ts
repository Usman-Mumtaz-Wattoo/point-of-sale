import "server-only";
import { Prisma, PurchasePaymentMethod, PurchasePaymentStatus, PurchaseStatus } from "@prisma/client";
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
  resolveTenantContext,
  TenantContextError,
  AuthRequiredError,
} from "./tenant-context";
import { PurchaseNotFoundError, type AppUserContext } from "./purchases";

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

export const PAYMENT_MUTATION_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
];

export const PAYMENT_READ_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
];

// ============================================================================
// DOMAIN ERROR HIERARCHY
// ============================================================================

export class PurchasePaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchasePaymentError";
  }
}

export class PurchasePaymentValidationError extends PurchasePaymentError {
  constructor(message: string) {
    super(message);
    this.name = "PurchasePaymentValidationError";
  }
}

export class PurchasePaymentNotFoundError extends PurchasePaymentError {
  constructor(message = "Purchase payment not found.") {
    super(message);
    this.name = "PurchasePaymentNotFoundError";
  }
}

export class PurchasePaymentOverpaymentError extends PurchasePaymentError {
  constructor(message: string) {
    super(message);
    this.name = "PurchasePaymentOverpaymentError";
  }
}

export class PurchasePaymentStateError extends PurchasePaymentError {
  constructor(message: string) {
    super(message);
    this.name = "PurchasePaymentStateError";
  }
}

export {
  PurchaseNotFoundError,
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
  TenantContextError,
  AuthRequiredError,
};

// ============================================================================
// INPUT & OUTPUT INTERFACES
// ============================================================================

export interface RecordPurchasePaymentInput {
  purchaseId: string;
  amount: number | string | Prisma.Decimal;
  paymentMethod: PurchasePaymentMethod;
  paidAt?: Date | string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface PurchasePaymentServiceOptions {
  organizationId?: string;
  actorUser?: AppUserContext | null;
}

export interface ListPurchasePaymentsOptions {
  organizationId?: string;
  actorUser?: AppUserContext | null;
  limit?: number;
  offset?: number;
}

export interface PurchasePaymentSummary {
  purchaseId: string;
  purchaseNumber: string;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
  paymentStatus: PurchasePaymentStatus;
  paymentCount: number;
}

export interface AuthorizedPaymentContext {
  user: AppUserContext;
  organizationId: string;
  role: SystemRoleName;
}

// ============================================================================
// CONTEXT RESOLUTION
// ============================================================================

/**
 * Resolves and verifies the authenticated user's organization context and payment permissions.
 * Never trusts a client-supplied organizationId.
 */
export async function resolveAuthorizedPaymentContext(params?: {
  organizationId?: string;
  requireMutation?: boolean;
  actorUser?: AppUserContext | null;
}): Promise<AuthorizedPaymentContext> {
  const allowedRoles = params?.requireMutation
    ? PAYMENT_MUTATION_ROLES
    : PAYMENT_READ_ROLES;

  const tenantContext = await resolveTenantContext(params?.organizationId, {
    requireRoles: allowedRoles,
    actorUser: params?.actorUser,
  });

  const user = params?.actorUser !== undefined ? params.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new AuthRequiredError();
  }

  return {
    user,
    organizationId: tenantContext.organizationId,
    role: tenantContext.role,
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function parsePaymentAmount(value: unknown, fieldName = "Payment amount"): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    throw new PurchasePaymentValidationError(`${fieldName} is required.`);
  }

  let dec: Prisma.Decimal;
  try {
    dec = new Prisma.Decimal(value as Prisma.Decimal.Value);
  } catch {
    throw new PurchasePaymentValidationError(`${fieldName} must be a valid monetary value.`);
  }

  if (dec.isNaN() || !dec.isFinite()) {
    throw new PurchasePaymentValidationError(`${fieldName} must be a finite number.`);
  }

  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 2) {
    throw new PurchasePaymentValidationError(`${fieldName} cannot exceed 2 decimal places.`);
  }

  if (dec.lessThanOrEqualTo(0)) {
    throw new PurchasePaymentValidationError(`${fieldName} must be strictly greater than 0.`);
  }

  if (dec.greaterThan("9999999999.99")) {
    throw new PurchasePaymentValidationError(`${fieldName} exceeds maximum capacity.`);
  }

  return dec;
}

function parseOptionalDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = new Date(value as string | number | Date);
  if (isNaN(date.getTime())) {
    throw new PurchasePaymentValidationError(`Invalid date format for ${fieldName}.`);
  }
  return date;
}

const VALID_PAYMENT_METHODS: readonly string[] = [
  PurchasePaymentMethod.CASH,
  PurchasePaymentMethod.BANK_TRANSFER,
  PurchasePaymentMethod.CHECK,
  PurchasePaymentMethod.OTHER,
];

// ============================================================================
// MUTATION SERVICES
// ============================================================================

/**
 * Records a supplier payment against an existing Purchase Order atomically.
 *
 * Operations executed within ONE transaction:
 * 1. Locks Purchase row via SELECT FOR UPDATE to serialize concurrent payments.
 * 2. Validates purchase status (allowed on ORDERED, PARTIALLY_RECEIVED, RECEIVED; rejected on DRAFT, CANCELLED).
 * 3. Validates payment amount > 0, max 2 decimals, and amount <= remainingBalance.
 * 4. Creates exactly one PurchasePayment record with authenticated recordedById and organizationId.
 * 5. Updates Purchase.paidAmount and recalculates Purchase.paymentStatus (PARTIAL or PAID).
 * 6. Returns payment with populated relations.
 */
export async function recordPurchasePayment(
  input: RecordPurchasePaymentInput,
  options?: PurchasePaymentServiceOptions
) {
  // 1. Resolve authorized user and organization context (Requires mutation role: OWNER, MANAGER, ACCOUNTANT)
  const { organizationId, user } = await resolveAuthorizedPaymentContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  // 2. Validate input parameters
  if (!input.purchaseId || typeof input.purchaseId !== "string" || input.purchaseId.trim().length === 0) {
    throw new PurchasePaymentValidationError("Purchase ID is required.");
  }
  const cleanPurchaseId = input.purchaseId.trim();

  if (!input.paymentMethod || !VALID_PAYMENT_METHODS.includes(input.paymentMethod)) {
    throw new PurchasePaymentValidationError(
      `Invalid payment method "${input.paymentMethod}". Allowed methods: ${VALID_PAYMENT_METHODS.join(", ")}.`
    );
  }

  const parsedAmount = parsePaymentAmount(input.amount, "Payment amount");
  const paidAt = parseOptionalDate(input.paidAt, "Paid date") || new Date();
  const reference = input.reference?.trim() || null;
  const notes = input.notes?.trim() || null;

  if (reference && reference.length > 255) {
    throw new PurchasePaymentValidationError("Reference cannot exceed 255 characters.");
  }
  if (notes && notes.length > 1000) {
    throw new PurchasePaymentValidationError("Notes cannot exceed 1000 characters.");
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
        paymentStatus: PurchasePaymentStatus;
        totalAmount: Prisma.Decimal;
        paidAmount: Prisma.Decimal;
        purchaseNumber: string;
      }[]
    >`
      SELECT id, "organizationId", "branchId", status, "paymentStatus", "totalAmount", "paidAmount", "purchaseNumber"
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
      lockedPurchase.status !== PurchaseStatus.PARTIALLY_RECEIVED &&
      lockedPurchase.status !== PurchaseStatus.RECEIVED
    ) {
      throw new PurchasePaymentStateError(
        `Cannot record payment for purchase "${lockedPurchase.purchaseNumber}" in ${lockedPurchase.status} status. ` +
        `Payments are allowed only on ORDERED, PARTIALLY_RECEIVED, or RECEIVED purchase orders.`
      );
    }

    // c. Validate remaining balance and overpayment
    const currentTotal = new Prisma.Decimal(lockedPurchase.totalAmount);
    const currentPaid = new Prisma.Decimal(lockedPurchase.paidAmount);
    const remainingBalance = currentTotal.minus(currentPaid);

    if (parsedAmount.greaterThan(remainingBalance)) {
      throw new PurchasePaymentOverpaymentError(
        `Payment amount (${parsedAmount.toString()}) exceeds remaining balance (${remainingBalance.toString()}) ` +
        `for purchase order "${lockedPurchase.purchaseNumber}". Total: ${currentTotal.toString()}, Already Paid: ${currentPaid.toString()}.`
      );
    }

    // d. Calculate new paidAmount and paymentStatus
    const newPaidAmount = currentPaid.add(parsedAmount);

    let newPaymentStatus: PurchasePaymentStatus;
    if (newPaidAmount.equals(0)) {
      newPaymentStatus = PurchasePaymentStatus.UNPAID;
    } else if (newPaidAmount.lessThan(currentTotal)) {
      newPaymentStatus = PurchasePaymentStatus.PARTIAL;
    } else {
      newPaymentStatus = PurchasePaymentStatus.PAID;
    }

    // e. Create PurchasePayment row
    const payment = await tx.purchasePayment.create({
      data: {
        organizationId,
        purchaseId: lockedPurchase.id,
        amount: parsedAmount,
        paymentMethod: input.paymentMethod,
        paidAt,
        reference,
        notes,
        recordedById: user.id,
      },
    });

    // f. Update Purchase paidAmount and paymentStatus
    await tx.purchase.update({
      where: { id: lockedPurchase.id },
      data: {
        paidAmount: newPaidAmount,
        paymentStatus: newPaymentStatus,
      },
    });

    // g. Return created payment with populated relations
    return tx.purchasePayment.findUniqueOrThrow({
      where: { id: payment.id },
      include: {
        purchase: {
          select: {
            id: true,
            purchaseNumber: true,
            status: true,
            paymentStatus: true,
            totalAmount: true,
            paidAmount: true,
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
        recordedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }, { timeout: 25000, maxWait: 10000 });
}

// ============================================================================
// READ SERVICES
// ============================================================================

/**
 * Retrieves a single purchase payment by ID within the authenticated user's organization.
 */
export async function getPurchasePaymentById(
  paymentId: string,
  options?: PurchasePaymentServiceOptions
) {
  const { organizationId } = await resolveAuthorizedPaymentContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  if (!paymentId || typeof paymentId !== "string" || paymentId.trim().length === 0) {
    throw new PurchasePaymentValidationError("Payment ID is required.");
  }

  const payment = await db.purchasePayment.findFirst({
    where: {
      id: paymentId.trim(),
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
      recordedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!payment) {
    throw new PurchasePaymentNotFoundError(`Purchase payment with ID "${paymentId}" not found.`);
  }

  return payment;
}

/**
 * Lists all payments recorded for a specific Purchase Order.
 */
export async function listPaymentsForPurchase(
  purchaseId: string,
  options?: ListPurchasePaymentsOptions
) {
  const { organizationId } = await resolveAuthorizedPaymentContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
    throw new PurchasePaymentValidationError("Purchase ID is required.");
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

  const whereClause: Prisma.PurchasePaymentWhereInput = {
    organizationId,
    purchaseId: cleanPurchaseId,
  };

  const [payments, totalCount] = await Promise.all([
    db.purchasePayment.findMany({
      where: whereClause,
      include: {
        recordedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: offset,
    }),
    db.purchasePayment.count({ where: whereClause }),
  ]);

  return {
    payments,
    totalCount,
    limit,
    offset,
  };
}

/**
 * Returns an up-to-date payment and balance summary for a purchase order.
 */
export async function getPurchasePaymentSummary(
  purchaseId: string,
  options?: PurchasePaymentServiceOptions
): Promise<PurchasePaymentSummary> {
  const { organizationId } = await resolveAuthorizedPaymentContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
    throw new PurchasePaymentValidationError("Purchase ID is required.");
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
      totalAmount: true,
      paidAmount: true,
      paymentStatus: true,
      _count: {
        select: { payments: true },
      },
    },
  });

  if (!purchase) {
    throw new PurchaseNotFoundError(`Purchase order with ID "${cleanPurchaseId}" not found.`);
  }

  const totalAmount = new Prisma.Decimal(purchase.totalAmount);
  const paidAmount = new Prisma.Decimal(purchase.paidAmount);
  const remainingAmount = totalAmount.minus(paidAmount);

  return {
    purchaseId: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    totalAmount,
    paidAmount,
    remainingAmount,
    paymentStatus: purchase.paymentStatus,
    paymentCount: purchase._count.payments,
  };
}
