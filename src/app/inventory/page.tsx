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
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-6 shadow-xl text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/20">
                🏢
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-white">Select Business</h1>
                <p className="text-xs text-slate-400">
                  You belong to multiple businesses. Please choose which inventory you wish to view.
                </p>
              </div>
              <div className="space-y-2 text-left">
                {activeMemberships.map((m) => (
                  <Link
                    key={m.id}
                    href={`/inventory?org=${m.organizationId}`}
                    className="block p-3 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-slate-700 transition-colors"
                  >
                    <div className="font-medium text-sm text-slate-200">{m.organization?.name}</div>
                    <div className="text-xs text-slate-500 capitalize">{m.role.name.toLowerCase()}</div>
                  </Link>
                ))}
              </div>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
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
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
            <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
              <div className="w-12 h-12 rounded-full bg-slate-900 text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-800">
                🏢
              </div>
              <h1 className="text-xl font-bold text-white">No Business Found</h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                You must belong to an active organization to access the Inventory management module.
              </p>
              <div className="pt-2">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
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
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                ⚠️
              </div>
              <h1 className="text-xl font-bold text-white">Organization Inaccessible</h1>
              <p className="text-sm text-slate-400">
                The requested organization could not be found or your membership in it is inactive.
              </p>
              <div className="pt-2">
                <Link
                  href="/inventory"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
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
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
            <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-white">Access Denied</h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Your role does not have permission to view branch inventory.
              </p>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
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
    const dbBranches = await db.branch.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
    authorizedBranches = dbBranches;
  } else {
    authorizedBranches = activeMembership.branchMemberships
      .filter((bm) => bm.branch.isActive)
      .map((bm) => ({
        id: bm.branch.id,
        name: bm.branch.name,
        code: bm.branch.code,
      }));
  }

  if (authorizedBranches.length === 0) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto text-xl border border-amber-500/20">
            🏢
          </div>
          <h1 className="text-xl font-bold text-white">No Branch Access</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You do not have active branch assignments in{" "}
            <strong className="text-white">{organization.name}</strong>. Please contact an
            administrator to assign your account to an active branch.
          </p>
          <div className="pt-2">
            <Link
              href={`/dashboard?org=${organization.id}`}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              &larr; Return to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Determine initial branch
  const candidateBranchId = searchParams.branch;
  const initialBranch =
    (candidateBranchId && authorizedBranches.find((b) => b.id === candidateBranchId)) ||
    authorizedBranches[0];

  const branchId = initialBranch.id;

  // Load initial summary and inventory records in parallel on server
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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard?org=${organization.id}`}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <h1 className="text-base font-bold text-white tracking-wide">
              Inventory Management
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {organization.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/catalog?org=${organization.id}`}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            >
              Catalog &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <InventoryView
          initialBranches={authorizedBranches}
          initialSelectedBranchId={branchId}
          initialSummary={initialSummary}
          initialInventory={initialInventory}
          orgId={organization.id}
          userRole={userRole}
          canMutate={canMutate}
        />
      </div>
    </main>
  );
}
