import { PurchaseStatus, PurchasePaymentStatus, PurchasePaymentMethod } from "@prisma/client";
import { type SystemRoleName } from "@/lib/roles";

// ============================================================================
// SUPPLIER DTOs
// ============================================================================

export interface SerializedSupplier {
  id: string;
  organizationId: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  taxNumber: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierListResult {
  suppliers: SerializedSupplier[];
  totalCount: number;
  limit: number;
  offset: number;
}

export interface SupplierActionResult {
  success?: boolean;
  error?: string;
  message?: string;
  supplier?: SerializedSupplier;
}

export interface CreateSupplierInputDTO {
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  taxNumber?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface UpdateSupplierInputDTO {
  name?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  taxNumber?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

// ============================================================================
// PURCHASE ORDER DTOs
// ============================================================================

export interface SerializedPurchaseListItem {
  id: string;
  organizationId: string;
  purchaseNumber: string;
  branchId: string;
  supplierId: string;
  status: PurchaseStatus;
  paymentStatus: PurchasePaymentStatus;
  orderDate: string;
  expectedDate: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  shippingAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  notes: string | null;
  createdAt: string;
  supplier: {
    id: string;
    name: string;
    contactPerson: string | null;
  };
  branch: {
    id: string;
    name: string;
    code: string;
  };
  itemCount: number;
}

export interface PurchaseKPIs {
  totalOrders: number;
  openOrders: number;
  completedOrders: number;
  totalOutstanding: string;
}

export interface PurchaseListResult {
  purchases: SerializedPurchaseListItem[];
  totalCount: number;
  limit: number;
  offset: number;
  kpis: PurchaseKPIs;
}

export interface PurchaseListFilterParams {
  search?: string;
  status?: PurchaseStatus;
  paymentStatus?: PurchasePaymentStatus;
  supplierId?: string;
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// COMMON CONTEXT DTOs
// ============================================================================

export interface AuthorizedBranchDTO {
  id: string;
  name: string;
  code: string;
}

export interface PurchasingPageInitialData {
  userRole: SystemRoleName;
  canMutateSuppliers: boolean;
  canMutatePurchases: boolean;
  organizationId: string;
  organizationName: string;
  authorizedBranches: AuthorizedBranchDTO[];
  initialSuppliers: SupplierListResult;
  initialPurchases: PurchaseListResult;
  allActiveSuppliersForFilter: { id: string; name: string }[];
  defaultTab: "purchases" | "suppliers";
}

// ============================================================================
// STEP 17B: CATALOG SEARCH & PURCHASE MUTATION DTOs
// ============================================================================

export interface SelectablePurchasingCatalogItem {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string;
  unit: string;
  costPrice: string;
  isVariable: boolean;
}

export interface CreatePurchaseLineItemDTO {
  productId: string;
  variantId?: string | null;
  quantity: string;
  unitCost: string;
  taxRate?: string;
  notes?: string | null;
}

export interface CreatePurchaseInputDTO {
  supplierId: string;
  branchId: string;
  orderDate?: string;
  expectedDate?: string | null;
  notes?: string | null;
  discountAmount?: string;
  taxAmount?: string;
  shippingAmount?: string;
  items: CreatePurchaseLineItemDTO[];
}

export interface UpdatePurchaseInputDTO {
  supplierId?: string;
  branchId?: string;
  orderDate?: string;
  expectedDate?: string | null;
  notes?: string | null;
  discountAmount?: string;
  taxAmount?: string;
  shippingAmount?: string;
  items?: CreatePurchaseLineItemDTO[];
}

// ============================================================================
// STEP 17B: PURCHASE DETAIL & HISTORY DTOs
// ============================================================================

export interface SerializedPurchaseDetailItem {
  id: string;
  purchaseId: string;
  productId: string;
  variantId: string | null;
  quantityOrdered: string;
  quantityReceived: string;
  quantityReturned: string;
  remainingToReceive: string;
  unitCost: string;
  taxRate: string;
  lineTotal: string;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  };
  variant: {
    id: string;
    name: string;
    sku: string | null;
  } | null;
}

export interface SerializedPurchaseReceiptHistoryItem {
  id: string;
  receiptNumber: string;
  receivedAt: string;
  notes: string | null;
  itemCount: number;
  receivedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface SerializedPurchasePaymentHistoryItem {
  id: string;
  paymentMethod: string;
  amount: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  recordedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface SerializedPurchaseReturnHistoryItem {
  id: string;
  returnNumber: string;
  returnDate: string;
  reason: string | null;
  notes: string | null;
  returnedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  itemCount: number;
  items?: {
    id: string;
    productName: string;
    variantName: string | null;
    sku: string | null;
    quantityReturned: string;
    unitCost: string;
    lineTotal: string;
  }[];
}

export interface SerializedPurchaseDetailDTO {
  id: string;
  organizationId: string;
  purchaseNumber: string;
  branchId: string;
  supplierId: string;
  status: PurchaseStatus;
  paymentStatus: PurchasePaymentStatus;
  orderDate: string;
  expectedDate: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  shippingAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: {
    id: string;
    name: string;
    contactPerson: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    taxNumber: string | null;
  };
  branch: {
    id: string;
    name: string;
    code: string;
  };
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  items: SerializedPurchaseDetailItem[];
  receipts: SerializedPurchaseReceiptHistoryItem[];
  payments: SerializedPurchasePaymentHistoryItem[];
  returns: SerializedPurchaseReturnHistoryItem[];
}

export interface PurchaseDetailActionResult {
  success?: boolean;
  error?: string;
  purchase?: SerializedPurchaseDetailDTO;
}

export interface PurchaseMutationActionResult {
  success?: boolean;
  error?: string;
  message?: string;
  purchaseId?: string;
  purchaseNumber?: string;
}

// ============================================================================
// STEP 17C: GOODS RECEIVING DTOs
// ============================================================================

export interface ReceivePurchaseOrderItemInputDTO {
  purchaseItemId: string;
  quantityReceived: string;
}

export interface ReceivePurchaseOrderInputDTO {
  purchaseId: string;
  items: ReceivePurchaseOrderItemInputDTO[];
  receivedAt?: string | null;
  notes?: string | null;
}

export interface ReceivePurchaseOrderActionResult {
  success: boolean;
  message?: string;
  error?: string;
  receiptId?: string;
  receiptNumber?: string;
  purchaseStatus?: PurchaseStatus;
}

// ============================================================================
// STEP 17D: SUPPLIER PAYMENT DTOs
// ============================================================================

export interface RecordPurchasePaymentInputDTO {
  purchaseId: string;
  amount: string;
  paymentMethod: PurchasePaymentMethod;
  paidAt?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface RecordPurchasePaymentActionResult {
  success: boolean;
  message?: string;
  error?: string;
  paymentId?: string;
  purchasePaymentStatus?: PurchasePaymentStatus;
}

// ============================================================================
// STEP 17E: PURCHASE RETURN DTOs
// ============================================================================

export interface CreatePurchaseReturnItemInputDTO {
  purchaseItemId: string;
  quantityReturned: string;
  reason?: string | null;
}

export interface CreatePurchaseReturnInputDTO {
  purchaseId: string;
  items: CreatePurchaseReturnItemInputDTO[];
  returnDate?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface CreatePurchaseReturnActionResult {
  success: boolean;
  message?: string;
  error?: string;
  returnId?: string;
  returnNumber?: string;
}
