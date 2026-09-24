import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { SYSTEM_ROLES } from "./roles";
import { getCurrentAppUser } from "./auth";

export interface OnboardingInput {
  // Business Information
  name: string;
  legalName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;

  // First Branch Information
  branchName: string;
  branchCode: string;
  branchAddress?: string;
  branchCity?: string;
  branchPhone?: string;

  // Business Settings Defaults
  currency?: string;
  timezone?: string;
  dateFormat?: string;
  invoicePrefix?: string;
  receiptPrefix?: string;
  taxEnabled?: boolean;
  defaultTaxRate?: number | string;
}

export interface ValidatedOnboardingData {
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string;
  branchName: string;
  branchCode: string;
  branchAddress: string | null;
  branchCity: string | null;
  branchPhone: string | null;
  currency: string;
  timezone: string;
  dateFormat: string;
  invoicePrefix: string;
  receiptPrefix: string;
  taxEnabled: boolean;
  defaultTaxRate: Prisma.Decimal;
}

export class OnboardingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingValidationError";
  }
}

/**
 * Normalizes a raw string into a clean URL-friendly slug base.
 * e.g., "Usman's Electronics" -> "usmans-electronics"
 */
export function generateSlugBase(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "business";
}

/**
 * Generates an authoritative, collision-free slug against the database within a transaction.
 */
export async function generateUniqueSlug(
  name: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  const baseSlug = generateSlugBase(name);
  let candidateSlug = baseSlug;
  let counter = 1;

  while (counter <= 100) {
    const existing = await tx.organization.findUnique({
      where: { slug: candidateSlug },
      select: { id: true },
    });

    if (!existing) {
      return candidateSlug;
    }

    counter += 1;
    candidateSlug = `${baseSlug}-${counter}`;
  }

  // Fallback with timestamp in the rare case of extreme collision density
  return `${baseSlug}-${Date.now().toString(36)}`;
}

/**
 * Validates onboarding input server-side.
 */
export function validateOnboardingInput(input: OnboardingInput): ValidatedOnboardingData {
  // 1. Business Name
  const name = input.name?.trim();
  if (!name || name.length < 2) {
    throw new OnboardingValidationError("Business Name must be at least 2 characters long.");
  }
  if (name.length > 100) {
    throw new OnboardingValidationError("Business Name cannot exceed 100 characters.");
  }

  // 2. Legal Name (Optional)
  const legalName = input.legalName?.trim() || null;
  if (legalName && legalName.length > 150) {
    throw new OnboardingValidationError("Legal Name cannot exceed 150 characters.");
  }

  // 3. Email (Optional)
  const email = input.email?.trim() || null;
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 120) {
      throw new OnboardingValidationError("Invalid email address format.");
    }
  }

  // 4. Phone (Optional)
  const phone = input.phone?.trim() || null;
  if (phone && phone.length > 30) {
    throw new OnboardingValidationError("Phone number cannot exceed 30 characters.");
  }

  // 5. Address & City
  const address = input.address?.trim() || null;
  if (address && address.length > 255) {
    throw new OnboardingValidationError("Address cannot exceed 255 characters.");
  }

  const city = input.city?.trim() || null;
  if (city && city.length > 100) {
    throw new OnboardingValidationError("City cannot exceed 100 characters.");
  }

  // 6. Country
  const country = input.country?.trim() || "Pakistan";
  if (country.length > 100) {
    throw new OnboardingValidationError("Country cannot exceed 100 characters.");
  }

  // 7. Branch Name
  const branchName = input.branchName?.trim();
  if (!branchName || branchName.length < 2) {
    throw new OnboardingValidationError("Branch Name must be at least 2 characters long.");
  }
  if (branchName.length > 100) {
    throw new OnboardingValidationError("Branch Name cannot exceed 100 characters.");
  }

  // 8. Branch Code (normalized to uppercase alphanumeric + hyphens)
  const rawCode = input.branchCode?.trim() || "MAIN";
  const branchCode = rawCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!branchCode || branchCode.length < 1 || branchCode.length > 20) {
    throw new OnboardingValidationError("Branch Code must be 1 to 20 alphanumeric characters.");
  }

  const branchAddress = input.branchAddress?.trim() || address;
  const branchCity = input.branchCity?.trim() || city;
  const branchPhone = input.branchPhone?.trim() || phone;

  // 9. Currency
  const currency = (input.currency?.trim() || "PKR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new OnboardingValidationError("Currency must be a 3-letter ISO currency code (e.g. PKR, USD).");
  }

  // 10. Timezone
  const timezone = input.timezone?.trim() || "Asia/Karachi";
  if (timezone.length > 60) {
    throw new OnboardingValidationError("Timezone cannot exceed 60 characters.");
  }

  // 11. Invoicing Prefixes & Formats
  const dateFormat = input.dateFormat?.trim() || "YYYY-MM-DD";
  const invoicePrefix = input.invoicePrefix?.trim() || "INV-";
  if (invoicePrefix.length > 15) {
    throw new OnboardingValidationError("Invoice prefix cannot exceed 15 characters.");
  }

  const receiptPrefix = input.receiptPrefix?.trim() || "REC-";
  if (receiptPrefix.length > 15) {
    throw new OnboardingValidationError("Receipt prefix cannot exceed 15 characters.");
  }

  // 12. Tax settings
  const taxEnabled = Boolean(input.taxEnabled);
  let taxRateNum = 0;
  if (input.defaultTaxRate !== undefined && input.defaultTaxRate !== "") {
    taxRateNum = Number(input.defaultTaxRate);
    if (isNaN(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) {
      throw new OnboardingValidationError("Default Tax Rate must be a number between 0.00% and 100.00%.");
    }
  }
  const defaultTaxRate = new Prisma.Decimal(taxRateNum.toFixed(2));

  return {
    name,
    legalName,
    email,
    phone,
    address,
    city,
    country,
    branchName,
    branchCode,
    branchAddress,
    branchCity,
    branchPhone,
    currency,
    timezone,
    dateFormat,
    invoicePrefix,
    receiptPrefix,
    taxEnabled,
    defaultTaxRate,
  };
}

