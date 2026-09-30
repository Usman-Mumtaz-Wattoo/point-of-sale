"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  type OrganizationProfileDTO,
  type UpdateOrganizationProfileInput,
  SUPPORTED_CURRENCIES,
  COMMON_TIMEZONES,
} from "./types";
import { updateOrganizationProfileAction } from "./actions";

interface SettingsViewProps {
  initialData: OrganizationProfileDTO;
  organizationId: string;
  organizationName: string;
  userEmail: string;
  userName: string;
}

export function SettingsView({
  initialData,
  organizationId,
  organizationName,
  userEmail,
  userName,
}: SettingsViewProps) {
  const [profile, setProfile] = useState<OrganizationProfileDTO>(initialData);
  const [formData, setFormData] = useState<UpdateOrganizationProfileInput>({
    name: initialData.name,
    legalName: initialData.legalName || "",
    email: initialData.email || "",
    phone: initialData.phone || "",
    address: initialData.address || "",
    city: initialData.city || "",
    country: initialData.country || "",
    currency: initialData.currency,
    timezone: initialData.timezone,
    logoUrl: initialData.logoUrl || "",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [logoPreviewError, setLogoPreviewError] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === "logoUrl") {
      setLogoPreviewError(false);
    }
    // Clear inline error on edit
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleReset = () => {
    setFormData({
      name: profile.name,
      legalName: profile.legalName || "",
      email: profile.email || "",
      phone: profile.phone || "",
      address: profile.address || "",
      city: profile.city || "",
      country: profile.country || "",
      currency: profile.currency,
      timezone: profile.timezone,
      logoUrl: profile.logoUrl || "",
    });
    setFieldErrors({});
    setGlobalError(null);
    setSuccessMessage(null);
    setLogoPreviewError(false);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setGlobalError(null);
    setSuccessMessage(null);
    setFieldErrors({});

    startTransition(async () => {
      const res = await updateOrganizationProfileAction(formData, organizationId);
      if (!res.success) {
        setGlobalError(res.error);
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
      } else {
        setProfile(res.data);
        setSuccessMessage(res.message || "Organization settings saved successfully.");
      }
    });
  };

  const isFormDirty =
    formData.name !== profile.name ||
    formData.legalName !== (profile.legalName || "") ||
    formData.email !== (profile.email || "") ||
    formData.phone !== (profile.phone || "") ||
    formData.address !== (profile.address || "") ||
    formData.city !== (profile.city || "") ||
    formData.country !== (profile.country || "") ||
    formData.currency !== profile.currency ||
    formData.timezone !== profile.timezone ||
    formData.logoUrl !== (profile.logoUrl || "");

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Top Header / Navigation */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard?org=${organizationId}`}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              &larr; Back to Dashboard
            </Link>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {organizationName} — Settings
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-400">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              OWNER
            </span>
            <span>
              {userName} ({userEmail})
            </span>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="max-w-6xl mx-auto mt-3 flex items-center gap-2 border-t border-slate-800/80 pt-2.5">
          <Link
            href={`/settings?org=${organizationId}`}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 transition-colors"
          >
            🏢 Organization Profile
          </Link>
          <Link
            href={`/settings/branches?org=${organizationId}`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
          >
            🏪 Branch Administration
          </Link>
          <Link
            href={`/settings/staff?org=${organizationId}`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
          >
            👥 Staff & Permissions
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Banner: Success Notification */}
        {successMessage && (
          <div
            role="status"
            className="flex items-start gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-sm shadow-sm"
          >
            <span className="text-emerald-400 text-lg leading-none select-none">✓</span>
            <div className="flex-1 font-medium">{successMessage}</div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-400/80 hover:text-emerald-200 text-xs px-2 py-0.5 rounded border border-emerald-800/40"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Banner: Global Error Notification */}
        {globalError && (
          <div
            role="alert"
            className="flex items-start gap-3 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-sm shadow-sm"
          >
            <span className="text-rose-400 text-lg leading-none select-none">⚠</span>
            <div className="flex-1 font-medium">{globalError}</div>
            <button
              type="button"
              onClick={() => setGlobalError(null)}
              className="text-rose-400/80 hover:text-rose-200 text-xs px-2 py-0.5 rounded border border-rose-800/40"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Settings Form */}
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <input type="hidden" name="organizationId" value={organizationId} />
          {/* Card 1: General Business Identity */}
          <section className="bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="border-b border-slate-800/80 pb-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span>🏢</span> General Business Identity
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure your public business profile, registered legal identity, and brand logo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Business Name */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-name"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Business Name <span className="text-rose-400">*</span>
                </label>
                <input
                  id="org-name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Usman Electronics"
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.name
                      ? "border-rose-500 focus:ring-rose-500/40"
                      : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                />
                {fieldErrors.name && (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              {/* Legal Name */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-legal-name"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Legal / Registered Entity Name
                </label>
                <input
                  id="org-legal-name"
                  name="legalName"
                  type="text"
                  value={formData.legalName || ""}
                  onChange={handleChange}
                  placeholder="e.g. Usman Electronics (Pvt) Ltd"
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.legalName
                      ? "border-rose-500 focus:ring-rose-500/40"
                      : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                />
                {fieldErrors.legalName && (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.legalName}
                  </p>
                )}
              </div>

              {/* Business Slug (Read-only System Identifier) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-slug"
                  className="block text-xs font-semibold text-slate-400 uppercase tracking-wider"
                >
                  System Handle / URL Slug (Permanent)
                </label>
                <input
                  id="org-slug"
                  type="text"
                  readOnly
                  disabled
                  value={profile.slug}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-sm text-slate-400 cursor-not-allowed select-all font-mono"
                />
                <p className="text-[11px] text-slate-500">
                  Fixed system handle assigned during onboarding.
                </p>
              </div>

              {/* Logo URL with live preview */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-logo-url"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Business Logo URL (HTTPS)
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <input
                      id="org-logo-url"
                      name="logoUrl"
                      type="url"
                      value={formData.logoUrl || ""}
                      onChange={handleChange}
                      placeholder="https://example.com/logo.png"
                      className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                        fieldErrors.logoUrl
                          ? "border-rose-500 focus:ring-rose-500/40"
                          : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                      }`}
                    />
                  </div>
                  {/* Live Thumbnail Preview */}
                  <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                    {formData.logoUrl && !logoPreviewError ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={formData.logoUrl}
                        alt="Logo Preview"
                        className="w-full h-full object-contain"
                        onError={() => setLogoPreviewError(true)}
                      />
                    ) : (
                      <span className="text-xs text-slate-500 select-none">🏢</span>
                    )}
                  </div>
                </div>
                {fieldErrors.logoUrl ? (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.logoUrl}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Provide a secure public image URL (PNG, SVG, or JPG).
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Card 2: Contact Information & Physical Address */}
          <section className="bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="border-b border-slate-800/80 pb-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span>📍</span> Contact & Physical Location
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Official contact channels and primary physical headquarters address.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Contact Email */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-email"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Contact Email
                </label>
                <input
                  id="org-email"
                  name="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={handleChange}
                  placeholder="contact@business.com"
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.email
                      ? "border-rose-500 focus:ring-rose-500/40"
                      : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                />
                {fieldErrors.email && (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-phone"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Phone Number
                </label>
                <input
                  id="org-phone"
                  name="phone"
                  type="tel"
                  value={formData.phone || ""}
                  onChange={handleChange}
                  placeholder="+92 300 1234567"
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.phone
                      ? "border-rose-500 focus:ring-rose-500/40"
                      : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                />
                {fieldErrors.phone && (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.phone}
                  </p>
                )}
              </div>

              {/* Physical Street Address */}
              <div className="space-y-1.5 md:col-span-2">
                <label
                  htmlFor="org-address"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Street Address
                </label>
                <input
                  id="org-address"
                  name="address"
                  type="text"
                  value={formData.address || ""}
                  onChange={handleChange}
                  placeholder="Main Commercial Market, Block 4"
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.address
                      ? "border-rose-500 focus:ring-rose-500/40"
                      : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                />
                {fieldErrors.address && (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.address}
                  </p>
                )}
              </div>

              {/* City */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-city"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  City
                </label>
                <input
                  id="org-city"
                  name="city"
                  type="text"
                  value={formData.city || ""}
                  onChange={handleChange}
                  placeholder="e.g. Lahore"
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.city
                      ? "border-rose-500 focus:ring-rose-500/40"
                      : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                />
                {fieldErrors.city && (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.city}
                  </p>
                )}
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-country"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Country
                </label>
                <input
                  id="org-country"
                  name="country"
                  type="text"
                  value={formData.country || ""}
                  onChange={handleChange}
                  placeholder="e.g. Pakistan"
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.country
                      ? "border-rose-500 focus:ring-rose-500/40"
                      : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                />
                {fieldErrors.country && (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.country}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Card 3: Currency & Timezone Settings */}
          <section className="bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="border-b border-slate-800/80 pb-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span>🌐</span> Currency & Timezone Configuration
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure primary financial currency and reporting timezone boundaries.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Currency Selector */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-currency"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Operational Currency <span className="text-rose-400">*</span>
                </label>
                <select
                  id="org-currency"
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.currency
                      ? "border-rose-500 focus:ring-rose-500/40"
                      : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                >
                  {SUPPORTED_CURRENCIES.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.code} — {curr.name} ({curr.symbol})
                    </option>
                  ))}
                </select>
                {fieldErrors.currency && (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.currency}
                  </p>
                )}
              </div>

              {/* Timezone Selector */}
              <div className="space-y-1.5">
                <label
                  htmlFor="org-timezone"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Business Timezone <span className="text-rose-400">*</span>
                </label>
                <select
                  id="org-timezone"
                  name="timezone"
                  value={formData.timezone}
                  onChange={handleChange}
                  className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-sm text-slate-100 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.timezone
                      ? "border-rose-500 focus:ring-rose-500/40"
                      : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.timezone && (
                  <p role="alert" className="text-xs text-rose-400 font-medium">
                    {fieldErrors.timezone}
                  </p>
                )}
              </div>
            </div>

            {/* Crucial Data Integrity Warnings */}
            <div className="space-y-3 pt-2">
              {/* Currency Warning */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-950/25 border border-amber-800/40 text-xs text-amber-200/90 leading-relaxed">
                <span className="text-amber-400 text-base leading-none select-none">⚠️</span>
                <div>
                  <strong className="text-amber-300 block font-semibold mb-0.5">
                    Important Note on Currency:
                  </strong>
                  Changing your organization currency applies to new sales, purchase orders, and
                  customer receipts. Because past transaction records store raw numerical amounts
                  without independent currency labels, changing this setting alters the currency
                  symbol displayed next to historical orders. Stored numerical amounts are never
                  converted or altered.
                </div>
              </div>

              {/* Timezone Warning */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-sky-950/25 border border-sky-800/40 text-xs text-sky-200/90 leading-relaxed">
                <span className="text-sky-400 text-base leading-none select-none">ℹ️</span>
                <div>
                  <strong className="text-sky-300 block font-semibold mb-0.5">
                    Important Note on Timezone:
                  </strong>
                  Changing your business timezone adjusts local midnight-to-midnight reporting
                  boundaries for sales metrics and dashboard summaries. Stored transaction
                  timestamps in UTC remain completely untouched.
                </div>
              </div>
            </div>
          </section>

          {/* Card 4: Invoicing & Document Settings (Informational Overview) */}
          {profile.settings && (
            <section className="bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
              <div className="border-b border-slate-800/80 pb-3">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>📄</span> Invoicing & Tax Status Overview
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Read-only summary of current invoicing sequence prefixes and tax configuration.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 space-y-1">
                  <span className="text-slate-400 block font-medium">Invoice Prefix</span>
                  <span className="text-slate-200 font-mono text-sm font-semibold">
                    {profile.settings.invoicePrefix || "INV-"}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 space-y-1">
                  <span className="text-slate-400 block font-medium">Receipt Prefix</span>
                  <span className="text-slate-200 font-mono text-sm font-semibold">
                    {profile.settings.receiptPrefix || "REC-"}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 space-y-1">
                  <span className="text-slate-400 block font-medium">Date Format</span>
                  <span className="text-slate-200 font-mono text-sm font-semibold">
                    {profile.settings.dateFormat || "YYYY-MM-DD"}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 space-y-1">
                  <span className="text-slate-400 block font-medium">Tax Status</span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      profile.settings.taxEnabled
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {profile.settings.taxEnabled
                      ? `Enabled (${profile.settings.defaultTaxRate}%)`
                      : "Disabled"}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Form Actions Footer */}
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-800 flex-wrap">
            <div className="text-xs text-slate-500">
              Last saved: {new Date(profile.updatedAt).toLocaleString()}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending || !isFormDirty}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset Changes
              </button>

              <button
                type="submit"
                disabled={isPending || !isFormDirty}
                className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Saving Settings...</span>
                  </>
                ) : (
                  <span>Save Settings</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
