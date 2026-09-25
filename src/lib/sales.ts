import "server-only";
import { Prisma, SalePaymentMethod, SalePaymentStatus, SaleStatus } from "@prisma/client";
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
import {
  applyStockInflowTransaction,
  applyStockOutflowTransaction,
  InsufficientStockError,
} from "./inventory";

// ============================================================================
// ROLE ACCESS DEFINITIONS
// ============================================================================

export const SALE_MUTATION_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
];

export const SALE_READ_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.ACCOUNTANT,
];

export const SALE_VOID_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
];

// ============================================================================
// DOMAIN ERROR HIERARCHY
// ============================================================================

export class SaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleError";
  }
}

export class SaleValidationError extends SaleError {
  constructor(message: string) {
    super(message);
    this.name = "SaleValidationError";
  }
}

export class SaleNotFoundError extends SaleError {
  constructor(message = "Sale not found.") {
    super(message);
    this.name = "SaleNotFoundError";
  }
}

export class SaleStateError extends SaleError {
  constructor(message: string) {
    super(message);
    this.name = "SaleStateError";
  }
}

export class SalePaymentError extends SaleError {
  constructor(message: string) {
    super(message);
    this.name = "SalePaymentError";
  }
}

export class SaleBranchAccessError extends SaleError {
  constructor(message = "User does not have authorized access to branch.") {
    super(message);
    this.name = "SaleBranchAccessError";
  }
}

export {
  InsufficientStockError,
  CrossTenantViolationError,
  UnauthorizedRoleError,
  MembershipNotFoundError,
  BranchNotFoundError,
};

// ============================================================================
// TYPES & INTERFACES
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

export interface CompleteSaleItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number | string | Prisma.Decimal;
  discountAmount?: number | string | Prisma.Decimal | null;
}

export interface CompleteSalePaymentInput {
  paymentMethod: SalePaymentMethod;
  amount: number | string | Prisma.Decimal;
  tenderedAmount?: number | string | Prisma.Decimal | null;
  reference?: string | null;
  notes?: string | null;
}

export interface CompleteSaleInput {
  branchId: string;
  items: CompleteSaleItemInput[];
  payments: CompleteSalePaymentInput[];
  discountAmount?: number | string | Prisma.Decimal | null;
  notes?: string | null;
  customerId?: string | null;
  receiptNumber?: string | null;
}

export interface ListSalesInput {
  branchId?: string | null;
  status?: SaleStatus | null;
  paymentStatus?: SalePaymentStatus | null;
  cashierId?: string | null;
  dateFrom?: Date | string | null;
  dateTo?: Date | string | null;
  search?: string | null;
  page?: number | null;
  pageSize?: number | null;
}

export interface SaleBranchSummaryDTO {
  id: string;
  name: string;
  code: string;
}

export interface SaleCashierSummaryDTO {
  id: string;
  name: string;
  email: string;
}

export interface SaleSummaryDTO {
  id: string;
  invoiceNumber: string;
  receiptNumber: string | null;
  saleDate: Date;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  changeAmount: Prisma.Decimal;
  customerId: string | null;
  createdAt: Date;
  branch: SaleBranchSummaryDTO;
  cashier: SaleCashierSummaryDTO | null;
  itemCount: number;
}

export interface PaginatedSalesResult {
  items: SaleSummaryDTO[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface SaleDetailItemDTO {
  id: string;
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
}

export interface SaleDetailPaymentDTO {
  id: string;
  paymentMethod: SalePaymentMethod;
  amount: Prisma.Decimal;
  tenderedAmount: Prisma.Decimal | null;
  changeAmount: Prisma.Decimal | null;
  reference: string | null;
  notes: string | null;
  paidAt: Date;
  recordedBy: SaleCashierSummaryDTO | null;
}

export interface SaleDetailDTO {
  id: string;
  organizationId: string;
  branchId: string;
  invoiceNumber: string;
  receiptNumber: string | null;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  saleDate: Date;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  changeAmount: Prisma.Decimal;
  notes: string | null;
  cashierId: string | null;
  customerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch: SaleBranchSummaryDTO;
  cashier: SaleCashierSummaryDTO | null;
  items: SaleDetailItemDTO[];
  payments: SaleDetailPaymentDTO[];
}

export interface VoidSaleResultDTO {
  saleId: string;
  invoiceNumber: string;
  previousStatus: SaleStatus;
  status: SaleStatus;
  restoredItemCount: number;
  restoredQuantity: Prisma.Decimal;
  voidedAt: Date;
}

export interface SaleServiceOptions {
  organizationId?: string;
  actorUser?: AppUserContext | null;
}

export interface AuthorizedSalesContext {
  user: AppUserContext;
  organizationId: string;
  branchId: string;
  role: SystemRoleName;
}

// ============================================================================
// VALIDATION & PARSING HELPERS
// ============================================================================

/**
 * Parses and validates an item sale quantity.
 * Must be strictly positive, max 3 decimal places, and within Decimal(12,3).
 */
export function parseSaleQuantity(
  value: number | string | Prisma.Decimal | undefined | null,
  fieldName = "Quantity"
): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    throw new SaleValidationError(`${fieldName} is required.`);
  }

