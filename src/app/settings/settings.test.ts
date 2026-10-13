import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveOwnerTenantContext,
  resolveTenantContext,
  TenantContextError,
  MembershipNotFoundError,
  InactiveMembershipError,
  MultipleOrganizationsError,
  UnauthorizedRoleError,
  type TenantUserContext,
} from "@/lib/tenant-context";
import { SYSTEM_ROLES } from "@/lib/roles";
import {
  getOrganizationSettingsAction,
  updateOrganizationProfileAction,
} from "./actions";
import { isValidIanaTimezone, isValidSafeLogoUrl } from "./validation";
import {
  SUPPORTED_CURRENCIES,
  type UpdateOrganizationProfileInput,
} from "./types";

// ============================================================================
// TEST FIXTURES & MOCK USERS
// ============================================================================

const createMockUser = (overrides?: Partial<TenantUserContext>): TenantUserContext => ({
  id: "user-owner-1",
  email: "owner@example.com",
  name: "Owner User",
  isActive: true,
  memberships: [
    {
      id: "mem-1",
      organizationId: "org-1",
      isActive: true,
      role: { name: SYSTEM_ROLES.OWNER },
      organization: {
        id: "org-1",
        name: "Prime Supermarket",
        slug: "prime-supermarket",
        isActive: true,
        currency: "PKR",
        timezone: "Asia/Karachi",
      },
    },
  ],
  ...overrides,
});

// ============================================================================
// PHASE 4 TEST SUITE: ORGANIZATION SETTINGS SHARED TENANT CONTEXT
// ============================================================================

test("1. Single-organization user resolves settings context successfully", async () => {
  const user = createMockUser();

  // Resolving without explicit candidate should cleanly fallback to sole active owned org
  const context = await resolveOwnerTenantContext(undefined, { actorUser: user });

  assert.equal(context.organizationId, "org-1");
  assert.equal(context.organizationName, "Prime Supermarket");
  assert.equal(context.role, SYSTEM_ROLES.OWNER);
  assert.equal(context.membershipId, "mem-1");
  assert.equal(context.userId, "user-owner-1");
});

test("2. Multiple eligible organizations without explicit org ID triggers Select Business error", async () => {
  const multiOwnerUser = createMockUser({
    memberships: [
      {
        id: "mem-1",
        organizationId: "org-1",
        isActive: true,
        role: { name: SYSTEM_ROLES.OWNER },
        organization: {
          id: "org-1",
          name: "Business One",
          slug: "biz-1",
          isActive: true,
        },
      },
      {
        id: "mem-2",
        organizationId: "org-2",
        isActive: true,
        role: { name: SYSTEM_ROLES.OWNER },
        organization: {
          id: "org-2",
          name: "Business Two",
          slug: "biz-2",
          isActive: true,
        },
      },
    ],
  });

  // Must NEVER silently select memberships[0]
  await assert.rejects(
    async () => {
      await resolveOwnerTenantContext(undefined, { actorUser: multiOwnerUser });
    },
    (err: unknown) => {
      assert.ok(err instanceof MultipleOrganizationsError);
      assert.equal(err.code, "MULTIPLE_ORGS_SPECIFY_REQUIRED");
      return true;
    }
  );
});

test("3. Valid explicit organization context resolves strictly to requested organization", async () => {
  const multiOwnerUser = createMockUser({
    memberships: [
      {
        id: "mem-1",
        organizationId: "org-1",
        isActive: true,
        role: { name: SYSTEM_ROLES.OWNER },
        organization: {
          id: "org-1",
          name: "Business One",
          slug: "biz-1",
          isActive: true,
        },
      },
      {
        id: "mem-2",
        organizationId: "org-2",
        isActive: true,
        role: { name: SYSTEM_ROLES.OWNER },
        organization: {
          id: "org-2",
          name: "Business Two",
          slug: "biz-2",
          isActive: true,
        },
      },
    ],
  });

  // Explicitly selecting org-2 must resolve strictly to org-2
  const context = await resolveOwnerTenantContext("org-2", { actorUser: multiOwnerUser });
  assert.equal(context.organizationId, "org-2");
  assert.equal(context.organizationName, "Business Two");
  assert.equal(context.membershipId, "mem-2");
  assert.equal(context.role, SYSTEM_ROLES.OWNER);
});

