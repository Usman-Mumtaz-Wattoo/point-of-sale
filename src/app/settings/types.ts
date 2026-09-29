export interface OrganizationSettingsDTO {
  dateFormat: string;
  invoicePrefix: string;
  receiptPrefix: string;
  taxEnabled: boolean;
  defaultTaxRate: string;
}

export interface OrganizationProfileDTO {
  name: string;
  slug: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  currency: string;
  timezone: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  settings?: OrganizationSettingsDTO | null;
}

export interface UpdateOrganizationProfileInput {
  name: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  currency: string;
  timezone: string;
  logoUrl?: string | null;
}

export type OrganizationSettingsActionResult<T> =
  | {
      success: true;
      data: T;
      message?: string;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string>;
    };

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
}

export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  { code: "PKR", name: "Pakistani Rupee", symbol: "Rs" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", name: "Australian Dollar", symbol: "AU$" },
  { code: "AED", name: "UAE Dirham", symbol: "AED" },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "SGD", name: "Singapore Dollar", symbol: "SG$" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CNY", name: "Chinese Yuan", symbol: "CN¥" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD" },
  { code: "QAR", name: "Qatari Riyal", symbol: "QR" },
  { code: "OMR", name: "Omani Rial", symbol: "OMR" },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BD" },
] as const;

export interface TimezoneOption {
  value: string;
  label: string;
  group: string;
}

export const COMMON_TIMEZONES: readonly TimezoneOption[] = [
  { value: "Asia/Karachi", label: "Karachi (PKT, UTC+5)", group: "Asia / South Asia" },
  { value: "Asia/Dubai", label: "Dubai / Gulf (GST, UTC+4)", group: "Middle East" },
  { value: "Asia/Riyadh", label: "Riyadh (AST, UTC+3)", group: "Middle East" },
  { value: "Asia/Kolkata", label: "India Standard (IST, UTC+5:30)", group: "Asia / South Asia" },
  { value: "Asia/Dhaka", label: "Dhaka (BST, UTC+6)", group: "Asia / South Asia" },
  { value: "Asia/Bangkok", label: "Bangkok / Jakarta (ICT, UTC+7)", group: "Asia / Southeast" },
  { value: "Asia/Singapore", label: "Singapore / KL (SGT, UTC+8)", group: "Asia / Southeast" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (HKT, UTC+8)", group: "Asia / East" },
  { value: "Asia/Tokyo", label: "Tokyo (JST, UTC+9)", group: "Asia / East" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)", group: "Global" },
  { value: "Europe/London", label: "London (GMT/BST, UTC+0/+1)", group: "Europe" },
  { value: "Europe/Paris", label: "Paris / Berlin (CET/CEST, UTC+1/+2)", group: "Europe" },
  { value: "Europe/Istanbul", label: "Istanbul (TRT, UTC+3)", group: "Europe" },
  { value: "America/New_York", label: "New York / Eastern (EST/EDT, UTC-5/-4)", group: "Americas" },
  { value: "America/Chicago", label: "Chicago / Central (CST/CDT, UTC-6/-5)", group: "Americas" },
  { value: "America/Denver", label: "Denver / Mountain (MST/MDT, UTC-7/-6)", group: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles / Pacific (PST/PDT, UTC-8/-7)", group: "Americas" },
  { value: "America/Toronto", label: "Toronto (EST/EDT, UTC-5/-4)", group: "Americas" },
  { value: "Australia/Sydney", label: "Sydney / Melbourne (AEST/AEDT, UTC+10/+11)", group: "Oceania" },
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT, UTC+12/+13)", group: "Oceania" },
] as const;
