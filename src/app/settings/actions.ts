"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  resolveOwnerTenantContext,
  TenantContextError,
  type TenantUserContext,
} from "@/lib/tenant-context";
import {
  type OrganizationProfileDTO,
  type UpdateOrganizationProfileInput,
  type OrganizationSettingsActionResult,
  SUPPORTED_CURRENCIES,
} from "./types";

import { isValidIanaTimezone, isValidSafeLogoUrl } from "./validation";

/**
 * Retrieves organization profile settings for the authenticated owner.
 * If requestedOrgId is provided, validates active OWNER membership in that exact organization.
 * If omitted, falls back to the user's sole active owned organization if unique.
 */
export async function getOrganizationSettingsAction(
  requestedOrgId?: string,
  options?: { actorUser?: TenantUserContext | null }
): Promise<OrganizationSettingsActionResult<OrganizationProfileDTO>> {
  try {
    const { organizationId } = await resolveOwnerTenantContext(requestedOrgId, options);

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      include: {
        settings: true,
      },
    });

    if (!org || !org.isActive) {
      return {
        success: false,
        error: "The organization was not found or is currently inactive.",
      };
    }

    const data: OrganizationProfileDTO = {
      name: org.name,
      slug: org.slug,
      legalName: org.legalName,
      email: org.email,
      phone: org.phone,
      address: org.address,
      city: org.city,
      country: org.country,
      currency: org.currency || "USD",
      timezone: org.timezone || "UTC",
      logoUrl: org.logoUrl,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
      settings: org.settings
        ? {
            dateFormat: org.settings.dateFormat,
            invoicePrefix: org.settings.invoicePrefix,
            receiptPrefix: org.settings.receiptPrefix,
            taxEnabled: org.settings.taxEnabled,
            defaultTaxRate: org.settings.defaultTaxRate.toString(),
          }
        : null,
    };

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      const code = error instanceof TenantContextError ? error.code : error.message;
      if (code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to access organization settings." };
      }
      if (code === "NO_ACTIVE_MEMBERSHIP") {
        return { success: false, error: "No active business organization found for your account." };
      }
      if (code === "MEMBERSHIP_NOT_FOUND") {
        return {
          success: false,
          error: "The requested organization was not found or you do not have an active membership in it.",
        };
      }
      if (code === "INACTIVE_MEMBERSHIP") {
        return {
          success: false,
          error: "Your membership in the requested organization is inactive or disabled.",
        };
      }
      if (code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        return {
          success: false,
          error: "Multiple organizations found. Please specify an organization to manage its settings.",
        };
      }
      if (code === "OWNER_ROLE_REQUIRED" || code === "UNAUTHORIZED_ROLE") {
        return {
          success: false,
          error: "Permission denied: Only the organization owner can access or edit settings.",
        };
      }
    }

    return {
      success: false,
      error: "An unexpected error occurred while loading organization settings.",
    };
  }
}

/**
 * Updates organization profile and regional settings for the authenticated owner.
 * All updates are performed atomically in a transaction across Organization and OrganizationSettings.
 *
 * If requestedOrgId is provided, validates active OWNER membership in that exact organization.
 * If omitted, falls back to the user's sole active owned organization if unique.
 */