test("4. Rejection of foreign-tenant and inactive organization memberships", async () => {
  const user = createMockUser({
    memberships: [
      {
        id: "mem-1",
        organizationId: "org-1",
        isActive: true,
        role: { name: SYSTEM_ROLES.OWNER },
        organization: {
          id: "org-1",
          name: "Active Business",
          slug: "active-biz",
          isActive: true,
        },
      },
      {
        id: "mem-inactive-member",
        organizationId: "org-disabled-mem",
        isActive: false, // Inactive membership
        role: { name: SYSTEM_ROLES.OWNER },
        organization: {
          id: "org-disabled-mem",
          name: "Inactive Membership Biz",
          slug: "inactive-mem-biz",
          isActive: true,
        },
      },
      {
        id: "mem-inactive-org",
        organizationId: "org-disabled-org",
        isActive: true,
        role: { name: SYSTEM_ROLES.OWNER },
        organization: {
          id: "org-disabled-org",
          name: "Disabled Organization",
          slug: "disabled-org",
          isActive: false, // Inactive organization
        },
      },
    ],
  });

  // A. Foreign tenant candidate not present in memberships
  await assert.rejects(
    async () => {
      await resolveOwnerTenantContext("org-foreign-404", { actorUser: user });
    },
    (err: unknown) => {
      assert.ok(err instanceof MembershipNotFoundError);
      assert.equal(err.code, "MEMBERSHIP_NOT_FOUND");
      return true;
    }
  );

  // B. Inactive membership in existing organization
  await assert.rejects(
    async () => {
      await resolveOwnerTenantContext("org-disabled-mem", { actorUser: user });
    },
    (err: unknown) => {
      assert.ok(err instanceof InactiveMembershipError);
      assert.equal(err.code, "INACTIVE_MEMBERSHIP");
      return true;
    }
  );

  // C. Inactive organization with active membership
  await assert.rejects(
    async () => {
      await resolveOwnerTenantContext("org-disabled-org", { actorUser: user });
    },
    (err: unknown) => {
      assert.ok(err instanceof InactiveMembershipError);
      assert.equal(err.code, "INACTIVE_MEMBERSHIP");
      return true;
    }
  );
});

