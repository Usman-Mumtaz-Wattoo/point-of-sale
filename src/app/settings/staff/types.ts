import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";

export const ASSIGNABLE_STAFF_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
] as const;

export interface StaffBranchDTO {
  branchId: string;
  branchName: string;
  branchCode: string;
  branchIsActive: boolean;
}

export interface StaffMemberDTO {
  id: string; // OrganizationMembership.id
  userId: string;
  name: string;
  email: string;
  role: {
    id: string;
    name: string;
    description: string | null;
  };
  isActive: boolean;
  isSelf: boolean;
  createdAt: string;
  updatedAt: string;
  branchMemberships: StaffBranchDTO[];
}

export interface InvitationDTO {
  id: string;
  email: string;
  role: {
    id: string;
    name: string;
  };
  status: "PENDING" | "ACCEPTED" | "CANCELLED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  invitedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  branches: Array<{
    branchId: string;
    branchName: string;
    branchCode: string;
  }>;
}

export interface CreateInvitationInput {
  email: string;
  roleName: string;
  branchIds?: string[];
}

export interface UpdateStaffRoleInput {
  membershipId: string;
  newRoleName: string;
}

export interface UpdateStaffBranchAccessInput {
  membershipId: string;
  branchIds: string[];
}

export interface ToggleStaffStatusInput {
  membershipId: string;
}

export type StaffActionResult<T> =
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

export interface PublicInvitationDetailDTO {
  id: string;
  email: string;
  organizationName: string;
  roleName: string;
  expiresAt: string;
  branches: Array<{
    branchName: string;
    branchCode: string;
  }>;
}
