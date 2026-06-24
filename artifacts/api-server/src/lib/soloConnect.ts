import {
  db,
  usersTable,
  subscriptionsTable,
  vendorsTable,
  organizersTable,
  gameOrganizersTable,
  soloConnectVerificationsTable,
} from "@workspace/db";
import { eq, and, gt, lte, desc, sql } from "drizzle-orm";
import type { AuthUser } from "./auth";

// Launch promo: the first N registered customers ("founding members") get
// complimentary Premium access to Solo Connect — they can verify, enter, book
// and join groups without ever buying a membership. Ranked by signup order
// (ascending user id) among role="user" accounts.
const FOUNDING_MEMBER_LIMIT = 1000;

async function isFoundingMember(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ rank: sql<number>`count(*)` })
    .from(usersTable)
    .where(and(eq(usersTable.role, "user"), lte(usersTable.id, userId)));
  return Number(row?.rank ?? Number.POSITIVE_INFINITY) <= FOUNDING_MEMBER_LIMIT;
}

export interface SoloAccess {
  eligible: boolean;
  // Why the caller is (not) eligible — surfaced to drive the UI gate.
  reason: "ok" | "not_premium";
  premium: boolean;
  // "draft" = onboarding started (phone verified) but not yet submitted.
  // "none" = never started.
  verificationStatus: "none" | "draft" | "pending" | "approved" | "rejected";
  gender: string | null;
  // Moderation state — when blocked the UI shows a banned/suspended notice.
  banned: boolean;
  suspendedUntil: string | null;
}

// Eligibility for Solo Connect: admins, premium users (active subscription), or
// a verified partner / event organizer / game organizer. Mirrors the gating the
// product spec requires; computed on demand so the core /auth/me payload is
// never touched.
export async function getSoloAccess(user: AuthUser): Promise<SoloAccess> {
  let eligible = false;
  let premium = false;

  if (user.role === "admin") {
    eligible = true;
    premium = true;
  } else if (user.role === "user") {
    const sub = await db
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.userId, user.id),
          eq(subscriptionsTable.status, "active"),
          gt(subscriptionsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    premium = sub.length > 0;
    // Founding members (first 1000 customers) are treated as premium even
    // without an active subscription.
    if (!premium && (await isFoundingMember(user.id))) {
      premium = true;
    }
    eligible = premium;
  } else if (user.role === "vendor") {
    const v = await db
      .select({ status: vendorsTable.status })
      .from(vendorsTable)
      .where(eq(vendorsTable.userId, user.id))
      .limit(1);
    eligible = v[0]?.status === "approved";
  } else if (user.role === "organizer") {
    const o = await db
      .select({ verified: organizersTable.verified, status: organizersTable.status })
      .from(organizersTable)
      .where(eq(organizersTable.userId, user.id))
      .limit(1);
    eligible = !!o[0] && (o[0].verified || o[0].status === "approved");
  } else if (user.role === "game_organizer") {
    const g = await db
      .select({ verified: gameOrganizersTable.verified, status: gameOrganizersTable.status })
      .from(gameOrganizersTable)
      .where(eq(gameOrganizersTable.userId, user.id))
      .limit(1);
    eligible = !!g[0] && (g[0].verified || g[0].status === "approved");
  }

  // Admins moderate Solo Connect and never go through identity verification —
  // they're treated as already approved.
  let verificationStatus: SoloAccess["verificationStatus"];
  let banned = false;
  let suspendedUntil: string | null = null;
  if (user.role === "admin") {
    verificationStatus = "approved";
  } else {
    const verRows = await db
      .select({
        status: soloConnectVerificationsTable.status,
        banned: soloConnectVerificationsTable.banned,
        suspendedUntil: soloConnectVerificationsTable.suspendedUntil,
      })
      .from(soloConnectVerificationsTable)
      .where(eq(soloConnectVerificationsTable.userId, user.id))
      .orderBy(desc(soloConnectVerificationsTable.id))
      .limit(1);
    verificationStatus = (verRows[0]?.status ?? "none") as SoloAccess["verificationStatus"];
    banned = verRows[0]?.banned ?? false;
    const su = verRows[0]?.suspendedUntil ?? null;
    suspendedUntil = su && su.getTime() > Date.now() ? su.toISOString() : null;
  }

  return {
    eligible,
    reason: eligible ? "ok" : "not_premium",
    premium,
    verificationStatus,
    gender: user.gender,
    banned,
    suspendedUntil,
  };
}
