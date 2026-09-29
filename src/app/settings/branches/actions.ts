"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getCurrentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SYSTEM_ROLES } from "@/lib/roles";
import {
  type BranchListItemDTO,
  type CreateBranchInput,
  type UpdateBranchInput,
  type BranchActionResult,
} from "./types";

/**
 * Resolves the authenticated user's organization context strictly enforcing
 * the OWNER role and multi-tenant isolation.
 *
 * Never silently defaults to the first organization if the user belongs to multiple organizations.
 */
async function resolveOwnerBranchContext(requestedOrgId?: string): Promise<{
  userId: string;
  organizationId: string;
  organizationName: string;
}> {
  const user = await getCurrentAppUser();
  if (!user || !user.isActive) {
    throw new Error("AUTH_REQUIRED");
  }

  // Filter verified active memberships with active organizations
  const activeMemberships = user.memberships.filter(
    (m) => m.isActive && m.organization && m.organization.isActive
  );

  if (activeMemberships.length === 0) {
    throw new Error("NO_ACTIVE_MEMBERSHIP");
  }

  let selectedMembership = activeMemberships[0];

  if (requestedOrgId?.trim()) {
    const match = activeMemberships.find((m) => m.organizationId === requestedOrgId.trim());
    if (!match) {
      throw new Error("MEMBERSHIP_NOT_FOUND");
    }
    selectedMembership = match;
  } else {
    // If user belongs to multiple active organizations and none is specified, do NOT guess
    if (activeMemberships.length > 1) {
      throw new Error("MULTIPLE_ORGS_SPECIFY_REQUIRED");
    }
    selectedMembership = activeMemberships[0];
  }

  // Strictly enforce OWNER role for the selected organization
  if (selectedMembership.role.name !== SYSTEM_ROLES.OWNER) {
    throw new Error("OWNER_ROLE_REQUIRED");
  }

  return {
    userId: user.id,
    organizationId: selectedMembership.organizationId,
    organizationName: selectedMembership.organization.name,
  };
}

/**
 * Lists all branches belonging to the verified active organization.
 */
