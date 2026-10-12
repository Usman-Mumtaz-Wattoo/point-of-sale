import "server-only";
import { Prisma } from "@prisma/client";
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
  resolveTenantContext,
  TenantContextError,
  AuthRequiredError,
  type TenantUserContext,
} from "./tenant-context";

// ============================================================================
// ROLE ACCESS DEFINITIONS
// ============================================================================

export const CUSTOMER_READ_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.ACCOUNTANT,
];

export const CUSTOMER_MUTATION_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
];

export const CUSTOMER_STATUS_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
];

// ============================================================================
// DOMAIN ERROR HIERARCHY
// ============================================================================

export class CustomerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerError";
  }
}

export class CustomerValidationError extends CustomerError {
  constructor(message: string) {
    super(message);
    this.name = "CustomerValidationError";
  }
}

export class CustomerNotFoundError extends CustomerError {
  constructor(message = "Customer not found.") {
    super(message);
    this.name = "CustomerNotFoundError";
  }
}

export class CustomerConflictError extends CustomerError {
  constructor(message = "A customer with this code already exists in this organization.") {
    super(message);
    this.name = "CustomerConflictError";
  }
}

export class CustomerBranchAccessError extends CustomerError {
  constructor(message = "User does not have authorized access to the specified branch.") {
    super(message);
    this.name = "CustomerBranchAccessError";
  }
}

// Re-export core tenant/membership authorization errors for caller convenience
export {
  CrossTenantViolationError,
  MembershipNotFoundError,
  UnauthorizedRoleError,
  BranchNotFoundError,
  TenantContextError,
  AuthRequiredError,
  resolveTenantContext,
};

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

export interface CustomerServiceOptions {
  organizationId?: string;
  actorUser?: AppUserContext | TenantUserContext | null;
}

export interface AuthorizedCustomerContext {
  user: AppUserContext | TenantUserContext;
  organizationId: string;
  role: SystemRoleName;
}

export type CustomerAction = "read" | "mutate" | "status";

/**
 * Resolves the authenticated user, verifies organization membership,
 * and enforces the role permission gate for the requested customer action
 * using the shared server-side tenant context resolver.
 */
