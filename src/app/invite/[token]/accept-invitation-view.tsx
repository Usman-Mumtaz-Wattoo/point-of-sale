"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Clock,
  MapPin,
  Mail,
  Loader2,
  UserCheck,
} from "lucide-react";
import { type PublicInvitationDetailDTO } from "@/app/settings/staff/types";
import { acceptInvitationAction } from "@/app/settings/staff/actions";
import { ThemeToggle } from "@/components/theme-provider";

interface AcceptInvitationViewProps {
  token: string;
  invitation: PublicInvitationDetailDTO | null;
  error?: string | null;
  currentUser: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export function AcceptInvitationView({
  token,
  invitation,
  error: initialError,
  currentUser,
}: AcceptInvitationViewProps) {
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAccepted, setIsAccepted] = useState(false);
  const [acceptedOrgId, setAcceptedOrgId] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  // If initial server verification failed (token invalid, expired, already accepted)
  if (initialError || !invitation) {
    const isAlreadyAccepted = initialError?.toLowerCase().includes("accepted");

    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 transition-colors relative">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 shadow-xl space-y-6 text-center">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
            isAlreadyAccepted
              ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400"
          }`}>
            {isAlreadyAccepted ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {isAlreadyAccepted ? "Invitation Already Accepted" : "Invitation Invalid"}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {isAlreadyAccepted
                ? "This invitation has already been accepted and activated. You can proceed directly to your organization."
                : (initialError || "This invitation link is invalid or has expired.")}
            </p>
          </div>
          <div className="pt-2">
            <Link
              href={currentUser ? "/dashboard" : "/login"}
              className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-xs"
            >
              {currentUser ? "Continue to Application" : "Sign In to Your Account"}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // If successfully accepted in this session
  if (isAccepted) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 transition-colors relative">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md bg-white dark:bg-[#0f172a] border border-emerald-300 dark:border-emerald-500/30 rounded-2xl p-8 shadow-xl space-y-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome Aboard!</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              You have successfully joined{" "}
              <strong className="text-slate-900 dark:text-white">{invitation.organizationName}</strong> as a{" "}
              <strong className="text-indigo-600 dark:text-indigo-400">{invitation.roleName}</strong>.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href={redirectUrl || (acceptedOrgId ? `/dashboard?org=${acceptedOrgId}` : "/dashboard")}
              className="inline-flex items-center justify-center w-full gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-xs"
            >
              <span>Continue to Application</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Format expiration
  const expiresDate = new Date(invitation.expiresAt);
  const formattedExpiry = expiresDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const isEmailMatch =
    currentUser && currentUser.email.toLowerCase() === invitation.email.toLowerCase();

  const handleAccept = () => {
    setActionError(null);
    startTransition(async () => {
      const res = await acceptInvitationAction(token);
      if (res.success) {
        setIsAccepted(true);
        setAcceptedOrgId(res.data.organizationId);
        if (res.data.redirectUrl) {
          setRedirectUrl(res.data.redirectUrl);
        }
      } else {
        setActionError(res.error || "Failed to accept invitation. Please try again.");
      }
    });
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 transition-colors relative">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Staff Invitation</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You have been invited to join an organization on Point of Sale.
          </p>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Invitation Summary Card */}
        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
            <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Organization
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{invitation.organizationName}</span>
          </div>

          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
            <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Assigned Role
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              {invitation.roleName}
            </span>
          </div>

          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
            <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Invited Email
            </span>
            <span className="text-xs font-mono text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              {invitation.email}
            </span>
          </div>

          <div className="flex items-start justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
            <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold pt-0.5">
              Branch Access
            </span>
            <div className="text-right">
              {invitation.branches.length === 0 ? (
                <span className="text-xs text-slate-500 dark:text-slate-400 italic">All Authorized Branches</span>
              ) : (
                <div className="flex flex-wrap justify-end gap-1.5 max-w-[240px]">
                  {invitation.branches.map((b) => (
                    <span
                      key={b.branchCode}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    >
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {b.branchName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Expires:
            </span>
            <span>{formattedExpiry}</span>
          </div>
        </div>

        {/* State 1: Unauthenticated */}
        {!currentUser && (
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs leading-relaxed font-medium">
              To accept this invitation and join{" "}
              <strong className="text-amber-900 dark:text-white font-semibold">{invitation.organizationName}</strong>, please sign
              in or register with your invited email:{" "}
              <strong className="underline">{invitation.email}</strong>.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link
                href={`/login?redirectTo=/invite/${token}`}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-xs text-center"
              >
                Sign In
              </Link>
              <Link
                href={`/signup?email=${encodeURIComponent(invitation.email)}&redirectTo=/invite/${token}`}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors text-center border border-slate-200 dark:border-slate-700"
              >
                Create Account
              </Link>
            </div>
          </div>
        )}

        {/* State 2: Authenticated with Email Mismatch */}
        {currentUser && !isEmailMatch && (
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-rose-900 dark:text-rose-100">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                Email Mismatch Detected
              </div>
              <p>
                You are currently signed in as{" "}
                <strong className="text-slate-900 dark:text-white">{currentUser.email}</strong>.
              </p>
              <p>
                However, this invitation was specifically issued to{" "}
                <strong className="text-slate-900 dark:text-white">{invitation.email}</strong>. For security reasons,
                invitations can only be accepted by their designated recipient.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors border border-slate-200 dark:border-slate-700"
                >
                  Sign Out to Switch Accounts
                </button>
              </form>
              <Link
                href="/dashboard"
                className="text-center text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors py-1"
              >
                &larr; Return to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* State 3: Authenticated with Matching Email */}
        {currentUser && isEmailMatch && (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2.5 font-medium">
              <UserCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                Verified identity: Signed in as{" "}
                <strong className="text-slate-900 dark:text-white">{currentUser.email}</strong>
              </span>
            </div>

            <button
              type="button"
              onClick={handleAccept}
              disabled={isPending}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-xs cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Joining Organization...</span>
                </>
              ) : (
                <>
                  <span>Accept Invitation & Join Team</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
