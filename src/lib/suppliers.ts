import "server-only";
import { Prisma } from "@prisma/client";
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

export const SUPPLIER_MUTATION_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
];

export const SUPPLIER_READ_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
];

// ============================================================================
// DOMAIN ERROR HIERARCHY
// ============================================================================

export class SupplierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierError";
  }
}

export class SupplierValidationError extends SupplierError {
  constructor(message: string) {
    super(message);
    this.name = "SupplierValidationError";
  }
}

export class SupplierNotFoundError extends SupplierError {
  constructor(message = "Supplier not found.") {
    super(message);
    this.name = "SupplierNotFoundError";
  }
}

export class SupplierDuplicateError extends SupplierError {
  constructor(message = "A supplier with this name already exists in this organization.") {
    super(message);
    this.name = "SupplierDuplicateError";
  }
}

// Re-export common tenant authorization errors for caller convenience
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

export interface AuthorizedSupplierContext {
  user: AppUserContext;
  organizationId: string;
  role: SystemRoleName;
}

/**
 * Resolves and verifies the authenticated user's organization context and role permissions.
 * Never trusts a client-supplied organizationId.
 */
export async function resolveAuthorizedSupplierContext(params?: {
  organizationId?: string;
  requireMutation?: boolean;
  actorUser?: AppUserContext | null;
}): Promise<AuthorizedSupplierContext> {
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
    if (!SUPPLIER_MUTATION_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to modify suppliers. Required one of: ${SUPPLIER_MUTATION_ROLES.join(
          ", "
        )}.`
      );
    }
  } else {
    if (!SUPPLIER_READ_ROLES.includes(roleName)) {
      throw new UnauthorizedRoleError(
        `Role "${roleName}" is not permitted to view suppliers. Required one of: ${SUPPLIER_READ_ROLES.join(
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
// VALIDATION HELPERS
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeString(value: unknown, maxLength: number, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new SupplierValidationError(`${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new SupplierValidationError(`${fieldName} cannot exceed ${maxLength} characters.`);
  }
  return trimmed;
}

function validateName(value: unknown): string {
  if (value === undefined || value === null || typeof value !== "string") {
    throw new SupplierValidationError("Supplier name is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new SupplierValidationError("Supplier name cannot be blank.");
  }
  if (trimmed.length > 150) {
    throw new SupplierValidationError("Supplier name cannot exceed 150 characters.");
  }
  return trimmed;
}

function validateEmail(value: unknown): string | null {
  const sanitized = sanitizeString(value, 150, "Email");
  if (!sanitized) {
    return null;
  }
  if (!EMAIL_REGEX.test(sanitized)) {
    throw new SupplierValidationError(`Invalid email format: "${sanitized}".`);
  }
  return sanitized;
}

// ============================================================================
// SERVICE INPUT INTERFACES
// ============================================================================

export interface CreateSupplierInput {
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

export interface UpdateSupplierInput {
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

export interface ListSuppliersOptions {
  search?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
  organizationId?: string;
  actorUser?: AppUserContext | null;
}

// ============================================================================
// SUPPLIER BUSINESS SERVICE
// ============================================================================

/**
 * Creates a new supplier within the authenticated user's organization context.
 * Role required: OWNER, MANAGER, INVENTORY_MANAGER.
 */
export async function createSupplier(
  input: CreateSupplierInput,
  options?: {
    organizationId?: string;
    actorUser?: AppUserContext | null;
  }
) {
  const { organizationId } = await resolveAuthorizedSupplierContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  const name = validateName(input.name);
  const contactPerson = sanitizeString(input.contactPerson, 100, "Contact person");
  const email = validateEmail(input.email);
  const phone = sanitizeString(input.phone, 50, "Phone");
  const address = sanitizeString(input.address, 255, "Address");
  const city = sanitizeString(input.city, 100, "City");
  const taxNumber = sanitizeString(input.taxNumber, 50, "Tax number");
  const paymentTerms = sanitizeString(input.paymentTerms, 100, "Payment terms");
  const notes = sanitizeString(input.notes, 1000, "Notes");
  const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;

  try {
    return await db.supplier.create({
      data: {
        organizationId,
        name,
        contactPerson,
        email,
        phone,
        address,
        city,
        taxNumber,
        paymentTerms,
        notes,
        isActive,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SupplierDuplicateError(
        `A supplier with the name "${name}" already exists in this organization.`
      );
    }
    throw error;
  }
}

/**
 * Retrieves a single supplier by ID within the authenticated user's organization context.
 * Role required: OWNER, MANAGER, INVENTORY_MANAGER, ACCOUNTANT.
 */
export async function getSupplierById(
  supplierId: string,
  options?: {
    organizationId?: string;
    actorUser?: AppUserContext | null;
  }
) {
  const { organizationId } = await resolveAuthorizedSupplierContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  if (!supplierId || typeof supplierId !== "string" || supplierId.trim().length === 0) {
    throw new SupplierValidationError("Supplier ID is required.");
  }

  const supplier = await db.supplier.findFirst({
    where: {
      id: supplierId.trim(),
      organizationId,
    },
  });

  if (!supplier) {
    throw new SupplierNotFoundError(`Supplier with ID "${supplierId}" not found.`);
  }

  return supplier;
}

/**
 * Lists suppliers for the authenticated user's organization with optional search and filters.
 * Role required: OWNER, MANAGER, INVENTORY_MANAGER, ACCOUNTANT.
 */
export async function listSuppliers(options?: ListSuppliersOptions) {
  const { organizationId } = await resolveAuthorizedSupplierContext({
    organizationId: options?.organizationId,
    requireMutation: false,
    actorUser: options?.actorUser,
  });

  const search = options?.search?.trim();
  const limit = Math.min(Math.max(Number(options?.limit) || 50, 1), 200);
  const offset = Math.max(Number(options?.offset) || 0, 0);

  const whereClause: Prisma.SupplierWhereInput = {
    organizationId,
    ...(typeof options?.isActive === "boolean" ? { isActive: options.isActive } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { contactPerson: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
            { taxNumber: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [suppliers, totalCount] = await Promise.all([
    db.supplier.findMany({
      where: whereClause,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
      skip: offset,
    }),
    db.supplier.count({ where: whereClause }),
  ]);

  return {
    suppliers,
    totalCount,
    limit,
    offset,
  };
}

/**
 * Updates an existing supplier within the authenticated user's organization.
 * Role required: OWNER, MANAGER, INVENTORY_MANAGER.
 */
export async function updateSupplier(
  supplierId: string,
  input: UpdateSupplierInput,
  options?: {
    organizationId?: string;
    actorUser?: AppUserContext | null;
  }
) {
  const { organizationId } = await resolveAuthorizedSupplierContext({
    organizationId: options?.organizationId,
    requireMutation: true,
    actorUser: options?.actorUser,
  });

  if (!supplierId || typeof supplierId !== "string" || supplierId.trim().length === 0) {
    throw new SupplierValidationError("Supplier ID is required.");
  }

  const existingSupplier = await db.supplier.findFirst({
    where: {
      id: supplierId.trim(),
      organizationId,
    },
  });

  if (!existingSupplier) {
    throw new SupplierNotFoundError(`Supplier with ID "${supplierId}" not found.`);
  }

  const dataToUpdate: Prisma.SupplierUpdateInput = {};

  if (input.name !== undefined) {
    dataToUpdate.name = validateName(input.name);
  }
  if (input.contactPerson !== undefined) {
    dataToUpdate.contactPerson = sanitizeString(input.contactPerson, 100, "Contact person");
  }
  if (input.email !== undefined) {
    dataToUpdate.email = validateEmail(input.email);
  }
  if (input.phone !== undefined) {
    dataToUpdate.phone = sanitizeString(input.phone, 50, "Phone");
  }
  if (input.address !== undefined) {
    dataToUpdate.address = sanitizeString(input.address, 255, "Address");
  }
  if (input.city !== undefined) {
    dataToUpdate.city = sanitizeString(input.city, 100, "City");
  }
  if (input.taxNumber !== undefined) {
    dataToUpdate.taxNumber = sanitizeString(input.taxNumber, 50, "Tax number");
  }
  if (input.paymentTerms !== undefined) {
    dataToUpdate.paymentTerms = sanitizeString(input.paymentTerms, 100, "Payment terms");
  }
  if (input.notes !== undefined) {
    dataToUpdate.notes = sanitizeString(input.notes, 1000, "Notes");
  }
  if (input.isActive !== undefined) {
    dataToUpdate.isActive = Boolean(input.isActive);
  }

  try {
    return await db.supplier.update({
      where: { id: existingSupplier.id },
      data: dataToUpdate,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const attemptedName = typeof dataToUpdate.name === "string" ? dataToUpdate.name : input.name;
      throw new SupplierDuplicateError(
        `A supplier with the name "${attemptedName}" already exists in this organization.`
      );
    }
    throw error;
  }
}