  let dec: Prisma.Decimal;
  if (value instanceof Prisma.Decimal) {
    dec = value;
  } else {
    const str = String(value).trim();
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
      throw new SaleValidationError(`${fieldName} must be a valid numeric value.`);
    }
    dec = new Prisma.Decimal(str);
  }

  if (isNaN(dec.toNumber()) || !isFinite(dec.toNumber())) {
    throw new SaleValidationError(`${fieldName} must be a finite number.`);
  }

  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 3) {
    throw new SaleValidationError(`${fieldName} cannot exceed 3 decimal places.`);
  }

  if (dec.lessThanOrEqualTo(0)) {
    throw new SaleValidationError(`${fieldName} must be strictly greater than 0.`);
  }

  if (dec.greaterThan("999999999.999")) {
    throw new SaleValidationError(`${fieldName} exceeds maximum supported capacity.`);
  }

  return dec;
}

/**
 * Parses and validates monetary amounts with max 2 decimal places.
 */
export function parseSaleMoney(
  value: number | string | Prisma.Decimal | undefined | null,
  fieldName = "Amount",
  allowZero = false
): Prisma.Decimal {
  if (value === undefined || value === null || value === "") {
    if (allowZero) return new Prisma.Decimal("0.00");
    throw new SaleValidationError(`${fieldName} is required.`);
  }

  let dec: Prisma.Decimal;
  if (value instanceof Prisma.Decimal) {
    dec = value;
  } else {
    const str = String(value).trim();
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
      throw new SaleValidationError(`${fieldName} must be a valid monetary value.`);
    }
    dec = new Prisma.Decimal(str);
  }

  if (isNaN(dec.toNumber()) || !isFinite(dec.toNumber())) {
    throw new SaleValidationError(`${fieldName} must be a finite number.`);
  }

  const strVal = dec.toString();
  const parts = strVal.split(".");
  if (parts.length === 2 && parts[1].length > 2) {
    throw new SaleValidationError(`${fieldName} cannot exceed 2 decimal places.`);
  }

  if (allowZero ? dec.lessThan(0) : dec.lessThanOrEqualTo(0)) {
    throw new SaleValidationError(
      `${fieldName} must be ${allowZero ? "greater than or equal to 0" : "strictly greater than 0"}.`
    );
  }

  if (dec.greaterThan("999999999.99")) {
    throw new SaleValidationError(`${fieldName} exceeds maximum supported amount.`);
  }

  return dec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

// ============================================================================
// CONTEXT RESOLUTION & AUTHORIZATION
// ============================================================================

/**
 * Resolves the authenticated user, verifies organization membership and role permissions,
 * and validates access to the specified branch.
 */
export async function resolveAuthorizedSalesContext(params: {
  organizationId?: string;
  branchId: string;
  requireMutation?: boolean;
  actorUser?: AppUserContext | null;
}): Promise<AuthorizedSalesContext> {
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
    if (!SALE_MUTATION_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to perform sales. Required one of: ${SALE_MUTATION_ROLES.join(", ")}.`
      );
    }
  } else {
    if (!SALE_READ_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to view sales.`
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
    throw new SaleBranchAccessError(
      `User does not have authorized access to branch "${params.branchId}".`
    );
  }

  return {
    user,
    organizationId,
    branchId: params.branchId,
    role: roleName,
  };
}

// ============================================================================
// INVOICE NUMBER GENERATION
// ============================================================================

/**
 * Generates an organization-scoped, sequential invoice number (e.g. INV-202609-0001).
 * Serialized concurrency-safely via PostgreSQL transaction advisory lock.
 */
