import { requireAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-provider";
import { OnboardingForm } from "./onboarding-form";

export const metadata = {
  title: "Business Setup & Onboarding — POS SaaS",
  description: "Configure your organization, primary branch, and business defaults.",
};

export default async function OnboardingPage() {
  const user = await requireAuth();

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 transition-colors relative">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 mb-3">
              Initial Business Setup
            </span>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Register Your Business
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Setting up organization ownership for{" "}
              <span className="text-slate-900 dark:text-slate-200 font-medium">{user.name}</span> ({user.email}).
              You will become the primary Owner with full administrative control.
            </p>
          </div>

          <div className="shrink-0 pt-1">
            <ThemeToggle />
          </div>
        </div>

        <OnboardingForm />
      </div>
    </main>
  );
}
