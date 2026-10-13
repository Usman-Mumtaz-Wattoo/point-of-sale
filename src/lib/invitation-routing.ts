/**
 * Returns the primary authorized destination page for a staff role.
 */
export function getDefaultRouteForRole(roleName: string, orgId?: string): string {
  const query = orgId ? `?org=${encodeURIComponent(orgId)}` : "";
  switch (roleName) {
    case "CASHIER":
      return `/pos${query}`;
    case "INVENTORY_MANAGER":
      return `/inventory${query}`;
    case "ACCOUNTANT":
    case "MANAGER":
    case "OWNER":
    default:
      return `/dashboard${query}`;
  }
}
