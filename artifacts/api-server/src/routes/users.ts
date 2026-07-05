import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable, bookingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { UpdateUserRoleBody } from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest, userToPublic, type Role } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";

const router: IRouter = Router();

const UpdateMeBody = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).optional(),
  about: z.string().max(2000).optional(),
  profileImage: z.string().max(2048).optional(),
});

router.patch("/users/me", requireAuth(), async (req, res) => {
  const me = await loadUserFromRequest(req);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const patch: Record<string, string> = {};
  if (parsed.data.name !== undefined) patch["name"] = parsed.data.name;
  if (parsed.data.phone !== undefined) patch["phone"] = parsed.data.phone;
  if (parsed.data.about !== undefined) patch["about"] = parsed.data.about;
  if (parsed.data.profileImage !== undefined) patch["profileImage"] = parsed.data.profileImage;
  if (Object.keys(patch).length === 0) {
    res.json(userToPublic(me as never));
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set(patch)
    .where(eq(usersTable.id, me.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(userToPublic(updated));
});

// ── Save / update the current user's location ────────────────────────────────
// Called by the web/mobile client right after login (and whenever the browser
// reports a fresh position). We keep the LATEST location only, stamping
// location_updated_at, so nearby-offer notifications always use the most recent
// position. Idempotent last-write-wins; a tiny jitter below ~50 m is ignored so
// we don't thrash the row on every GPS tick.
const SaveLocationBody = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.post("/users/me/location", requireAuth(), async (req, res) => {
  const me = await loadUserFromRequest(req);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = SaveLocationBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const { lat, lng } = parsed.data;

  // Skip a no-op write when the position barely moved (~4 decimals ≈ 11 m).
  const [cur] = await db
    .select({ lat: usersTable.latitude, lng: usersTable.longitude })
    .from(usersTable)
    .where(eq(usersTable.id, me.id))
    .limit(1);
  const prevLat = cur?.lat != null ? Number(cur.lat) : null;
  const prevLng = cur?.lng != null ? Number(cur.lng) : null;
  const unchanged =
    prevLat != null &&
    prevLng != null &&
    Math.abs(prevLat - lat) < 0.0005 &&
    Math.abs(prevLng - lng) < 0.0005;
  if (unchanged) {
    res.json({ ok: true, updated: false });
    return;
  }

  await db
    .update(usersTable)
    .set({
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
      locationUpdatedAt: new Date(),
    })
    .where(eq(usersTable.id, me.id));
  res.json({ ok: true, updated: true });
});

router.get("/users", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));
  res.json(rows.map(userToPublic));
});

router.patch(
  "/users/:userId/role",
  requireAuth(["admin"]),
  async (req, res) => {
    const userId = Number(req.params["userId"]);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }
    const parsed = UpdateUserRoleBody.safeParse(req.body);
    if (!parsed.success) {
      respondInvalid(res, parsed.error);
      return;
    }
    const role: Role = parsed.data.role as Role;
    const [updated] = await db
      .update(usersTable)
      .set({ role })
      .where(eq(usersTable.id, userId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(userToPublic(updated));
  },
);

router.get("/users/me/points-history", requireAuth(), async (req, res) => {
  const me = await loadUserFromRequest(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [earned, spent] = await Promise.all([
    db
      .select({
        id: referralsTable.id,
        points: referralsTable.pointsAwarded,
        createdAt: referralsTable.completedAt,
      })
      .from(referralsTable)
      .where(eq(referralsTable.referrerId, me.id))
      .orderBy(desc(referralsTable.completedAt)),
    db
      .select({
        id: bookingsTable.id,
        points: bookingsTable.pointsUsed,
        createdAt: bookingsTable.createdAt,
      })
      .from(bookingsTable)
      .where(eq(bookingsTable.userId, me.id))
      .orderBy(desc(bookingsTable.createdAt)),
  ]);

  type HistoryEntry = {
    key: string;
    type: "earned" | "spent";
    points: number;
    label: string;
    date: string;
  };

  const history: HistoryEntry[] = [
    ...earned
      .filter((r) => r.points > 0 && r.createdAt)
      .map((r) => ({
        key: `earned-${r.id}`,
        type: "earned" as const,
        points: r.points,
        label: "Referral bonus",
        date: r.createdAt!.toISOString(),
      })),
    ...spent
      .filter((r) => r.points > 0)
      .map((r) => ({
        key: `spent-${r.id}`,
        type: "spent" as const,
        points: r.points,
        label: `Booking #${r.id}`,
        date: r.createdAt.toISOString(),
      })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json({ balance: me.points, history });
});

router.delete("/users/:userId", requireAuth(["admin"]), async (req, res) => {
  const userId = Number(req.params["userId"]);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

export default router;
