export interface BranchSettingsDTO {
  id: string;
  invoiceNumberPrefix: string | null;
  receiptNumberPrefix: string | null;
  defaultWarehouseName: string | null;
}

export interface BranchListItemDTO {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  settings?: BranchSettingsDTO | null;
  _count?: {
    sales: number;
    inventoryStocks: number;
    memberships: number;
  };
}

export interface CreateBranchInput {
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  invoiceNumberPrefix?: string | null;
  receiptNumberPrefix?: string | null;
  defaultWarehouseName?: string | null;
}

export interface UpdateBranchInput {
  branchId: string;
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  invoiceNumberPrefix?: string | null;
  receiptNumberPrefix?: string | null;
  defaultWarehouseName?: string | null;
}

export type BranchActionResult<T> =
  | {
      success: true;
      data: T;
      message?: string;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string>;
    };
