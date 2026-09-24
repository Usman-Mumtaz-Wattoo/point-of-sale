"use server";

import { redirect } from "next/navigation";
import {
  createBusinessOnboarding,
  OnboardingValidationError,
  type OnboardingInput,
} from "@/lib/onboarding";

export interface OnboardingActionResult {
  error?: string;
  success?: boolean;
  fields?: Record<string, string>;
}

export async function onboardingAction(
  _prevState: OnboardingActionResult | null,
  formData: FormData
): Promise<OnboardingActionResult> {
  const rawFields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") {
      rawFields[key] = value;
    }
  });

  const input: OnboardingInput = {
    name: formData.get("name")?.toString() || "",
    legalName: formData.get("legalName")?.toString() || undefined,
    email: formData.get("email")?.toString() || undefined,
    phone: formData.get("phone")?.toString() || undefined,
    address: formData.get("address")?.toString() || undefined,
    city: formData.get("city")?.toString() || undefined,
    country: formData.get("country")?.toString() || "Pakistan",

    branchName: formData.get("branchName")?.toString() || "",
    branchCode: formData.get("branchCode")?.toString() || "MAIN",
    branchAddress: formData.get("branchAddress")?.toString() || undefined,
    branchCity: formData.get("branchCity")?.toString() || undefined,
    branchPhone: formData.get("branchPhone")?.toString() || undefined,

    currency: formData.get("currency")?.toString() || "PKR",
    timezone: formData.get("timezone")?.toString() || "Asia/Karachi",
    dateFormat: formData.get("dateFormat")?.toString() || "YYYY-MM-DD",
    invoicePrefix: formData.get("invoicePrefix")?.toString() || "INV-",
    receiptPrefix: formData.get("receiptPrefix")?.toString() || "REC-",
    taxEnabled: formData.get("taxEnabled") === "true" || formData.get("taxEnabled") === "on",
    defaultTaxRate: formData.get("defaultTaxRate")?.toString() || "0",
  };

  try {
    await createBusinessOnboarding(input);
  } catch (err: unknown) {
    if (err instanceof OnboardingValidationError) {
      return {
        error: err.message,
        fields: rawFields,
      };
    }

    if (err instanceof Error) {
      // Clean error presentation without leaking internal trace details
      return {
        error: err.message.includes("Unique constraint")
          ? "A business or branch with this identifier already exists. Please choose a different name or code."
          : err.message,
        fields: rawFields,
      };
    }

    return {
      error: "An unexpected error occurred during business onboarding. Please try again.",
      fields: rawFields,
    };
  }

  redirect("/dashboard");
}
