/**
 * Client-safe serializable DTOs and types for the Inventory module.
 * Strictly NO Prisma runtime imports in this file.
 */

export interface InventorySummaryDTO {
  totalTracked: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export type StockStatusType = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface SerializedProductDetail {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  costPrice: string | null;
  sellingPrice: string | null;
  isActive: boolean;
}

export interface SerializedVariantDetail {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  costPrice: string | null;
  sellingPrice: string | null;
  isActive: boolean;
}

export interface SerializedInventoryStock {
  id: string;
  organizationId: string;
  branchId: string;
  productId: string;
  variantId: string | null;
  quantity: string;
  reorderLevel: string | null;
  reorderQuantity: string | null;
  createdAt: string;
  updatedAt: string;
  product: SerializedProductDetail;
  variant: SerializedVariantDetail | null;
  status: StockStatusType;
}

export interface SerializedMovementProduct {
  id: string;
  name: string;
  sku: string;
}

export interface SerializedMovementVariant {
  id: string;
  name: string;
  sku: string | null;
}

export interface SerializedMovementUser {
  id: string;
  name: string;
  email: string;
}

export interface SerializedInventoryMovement {
  id: string;
  organizationId: string;
  branchId: string;
  productId: string;
  variantId: string | null;
  movementType: StockMovementTypeValue;
  quantityDelta: string;
  quantityBefore: string;
  quantityAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  notes: string | null;
  performedByUserId: string | null;
  createdAt: string;
  product?: SerializedMovementProduct;
  variant?: SerializedMovementVariant | null;
  performedBy?: SerializedMovementUser | null;
}

export interface InventoryHistoryListResult {
  items: SerializedInventoryMovement[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface InventoryStockListResult {
  items: SerializedInventoryStock[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface InventoryActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthorizedBranchDTO {
  id: string;
  name: string;
  code: string;
}

export type StockMovementTypeValue =
  | "OPENING_BALANCE"
  | "PURCHASE_RECEIPT"
  | "PURCHASE_RETURN"
  | "SALE"
  | "SALE_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "DAMAGE"
  | "WASTE";

export interface RecordOpeningBalanceInput {
  branchId: string;
  productId: string;
  variantId?: string | null;
  quantity: string;
  reorderLevel?: string | null;
  reorderQuantity?: string | null;
  reason?: string;
  notes?: string;
}

export interface RecordStockInflowInput {
  branchId: string;
  productId: string;
  variantId?: string | null;
  quantity: string;
  movementType: "ADJUSTMENT_IN";
  reason?: string;
  notes?: string;
}

export interface RecordStockOutflowInput {
  branchId: string;
  productId: string;
  variantId?: string | null;
  quantity: string;
  movementType: "ADJUSTMENT_OUT" | "DAMAGE" | "WASTE";
  reason?: string;
  notes?: string;
}

export interface AdjustStockInput {
  branchId: string;
  productId: string;
  variantId?: string | null;
  newQuantity: string;
  reason: string;
  notes?: string;
}

export interface UpdateStockThresholdsInput {
  branchId: string;
  stockId: string;
  reorderLevel?: string | null;
  reorderQuantity?: string | null;
}

export interface SerializedStockMutationResult {
  stock: {
    id: string;
    organizationId: string;
    branchId: string;
    productId: string;
    variantId: string | null;
    quantity: string;
    reorderLevel: string | null;
    reorderQuantity: string | null;
  };
  movement: {
    id: string;
    organizationId: string;
    branchId: string;
    productId: string;
    variantId: string | null;
    movementType: string;
    quantityDelta: string;
    quantityBefore: string;
    quantityAfter: string;
    referenceType: string | null;
    referenceId: string | null;
    reason: string | null;
    notes: string | null;
    performedByUserId: string | null;
    createdAt: string;
  };
}

export interface SerializedThresholdResult {
  id: string;
  reorderLevel: string | null;
  reorderQuantity: string | null;
}

export interface SelectableCatalogItem {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string;
  isVariable: boolean;
  unit: string;
  currentStockInBranch?: string | null;
}

/**
 * Computes presentation stock status according to approved rules:
 * - Out of Stock: quantity <= 0
 * - Low Stock: quantity > 0 AND reorderLevel IS NOT NULL AND quantity <= reorderLevel
 * - In Stock: quantity > 0 AND (reorderLevel IS NULL OR quantity > reorderLevel)
 */
export function computeStockStatus(
  quantity: number | string,
  reorderLevel: number | string | null | undefined
): StockStatusType {
  const qty = typeof quantity === "number" ? quantity : parseFloat(quantity);
  if (isNaN(qty) || qty <= 0) {
    return "OUT_OF_STOCK";
  }
  if (reorderLevel !== null && reorderLevel !== undefined && reorderLevel !== "") {
    const level = typeof reorderLevel === "number" ? reorderLevel : parseFloat(String(reorderLevel));
    if (!isNaN(level) && qty <= level) {
      return "LOW_STOCK";
    }
  }
  return "IN_STOCK";
}
