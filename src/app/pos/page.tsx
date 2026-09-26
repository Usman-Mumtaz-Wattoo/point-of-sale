import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { SALE_MUTATION_ROLES } from "@/lib/sales";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import { db } from "@/lib/db";
import { PosView } from "./pos-view";

export const metadata = {
  title: "POS Terminal — Point of Sale",
  description: "Point of Sale terminal for instant checkout and customer selection.",
};

interface PosPageProps {
  searchParams: Promise<{
    org?: string;
  }>;
}

export default async function PosPage(props: PosPageProps) {
  const user = await requireAuth();
  const searchParams = await props.searchParams;

  if (user.memberships.length === 0) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-800">
            🏢
          </div>
          <h1 className="text-xl font-bold text-white">No Business Found</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You must belong to an active organization to access the POS terminal.
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

  // Resolve requested or default active membership
  const requestedOrgId = searchParams.org;
  const activeMembership = requestedOrgId
    ? user.memberships.find((m) => m.organizationId === requestedOrgId && m.isActive) ||
      user.memberships.find((m) => m.isActive) ||
      user.memberships[0]
    : user.memberships.find((m) => m.isActive) || user.memberships[0];

  const organization = activeMembership.organization;
  const userRole = activeMembership.role.name as SystemRoleName;

  // Enforce mutation role gate (OWNER, MANAGER, CASHIER)
  if (!SALE_MUTATION_ROLES.includes(userRole)) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            🚫
          </div>
          <h1 className="text-xl font-bold text-white">POS Terminal Access Denied</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Your role (<strong className="text-slate-200">{userRole}</strong>) does not have
            permission to operate the POS checkout terminal.
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

  // Resolve accessible active branches
  const isOwner = userRole === SYSTEM_ROLES.OWNER;
  const branches = isOwner
    ? await db.branch.findMany({
        where: { organizationId: organization.id, isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      })
    : activeMembership.branchMemberships
        .filter((bm) => bm.branch.isActive)
        .map((bm) => ({
          id: bm.branch.id,
          name: bm.branch.name,
          code: bm.branch.code,
        }));

  if (branches.length === 0) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-800">
            🏪
          </div>
          <h1 className="text-xl font-bold text-white">No Accessible Active Branches</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You do not have access to any active branch in {organization.name}. An active branch is
            required to operate POS terminal checkouts.
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

  // Fetch active products with active variants
  const products = await db.product.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      sellingPrice: true,
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const formattedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    sellingPrice: p.sellingPrice.toString(),
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      sellingPrice: v.sellingPrice !== null ? v.sellingPrice.toString() : null,
    })),
  }));

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/dashboard"
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                &larr; Dashboard
              </Link>
              <span className="text-slate-600 text-xs">•</span>
              <Link
                href={`/customers?org=${organization.id}`}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Customers
              </Link>
              <span className="text-slate-600 text-xs">•</span>
              <span className="text-xs text-slate-400">Terminal Checkout</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {organization.name} — POS Terminal
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Role: {userRole}
            </span>
            <Link
              href={`/customers?org=${organization.id}`}
              className="px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              Customer Directory &rarr;
            </Link>
          </div>
        </div>

        {/* POS Cashier Terminal View */}
        <PosView
          organizationId={organization.id}
          organizationName={organization.name}
          userRole={userRole}
          branches={branches}
          products={formattedProducts}
        />
      </div>
    </main>
  );
}
