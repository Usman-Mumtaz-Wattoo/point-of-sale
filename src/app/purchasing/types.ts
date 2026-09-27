import { PurchaseStatus, PurchasePaymentStatus } from "@prisma/client";
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