export async function listBranchesAction(
  requestedOrgId?: string
): Promise<BranchActionResult<BranchListItemDTO[]>> {
  try {
    const { organizationId } = await resolveOwnerBranchContext(requestedOrgId);

    const branches = await db.branch.findMany({
      where: { organizationId },
      include: {
        settings: true,
        _count: {
          select: {
            sales: true,
            inventoryStocks: true,
            memberships: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    const serialized: BranchListItemDTO[] = branches.map((b) => ({
      id: b.id,
      organizationId: b.organizationId,
      name: b.name,
      code: b.code,
      address: b.address,
      city: b.city,
      phone: b.phone,
      isActive: b.isActive,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      settings: b.settings
        ? {
            id: b.settings.id,
            invoiceNumberPrefix: b.settings.invoiceNumberPrefix,
            receiptNumberPrefix: b.settings.receiptNumberPrefix,
            defaultWarehouseName: b.settings.defaultWarehouseName,
          }
        : null,
      _count: b._count,
    }));

    return {
      success: true,
      data: serialized,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to view branches." };
      }
      if (error.message === "NO_ACTIVE_MEMBERSHIP") {
        return { success: false, error: "No active business organization found." };
      }
      if (error.message === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        return {
          success: false,
          error: "Multiple organizations found. Please select an organization to manage its branches.",
        };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return {
          success: false,
          error: "Permission denied: Only the organization owner can manage branches.",
        };
      }
    }

    return {
      success: false,
      error: "An unexpected error occurred while loading branches.",
    };
  }
}

/**
 * Creates a new branch with associated BranchSettings atomically.
 */
export async function createBranchAction(
  input: CreateBranchInput,
  requestedOrgId?: string
): Promise<BranchActionResult<BranchListItemDTO>> {
  try {
    const { organizationId } = await resolveOwnerBranchContext(requestedOrgId);

    const fieldErrors: Record<string, string> = {};

    // 1. Validate Branch Name
    const name = input.name?.trim();
    if (!name || name.length < 2) {
      fieldErrors.name = "Branch name must be at least 2 characters.";
    } else if (name.length > 100) {
      fieldErrors.name = "Branch name cannot exceed 100 characters.";
    }

    // 2. Validate Branch Code
    const rawCode = input.code?.trim() || "";
    if (!rawCode) {
      fieldErrors.code = "Branch code is required.";
    } else if (!/^[A-Za-z0-9_-]+$/.test(rawCode)) {
      fieldErrors.code = "Branch code can only contain letters, numbers, hyphens, and underscores.";
    } else if (rawCode.length > 20) {
      fieldErrors.code = "Branch code cannot exceed 20 characters.";
    }
    const code = rawCode.toUpperCase();

    // 3. Validate Optional Fields
    const address = input.address?.trim() || null;
    if (address && address.length > 255) {
      fieldErrors.address = "Address cannot exceed 255 characters.";
    }

    const city = input.city?.trim() || null;
    if (city && city.length > 100) {
      fieldErrors.city = "City cannot exceed 100 characters.";
    }

    const phone = input.phone?.trim() || null;
    if (phone && phone.length > 30) {
      fieldErrors.phone = "Phone number cannot exceed 30 characters.";
    }

    const invoiceNumberPrefix = input.invoiceNumberPrefix?.trim() || null;
    if (invoiceNumberPrefix && invoiceNumberPrefix.length > 15) {
      fieldErrors.invoiceNumberPrefix = "Invoice prefix cannot exceed 15 characters.";
    }

    const receiptNumberPrefix = input.receiptNumberPrefix?.trim() || null;
    if (receiptNumberPrefix && receiptNumberPrefix.length > 15) {
      fieldErrors.receiptNumberPrefix = "Receipt prefix cannot exceed 15 characters.";
    }

    const defaultWarehouseName = input.defaultWarehouseName?.trim() || `${name || "Main"} Store`;
    if (defaultWarehouseName && defaultWarehouseName.length > 100) {
      fieldErrors.defaultWarehouseName = "Warehouse name cannot exceed 100 characters.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        error: "Please correct the highlighted validation errors.",
        fieldErrors,
      };
    }

    // 4. Pre-check code uniqueness within organization
    const existing = await db.branch.findUnique({
      where: {
        organizationId_code: {
          organizationId,
          code,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        error: `A branch with code "${code}" already exists in your organization.`,
        fieldErrors: {
          code: `A branch with code "${code}" already exists.`,
        },
      };
    }

    // 5. Atomic transaction to create Branch and BranchSettings
    const newBranch = await db.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          organizationId,
          name: name!,
          code,
          address,
          city,
          phone,
          isActive: true,
        },
      });

      const settings = await tx.branchSettings.create({
        data: {
          branchId: branch.id,
          invoiceNumberPrefix,
          receiptNumberPrefix,
          defaultWarehouseName,
        },
      });

      return { ...branch, settings, _count: { sales: 0, inventoryStocks: 0, memberships: 0 } };
    });

    revalidatePath("/settings/branches");
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/pos");

    const serialized: BranchListItemDTO = {
      id: newBranch.id,
      organizationId: newBranch.organizationId,
      name: newBranch.name,
      code: newBranch.code,
      address: newBranch.address,
      city: newBranch.city,
      phone: newBranch.phone,
      isActive: newBranch.isActive,
      createdAt: newBranch.createdAt.toISOString(),
      updatedAt: newBranch.updatedAt.toISOString(),
      settings: {
        id: newBranch.settings.id,
        invoiceNumberPrefix: newBranch.settings.invoiceNumberPrefix,
        receiptNumberPrefix: newBranch.settings.receiptNumberPrefix,
        defaultWarehouseName: newBranch.settings.defaultWarehouseName,
      },
      _count: newBranch._count,
    };

    return {
      success: true,
      data: serialized,
      message: `Branch "${newBranch.name}" created successfully.`,
    };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        error: "A branch with this code already exists in your organization.",
        fieldErrors: {
          code: "This branch code is already in use.",
        },
      };
    }

    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to create a branch." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can create branches." };
      }
      if (error.message === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        return { success: false, error: "Multiple organizations found. Please specify an organization." };
      }
    }

    return {
      success: false,
      error: "An unexpected error occurred while creating the branch.",
    };
  }
}

