import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getInventorySummary,
  getBranchInventory,
  INVENTORY_READ_ROLES,
  INVENTORY_MUTATION_ROLES,
} from "@/lib/inventory";
import { resolveTenantContext, TenantContextError } from "@/lib/tenant-context";
import { SYSTEM_ROLES } from "@/lib/roles";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import { InventoryView } from "./inventory-view";
import {
  computeStockStatus,
  type AuthorizedBranchDTO,
  type InventorySummaryDTO,
  type InventoryStockListResult,
  type SerializedInventoryStock,
} from "./types";

export const metadata = {
  title: "Inventory Management — Point of Sale",
  description: "Monitor branch inventory balances, reorder points, and stock levels in real time.",
};

interface InventoryPageProps {
  searchParams: Promise<{
    org?: string;
    branch?: string;
  }>;
}

export default async function InventoryPage(props: InventoryPageProps) {
  const user = await requireAuth();
  const searchParams = await props.searchParams;

  let tenantContext;
  try {
    tenantContext = await resolveTenantContext(searchParams.org, {
      requireRoles: INVENTORY_READ_ROLES,
      actorUser: user,
    });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        const activeMemberships = user.memberships.filter(
          (m) => m.isActive && m.organization && m.organization.isActive
        );
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-6 shadow-xl text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-xl border border-indigo-500/20">
                🏢
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Select Business</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  You belong to multiple businesses. Please choose which inventory you wish to view.
                </p>
              </div>
              <div className="space-y-2 text-left">
                {activeMemberships.map((m) => (
                  <Link
                    key={m.id}
                    href={`/inventory?org=${m.organizationId}`}
                    className="block p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors"
                  >
                    <div className="font-semibold text-sm text-slate-900 dark:text-white">{m.organization?.name}</div>
                    <div className="text-xs text-slate-500 capitalize">{m.role.name.toLowerCase()}</div>
                  </Link>
                ))}
              </div>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  &larr; Return to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "NO_ACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mx-auto text-xl border border-slate-200 dark:border-slate-700">
                🏢
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">No Business Found</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You must belong to an active organization to access the Inventory management module.
              </p>
              <div className="pt-2">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-950/40"
                >
                  Create Your Business &rarr;
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "MEMBERSHIP_NOT_FOUND" || err.code === "INACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                ⚠️
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Organization Inaccessible</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                The requested organization could not be found or your membership in it is inactive.
              </p>
              <div className="pt-2">
                <Link
                  href="/inventory"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  &larr; Return to Inventory
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "UNAUTHORIZED_ROLE") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Access Denied</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your role does not have permission to view branch inventory.
              </p>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  &larr; Return to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }
    }

    throw err;
  }

  const organization = tenantContext.organization;
  const userRole = tenantContext.role;
  const activeMembership = user.memberships.find((m) => m.id === tenantContext.membershipId)!;
  const canMutate = INVENTORY_MUTATION_ROLES.includes(userRole);

  // Resolve accessible active branches
  const isOwner = userRole === SYSTEM_ROLES.OWNER;
  let authorizedBranches: AuthorizedBranchDTO[] = [];

  if (isOwner) {
    const rawBranches = await db.branch.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
    authorizedBranches = rawBranches.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      role: userRole,
    }));
  } else {
    authorizedBranches = activeMembership.branchMemberships
      .filter((bm) => bm.branch.isActive)
      .map((bm) => ({
        id: bm.branch.id,
        name: bm.branch.name,
        code: bm.branch.code,
        role: userRole,
      }));
  }

  if (authorizedBranches.length === 0) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto text-xl border border-amber-500/20">
            🏪
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">No Accessible Active Branches</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You do not have access to any active branch in {organization.name}. An active branch is
            required to monitor inventory.
          </p>
          <div className="pt-2">
            <Link
              href={`/dashboard?org=${organization.id}`}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
            >
              &larr; Return to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Validate or fallback branch selection
  const requestedBranch = searchParams.branch;
  const isRequestedBranchValid =
    requestedBranch && authorizedBranches.some((b) => b.id === requestedBranch);
  const branchId = isRequestedBranchValid ? requestedBranch! : authorizedBranches[0].id;

  // Server-side initial data fetch
  const [summaryData, inventoryData] = await Promise.all([
    getInventorySummary({
      organizationId: organization.id,
      branchId,
      actorUser: user,
    }),
    getBranchInventory({
      organizationId: organization.id,
      branchId,
      take: 50,
      skip: 0,
      actorUser: user,
    }),
  ]);

  const initialSummary: InventorySummaryDTO = {
    totalTracked: summaryData.totalTracked,
    inStockCount: summaryData.inStockCount,
    lowStockCount: summaryData.lowStockCount,
    outOfStockCount: summaryData.outOfStockCount,
  };

  const initialItems: SerializedInventoryStock[] = inventoryData.items.map((item) => ({
    id: item.id,
    organizationId: item.organizationId,
    branchId: item.branchId,
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity.toString(),
    reorderLevel: item.reorderLevel ? item.reorderLevel.toString() : null,
    reorderQuantity: item.reorderQuantity ? item.reorderQuantity.toString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    product: {
      id: item.product.id,
      name: item.product.name,
      sku: item.product.sku,
      barcode: item.product.barcode,
      unit: item.product.unit,
      costPrice: item.product.costPrice ? item.product.costPrice.toString() : null,
      sellingPrice: item.product.sellingPrice ? item.product.sellingPrice.toString() : null,
      isActive: item.product.isActive,
    },
    variant: item.variant
      ? {
          id: item.variant.id,
          name: item.variant.name,
          sku: item.variant.sku,
          barcode: item.variant.barcode,
          costPrice: item.variant.costPrice ? item.variant.costPrice.toString() : null,
          sellingPrice: item.variant.sellingPrice ? item.variant.sellingPrice.toString() : null,
          isActive: item.variant.isActive,
        }
      : null,
    status: computeStockStatus(
      item.quantity.toString(),
      item.reorderLevel ? item.reorderLevel.toString() : null
    ),
  }));

  const initialInventory: InventoryStockListResult = {
    items: initialItems,
    totalCount: inventoryData.totalCount,
    page: 1,
    pageSize: 50,
    totalPages: Math.ceil(inventoryData.totalCount / 50) || 1,
  };

  return (
    <AppShell
      organizationId={organization.id}
      organizationName={organization.name}
      userRole={userRole}
      userName={user.name}
      userEmail={user.email}
      breadcrumbs={[
        { label: "Catalog & Stock" },
        { label: "Stock Inventory" },
      ]}
    >
      <InventoryView
        initialBranches={authorizedBranches}
        initialSelectedBranchId={branchId}
        initialSummary={initialSummary}
        initialInventory={initialInventory}
        orgId={organization.id}
        userRole={userRole}
        canMutate={canMutate}
      />
    </AppShell>
  );
}
