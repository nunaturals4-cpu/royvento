import {
  db,
  subscriptionsTable,
  vendorsTable,
  organizersTable,
  gameOrganizersTable,
  soloConnectVerificationsTable,
} from "@workspace/db";
import { eq, and, gt, desc } from "drizzle-orm";
import type { AuthUser } from "./auth";

export interface SoloAccess {
  eligible: boolean;
  // Why the caller is (not) eligible — surfaced to drive the UI gate.
  reason: "ok" | "not_premium";
  premium: boolean;
  // null when the user has never started verification.
  verificationStatus: "none" | "pending" | "approved" | "rejected";
  gender: string | null;
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
  if (user.role === "admin") {
    verificationStatus = "approved";
  } else {
    const verRows = await db
      .select({ status: soloConnectVerificationsTable.status })
      .from(soloConnectVerificationsTable)
      .where(eq(soloConnectVerificationsTable.userId, user.id))
      .orderBy(desc(soloConnectVerificationsTable.id))
      .limit(1);
    verificationStatus = (verRows[0]?.status ?? "none") as SoloAccess["verificationStatus"];
  }

  return {
    eligible,
    reason: eligible ? "ok" : "not_premium",
    premium,
    verificationStatus,
    gender: user.gender,
  };
}
