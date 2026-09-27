import "server-only";
import { Prisma, PurchaseStatus, PurchasePaymentStatus } from "@prisma/client";
import { db } from "./db";
import { SYSTEM_ROLES, type SystemRoleName } from "./roles";
import { getCurrentAppUser } from "./auth";
import {
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
} from "./memberships";

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

export const PURCHASE_MUTATION_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
];

export const PURCHASE_READ_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
];

// ============================================================================
// DOMAIN ERROR HIERARCHY
// ============================================================================

export class PurchaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseError";
  }
}

export class PurchaseValidationError extends PurchaseError {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseValidationError";
  }
}

export class PurchaseNotFoundError extends PurchaseError {
  constructor(message = "Purchase order not found.") {
    super(message);
    this.name = "PurchaseNotFoundError";
  }
}

export class PurchaseStateError extends PurchaseError {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseStateError";
  }
}

export class PurchaseDuplicateError extends PurchaseError {
  constructor(message = "A purchase order with this number already exists in this organization.") {
    super(message);
    this.name = "PurchaseDuplicateError";
  }
}

export class PurchaseConflictError extends PurchaseError {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseConflictError";
  }
}

export { CrossTenantViolationError, MembershipNotFoundError, UnauthorizedRoleError };

// ============================================================================
// CONTEXT RESOLUTION & TYPES
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

export interface AuthorizedPurchaseContext {
  user: AppUserContext;
  organizationId: string;
  role: SystemRoleName;
}

/**
 * Resolves and verifies the authenticated user's organization context and role permissions.
 * Never trusts a client-supplied organizationId.
 */