test("5. Unauthorized non-OWNER roles are rejected from settings resolution and actions", async () => {
  const cashierUser = createMockUser({
    memberships: [
      {
        id: "mem-cashier",
        organizationId: "org-1",
        isActive: true,
        role: { name: SYSTEM_ROLES.CASHIER },
        organization: {
          id: "org-1",
          name: "Prime Supermarket",
          slug: "prime-supermarket",
          isActive: true,
        },
      },
    ],
  });

  // Direct tenant-context resolution throws OWNER_ROLE_REQUIRED
  await assert.rejects(
    async () => {
      await resolveOwnerTenantContext("org-1", { actorUser: cashierUser });
    },
    (err: unknown) => {
      assert.ok(err instanceof UnauthorizedRoleError);
      assert.equal(err.code, "OWNER_ROLE_REQUIRED");
      return true;
    }
  );

  // Server action translating error safely
  const settingsRes = await getOrganizationSettingsAction("org-1", { actorUser: cashierUser });
  assert.equal(settingsRes.success, false);
  if (!settingsRes.success) {
    assert.match(settingsRes.error, /Only the organization owner/i);
  }

  const updateRes = await updateOrganizationProfileAction(
    {
      name: "Attempted Name Change",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
    "org-1",
    { actorUser: cashierUser }
  );
  assert.equal(updateRes.success, false);
  if (!updateRes.success) {
    assert.match(updateRes.error, /Only the organization owner/i);
  }
});

test("6. Validation standards: Invalid currencies, timezones, and unsafe logo URLs", async () => {
  // A. Timezone validation (valid IANA required)
  assert.equal(isValidIanaTimezone("Asia/Karachi"), true);
  assert.equal(isValidIanaTimezone("UTC"), true);
  assert.equal(isValidIanaTimezone("America/New_York"), true);
  assert.equal(isValidIanaTimezone("Europe/London"), true);
  assert.equal(isValidIanaTimezone("Asia/Dubai"), true);

  assert.equal(isValidIanaTimezone("Not/ATimezone"), false);
  assert.equal(isValidIanaTimezone("Mars/Base"), false);
  assert.equal(isValidIanaTimezone(""), false);
  assert.equal(isValidIanaTimezone("   "), false);
  assert.equal(isValidIanaTimezone("a".repeat(100)), false);

  // B. Safe Logo URL validation (strict http/https, no script/data URIs)
  assert.equal(isValidSafeLogoUrl("https://example.com/logo.png"), true);
  assert.equal(isValidSafeLogoUrl("http://cdn.store.com/assets/img.svg"), true);

  assert.equal(isValidSafeLogoUrl("javascript:alert(1)"), false);
  assert.equal(isValidSafeLogoUrl("data:text/html,<script>alert(1)</script>"), false);
  assert.equal(isValidSafeLogoUrl("file:///etc/passwd"), false);
  assert.equal(isValidSafeLogoUrl("ftp://ftp.example.com/logo.png"), false);
  assert.equal(isValidSafeLogoUrl("not-a-valid-url"), false);
  assert.equal(isValidSafeLogoUrl("https://" + "a".repeat(600)), false);

  // C. Currency validation allowlist
  const isPkrSupported = SUPPORTED_CURRENCIES.some((c) => c.code === "PKR");
  const isUsdSupported = SUPPORTED_CURRENCIES.some((c) => c.code === "USD");
  const isXyzSupported = SUPPORTED_CURRENCIES.some((c) => c.code === "XYZ");
  assert.equal(isPkrSupported, true);
  assert.equal(isUsdSupported, true);
  assert.equal(isXyzSupported, false);

  // D. updateOrganizationProfileAction fieldErrors validation
  const ownerUser = createMockUser();

  const invalidInput: UpdateOrganizationProfileInput = {
    name: "A", // too short (min 2 chars)
    email: "not-an-email", // invalid email
    currency: "XYZ_INVALID", // invalid currency
    timezone: "Invalid/Zone", // invalid timezone
    logoUrl: "javascript:evil()", // unsafe logo URL
  };

  const validationRes = await updateOrganizationProfileAction(invalidInput, "org-1", {
    actorUser: ownerUser,
  });

  assert.equal(validationRes.success, false);
  if (!validationRes.success && validationRes.fieldErrors) {
    assert.ok(validationRes.fieldErrors.name);
    assert.ok(validationRes.fieldErrors.email);
    assert.ok(validationRes.fieldErrors.currency);
    assert.ok(validationRes.fieldErrors.timezone);
    assert.ok(validationRes.fieldErrors.logoUrl);
  } else {
    assert.fail("Expected fieldErrors for invalid input");
  }
});

test("7. Cross-tenant isolation: Foreign org updates rejected with safe error translation", async () => {
  const user = createMockUser();

  const foreignRes = await updateOrganizationProfileAction(
    {
      name: "Malicious Cross-Tenant Overwrite",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
    "foreign-org-id-999",
    { actorUser: user }
  );

  assert.equal(foreignRes.success, false);
  if (!foreignRes.success) {
    assert.match(foreignRes.error, /not found or you do not have an active membership/i);
  }
});

test("8. Single owned organization fallback preserves seamless access for multi-org member", async () => {
  // A user who is OWNER in Org A, but CASHIER in Org B
  const mixedUser = createMockUser({
    memberships: [
      {
        id: "mem-owner",
        organizationId: "org-owned",
        isActive: true,
        role: { name: SYSTEM_ROLES.OWNER },
        organization: {
          id: "org-owned",
          name: "Owned Business",
          slug: "owned-biz",
          isActive: true,
        },
      },
      {
        id: "mem-cashier",
        organizationId: "org-staff",
        isActive: true,
        role: { name: SYSTEM_ROLES.CASHIER },
        organization: {
          id: "org-staff",
          name: "Employed Business",
          slug: "employed-biz",
          isActive: true,
        },
      },
    ],
  });

  // When no orgId is specified, resolveOwnerTenantContext filters for eligible OWNER orgs,
  // identifying exactly 1 owned organization and falling back seamlessly without error.
  const context = await resolveOwnerTenantContext(undefined, { actorUser: mixedUser });
  assert.equal(context.organizationId, "org-owned");
  assert.equal(context.organizationName, "Owned Business");
  assert.equal(context.role, SYSTEM_ROLES.OWNER);
});