/**
 * Updates an existing branch and its associated BranchSettings atomically.
 */
export async function updateBranchAction(
  input: UpdateBranchInput,
  requestedOrgId?: string
): Promise<BranchActionResult<BranchListItemDTO>> {
  try {
    const { organizationId } = await resolveOwnerBranchContext(requestedOrgId);

    const branchId = input.branchId?.trim();
    if (!branchId) {
      return { success: false, error: "Branch ID is required." };
    }

    // Verify branch belongs to caller's verified organization
    const existingBranch = await db.branch.findUnique({
      where: { id: branchId },
      include: { settings: true },
    });

    if (!existingBranch || existingBranch.organizationId !== organizationId) {
      return { success: false, error: "Branch not found." };
    }

    const fieldErrors: Record<string, string> = {};

    // 1. Validate Branch Name
    const name = input.name?.trim();
    if (!name || name.length < 2) {
      fieldErrors.name = "Branch name must be at least 2 characters.";
    } else if (name.length > 100) {
      fieldErrors.name = "Branch name cannot exceed 100 characters.";
    }

    // 2. Validate Branch Code
    const rawCode = input.code?.trim() || "";
    if (!rawCode) {
      fieldErrors.code = "Branch code is required.";
    } else if (!/^[A-Za-z0-9_-]+$/.test(rawCode)) {
      fieldErrors.code = "Branch code can only contain letters, numbers, hyphens, and underscores.";
    } else if (rawCode.length > 20) {
      fieldErrors.code = "Branch code cannot exceed 20 characters.";
    }
    const code = rawCode.toUpperCase();

    // 3. Validate Optional Fields
    const address = input.address?.trim() || null;
    if (address && address.length > 255) {
      fieldErrors.address = "Address cannot exceed 255 characters.";
    }

    const city = input.city?.trim() || null;
    if (city && city.length > 100) {
      fieldErrors.city = "City cannot exceed 100 characters.";
    }

    const phone = input.phone?.trim() || null;
    if (phone && phone.length > 30) {
      fieldErrors.phone = "Phone number cannot exceed 30 characters.";
    }

    const invoiceNumberPrefix = input.invoiceNumberPrefix?.trim() || null;
    if (invoiceNumberPrefix && invoiceNumberPrefix.length > 15) {
      fieldErrors.invoiceNumberPrefix = "Invoice prefix cannot exceed 15 characters.";
    }

    const receiptNumberPrefix = input.receiptNumberPrefix?.trim() || null;
    if (receiptNumberPrefix && receiptNumberPrefix.length > 15) {
      fieldErrors.receiptNumberPrefix = "Receipt prefix cannot exceed 15 characters.";
    }

    const defaultWarehouseName = input.defaultWarehouseName?.trim() || null;
    if (defaultWarehouseName && defaultWarehouseName.length > 100) {
      fieldErrors.defaultWarehouseName = "Warehouse name cannot exceed 100 characters.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        error: "Please correct the highlighted validation errors.",
        fieldErrors,
      };
    }

    // 4. Code uniqueness check if code is being changed
    if (code !== existingBranch.code) {
      const codeConflict = await db.branch.findUnique({
        where: {
          organizationId_code: {
            organizationId,
            code,
          },
        },
        select: { id: true },
      });

      if (codeConflict && codeConflict.id !== branchId) {
        return {
          success: false,
          error: `Another branch with code "${code}" already exists in your organization.`,
          fieldErrors: {
            code: `Code "${code}" is already in use by another branch.`,
          },
        };
      }
    }

    // 5. Atomic update of Branch and upsert of BranchSettings
    const updated = await db.$transaction(async (tx) => {
      const branch = await tx.branch.update({
        where: { id: branchId },
        data: {
          name: name!,
          code,
          address,
          city,
          phone,
        },
      });

      const settings = await tx.branchSettings.upsert({
        where: { branchId },
        create: {
          branchId,
          invoiceNumberPrefix,
          receiptNumberPrefix,
          defaultWarehouseName: defaultWarehouseName || `${name} Store`,
        },
        update: {
          invoiceNumberPrefix,
          receiptNumberPrefix,
          defaultWarehouseName,
        },
      });

      const counts = await tx.branch.findUnique({
        where: { id: branchId },
        select: {
          _count: {
            select: {
              sales: true,
              inventoryStocks: true,
              memberships: true,
            },
          },
        },
      });

      return { ...branch, settings, _count: counts?._count };
    });

    revalidatePath("/settings/branches");
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/pos");

    const serialized: BranchListItemDTO = {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      code: updated.code,
      address: updated.address,
      city: updated.city,
      phone: updated.phone,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      settings: {
        id: updated.settings.id,
        invoiceNumberPrefix: updated.settings.invoiceNumberPrefix,
        receiptNumberPrefix: updated.settings.receiptNumberPrefix,
        defaultWarehouseName: updated.settings.defaultWarehouseName,
      },
      _count: updated._count,
    };

    return {
      success: true,
      data: serialized,
      message: `Branch "${updated.name}" updated successfully.`,
    };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        error: "A branch with this code already exists in your organization.",
        fieldErrors: {
          code: "This branch code is already in use.",
        },
      };
    }

    if (error instanceof Error) {
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to update a branch." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can edit branches." };
      }
    }

    return {
      success: false,
      error: "An unexpected error occurred while saving branch changes.",
    };
  }
}

