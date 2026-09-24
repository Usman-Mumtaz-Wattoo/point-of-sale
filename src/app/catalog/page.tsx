import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getCategories, getProducts, CATALOG_MUTATION_ROLES } from "@/lib/catalog";
import { type SystemRoleName } from "@/lib/roles";
import { CatalogView } from "./catalog-view";

export const metadata = {
  title: "Product Catalog — POS SaaS",
  description: "Manage products, categories, and variants for your organization.",
};

interface CatalogPageProps {
  searchParams: Promise<{
    org?: string;
    search?: string;
    category?: string;
  }>;
}

export default async function CatalogPage(props: CatalogPageProps) {
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
            You need to create or belong to an organization before accessing the product catalog.
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

  // Determine authorized organization from searchParams or default to first active membership
  const requestedOrgId = searchParams.org;
  const activeMembership = requestedOrgId
    ? user.memberships.find((m) => m.organizationId === requestedOrgId && m.isActive) || user.memberships[0]
    : user.memberships[0];

  const organization = activeMembership.organization;
  const userRole = activeMembership.role.name as SystemRoleName;
  const canMutate = CATALOG_MUTATION_ROLES.includes(userRole);

  const [categories, products] = await Promise.all([
    getCategories({ organizationId: organization.id }),
    getProducts({
      organizationId: organization.id,
      search: searchParams.search,
      categoryId: searchParams.category,
    }),
  ]);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/dashboard"
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                &larr; Dashboard
              </Link>
              <span className="text-slate-600 text-xs">•</span>
              <span className="text-xs text-slate-400">Catalog Management</span>
            </div>
            <h1 className="text-2xl font-bold text-white">{organization.name} — Catalog</h1>
            <p className="text-xs text-slate-400">
              Manage organization-wide inventory definitions, SKU codes, and variant options.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Role: {userRole}
            </span>
          </div>
        </div>

        {/* Catalog View */}
        <CatalogView
          organizationId={organization.id}
          organizationName={organization.name}
          userRole={userRole}
          canMutate={canMutate}
          categories={categories}
          products={products}
          currentSearch={searchParams.search}
          currentCategory={searchParams.category}
        />
      </div>
    </main>
  );
}
