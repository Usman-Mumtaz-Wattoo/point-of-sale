import { requireAuth } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata = {
  title: "Business Setup & Onboarding — POS SaaS",
  description: "Configure your organization, primary branch, and business defaults.",
};

export default async function OnboardingPage() {
  const user = await requireAuth();

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
            Initial Tenant Setup
          </span>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Register Your Business
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Setting up organization ownership for{" "}
            <span className="text-slate-200 font-medium">{user.name}</span> ({user.email}).
            You will become the primary Owner with full administrative control.
          </p>
        </div>

        <OnboardingForm />
      </div>
    </main>
  );
}