export interface OnboardingResult {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  branchId: string;
  branchCode: string;
  membershipId: string;
}

/**
 * Creates an entire organization tenant foundation inside ONE atomic database transaction.
 *
 * Transaction operations:
 * 1. Verify OWNER system role exists.
 * 2. Generate unique organization slug.
 * 3. Create Organization.
 * 4. Create OrganizationSettings.
 * 5. Create First Branch.
 * 6. Create BranchSettings.
 * 7. Create OrganizationMembership with OWNER role for authenticated user.
 * 8. Create BranchMembership connecting the membership to the first branch.
 *
 * If ANY operation fails, the transaction rolls back completely leaving zero orphan records.
 */
export async function createBusinessOnboarding(
  input: OnboardingInput,
  overrideUserId?: string
): Promise<OnboardingResult> {
  // 1. Resolve authenticated user server-side
  let targetUserId = overrideUserId;
  if (!targetUserId) {
    const currentAppUser = await getCurrentAppUser();
    if (!currentAppUser) {
      throw new Error("Unauthorized: You must be signed in to create an organization.");
    }
    targetUserId = currentAppUser.id;
  }

  // 2. Validate all inputs
  const validated = validateOnboardingInput(input);

  // 3. Execute atomic transaction
  return db.$transaction(async (tx) => {
    // A. Resolve OWNER role
    const ownerRole = await tx.role.findUnique({
      where: { name: SYSTEM_ROLES.OWNER },
      select: { id: true },
    });

    if (!ownerRole) {
      throw new Error("System error: OWNER role definition not found in database. Seed must be run.");
    }

    // B. Generate unique slug
    const slug = await generateUniqueSlug(validated.name, tx);

    // C. Create Organization
    const organization = await tx.organization.create({
      data: {
        name: validated.name,
        slug,
        legalName: validated.legalName,
        email: validated.email,
        phone: validated.phone,
        address: validated.address,
        city: validated.city,
        country: validated.country,
        currency: validated.currency,
        timezone: validated.timezone,
        isActive: true,
      },
    });

    // D. Create OrganizationSettings
    await tx.organizationSettings.create({
      data: {
        organizationId: organization.id,
        currency: validated.currency,
        timezone: validated.timezone,
        dateFormat: validated.dateFormat,
        invoicePrefix: validated.invoicePrefix,
        receiptPrefix: validated.receiptPrefix,
        taxEnabled: validated.taxEnabled,
        defaultTaxRate: validated.defaultTaxRate,
      },
    });

    // E. Create First Branch
    const branch = await tx.branch.create({
      data: {
        organizationId: organization.id,
        name: validated.branchName,
        code: validated.branchCode,
        address: validated.branchAddress,
        city: validated.branchCity,
        phone: validated.branchPhone,
        isActive: true,
      },
    });

    // F. Create BranchSettings
    await tx.branchSettings.create({
      data: {
        branchId: branch.id,
        invoiceNumberPrefix: validated.invoicePrefix,
        receiptNumberPrefix: validated.receiptPrefix,
        defaultWarehouseName: "Main Store",
      },
    });

    // G. Create OrganizationMembership (OWNER)
    const organizationMembership = await tx.organizationMembership.create({
      data: {
        userId: targetUserId,
        organizationId: organization.id,
        roleId: ownerRole.id,
        isActive: true,
      },
    });

    // H. Create BranchMembership
    await tx.branchMembership.create({
      data: {
        organizationMembershipId: organizationMembership.id,
        branchId: branch.id,
      },
    });

    return {
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      branchId: branch.id,
      branchCode: branch.code,
      membershipId: organizationMembership.id,
    };
  });
}