export async function updateOrganizationProfileAction(
  input: UpdateOrganizationProfileInput,
  requestedOrgId?: string,
  options?: { actorUser?: TenantUserContext | null }
): Promise<OrganizationSettingsActionResult<OrganizationProfileDTO>> {
  try {
    const { organizationId } = await resolveOwnerTenantContext(requestedOrgId, options);

    const fieldErrors: Record<string, string> = {};

    // 1. Business Name (Required, 2-100 chars)
    const name = input.name?.trim();
    if (!name || name.length < 2) {
      fieldErrors.name = "Business name must be at least 2 characters.";
    } else if (name.length > 100) {
      fieldErrors.name = "Business name cannot exceed 100 characters.";
    }

    // 2. Legal Name (Optional, max 150 chars)
    const legalName = input.legalName?.trim() || null;
    if (legalName && legalName.length > 150) {
      fieldErrors.legalName = "Legal / registered name cannot exceed 150 characters.";
    }

    // 3. Email (Optional, valid format, max 120 chars)
    const email = input.email?.trim() || null;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email) || email.length > 120) {
        fieldErrors.email = "Please enter a valid email address (max 120 characters).";
      }
    }

    // 4. Phone (Optional, max 30 chars)
    const phone = input.phone?.trim() || null;
    if (phone && phone.length > 30) {
      fieldErrors.phone = "Phone number cannot exceed 30 characters.";
    }

    // 5. Address (Optional, max 255 chars)
    const address = input.address?.trim() || null;
    if (address && address.length > 255) {
      fieldErrors.address = "Address cannot exceed 255 characters.";
    }

    // 6. City (Optional, max 100 chars)
    const city = input.city?.trim() || null;
    if (city && city.length > 100) {
      fieldErrors.city = "City cannot exceed 100 characters.";
    }

    // 7. Country (Optional, max 100 chars)
    const country = input.country?.trim() || null;
    if (country && country.length > 100) {
      fieldErrors.country = "Country cannot exceed 100 characters.";
    }

    // 8. Currency (Strict allowlist)
    const currency = (input.currency?.trim() || "").toUpperCase();
    const isCurrencyAllowed = SUPPORTED_CURRENCIES.some((c) => c.code === currency);
    if (!isCurrencyAllowed) {
      fieldErrors.currency = `Unsupported currency code. Supported: ${SUPPORTED_CURRENCIES.map((c) => c.code).join(", ")}.`;
    }

    // 9. Timezone (Valid IANA timezone)
    const timezone = input.timezone?.trim() || "";
    if (!isValidIanaTimezone(timezone)) {
      fieldErrors.timezone = "Please select a valid IANA timezone (e.g. Asia/Karachi, UTC, America/New_York).";
    }

    // 10. Logo URL (Optional, safe protocol HTTP/HTTPS, max 500 chars)
    const logoUrl = input.logoUrl?.trim() || null;
    if (logoUrl && !isValidSafeLogoUrl(logoUrl)) {
      fieldErrors.logoUrl = "Logo URL must be a valid web address starting with https:// or http:// (max 500 characters).";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        error: "Please correct the highlighted validation errors.",
        fieldErrors,
      };
    }

    // Atomic update of Organization and OrganizationSettings within a transaction
    const updatedOrg = await db.$transaction(async (tx) => {
      // 1. Update Organization profile
      const org = await tx.organization.update({
        where: { id: organizationId },
        data: {
          name: name!,
          legalName,
          email,
          phone,
          address,
          city,
          country,
          currency,
          timezone,
          logoUrl,
        },
        include: {
          settings: true,
        },
      });

      // 2. Atomically upsert OrganizationSettings to maintain synchronization
      const settings = await tx.organizationSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          currency,
          timezone,
        },
        update: {
          currency,
          timezone,
        },
      });

      return { ...org, settings };
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");

    const data: OrganizationProfileDTO = {
      name: updatedOrg.name,
      slug: updatedOrg.slug,
      legalName: updatedOrg.legalName,
      email: updatedOrg.email,
      phone: updatedOrg.phone,
      address: updatedOrg.address,
      city: updatedOrg.city,
      country: updatedOrg.country,
      currency: updatedOrg.currency || "USD",
      timezone: updatedOrg.timezone || "UTC",
      logoUrl: updatedOrg.logoUrl,
      createdAt: updatedOrg.createdAt.toISOString(),
      updatedAt: updatedOrg.updatedAt.toISOString(),
      settings: updatedOrg.settings
        ? {
            dateFormat: updatedOrg.settings.dateFormat,
            invoicePrefix: updatedOrg.settings.invoicePrefix,
            receiptPrefix: updatedOrg.settings.receiptPrefix,
            taxEnabled: updatedOrg.settings.taxEnabled,
            defaultTaxRate: updatedOrg.settings.defaultTaxRate.toString(),
          }
        : null,
    };

    return {
      success: true,
      data,
      message: "Organization profile and settings updated successfully.",
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      const code = error instanceof TenantContextError ? error.code : error.message;
      if (code === "AUTH_REQUIRED") {
        return { success: false, error: "Authentication required to update organization settings." };
      }
      if (code === "NO_ACTIVE_MEMBERSHIP") {
        return { success: false, error: "No active business organization found for your account." };
      }
      if (code === "MEMBERSHIP_NOT_FOUND") {
        return {
          success: false,
          error: "The requested organization was not found or you do not have an active membership in it.",
        };
      }
      if (code === "INACTIVE_MEMBERSHIP") {
        return {
          success: false,
          error: "Your membership in the requested organization is inactive or disabled.",
        };
      }
      if (code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        return {
          success: false,
          error: "Multiple organizations found. Please specify an organization to manage its settings.",
        };
      }
      if (code === "OWNER_ROLE_REQUIRED" || code === "UNAUTHORIZED_ROLE") {
        return {
          success: false,
          error: "Permission denied: Only the organization owner can modify settings.",
        };
      }
    }

    return {
      success: false,
      error: "An error occurred while saving organization settings. Please try again.",
    };
  }
}