/**
 * Toggles a branch's active status (activate or deactivate).
 * Concurrency-safe: uses PostgreSQL advisory transaction lock to protect
 * against concurrent deactivations leaving zero active branches.
 */
export async function toggleBranchStatusAction(
  branchId: string,
  requestedOrgId?: string
): Promise<BranchActionResult<{ id: string; isActive: boolean }>> {
  try {
    const { organizationId } = await resolveOwnerBranchContext(requestedOrgId);

    if (!branchId?.trim()) {
      return { success: false, error: "Branch ID is required." };
    }

    // Atomic transaction with advisory transaction lock
    const result = await db.$transaction(async (tx) => {
      // 1. Concurrency guard: Serialize status changes per organization
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('branch_status_lock'), hashtext(${organizationId}))`;

      // 2. Find branch within tenant
      const branch = await tx.branch.findUnique({
        where: { id: branchId.trim() },
        select: { id: true, organizationId: true, name: true, isActive: true },
      });

      if (!branch || branch.organizationId !== organizationId) {
        throw new Error("BRANCH_NOT_FOUND");
      }

      const nextStatus = !branch.isActive;

      // 3. If deactivating, ensure at least one OTHER branch remains active
      if (branch.isActive && !nextStatus) {
        const activeCount = await tx.branch.count({
          where: {
            organizationId,
            isActive: true,
          },
        });

        if (activeCount <= 1) {
          throw new Error("CANNOT_DEACTIVATE_LAST_BRANCH");
        }
      }

      // 4. Update status
      const updated = await tx.branch.update({
        where: { id: branch.id },
        data: { isActive: nextStatus },
        select: { id: true, name: true, isActive: true },
      });

      return updated;
    });

    revalidatePath("/settings/branches");
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/pos");

    const statusText = result.isActive ? "activated" : "deactivated";

    return {
      success: true,
      data: { id: result.id, isActive: result.isActive },
      message: `Branch "${result.name}" has been ${statusText}.`,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "BRANCH_NOT_FOUND") {
        return { success: false, error: "Branch not found." };
      }
      if (error.message === "CANNOT_DEACTIVATE_LAST_BRANCH") {
        return {
          success: false,
          error: "Cannot deactivate the only active branch. Your business must have at least one active branch to operate.",
        };
      }
      if (error.message === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to change branch status." };
      }
      if (error.message === "OWNER_ROLE_REQUIRED") {
        return { success: false, error: "Permission denied: Only the organization owner can change branch status." };
      }
    }

    return {
      success: false,
      error: "An unexpected error occurred while updating branch status.",
    };
  }
}