export async function resolveAuthorizedCustomerContext(
  action: CustomerAction,
  options?: CustomerServiceOptions
): Promise<AuthorizedCustomerContext> {
  const allowedRoles =
    action === "mutate"
      ? CUSTOMER_MUTATION_ROLES
      : action === "status"
      ? CUSTOMER_STATUS_ROLES
      : CUSTOMER_READ_ROLES;

  const tenantContext = await resolveTenantContext(options?.organizationId, {
    requireRoles: allowedRoles,
    actorUser: options?.actorUser,
  });

  const user = options?.actorUser !== undefined ? options.actorUser : await getCurrentAppUser();
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
// DTOs & INTERFACES
// ============================================================================

export interface CustomerBranchDTO {
  id: string;
  name: string;
  code: string;
}

export interface CustomerDTO {
  id: string;
  organizationId: string;
  primaryBranchId: string | null;
  primaryBranch: CustomerBranchDTO | null;
  code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  taxNumber: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerSearchResultDTO {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
}

export interface PaginatedCustomersResult {
  items: CustomerDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalItems: number;
  totalPages: number;
}

export interface CreateCustomerInput {
  name: string;
  primaryBranchId?: string | null;
  code?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerInput {
  name?: string;
  primaryBranchId?: string | null;
  code?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
}

export interface ListCustomersInput {
  isActive?: boolean | null;
  primaryBranchId?: string | null;
  search?: string | null;
  page?: number | null;
  pageSize?: number | null;
}

// ============================================================================
// SANITIZATION & VALIDATION HELPERS
// ============================================================================

function sanitizeString(value: unknown, maxLength: number, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new CustomerValidationError(`${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new CustomerValidationError(`${fieldName} cannot exceed ${maxLength} characters.`);
  }
  return trimmed;
}

function sanitizeRequiredString(value: unknown, maxLength: number, fieldName: string): string {
  if (value === undefined || value === null) {
    throw new CustomerValidationError(`${fieldName} is required.`);
  }
  if (typeof value !== "string") {
    throw new CustomerValidationError(`${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new CustomerValidationError(`${fieldName} cannot be empty.`);
  }
  if (trimmed.length > maxLength) {
    throw new CustomerValidationError(`${fieldName} cannot exceed ${maxLength} characters.`);
  }
  return trimmed;
}

/**
 * Validates that an optional primary branch exists, belongs to the authorized organization,
 * is active, and the caller has authorized access to it.
 */
async function validatePrimaryBranch(
  primaryBranchId: string | null | undefined,
  organizationId: string,
  userId: string
): Promise<string | null> {
  if (primaryBranchId === undefined || primaryBranchId === null) {
    return null;
  }
  const branchId = primaryBranchId.trim();
  if (branchId.length === 0) {
    return null;
  }

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

  if (!branch.isActive) {
    throw new CustomerValidationError(`Branch "${branchId}" is inactive and cannot be assigned.`);
  }

  const hasAccess = await checkBranchAccess({
    userId,
    organizationId,
    branchId,
  });

  if (!hasAccess) {
    throw new CustomerBranchAccessError(
      `User does not have authorized access to branch "${branchId}".`
    );
  }

  return branchId;
}

type CustomerWithBranchPayload = Prisma.CustomerGetPayload<{
  include: {
    primaryBranch: {
      select: { id: true; name: true; code: true };
    };
  };
}>;

function mapToCustomerDTO(raw: CustomerWithBranchPayload): CustomerDTO {
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    primaryBranchId: raw.primaryBranchId,
    primaryBranch: raw.primaryBranch
      ? {
          id: raw.primaryBranch.id,
          name: raw.primaryBranch.name,
          code: raw.primaryBranch.code,
        }
      : null,
    code: raw.code,
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    address: raw.address,
    city: raw.city,
    taxNumber: raw.taxNumber,
    notes: raw.notes,
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

// ============================================================================
// CUSTOMER BUSINESS SERVICE OPERATIONS
// ============================================================================

/**
 * Creates a new customer within the authenticated organization.
 */
export async function createCustomer(
  input: CreateCustomerInput,
  options?: CustomerServiceOptions
): Promise<CustomerDTO> {
  const { user, organizationId } = await resolveAuthorizedCustomerContext("mutate", options);

  const name = sanitizeRequiredString(input.name, 255, "Customer Name");
  const code = sanitizeString(input.code, 50, "Customer Code");
  const email = sanitizeString(input.email, 255, "Customer Email");
  const phone = sanitizeString(input.phone, 50, "Customer Phone");
  const address = sanitizeString(input.address, 500, "Customer Address");
  const city = sanitizeString(input.city, 100, "Customer City");
  const taxNumber = sanitizeString(input.taxNumber, 50, "Customer Tax Number");
  const notes = sanitizeString(input.notes, 2000, "Customer Notes");

  const validatedBranchId = await validatePrimaryBranch(input.primaryBranchId, organizationId, user.id);

  try {
    const customer = await db.customer.create({
      data: {
        organizationId,
        primaryBranchId: validatedBranchId,
        code,
        name,
        email,
        phone,
        address,
        city,
        taxNumber,
        notes,
        isActive: true,
      },
      include: {
        primaryBranch: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return mapToCustomerDTO(customer);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CustomerConflictError(
        `Customer code "${code}" already exists in this organization.`
      );
    }
    throw error;
  }
}

/**
 * Retrieves a customer by ID within the authenticated organization.
 */
export async function getCustomerById(
  customerId: string,
  options?: CustomerServiceOptions
): Promise<CustomerDTO> {
  if (!customerId?.trim()) {
    throw new CustomerValidationError("customerId is required.");
  }

  const { organizationId } = await resolveAuthorizedCustomerContext("read", options);

  const customer = await db.customer.findFirst({
    where: {
      id: customerId.trim(),
      organizationId,
    },
    include: {
      primaryBranch: {
        select: { id: true, name: true, code: true },
      },
    },
  });

  if (!customer) {
    throw new CustomerNotFoundError();
  }

  return mapToCustomerDTO(customer);
}

/**
 * Lists customers with deterministic pagination, filtering, and case-insensitive search.
 */
export async function listCustomers(
  input: ListCustomersInput = {},
  options?: CustomerServiceOptions
): Promise<PaginatedCustomersResult> {
  const { organizationId } = await resolveAuthorizedCustomerContext("read", options);

  const where: Prisma.CustomerWhereInput = {
    organizationId,
  };

  if (typeof input.isActive === "boolean") {
    where.isActive = input.isActive;
  }

  if (input.primaryBranchId?.trim()) {
    where.primaryBranchId = input.primaryBranchId.trim();
  }

  if (input.search?.trim()) {
    const q = input.search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
    ];
  }

  const page = input.page !== undefined && input.page !== null ? Math.floor(Number(input.page)) : 1;
  if (isNaN(page) || page < 1) {
    throw new CustomerValidationError("Page must be an integer greater than or equal to 1.");
  }

  const pageSize =
    input.pageSize !== undefined && input.pageSize !== null ? Math.floor(Number(input.pageSize)) : 25;
  if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new CustomerValidationError("PageSize must be an integer between 1 and 100.");
  }

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const orderBy: Prisma.CustomerOrderByWithRelationInput[] = [
    { name: "asc" },
    { id: "asc" },
  ];

  const [totalItems, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      include: {
        primaryBranch: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy,
      skip,
      take,
    }),
  ]);

  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    items: rows.map(mapToCustomerDTO),
    page,
    pageSize,
    total: totalItems,
    totalItems,
    totalPages,
  };
}

/**
 * Performs a fast, bounded autocomplete search for POS terminals.
 * Matches name, phone, email, or code.
 */
export async function searchCustomers(
  query: string,
  options?: CustomerServiceOptions
): Promise<CustomerSearchResultDTO[]> {
  const { organizationId } = await resolveAuthorizedCustomerContext("read", options);

  const trimmed = (query || "").trim();

  const where: Prisma.CustomerWhereInput = {
    organizationId,
    isActive: true,
    ...(trimmed.length > 0
      ? {
          OR: [
            { name: { contains: trimmed, mode: "insensitive" } },
            { phone: { contains: trimmed, mode: "insensitive" } },
            { email: { contains: trimmed, mode: "insensitive" } },
            { code: { contains: trimmed, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await db.customer.findMany({
    where,
    select: {
      id: true,
      name: true,
      code: true,
      phone: true,
      email: true,
    },
    orderBy: [
      { name: "asc" },
      { id: "asc" },
    ],
    take: 20,
  });

  return rows;
}

/**
 * Updates an existing customer's profile attributes.
 */
export async function updateCustomer(
  customerId: string,
  input: UpdateCustomerInput,
  options?: CustomerServiceOptions
): Promise<CustomerDTO> {
  if (!customerId?.trim()) {
    throw new CustomerValidationError("customerId is required.");
  }

  const { user, organizationId } = await resolveAuthorizedCustomerContext("mutate", options);

  const existing = await db.customer.findFirst({
    where: { id: customerId.trim(), organizationId },
  });

  if (!existing) {
    throw new CustomerNotFoundError();
  }

  const data: Prisma.CustomerUpdateInput = {};

  if (input.name !== undefined) {
    data.name = sanitizeRequiredString(input.name, 255, "Customer Name");
  }
  if (input.code !== undefined) {
    data.code = sanitizeString(input.code, 50, "Customer Code");
  }
  if (input.email !== undefined) {
    data.email = sanitizeString(input.email, 255, "Customer Email");
  }
  if (input.phone !== undefined) {
    data.phone = sanitizeString(input.phone, 50, "Customer Phone");
  }
  if (input.address !== undefined) {
    data.address = sanitizeString(input.address, 500, "Customer Address");
  }
  if (input.city !== undefined) {
    data.city = sanitizeString(input.city, 100, "Customer City");
  }
  if (input.taxNumber !== undefined) {
    data.taxNumber = sanitizeString(input.taxNumber, 50, "Customer Tax Number");
  }
  if (input.notes !== undefined) {
    data.notes = sanitizeString(input.notes, 2000, "Customer Notes");
  }
  if (input.primaryBranchId !== undefined) {
    const validatedBranchId = await validatePrimaryBranch(input.primaryBranchId, organizationId, user.id);
    if (validatedBranchId) {
      data.primaryBranch = { connect: { id: validatedBranchId } };
    } else {
      data.primaryBranch = { disconnect: true };
    }
  }

  try {
    const updated = await db.customer.update({
      where: { id: existing.id },
      data,
      include: {
        primaryBranch: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return mapToCustomerDTO(updated);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CustomerConflictError(
        `Customer code "${input.code}" already exists in this organization.`
      );
    }
    throw error;
  }
}

/**
 * Activates or deactivates a customer.
 * Restricted strictly to OWNER and MANAGER roles.
 */
export async function setCustomerActiveStatus(
  customerId: string,
  isActive: boolean,
  options?: CustomerServiceOptions
): Promise<CustomerDTO> {
  if (!customerId?.trim()) {
    throw new CustomerValidationError("customerId is required.");
  }
  if (typeof isActive !== "boolean") {
    throw new CustomerValidationError("isActive must be a boolean value.");
  }

  const { organizationId } = await resolveAuthorizedCustomerContext("status", options);

  const existing = await db.customer.findFirst({
    where: { id: customerId.trim(), organizationId },
  });

  if (!existing) {
    throw new CustomerNotFoundError();
  }

  const updated = await db.customer.update({
    where: { id: existing.id },
    data: { isActive },
    include: {
      primaryBranch: {
        select: { id: true, name: true, code: true },
      },
    },
  });

  return mapToCustomerDTO(updated);
}