export async function resolveAuthorizedPurchaseContext(params?: {
  organizationId?: string;
  requireMutation?: boolean;
  actorUser?: AppUserContext | null;
}): Promise<AuthorizedPurchaseContext> {
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
    if (!PURCHASE_MUTATION_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to modify purchase orders. Required one of: ${PURCHASE_MUTATION_ROLES.join(
          ", "
        )}.`
      );
    }
  } else {
    if (!PURCHASE_READ_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to view purchase orders. Required one of: ${PURCHASE_READ_ROLES.join(
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

// ============================================================================
// VALIDATION & ARITHMETIC HELPERS
// ============================================================================

function parseQuantity(value: unknown, fieldName: string): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    throw new PurchaseValidationError(`${fieldName} is required.`);
  }

  let dec: Prisma.Decimal;
  try {
    dec = new Prisma.Decimal(value as Prisma.Decimal.Value);
  } catch {
    throw new PurchaseValidationError(`${fieldName} must be a valid numeric value.`);
  }

  if (dec.isNaN() || !dec.isFinite()) {
    throw new PurchaseValidationError(`${fieldName} must be a finite number.`);
  }

  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 3) {
    throw new PurchaseValidationError(`${fieldName} cannot exceed 3 decimal places.`);
  }

  if (dec.lessThanOrEqualTo(0)) {
    throw new PurchaseValidationError(`${fieldName} must be strictly greater than 0.`);
  }

  if (dec.greaterThan("999999999.999")) {
    throw new PurchaseValidationError(`${fieldName} exceeds maximum capacity.`);
  }

  return dec;
}

function parseMoney(value: unknown, fieldName: string, allowZero = true): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    return new Prisma.Decimal("0.00");
  }

  let dec: Prisma.Decimal;
  try {
    dec = new Prisma.Decimal(value as Prisma.Decimal.Value);
  } catch {
    throw new PurchaseValidationError(`${fieldName} must be a valid monetary value.`);
  }

  if (dec.isNaN() || !dec.isFinite()) {
    throw new PurchaseValidationError(`${fieldName} must be a finite number.`);
  }

  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 2) {
    throw new PurchaseValidationError(`${fieldName} cannot exceed 2 decimal places.`);
  }

  if (allowZero ? dec.lessThan(0) : dec.lessThanOrEqualTo(0)) {
    throw new PurchaseValidationError(
      `${fieldName} must be ${allowZero ? "greater than or equal to 0" : "strictly greater than 0"}.`
    );
  }

  if (dec.greaterThan("9999999999.99")) {
    throw new PurchaseValidationError(`${fieldName} exceeds maximum capacity.`);
  }

  return dec;
}

function parseTaxRate(value: unknown): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    return new Prisma.Decimal("0.00");
  }

  let dec: Prisma.Decimal;
  try {
    dec = new Prisma.Decimal(value as Prisma.Decimal.Value);
  } catch {
    throw new PurchaseValidationError("Tax rate must be a valid numeric percentage.");
  }

  if (dec.isNaN() || !dec.isFinite()) {
    throw new PurchaseValidationError("Tax rate must be a finite number.");
  }

  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 2) {
    throw new PurchaseValidationError("Tax rate cannot exceed 2 decimal places.");
  }

  if (dec.lessThan(0) || dec.greaterThan(100)) {
    throw new PurchaseValidationError("Tax rate must be between 0 and 100 percent.");
  }

  return dec;
}

function parseOptionalDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = new Date(value as string | number | Date);
  if (isNaN(date.getTime())) {
    throw new PurchaseValidationError(`Invalid date format for ${fieldName}.`);
  }
  return date;
}

// ============================================================================
// CONCURRENCY-SAFE PURCHASE NUMBER GENERATOR
// ============================================================================

/**
 * Generates a human-readable, sequential, tenant-unique purchase order number.
 * Uses a PostgreSQL transaction-level advisory lock to serialize concurrent numbering
 * within the tenant organization.
 */
async function generatePurchaseNumber(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<string> {
  // Lock on organizationId for numbering sequence
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('po_number'), hashtext(${organizationId}))
  `;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PO-${yearMonth}-`;

  const latest = await tx.purchase.findFirst({
    where: {
      organizationId,
      purchaseNumber: { startsWith: prefix },
    },
    orderBy: { purchaseNumber: "desc" },
    select: { purchaseNumber: true },
  });

  let nextSeq = 1;
  if (latest?.purchaseNumber) {
    const parts = latest.purchaseNumber.split("-");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  let candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  while (await tx.purchase.findFirst({ where: { organizationId, purchaseNumber: candidate }, select: { id: true } })) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  return candidate;
}

// ============================================================================
// INPUT INTERFACES
// ============================================================================

export interface PurchaseItemInput {
  productId: string;
  variantId?: string | null;
  quantityOrdered: number | string | Prisma.Decimal;
  unitCost: number | string | Prisma.Decimal;
  taxRate?: number | string | Prisma.Decimal | null;
}

export interface CreatePurchaseInput {
  branchId: string;
  supplierId: string;
  orderDate?: Date | string | null;
  expectedDate?: Date | string | null;
  discountAmount?: number | string | Prisma.Decimal | null;
  taxAmount?: number | string | Prisma.Decimal | null;
  shippingAmount?: number | string | Prisma.Decimal | null;
  notes?: string | null;
  items: PurchaseItemInput[];
}

export interface UpdatePurchaseInput {
  branchId?: string;
  supplierId?: string;
  orderDate?: Date | string | null;
  expectedDate?: Date | string | null;
  discountAmount?: number | string | Prisma.Decimal | null;
  taxAmount?: number | string | Prisma.Decimal | null;
  shippingAmount?: number | string | Prisma.Decimal | null;
  notes?: string | null;
  items?: PurchaseItemInput[];
}

export interface ListPurchasesOptions {
  status?: PurchaseStatus;
  paymentStatus?: PurchasePaymentStatus;
  supplierId?: string;
  branchId?: string;
  dateFrom?: Date | string | null;
  dateTo?: Date | string | null;
  search?: string;
  limit?: number;
  offset?: number;
  organizationId?: string;
  actorUser?: AppUserContext | null;
}

interface ValidatedItem {
  productId: string;
  variantId: string | null;
  quantityOrdered: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

// ============================================================================
// ITEM & ENTITY VALIDATION
// ============================================================================

async function validateAndComputeItems(
  items: PurchaseItemInput[],
  organizationId: string
): Promise<{
  validatedItems: ValidatedItem[];
  subtotal: Prisma.Decimal;
}> {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new PurchaseValidationError("At least one purchase line item is required.");
  }

  // 1. Check for duplicate lines in input
  const seenLineKeys = new Set<string>();
  for (const item of items) {
    if (!item.productId || typeof item.productId !== "string" || item.productId.trim().length === 0) {
      throw new PurchaseValidationError("Each line item must have a valid productId.");
    }
    const cleanProdId = item.productId.trim();
    const cleanVariantId = item.variantId ? item.variantId.trim() : "base";
    const lineKey = `${cleanProdId}::${cleanVariantId}`;
    if (seenLineKeys.has(lineKey)) {
      throw new PurchaseValidationError(
        `Duplicate line item detected for product "${cleanProdId}" and variant "${item.variantId ?? "base"}".`
      );
    }
    seenLineKeys.add(lineKey);
  }

  // 2. Fetch products and their variants belonging to this organization
  const productIds = Array.from(new Set(items.map((i) => i.productId.trim())));
  const products = await db.product.findMany({
    where: {
      id: { in: productIds },
      organizationId,
    },
    include: {
      variants: {
        where: { organizationId },
        select: { id: true, name: true, sku: true },
      },
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Check if any product was not found in this organization
  for (const pId of productIds) {
    if (!productMap.has(pId)) {
      const crossTenant = await db.product.findUnique({
        where: { id: pId },
        select: { id: true, organizationId: true },
      });
      if (crossTenant) {
        throw new CrossTenantViolationError(
          `Multi-tenant violation: Product "${pId}" belongs to another organization.`
        );
      }
      throw new PurchaseValidationError(`Product "${pId}" not found.`);
    }
  }

  let subtotal = new Prisma.Decimal("0.00");
  const validatedItems: ValidatedItem[] = [];

  for (const item of items) {
    const cleanProdId = item.productId.trim();
    const product = productMap.get(cleanProdId)!;
    const cleanVariantId = item.variantId ? item.variantId.trim() : null;

    if (product.variants.length > 0) {
      // Variable product requires variant
      if (!cleanVariantId) {
        throw new PurchaseValidationError(
          `Product "${product.name}" has variants. A variant must be selected.`
        );
      }
      const variant = product.variants.find((v) => v.id === cleanVariantId);
      if (!variant) {
        throw new PurchaseValidationError(
          `Variant "${cleanVariantId}" does not belong to product "${product.name}".`
        );
      }
    } else {
      // Simple product forbids variant
      if (cleanVariantId) {
        throw new PurchaseValidationError(
          `Product "${product.name}" has no variants. Variant ID must not be provided.`
        );
      }
    }

    const quantityOrdered = parseQuantity(item.quantityOrdered, `Quantity for "${product.name}"`);
    const unitCost = parseMoney(item.unitCost, `Unit cost for "${product.name}"`, true);
    const taxRate = parseTaxRate(item.taxRate);
    const lineTotal = quantityOrdered.mul(unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    subtotal = subtotal.add(lineTotal);

    validatedItems.push({
      productId: cleanProdId,
      variantId: cleanVariantId,
      quantityOrdered,
      unitCost,
      taxRate,
      lineTotal,
    });
  }

  return { validatedItems, subtotal };
}

// ============================================================================
// PURCHASE BUSINESS SERVICE
// ============================================================================

/**
 * Creates a new Purchase Order in DRAFT status.
 * Atomic transaction: generates purchase number, writes purchase and line items.
 * Does NOT modify inventory.
 */
export async function createPurchase(
  input: CreatePurchaseInput,
  options?: {
    organizationId?: string;
    actorUser?: AppUserContext | null;
  }
) {
  const { organizationId, user } = await resolveAuthorizedPurchaseContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  // 1. Validate branch belongs to organization
  const branch = await db.branch.findUnique({
    where: { id: input.branchId.trim() },
    select: { id: true, organizationId: true, isActive: true },
  });
  if (!branch || branch.organizationId !== organizationId) {
    throw new CrossTenantViolationError(
      `Multi-tenant violation: Branch "${input.branchId}" does not belong to this organization.`
    );
  }
  if (!branch.isActive) {
    throw new PurchaseValidationError(`Branch "${input.branchId}" is inactive.`);
  }

  // 2. Validate supplier belongs to organization
  const supplier = await db.supplier.findUnique({
    where: { id: input.supplierId.trim() },
    select: { id: true, organizationId: true, isActive: true },
  });
  if (!supplier || supplier.organizationId !== organizationId) {
    throw new CrossTenantViolationError(
      `Multi-tenant violation: Supplier "${input.supplierId}" does not belong to this organization.`
    );
  }
  if (!supplier.isActive) {
    throw new PurchaseValidationError(`Supplier "${input.supplierId}" is inactive.`);
  }

  // 3. Validate items and compute subtotal
  const { validatedItems, subtotal } = await validateAndComputeItems(input.items, organizationId);

  // 4. Validate header amounts
  const discountAmount = parseMoney(input.discountAmount, "Discount amount", true);
  const taxAmount = parseMoney(input.taxAmount, "Tax amount", true);
  const shippingAmount = parseMoney(input.shippingAmount, "Shipping amount", true);

  const totalAmount = subtotal.sub(discountAmount).add(taxAmount).add(shippingAmount);
  if (totalAmount.lessThan(0)) {
    throw new PurchaseValidationError(
      `Total amount cannot be negative. Discount (${discountAmount.toString()}) exceeds order total (${subtotal.add(taxAmount).add(shippingAmount).toString()}).`
    );
  }

  const orderDate = parseOptionalDate(input.orderDate, "Order date") || new Date();
  const expectedDate = parseOptionalDate(input.expectedDate, "Expected date");
  const notes = input.notes?.trim() || null;

  // 5. Execute atomic database transaction
  return db.$transaction(async (tx) => {
    const purchaseNumber = await generatePurchaseNumber(tx, organizationId);

    const purchase = await tx.purchase.create({
      data: {
        organizationId,
        branchId: branch.id,
        supplierId: supplier.id,
        purchaseNumber,
        status: PurchaseStatus.DRAFT,
        paymentStatus: PurchasePaymentStatus.UNPAID,
        orderDate,
        expectedDate,
        subtotal,
        discountAmount,
        taxAmount,
        shippingAmount,
        totalAmount,
        paidAmount: new Prisma.Decimal("0.00"),
        notes,
        createdById: user.id,
      },
    });

    for (const item of validatedItems) {
      await tx.purchaseItem.create({
        data: {
          organizationId,
          purchaseId: purchase.id,
          productId: item.productId,
          variantId: item.variantId,
          quantityOrdered: item.quantityOrdered,
          unitCost: item.unitCost,
          taxRate: item.taxRate,
          lineTotal: item.lineTotal,
        },
      });
    }

    return tx.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: {
        supplier: true,
        branch: true,
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  });
}

/**
 * Retrieves a purchase by ID within the authenticated user's organization.
 */
export async function getPurchaseById(
  purchaseId: string,
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

  if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
    throw new PurchaseValidationError("Purchase ID is required.");
  }

  const purchase = await db.purchase.findFirst({
    where: {
      id: purchaseId.trim(),
      organizationId,
    },
    include: {
      supplier: true,
      branch: true,
      items: {
        include: {
          product: true,
          variant: true,
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!purchase) {
    throw new PurchaseNotFoundError(`Purchase order with ID "${purchaseId}" not found.`);
  }

  return purchase;
}

/**
 * Lists purchase orders with bounded pagination and filtering.
 */
export async function listPurchases(options?: ListPurchasesOptions) {
  const { organizationId } = await resolveAuthorizedPurchaseContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  const search = options?.search?.trim();
  const limit = Math.min(Math.max(Number(options?.limit) || 50, 1), 200);
  const offset = Math.max(Number(options?.offset) || 0, 0);

  const whereClause: Prisma.PurchaseWhereInput = {
    organizationId,
    ...(options?.status ? { status: options.status } : {}),
    ...(options?.paymentStatus ? { paymentStatus: options.paymentStatus } : {}),
    ...(options?.supplierId ? { supplierId: options.supplierId.trim() } : {}),
    ...(options?.branchId ? { branchId: options.branchId.trim() } : {}),
    ...(options?.dateFrom || options?.dateTo
      ? {
          orderDate: {
            ...(options?.dateFrom ? { gte: parseOptionalDate(options.dateFrom, "Date from")! } : {}),
            ...(options?.dateTo ? { lte: parseOptionalDate(options.dateTo, "Date to")! } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { purchaseNumber: { contains: search, mode: "insensitive" } },
            { supplier: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [purchases, totalCount] = await Promise.all([
    db.purchase.findMany({
      where: whereClause,
      include: {
        supplier: { select: { id: true, name: true, contactPerson: true } },
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: offset,
    }),
    db.purchase.count({ where: whereClause }),
  ]);

  return {
    purchases,
    totalCount,
    limit,
    offset,
  };
}

/**
 * Updates an existing DRAFT purchase order.
 * Revalidates items, recalculates totals, and transactionally replaces line items.
 * Non-DRAFT orders are strictly rejected.
 */
export async function updatePurchase(
  purchaseId: string,
  input: UpdatePurchaseInput,
  options?: {
    organizationId?: string;
    actorUser?: AppUserContext | null;
  }
) {
  const { organizationId } = await resolveAuthorizedPurchaseContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
    throw new PurchaseValidationError("Purchase ID is required.");
  }

  const cleanId = purchaseId.trim();

  return db.$transaction(async (tx) => {
    // 1. Lock purchase row for update
    const rawPurchases = await tx.$queryRaw<{ id: string; organizationId: string; status: PurchaseStatus }[]>`
      SELECT id, "organizationId", status FROM "Purchase"
      WHERE id = ${cleanId}
      FOR UPDATE
    `;
    const existing = rawPurchases[0];

    if (!existing || existing.organizationId !== organizationId) {
      throw new PurchaseNotFoundError(`Purchase order with ID "${cleanId}" not found.`);
    }

    if (existing.status !== PurchaseStatus.DRAFT) {
      throw new PurchaseStateError(
        `Only DRAFT purchase orders can be edited. Current status is ${existing.status}.`
      );
    }

    // Current purchase state for fallback calculation
    const current = await tx.purchase.findUniqueOrThrow({
      where: { id: cleanId },
      include: { items: true },
    });

    let newBranchId = current.branchId;
    if (input.branchId !== undefined) {
      const branch = await tx.branch.findUnique({
        where: { id: input.branchId.trim() },
        select: { id: true, organizationId: true, isActive: true },
      });
      if (!branch || branch.organizationId !== organizationId) {
        throw new CrossTenantViolationError(
          `Multi-tenant violation: Branch "${input.branchId}" does not belong to this organization.`
        );
      }
      if (!branch.isActive) {
        throw new PurchaseValidationError(`Branch "${input.branchId}" is inactive.`);
      }
      newBranchId = branch.id;
    }

    let newSupplierId = current.supplierId;
    if (input.supplierId !== undefined) {
      const supplier = await tx.supplier.findUnique({
        where: { id: input.supplierId.trim() },
        select: { id: true, organizationId: true, isActive: true },
      });
      if (!supplier || supplier.organizationId !== organizationId) {
        throw new CrossTenantViolationError(
          `Multi-tenant violation: Supplier "${input.supplierId}" does not belong to this organization.`
        );
      }
      if (!supplier.isActive) {
        throw new PurchaseValidationError(`Supplier "${input.supplierId}" is inactive.`);
      }
      newSupplierId = supplier.id;
    }

    let subtotal = current.subtotal;
    if (input.items !== undefined) {
      const validated = await validateAndComputeItems(input.items, organizationId);
      subtotal = validated.subtotal;

      // Delete old items and insert new
      await tx.purchaseItem.deleteMany({ where: { purchaseId: cleanId } });
      for (const item of validated.validatedItems) {
        await tx.purchaseItem.create({
          data: {
            organizationId,
            purchaseId: cleanId,
            productId: item.productId,
            variantId: item.variantId,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
            taxRate: item.taxRate,
            lineTotal: item.lineTotal,
          },
        });
      }
    }

    const discountAmount =
      input.discountAmount !== undefined
        ? parseMoney(input.discountAmount, "Discount amount", true)
        : current.discountAmount;

    const taxAmount =
      input.taxAmount !== undefined
        ? parseMoney(input.taxAmount, "Tax amount", true)
        : current.taxAmount;

    const shippingAmount =
      input.shippingAmount !== undefined
        ? parseMoney(input.shippingAmount, "Shipping amount", true)
        : current.shippingAmount;

    const totalAmount = subtotal.sub(discountAmount).add(taxAmount).add(shippingAmount);
    if (totalAmount.lessThan(0)) {
      throw new PurchaseValidationError(
        `Total amount cannot be negative. Discount (${discountAmount.toString()}) exceeds order total (${subtotal.add(taxAmount).add(shippingAmount).toString()}).`
      );
    }

    const orderDate =
      input.orderDate !== undefined
        ? parseOptionalDate(input.orderDate, "Order date") || current.orderDate
        : current.orderDate;

    const expectedDate =
      input.expectedDate !== undefined
        ? parseOptionalDate(input.expectedDate, "Expected date")
        : current.expectedDate;

    const notes = input.notes !== undefined ? input.notes?.trim() || null : current.notes;

    return tx.purchase.update({
      where: { id: cleanId },
      data: {
        branchId: newBranchId,
        supplierId: newSupplierId,
        orderDate,
        expectedDate,
        subtotal,
        discountAmount,
        taxAmount,
        shippingAmount,
        totalAmount,
        notes,
      },
      include: {
        supplier: true,
        branch: true,
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });
  }, { timeout: 25000, maxWait: 10000 });
}

/**
 * Transitions a purchase order from DRAFT to ORDERED.
 * Validates that at least one item exists.
 * Does NOT modify inventory.
 */
export async function markPurchaseOrdered(
  purchaseId: string,
  options?: {
    organizationId?: string;
    actorUser?: AppUserContext | null;
  }
) {
  const { organizationId } = await resolveAuthorizedPurchaseContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
    throw new PurchaseValidationError("Purchase ID is required.");
  }

  const cleanId = purchaseId.trim();

  return db.$transaction(async (tx) => {
    const rawPurchases = await tx.$queryRaw<{ id: string; organizationId: string; status: PurchaseStatus }[]>`
      SELECT id, "organizationId", status FROM "Purchase"
      WHERE id = ${cleanId}
      FOR UPDATE
    `;
    const existing = rawPurchases[0];

    if (!existing || existing.organizationId !== organizationId) {
      throw new PurchaseNotFoundError(`Purchase order with ID "${cleanId}" not found.`);
    }

    if (existing.status !== PurchaseStatus.DRAFT) {
      throw new PurchaseStateError(
        `Cannot transition purchase to ORDERED: current status is ${existing.status}. Only DRAFT purchases can be ordered.`
      );
    }

    const itemCount = await tx.purchaseItem.count({ where: { purchaseId: cleanId } });
    if (itemCount === 0) {
      throw new PurchaseValidationError("Cannot order a purchase order with no line items.");
    }

    return tx.purchase.update({
      where: { id: cleanId },
      data: { status: PurchaseStatus.ORDERED },
      include: {
        supplier: true,
        branch: true,
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });
  });
}

/**
 * Cancels a DRAFT purchase order.
 * Only DRAFT purchases without receipts may be cancelled.
 */
export async function cancelPurchase(
  purchaseId: string,
  options?: {
    organizationId?: string;
    actorUser?: AppUserContext | null;
  }
) {
  const { organizationId } = await resolveAuthorizedPurchaseContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
    throw new PurchaseValidationError("Purchase ID is required.");
  }

  const cleanId = purchaseId.trim();

  return db.$transaction(async (tx) => {
    const rawPurchases = await tx.$queryRaw<{ id: string; organizationId: string; status: PurchaseStatus }[]>`
      SELECT id, "organizationId", status FROM "Purchase"
      WHERE id = ${cleanId}
      FOR UPDATE
    `;
    const existing = rawPurchases[0];

    if (!existing || existing.organizationId !== organizationId) {
      throw new PurchaseNotFoundError(`Purchase order with ID "${cleanId}" not found.`);
    }

    if (existing.status !== PurchaseStatus.DRAFT) {
      throw new PurchaseStateError(
        `Cannot cancel purchase: only DRAFT purchases can be cancelled. Current status is ${existing.status}.`
      );
    }

    return tx.purchase.update({
      where: { id: cleanId },
      data: { status: PurchaseStatus.CANCELLED },
      include: {
        supplier: true,
        branch: true,
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });
  });
}
