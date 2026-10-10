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
  TenantContextError,
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

function translateCustomerError(err: unknown, fallbackMessage: string): string {
  if (err instanceof TenantContextError) {
    if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
      return "Multiple organizations found. Please specify an organization context.";
    }
    if (err.code === "NO_ACTIVE_MEMBERSHIP") {
      return "No active organization membership found for your account.";
    }
    if (err.code === "MEMBERSHIP_NOT_FOUND") {
      return "The requested organization was not found or you do not have an active membership in it.";
    }
    if (err.code === "INACTIVE_MEMBERSHIP") {
      return "Your membership in the requested organization is inactive or disabled.";
    }
    if (err.code === "UNAUTHORIZED_ROLE") {
      return "Your role does not have permission to perform this customer operation.";
    }
    return err.message;
  }
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
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallbackMessage;
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
    return { error: translateCustomerError(err, "An unexpected error occurred while creating customer.") };
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
    return { error: translateCustomerError(err, "An unexpected error occurred while updating customer.") };
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
    const candidateOrgId = options?.organizationId || organizationId || undefined;
    const customer = await setCustomerActiveStatus(customerId, isActive, {
      ...options,
      organizationId: candidateOrgId,
    });
    revalidatePath("/customers");
    return {
      success: true,
      message: `Customer "${customer.name}" has been ${isActive ? "activated" : "deactivated"}.`,
      customer,
    };
  } catch (err: unknown) {
    return { error: translateCustomerError(err, `Failed to ${isActive ? "activate" : "deactivate"} customer.`) };
  }
}

export async function searchCustomersAction(
  query: string,
  organizationId?: string,
  options?: CustomerServiceOptions
): Promise<CustomerSearchResultDTO[]> {
  try {
    const candidateOrgId = options?.organizationId || organizationId || undefined;
    return await searchCustomers(query, {
      ...options,
      organizationId: candidateOrgId,
    });
  } catch (err) {
    console.error("searchCustomersAction error:", err);
    return [];
  }
}
