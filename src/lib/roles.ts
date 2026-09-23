export const SYSTEM_ROLES = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  INVENTORY_MANAGER: "INVENTORY_MANAGER",
  ACCOUNTANT: "ACCOUNTANT",
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export interface SystemRoleDefinition {
  name: SystemRoleName;
  description: string;
}

export const SYSTEM_ROLE_DEFINITIONS: readonly SystemRoleDefinition[] = [
  {
    name: SYSTEM_ROLES.OWNER,
    description: "Full administrative and ownership access across the organization and all its branches.",
  },
  {
    name: SYSTEM_ROLES.MANAGER,
    description: "Operational management access across assigned branches.",
  },
  {
    name: SYSTEM_ROLES.CASHIER,
    description: "Point of sale register and transaction processing access for assigned branches.",
  },
  {
    name: SYSTEM_ROLES.INVENTORY_MANAGER,
    description: "Stock management, purchasing, and inventory control access for assigned branches.",
  },
  {
    name: SYSTEM_ROLES.ACCOUNTANT,
    description: "Financial, taxation, and accounting report access across the organization.",
  },
];
