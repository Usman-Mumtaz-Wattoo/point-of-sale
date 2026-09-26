"use server";

import { revalidatePath } from "next/cache";
import {
  createCustomer,
  updateCustomer,
  setCustomerActiveStatus,
  searchCustomers,
  CustomerValidationError,
  CustomerConflictError,
  CustomerBranchAccessError,
  CustomerNotFoundError,
  CustomerDTO,
  CustomerSearchResultDTO,
  CustomerServiceOptions,
} from "@/lib/customers";
import {
  UnauthorizedRoleError,
  MembershipNotFoundError,
  CrossTenantViolationError,
  BranchNotFoundError,
} from "@/lib/memberships";

export interface CustomerActionResult {
  success?: boolean;
  error?: string;
  message?: string;
  customer?: CustomerDTO;
}

function extractString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (value === null || value === undefined) return null;
  const str = value.toString().trim();
  return str.length > 0 ? str : null;
}

export async function createCustomerAction(
  _prevState: CustomerActionResult | null,
  formData: FormData,
  options?: CustomerServiceOptions
): Promise<CustomerActionResult> {
  const organizationId = options?.organizationId || extractString(formData, "organizationId") || undefined;
  const name = formData.get("name")?.toString().trim() || "";
  const code = extractString(formData, "code");
  const email = extractString(formData, "email");
  const phone = extractString(formData, "phone");
  const address = extractString(formData, "address");
  const city = extractString(formData, "city");
  const taxNumber = extractString(formData, "taxNumber");
  const notes = extractString(formData, "notes");
  const primaryBranchId = extractString(formData, "primaryBranchId");

  if (!name) {
    return { error: "Customer name is required." };
  }

  try {
    const customer = await createCustomer(
      {
        name,
        code,
        email,
        phone,
        address,
        city,
        taxNumber,
        notes,
        primaryBranchId,
      },
      { ...options, organizationId }
    );

    revalidatePath("/customers");
    return {
      success: true,
      message: `Customer "${customer.name}" created successfully.`,
      customer,
    };
  } catch (err: unknown) {
    if (
      err instanceof CustomerValidationError ||
      err instanceof CustomerConflictError ||
      err instanceof CustomerBranchAccessError ||
      err instanceof UnauthorizedRoleError ||
      err instanceof MembershipNotFoundError ||
      err instanceof CrossTenantViolationError ||
      err instanceof BranchNotFoundError
    ) {
      return { error: err.message };
    }
    if (err instanceof Error) {
      return { error: err.message };
    }
    return { error: "An unexpected error occurred while creating customer." };
  }
}

export async function updateCustomerAction(
  customerId: string,
  _prevState: CustomerActionResult | null,
  formData: FormData,
  options?: CustomerServiceOptions
): Promise<CustomerActionResult> {
  if (!customerId?.trim()) {
    return { error: "customerId is required." };
  }

  const organizationId = options?.organizationId || extractString(formData, "organizationId") || undefined;
  const name = formData.get("name")?.toString().trim();
  const code = extractString(formData, "code");
  const email = extractString(formData, "email");
  const phone = extractString(formData, "phone");
  const address = extractString(formData, "address");
  const city = extractString(formData, "city");
  const taxNumber = extractString(formData, "taxNumber");
  const notes = extractString(formData, "notes");

  // For primaryBranchId: if field is present in formData, we update it.
  const hasBranchField = formData.has("primaryBranchId");
  const primaryBranchId = hasBranchField ? extractString(formData, "primaryBranchId") : undefined;

  try {
    const customer = await updateCustomer(
      customerId,
      {
        ...(name !== undefined ? { name } : {}),
        code,
        email,
        phone,
        address,
        city,
        taxNumber,
        notes,
        ...(hasBranchField ? { primaryBranchId } : {}),
      },
      { ...options, organizationId }
    );

    revalidatePath("/customers");
    return {
      success: true,
      message: `Customer "${customer.name}" updated successfully.`,
      customer,
    };
  } catch (err: unknown) {
    if (
      err instanceof CustomerValidationError ||
      err instanceof CustomerConflictError ||
      err instanceof CustomerBranchAccessError ||
      err instanceof CustomerNotFoundError ||
      err instanceof UnauthorizedRoleError ||
      err instanceof MembershipNotFoundError ||
      err instanceof CrossTenantViolationError ||
      err instanceof BranchNotFoundError
    ) {
      return { error: err.message };
    }
    if (err instanceof Error) {
      return { error: err.message };
    }
    return { error: "An unexpected error occurred while updating customer." };
  }
}

export async function setCustomerActiveStatusAction(
  customerId: string,
  isActive: boolean,
  organizationId?: string,
  options?: CustomerServiceOptions
): Promise<CustomerActionResult> {
  if (!customerId?.trim()) {
    return { error: "customerId is required." };
  }

  try {
    const customer = await setCustomerActiveStatus(customerId, isActive, {
      ...options,
      organizationId: options?.organizationId || organizationId,
    });
    revalidatePath("/customers");
    return {
      success: true,
      message: `Customer "${customer.name}" has been ${isActive ? "activated" : "deactivated"}.`,
      customer,
    };
  } catch (err: unknown) {
    if (
      err instanceof CustomerValidationError ||
      err instanceof CustomerNotFoundError ||
      err instanceof UnauthorizedRoleError ||
      err instanceof MembershipNotFoundError
    ) {
      return { error: err.message };
    }
    if (err instanceof Error) {
      return { error: err.message };
    }
    return { error: `Failed to ${isActive ? "activate" : "deactivate"} customer.` };
  }
}

export async function searchCustomersAction(
  query: string,
  organizationId?: string,
  options?: CustomerServiceOptions
): Promise<CustomerSearchResultDTO[]> {
  try {
    return await searchCustomers(query, {
      ...options,
      organizationId: options?.organizationId || organizationId,
    });
  } catch (err) {
    console.error("searchCustomersAction error:", err);
    return [];
  }
}
