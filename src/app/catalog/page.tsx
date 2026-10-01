import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  getCategories,
  getProducts,
  CATALOG_MUTATION_ROLES,
  CATALOG_READ_ROLES,
} from "@/lib/catalog";
import { resolveTenantContext, TenantContextError } from "@/lib/tenant-context";
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

  let tenantContext;
  try {
    tenantContext = await resolveTenantContext(searchParams.org, {
      requireRoles: CATALOG_READ_ROLES,
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
                  You belong to multiple businesses. Please choose which catalog you wish to view.
                </p>
              </div>
              <div className="space-y-2 text-left">
                {activeMemberships.map((m) => (
                  <Link
                    key={m.id}
                    href={`/catalog?org=${m.organizationId}`}
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
                You need to create or belong to an active organization before accessing the product catalog.
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
                  href="/catalog"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                >
                  &larr; Return to Catalog
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
              <h1 className="text-xl font-bold text-white">Catalog Access Denied</h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Your role does not have permission to view or manage the product catalog.
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
  const canMutate = CATALOG_MUTATION_ROLES.includes(userRole);

  const [categories, products] = await Promise.all([
    getCategories({ organizationId: organization.id, actorUser: user }),
    getProducts({
      organizationId: organization.id,
      search: searchParams.search,
      categoryId: searchParams.category,
      actorUser: user,
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
                href={`/dashboard?org=${organization.id}`}
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