async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  prefixSetting?: string | null
): Promise<string> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('sale_invoice_number'), hashtext(${organizationId}))
  `;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const basePrefix = prefixSetting?.trim() || "INV-";
  const prefix = `${basePrefix}${yearMonth}-`;

  const latest = await tx.sale.findFirst({
    where: {
      organizationId,
      invoiceNumber: { startsWith: prefix },
    },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  let nextSeq = 1;
  if (latest?.invoiceNumber) {
    const parts = latest.invoiceNumber.split("-");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  let candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  while (
    await tx.sale.findFirst({
      where: { organizationId, invoiceNumber: candidate },
      select: { id: true },
    })
  ) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  return candidate;
}

// ============================================================================
// COMPLETE SALE MUTATION SERVICE
// ============================================================================

/**
 * Atomically completes a Point of Sale transaction:
 * 1. Validates user, organization, role, and branch authorization server-side.
 * 2. Validates products, variants, quantities, and rejects duplicate items.
 * 3. Resolves authoritative catalog prices, tax settings, and calculates totals using Prisma.Decimal.
 * 4. Validates payments, tender amounts, and calculates change without corrupting revenue totals.
 * 5. Generates a concurrency-safe sequential invoice number via advisory xact locks.
 * 6. Creates Sale and SaleItem records in PostgreSQL.
 * 7. Deducts inventory using applyStockOutflowTransaction() in deterministic lexicographical order.
 * 8. Records payment records and commits atomically.
 */
export async function completeSale(
  input: CompleteSaleInput,
  options?: SaleServiceOptions
) {
  if (!input.branchId?.trim()) {
    throw new SaleValidationError("branchId is required.");
  }

  // 1. Authorize user, organization, and branch access
  const { user, organizationId, branchId } = await resolveAuthorizedSalesContext({
    organizationId: options?.organizationId,
    branchId: input.branchId.trim(),
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  // 2. Validate items collection
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new SaleValidationError("Sale must contain at least one item.");
  }

  // Check for duplicate items and validate quantities
  const seenItems = new Set<string>();
  const parsedItemInputs: Array<{
    productId: string;
    variantId: string | null;
    quantity: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    inventoryKey: string;
  }> = [];

  for (const item of input.items) {
    if (!item.productId?.trim()) {
      throw new SaleValidationError("productId is required for every item.");
    }
    const productId = item.productId.trim();
    const variantId = item.variantId?.trim() || null;
    const inventoryKey = `${productId}:${variantId ?? "null"}`;

    if (seenItems.has(inventoryKey)) {
      throw new SaleValidationError(
        `Duplicate item in sale: product "${productId}"${variantId ? ` variant "${variantId}"` : ""} appears multiple times.`
      );
    }
    seenItems.add(inventoryKey);

    const quantity = parseSaleQuantity(item.quantity, "Sale Item Quantity");
    const discountAmount = parseSaleMoney(item.discountAmount, "Item Discount Amount", true);

    parsedItemInputs.push({
      productId,
      variantId,
      quantity,
      discountAmount,
      inventoryKey,
    });
  }

  // 3. Validate products and variants from active catalog
  const uniqueProductIds = Array.from(new Set(parsedItemInputs.map((i) => i.productId)));
  const products = await db.product.findMany({
    where: {
      id: { in: uniqueProductIds },
      organizationId,
    },
    include: {
      variants: true,
    },
  });

  const productMap = new Map<string, (typeof products)[0]>();
  for (const p of products) {
    productMap.set(p.id, p);
  }

  // Prepare line calculations
  interface PreparedSaleLine {
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
    inventoryKey: string;
  }

  // Read tax configuration
  const orgSettings = await db.organizationSettings.findUnique({
    where: { organizationId },
  });
  const taxEnabled = orgSettings?.taxEnabled ?? false;
  const defaultTaxRate = taxEnabled
    ? new Prisma.Decimal(orgSettings?.defaultTaxRate ?? 0)
    : new Prisma.Decimal("0.00");

  const preparedLines: PreparedSaleLine[] = [];
  let sumSubtotal = new Prisma.Decimal("0.00");
  let sumItemDiscounts = new Prisma.Decimal("0.00");
  let sumTaxAmount = new Prisma.Decimal("0.00");

  for (const itemInput of parsedItemInputs) {
    const product = productMap.get(itemInput.productId);
    if (!product) {
      throw new SaleValidationError(`Product "${itemInput.productId}" not found in authorized organization.`);
    }

    if (!product.isActive) {
      throw new SaleValidationError(`Product "${product.name}" is inactive and cannot be sold.`);
    }

    let productName: string;
    let productSku: string | null;
    let unitPrice: Prisma.Decimal;
    let unitCost: Prisma.Decimal;

    const hasVariants = product.variants.length > 0;
    if (hasVariants) {
      // Variable product requires valid, active variant
      if (!itemInput.variantId) {
        throw new SaleValidationError(
          `Product "${product.name}" has variants; a specific variantId is required.`
        );
      }
      const variant = product.variants.find((v) => v.id === itemInput.variantId);
      if (!variant) {
        throw new SaleValidationError(
          `Variant "${itemInput.variantId}" does not belong to product "${product.name}".`
        );
      }
      if (!variant.isActive) {
        throw new SaleValidationError(
          `Variant "${variant.name}" of product "${product.name}" is inactive and cannot be sold.`
        );
      }

      productName = `${product.name} - ${variant.name}`;
      productSku = variant.sku || product.sku;
      unitPrice = variant.sellingPrice !== null ? new Prisma.Decimal(variant.sellingPrice) : new Prisma.Decimal(product.sellingPrice);
      unitCost = variant.costPrice !== null ? new Prisma.Decimal(variant.costPrice) : new Prisma.Decimal(product.costPrice);
    } else {
      // Simple product must NOT have variantId
      if (itemInput.variantId) {
        throw new SaleValidationError(
          `Product "${product.name}" has no variants; variantId must not be provided.`
        );
      }
      productName = product.name;
      productSku = product.sku;
      unitPrice = new Prisma.Decimal(product.sellingPrice);
      unitCost = new Prisma.Decimal(product.costPrice);
    }

    // Line calculations
    const lineSubtotal = itemInput.quantity.times(unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const lineDiscount = itemInput.discountAmount;

    if (lineDiscount.greaterThan(lineSubtotal)) {
      throw new SaleValidationError(
        `Item discount amount (${lineDiscount}) cannot exceed line subtotal (${lineSubtotal}).`
      );
    }

    const taxableAmount = lineSubtotal.minus(lineDiscount);
    const lineTax = taxEnabled
      ? taxableAmount.times(defaultTaxRate).dividedBy(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : new Prisma.Decimal("0.00");
    const lineTotal = taxableAmount.plus(lineTax);

    sumSubtotal = sumSubtotal.add(lineSubtotal);
    sumItemDiscounts = sumItemDiscounts.add(lineDiscount);
    sumTaxAmount = sumTaxAmount.add(lineTax);

    preparedLines.push({
      productId: itemInput.productId,
      variantId: itemInput.variantId,
      productName,
      productSku,
      quantity: itemInput.quantity,
      unitPrice,
      unitCost,
      discountAmount: lineDiscount,
      taxRate: defaultTaxRate,
      taxAmount: lineTax,
      subtotal: lineSubtotal,
      lineTotal,
      inventoryKey: itemInput.inventoryKey,
    });
  }

  // Sale-level discounts
  const saleOrderDiscount = parseSaleMoney(input.discountAmount, "Sale Discount Amount", true);
  const totalDiscount = sumItemDiscounts.add(saleOrderDiscount);

  if (totalDiscount.greaterThan(sumSubtotal)) {
    throw new SaleValidationError(
      `Total discount (${totalDiscount}) cannot exceed sale subtotal (${sumSubtotal}).`
    );
  }

  const totalAmount = sumSubtotal.minus(totalDiscount).plus(sumTaxAmount);

  // 4. Validate payments
  if (!Array.isArray(input.payments)) {
    throw new SaleValidationError("Payments must be provided as an array.");
  }

  const validMethods = Object.values(SalePaymentMethod);
  let totalPaid = new Prisma.Decimal("0.00");
  let totalChange = new Prisma.Decimal("0.00");

  interface PreparedPayment {
    paymentMethod: SalePaymentMethod;
    amount: Prisma.Decimal;
    tenderedAmount: Prisma.Decimal | null;
    changeAmount: Prisma.Decimal | null;
    reference: string | null;
    notes: string | null;
  }

  const preparedPayments: PreparedPayment[] = [];

  for (const p of input.payments) {
    if (!validMethods.includes(p.paymentMethod)) {
      throw new SalePaymentError(`Invalid payment method "${p.paymentMethod}".`);
    }

    const amount = parseSaleMoney(p.amount, "Payment Amount", false);
    let tenderedAmount: Prisma.Decimal | null = null;
    let changeAmount: Prisma.Decimal | null = null;

    if (p.paymentMethod === SalePaymentMethod.CASH) {
      if (p.tenderedAmount !== undefined && p.tenderedAmount !== null && p.tenderedAmount !== "") {
        tenderedAmount = parseSaleMoney(p.tenderedAmount, "Cash Tendered Amount", true);
        if (tenderedAmount.lessThan(amount)) {
          throw new SalePaymentError(
            `Cash tendered amount (${tenderedAmount}) cannot be less than payment amount (${amount}).`
          );
        }
        changeAmount = tenderedAmount.minus(amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      } else {
        tenderedAmount = amount;
        changeAmount = new Prisma.Decimal("0.00");
      }
      totalChange = totalChange.add(changeAmount);
    } else {
      tenderedAmount = null;
      changeAmount = null;
    }

    totalPaid = totalPaid.add(amount);
    preparedPayments.push({
      paymentMethod: p.paymentMethod,
      amount,
      tenderedAmount,
      changeAmount,
      reference: p.reference?.trim() || null,
      notes: p.notes?.trim() || null,
    });
  }

  // Prevent overpayments beyond sale total
  if (totalPaid.greaterThan(totalAmount)) {
    throw new SalePaymentError(
      `Total payments applied (${totalPaid}) cannot exceed sale total amount (${totalAmount}).`
    );
  }

  // Determine payment status
  let paymentStatus: SalePaymentStatus;
  if (totalPaid.equals(totalAmount)) {
    paymentStatus = SalePaymentStatus.PAID;
  } else if (totalPaid.greaterThan(0)) {
    paymentStatus = SalePaymentStatus.PARTIAL;
  } else {
    paymentStatus = SalePaymentStatus.UNPAID;
  }

  // 5. Atomic Checkout Transaction
  return await db.$transaction(
    async (tx) => {
      // 5a. Generate sequential invoice number with advisory lock
      const invoiceNumber = await generateInvoiceNumber(tx, organizationId, orgSettings?.invoicePrefix);

      // 5b. Create Sale record
      const sale = await tx.sale.create({
        data: {
          organizationId,
          branchId,
          invoiceNumber,
          receiptNumber: input.receiptNumber?.trim() || null,
          status: SaleStatus.COMPLETED,
          paymentStatus,
          subtotal: sumSubtotal,
          discountAmount: totalDiscount,
          taxAmount: sumTaxAmount,
          totalAmount,
          paidAmount: totalPaid,
          changeAmount: totalChange,
          notes: input.notes?.trim() || null,
          cashierId: user.id,
          customerId: input.customerId?.trim() || null,
        },
      });

      // 5c. Create SaleItem records
      const createdItemRecords = [];
      for (const line of preparedLines) {
        const itemRecord = await tx.saleItem.create({
          data: {
            organizationId,
            saleId: sale.id,
            productId: line.productId,
            variantId: line.variantId,
            productName: line.productName,
            productSku: line.productSku,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            discountAmount: line.discountAmount,
            taxRate: line.taxRate,
            taxAmount: line.taxAmount,
            subtotal: line.subtotal,
            lineTotal: line.lineTotal,
          },
        });
        createdItemRecords.push({
          line,
          itemRecord,
        });
      }

      // 5d. Deduct inventory in deterministic lexicographical order to prevent deadlocks
      const sortedForInventory = [...createdItemRecords].sort((a, b) =>
        a.line.inventoryKey.localeCompare(b.line.inventoryKey)
      );

      for (const item of sortedForInventory) {
        await applyStockOutflowTransaction(tx, {
          organizationId,
          branchId,
          productId: item.line.productId,
          variantId: item.line.variantId,
          quantity: item.line.quantity,
          movementType: "SALE",
          referenceType: "SALE_ITEM",
          referenceId: item.itemRecord.id,
          reason: `Sale ${invoiceNumber}`,
          performedByUserId: user.id,
        });
      }

      // 5e. Create SalePayment records
      const createdPayments = [];
      for (const p of preparedPayments) {
        const paymentRecord = await tx.salePayment.create({
          data: {
            organizationId,
            saleId: sale.id,
            paymentMethod: p.paymentMethod,
            amount: p.amount,
            tenderedAmount: p.tenderedAmount,
            changeAmount: p.changeAmount,
            reference: p.reference,
            notes: p.notes,
            recordedById: user.id,
          },
        });
        createdPayments.push(paymentRecord);
      }

      return {
        ...sale,
        items: createdItemRecords.map((ci) => ci.itemRecord),
        payments: createdPayments,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}

// Export alias for consistency
export const createSale = completeSale;

// ============================================================================
// READ SERVICES
// ============================================================================

/**
 * Parses and validates an optional date parameter.
 */
function parseDateParam(value: Date | string | undefined | null, fieldName: string): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) {
    throw new SaleValidationError(`${fieldName} must be a valid ISO date or Date object.`);
  }
  return d;
}

/**
 * Retrieves a sale by ID with its items, payments, cashier, and branch details.
 * Strictly enforces tenant isolation and branch authorization.
 */
export async function getSaleById(
  saleId: string,
  options?: SaleServiceOptions
): Promise<SaleDetailDTO> {
  if (!saleId?.trim()) {
    throw new SaleValidationError("saleId is required.");
  }

  // 1. Authenticate user and verify organization membership
  const user = options?.actorUser !== undefined ? options?.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  const requestedOrgId = options?.organizationId;
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

  if (!SALE_READ_ROLES.includes(roleName)) {
    throw new UnauthorizedRoleError(
      `Role "${roleName}" is not permitted to view sales.`
    );
  }

  // 2. Fetch sale strictly within caller's organization (prevents cross-tenant existence leakage)
  const sale = await db.sale.findFirst({
    where: {
      id: saleId.trim(),
      organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      branchId: true,
      invoiceNumber: true,
      receiptNumber: true,
      status: true,
      paymentStatus: true,
      saleDate: true,
      subtotal: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      changeAmount: true,
      notes: true,
      cashierId: true,
      customerId: true,
      createdAt: true,
      updatedAt: true,
      branch: {
        select: { id: true, name: true, code: true },
      },
      cashier: {
        select: { id: true, name: true, email: true },
      },
      items: {
        select: {
          id: true,
          productId: true,
          variantId: true,
          productName: true,
          productSku: true,
          quantity: true,
          unitPrice: true,
          unitCost: true,
          discountAmount: true,
          taxRate: true,
          taxAmount: true,
          subtotal: true,
          lineTotal: true,
        },
        orderBy: { id: "asc" },
      },
      payments: {
        select: {
          id: true,
          paymentMethod: true,
          amount: true,
          tenderedAmount: true,
          changeAmount: true,
          reference: true,
          notes: true,
          paidAt: true,
          recordedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { paidAt: "asc" },
      },
    },
  });

  if (!sale) {
    throw new SaleNotFoundError();
  }

  // 3. Verify caller has branch authorization
  const hasBranchAccess = await checkBranchAccess({
    userId: user.id,
    organizationId,
    branchId: sale.branchId,
  });

  if (!hasBranchAccess) {
    throw new SaleBranchAccessError(
      `User does not have authorized access to branch "${sale.branchId}".`
    );
  }

  return sale as SaleDetailDTO;
}

/**
 * Lists sales with deterministic pagination, multi-attribute filtering,
 * and strict database-level tenant and branch scoping.
 */
export async function listSales(
  input: ListSalesInput = {},
  options?: SaleServiceOptions
): Promise<PaginatedSalesResult> {
  // 1. Authenticate user and verify organization membership
  const user = options?.actorUser !== undefined ? options?.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  const requestedOrgId = options?.organizationId;
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

  if (!SALE_READ_ROLES.includes(roleName)) {
    throw new UnauthorizedRoleError(
      `Role "${roleName}" is not permitted to view sales.`
    );
  }

  // 2. Resolve database-level branch scoping
  let branchFilterClause: Prisma.SaleWhereInput["branchId"] = undefined;

  if (input.branchId?.trim()) {
    const branchId = input.branchId.trim();
    const hasAccess = await checkBranchAccess({
      userId: user.id,
      organizationId,
      branchId,
    });

    if (!hasAccess) {
      const branch = await db.branch.findUnique({
        where: { id: branchId },
        select: { id: true, organizationId: true, isActive: true },
      });
      if (!branch) {
        throw new BranchNotFoundError(`Branch "${branchId}" does not exist.`);
      }
      if (branch.organizationId !== organizationId) {
        throw new CrossTenantViolationError(
          `Multi-tenant violation: Branch "${branchId}" belongs to another organization.`
        );
      }
      throw new SaleBranchAccessError(
        `User does not have authorized access to branch "${branchId}".`
      );
    }
    branchFilterClause = branchId;
  } else {
    // If no branch filter supplied, scope by caller's authorized branches
    if (roleName === SYSTEM_ROLES.OWNER) {
      // Owner has organization-wide access across all branches
      branchFilterClause = undefined;
    } else {
      const authorizedBranchIds = membership.branchMemberships
        .filter((bm) => bm.branch.isActive)
        .map((bm) => bm.branchId);

      if (authorizedBranchIds.length === 0) {
        return {
          items: [],
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 0,
        };
      }
      branchFilterClause = { in: authorizedBranchIds };
    }
  }

  // 3. Construct where clause
  const where: Prisma.SaleWhereInput = {
    organizationId,
    ...(branchFilterClause !== undefined ? { branchId: branchFilterClause } : {}),
  };

  // Status filter
  if (input.status) {
    const validStatuses = Object.values(SaleStatus);
    if (!validStatuses.includes(input.status)) {
      throw new SaleValidationError(
        `Invalid status "${input.status}". Allowed values: ${validStatuses.join(", ")}.`
      );
    }
    where.status = input.status;
  }

  // Payment status filter
  if (input.paymentStatus) {
    const validPaymentStatuses = Object.values(SalePaymentStatus);
    if (!validPaymentStatuses.includes(input.paymentStatus)) {
      throw new SaleValidationError(
        `Invalid paymentStatus "${input.paymentStatus}". Allowed values: ${validPaymentStatuses.join(", ")}.`
      );
    }
    where.paymentStatus = input.paymentStatus;
  }

  // Cashier filter
  if (input.cashierId?.trim()) {
    where.cashierId = input.cashierId.trim();
  }

  // Date filters
  const dateFrom = parseDateParam(input.dateFrom, "dateFrom");
  const dateTo = parseDateParam(input.dateTo, "dateTo");
  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw new SaleValidationError("dateFrom cannot be greater than dateTo.");
  }
  if (dateFrom || dateTo) {
    where.saleDate = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  // Search filter (case-insensitive substring match on invoiceNumber)
  if (input.search?.trim()) {
    where.invoiceNumber = {
      contains: input.search.trim(),
      mode: "insensitive",
    };
  }

  // 4. Pagination validation
  const page = input.page !== undefined && input.page !== null ? Math.floor(Number(input.page)) : 1;
  if (isNaN(page) || page < 1) {
    throw new SaleValidationError("Page must be an integer greater than or equal to 1.");
  }

  const pageSize =
    input.pageSize !== undefined && input.pageSize !== null ? Math.floor(Number(input.pageSize)) : 25;
  if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new SaleValidationError("PageSize must be an integer between 1 and 100.");
  }

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  // 5. Deterministic ordering
  const orderBy: Prisma.SaleOrderByWithRelationInput[] = [
    { saleDate: "desc" },
    { createdAt: "desc" },
    { id: "desc" },
  ];

  // 6. Execute count and findMany concurrently
  const [totalItems, rows] = await Promise.all([
    db.sale.count({ where }),
    db.sale.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        receiptNumber: true,
        saleDate: true,
        status: true,
        paymentStatus: true,
        subtotal: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true,
        paidAmount: true,
        changeAmount: true,
        customerId: true,
        createdAt: true,
        branch: {
          select: { id: true, name: true, code: true },
        },
        cashier: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy,
      skip,
      take,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    items: rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      receiptNumber: r.receiptNumber,
      saleDate: r.saleDate,
      status: r.status,
      paymentStatus: r.paymentStatus,
      subtotal: r.subtotal,
      discountAmount: r.discountAmount,
      taxAmount: r.taxAmount,
      totalAmount: r.totalAmount,
      paidAmount: r.paidAmount,
      changeAmount: r.changeAmount,
      customerId: r.customerId,
      createdAt: r.createdAt,
      branch: r.branch,
      cashier: r.cashier,
      itemCount: r._count.items,
    })),
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}

// ============================================================================
// VOID SALE SERVICE
// ============================================================================

/**
 * Safely voids an already COMPLETED sale:
 * 1. Authenticates caller and verifies strict void authorization (OWNER or MANAGER only).
 * 2. Acquires a pessimistic row lock (SELECT FOR UPDATE) on the Sale record inside a transaction.
 * 3. Verifies sale belongs to the authorized organization and caller has access to the sale's branch.
 * 4. Asserts that the sale status is currently COMPLETED (rejects DRAFT or already VOIDED sales).
 * 5. Loads all SaleItems and restores inventory using compensating ADJUSTMENT_IN movements
 *    applied in deterministic lexicographical order.
 * 6. Updates Sale.status = VOIDED.
 * 7. Preserves original SaleItem, SalePayment, and historical financial records completely intact.
 */
export async function voidSale(
  saleId: string,
  options?: SaleServiceOptions
): Promise<VoidSaleResultDTO> {
  if (!saleId?.trim()) {
    throw new SaleValidationError("saleId is required.");
  }

  // 1. Authenticate user and verify organization membership
  const user = options?.actorUser !== undefined ? options?.actorUser : await getCurrentAppUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }

  const requestedOrgId = options?.organizationId;
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

  // 2. Strict authorization: Only OWNER and MANAGER may void sales
  if (!SALE_VOID_ROLES.includes(roleName)) {
    throw new UnauthorizedRoleError(
      `Role "${roleName}" is not permitted to void sales. Required one of: ${SALE_VOID_ROLES.join(", ")}.`
    );
  }

  // 3. Atomic transaction with pessimistic row lock
  return await db.$transaction(
    async (tx) => {
      // 3a. Lock sale row with FOR UPDATE
      const [lockedSale] = await tx.$queryRaw<Array<{
        id: string;
        organizationId: string;
        branchId: string;
        invoiceNumber: string;
        status: SaleStatus;
      }>>`
        SELECT id, "organizationId", "branchId", "invoiceNumber", status
        FROM "Sale"
        WHERE id = ${saleId.trim()}
          AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;

      if (!lockedSale) {
        throw new SaleNotFoundError();
      }

      // 3b. Verify branch access
      const hasBranchAccess = await checkBranchAccess({
        userId: user.id,
        organizationId,
        branchId: lockedSale.branchId,
      });

      if (!hasBranchAccess) {
        throw new SaleBranchAccessError(
          `User does not have authorized access to branch "${lockedSale.branchId}".`
        );
      }

      // 3c. Verify sale state: Only COMPLETED sales may be voided
      if (lockedSale.status !== SaleStatus.COMPLETED) {
        throw new SaleStateError(
          `Cannot void sale "${lockedSale.invoiceNumber}": only COMPLETED sales can be voided. Current status is ${lockedSale.status}.`
        );
      }

      // 3d. Fetch SaleItems
      const saleItems = await tx.saleItem.findMany({
        where: { saleId: lockedSale.id, organizationId },
      });

      // 3e. Sort sale items deterministically by inventory key before locking
      const itemKey = (item: { productId: string; variantId: string | null }) =>
        `${item.productId}:${item.variantId ?? "null"}`;
      const sortedItems = [...saleItems].sort((a, b) => itemKey(a).localeCompare(itemKey(b)));

      // 3f. Restore inventory via compensating ADJUSTMENT_IN movements
      let restoredQuantity = new Prisma.Decimal("0.000");

      for (const item of sortedItems) {
        await applyStockInflowTransaction(tx, {
          organizationId,
          branchId: lockedSale.branchId,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          movementType: "ADJUSTMENT_IN",
          referenceType: "SALE_VOID",
          referenceId: item.id,
          reason: `Void Sale ${lockedSale.invoiceNumber}`,
          performedByUserId: user.id,
        });

        restoredQuantity = restoredQuantity.add(item.quantity);
      }

      // 3g. Update Sale status to VOIDED
      const updatedSale = await tx.sale.update({
        where: { id: lockedSale.id },
        data: { status: SaleStatus.VOIDED },
        select: { id: true, invoiceNumber: true, status: true, updatedAt: true },
      });

      return {
        saleId: updatedSale.id,
        invoiceNumber: updatedSale.invoiceNumber,
        previousStatus: SaleStatus.COMPLETED,
        status: updatedSale.status,
        restoredItemCount: saleItems.length,
        restoredQuantity,
        voidedAt: updatedSale.updatedAt,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}


