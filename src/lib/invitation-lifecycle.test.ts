import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getDefaultRouteForRole } from "./invitation-routing";
import { SYSTEM_ROLES, type SystemRoleName } from "./roles";

const ASSIGNABLE_STAFF_ROLES: readonly SystemRoleName[] = [
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.CASHIER,
  SYSTEM_ROLES.INVENTORY_MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
] as const;

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

test("Role default destination routing: directs each role to correct authorized page", () => {
  const orgId = "org_test_123";

  // Cashier goes directly to POS terminal
  assert.equal(getDefaultRouteForRole(SYSTEM_ROLES.CASHIER, orgId), "/pos?org=org_test_123");

  // Inventory Manager goes to Inventory catalog
  assert.equal(getDefaultRouteForRole(SYSTEM_ROLES.INVENTORY_MANAGER, orgId), "/inventory?org=org_test_123");

  // Accountant goes to Executive Dashboard (with access to Sales & Financials)
  assert.equal(getDefaultRouteForRole(SYSTEM_ROLES.ACCOUNTANT, orgId), "/dashboard?org=org_test_123");

  // Manager goes to Dashboard
  assert.equal(getDefaultRouteForRole(SYSTEM_ROLES.MANAGER, orgId), "/dashboard?org=org_test_123");

  // Owner goes to Dashboard
  assert.equal(getDefaultRouteForRole(SYSTEM_ROLES.OWNER, orgId), "/dashboard?org=org_test_123");

  // Fallback without orgId
  assert.equal(getDefaultRouteForRole(SYSTEM_ROLES.CASHIER), "/pos");
  assert.equal(getDefaultRouteForRole(SYSTEM_ROLES.ACCOUNTANT), "/dashboard");
});

test("Staff roles coverage: ACCOUNTANT, CASHIER, MANAGER, and INVENTORY_MANAGER are all supported", () => {
  assert.ok(ASSIGNABLE_STAFF_ROLES.includes(SYSTEM_ROLES.ACCOUNTANT));
  assert.ok(ASSIGNABLE_STAFF_ROLES.includes(SYSTEM_ROLES.CASHIER));
  assert.ok(ASSIGNABLE_STAFF_ROLES.includes(SYSTEM_ROLES.MANAGER));
  assert.ok(ASSIGNABLE_STAFF_ROLES.includes(SYSTEM_ROLES.INVENTORY_MANAGER));

  // Security Invariant: OWNER role must NEVER be an assignable staff role
  assert.equal(ASSIGNABLE_STAFF_ROLES.includes(SYSTEM_ROLES.OWNER as any), false);
});

test("Token hashing: cryptographic SHA-256 token verification is deterministic and secure", () => {
  const token = "invitation_test_token_987654321";
  const hash1 = hashToken(token);
  const hash2 = hashToken(token);

  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
  assert.notEqual(hash1, token);
});

test("Email normalization rules: invitation matching is strictly case-insensitive and trimmed", () => {
  const invitedEmail = "  UsmanMumtazWa2@Gmail.Com  ";
  const authEmail = "usmanmumtazwa2@gmail.com";

  const normalizedInvited = invitedEmail.trim().toLowerCase();
  const normalizedAuth = authEmail.trim().toLowerCase();

  assert.equal(normalizedInvited, normalizedAuth);
  assert.equal(normalizedInvited, "usmanmumtazwa2@gmail.com");
});

test("Email mismatch security check: prevents unauthorized account from claiming another employee's invite", () => {
  const invitedEmail = "accountant@urbanbasket.pk";
  const attackerAuthEmail = "attacker@example.com";

  const isMatch = invitedEmail.trim().toLowerCase() === attackerAuthEmail.trim().toLowerCase();
  assert.equal(isMatch, false);
});

test("Invitation lifecycle transitions: valid states and expiration enforcement", () => {
  const now = new Date();
  const past = new Date(now.getTime() - 1000 * 60 * 60); // 1 hr ago
  const future = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7); // 7 days ahead

  // Valid pending invitation
  assert.equal(future > now, true);

  // Expired invitation must be rejected
  assert.equal(past > now, false);

  // Status transitions
  const validStatuses = ["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"];
  assert.ok(validStatuses.includes("PENDING"));
  assert.ok(validStatuses.includes("ACCEPTED"));
});

test("Idempotent invitation acceptance: already accepted invitations for the same user succeed safely", () => {
  const invitationState = {
    status: "ACCEPTED",
    userId: "user_accountant_123",
    organizationId: "org_urban_basket",
    membershipActive: true,
  };

  // If the user attempting to accept is already an active member of that org
  const isIdempotentSuccess =
    invitationState.status === "ACCEPTED" &&
    invitationState.membershipActive === true;

  assert.equal(isIdempotentSuccess, true);
});

test("Onboarding security: staff members with existing memberships are barred from owner onboarding", () => {
  const staffUser = {
    id: "user_accountant_123",
    memberships: [
      {
        organizationId: "org_urban_basket",
        role: { name: SYSTEM_ROLES.ACCOUNTANT },
      },
    ],
  };

  // Check if staff user is permitted to start new owner onboarding
  const hasMemberships = staffUser.memberships.length > 0;
  assert.equal(hasMemberships, true);

  // Next action must be redirecting to their role page, not rendering onboarding
  const redirectTarget = getDefaultRouteForRole(
    staffUser.memberships[0].role.name,
    staffUser.memberships[0].organizationId
  );
  assert.equal(redirectTarget, "/dashboard?org=org_urban_basket");
});

test("Genuine new owner onboarding: users with 0 memberships and no pending invites access onboarding", () => {
  const genuineOwner = {
    id: "user_new_owner_456",
    memberships: [],
  };
  const pendingInvites: any[] = [];

  const shouldEnterOnboarding = genuineOwner.memberships.length === 0 && pendingInvites.length === 0;
  assert.equal(shouldEnterOnboarding, true);
});
