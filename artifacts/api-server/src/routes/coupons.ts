import { Router, type IRouter } from "express";
import { db, couponsTable, usersTable, vendorsTable, vendorCouponsTable, followsTable } from "@workspace/db";
import { eq, desc, and, isNull, or, gt } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";
import { randomInt } from "crypto";

const router: IRouter = Router();

// Unambiguous alphabet (no 0/O/1/I) drawn from a CSPRNG so discount codes can't
// be predicted from prior values (Math.random is not cryptographically secure).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

function genCode(prefix = "RV"): string {
  return `${prefix}-${randomCode(6)}`;
}

/** Generate a random 5-character alphanumeric code (uppercase). */
function genVendorCode(): string {
  return randomCode(5);
}

// Is `userId` following the given vendor? Used to gate follower/non-follower
// coupons. Never throws — a missing follows table degrades to "not following".
async function isFollowingVendor(userId: number, vendorId: number): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: followsTable.id })
      .from(followsTable)
      .where(
        and(
          eq(followsTable.userId, userId),
          eq(followsTable.targetType, "vendor"),
          eq(followsTable.targetId, vendorId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// Given a coupon audience and the viewer's follow status, may they use it?
function audienceAllows(audience: string | null | undefined, following: boolean): boolean {
  if (audience === "followers") return following;
  if (audience === "non_followers") return !following;
  return true; // "all" / legacy
}

// ─── User coupon routes ───────────────────────────────────────────────────────

router.get("/coupons/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const rows = await db
    .select({
      id: couponsTable.id,
      code: couponsTable.code,
      discountPercent: couponsTable.discountPercent,
      used: couponsTable.used,
      source: couponsTable.source,
      vendorId: couponsTable.vendorId,
      createdAt: couponsTable.createdAt,
      vendorName: vendorsTable.businessName,
    })
    .from(couponsTable)
    .leftJoin(vendorsTable, eq(couponsTable.vendorId, vendorsTable.id))
    .where(and(eq(couponsTable.userId, user.id), eq(couponsTable.used, false)))
    .orderBy(desc(couponsTable.createdAt));
  return res.json(rows);
});

router.post("/coupons/validate", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const parsed = z.object({ code: z.string(), vendorId: z.number().int().positive().optional() }).safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const upperCode = parsed.data.code.trim().toUpperCase();

  // 1. Check user-specific coupons first
  const rows = await db
    .select({
      id: couponsTable.id,
      code: couponsTable.code,
      discountPercent: couponsTable.discountPercent,
      vendorId: couponsTable.vendorId,
      vendorName: vendorsTable.businessName,
    })
    .from(couponsTable)
    .leftJoin(vendorsTable, eq(couponsTable.vendorId, vendorsTable.id))
    .where(
      and(
        eq(couponsTable.code, upperCode),
        eq(couponsTable.userId, user.id),
        eq(couponsTable.used, false),
      ),
    )
    .limit(1);
  const coupon = rows[0];
  if (coupon) {
    if (coupon.vendorId !== null && coupon.vendorId !== undefined) {
      if (parsed.data.vendorId && coupon.vendorId !== parsed.data.vendorId) {
        return res.status(400).json({
          error: `This code is only valid for ${coupon.vendorName ?? "another pub"}. It cannot be used here.`,
        });
      }
      return res.json({ valid: true, discountPercent: coupon.discountPercent, vendorId: coupon.vendorId, vendorName: coupon.vendorName });
    }
    return res.json({ valid: true, discountPercent: coupon.discountPercent });
  }

  // 2. Check vendor public coupons
  const vcRows = await db
    .select({
      id: vendorCouponsTable.id,
      code: vendorCouponsTable.code,
      discountType: vendorCouponsTable.discountType,
      discountValue: vendorCouponsTable.discountValue,
      applicableTo: vendorCouponsTable.applicableTo,
      audience: vendorCouponsTable.audience,
      vendorId: vendorCouponsTable.vendorId,
      maxUses: vendorCouponsTable.maxUses,
      usedCount: vendorCouponsTable.usedCount,
      expiresAt: vendorCouponsTable.expiresAt,
      vendorName: vendorsTable.businessName,
    })
    .from(vendorCouponsTable)
    .leftJoin(vendorsTable, eq(vendorCouponsTable.vendorId, vendorsTable.id))
    .where(
      and(
        eq(vendorCouponsTable.code, upperCode),
        eq(vendorCouponsTable.active, true),
      ),
    )
    .limit(1);
  const vc = vcRows[0];
  if (!vc) return res.status(404).json({ error: "Invalid or used coupon" });

  // Max-uses guard
  if (vc.maxUses !== null && vc.usedCount >= vc.maxUses) {
    return res.status(400).json({ error: "This coupon has reached its usage limit." });
  }
  // Expiry guard
  if (vc.expiresAt && new Date(vc.expiresAt) < new Date()) {
    return res.status(400).json({ error: "This coupon has expired." });
  }
  // Follower-audience guard — prevent a non-follower from using a followers-only
  // code they obtained out of band (and vice-versa).
  if (vc.audience === "followers" || vc.audience === "non_followers") {
    const following = await isFollowingVendor(user.id, vc.vendorId);
    if (!audienceAllows(vc.audience, following)) {
      return res.status(400).json({
        error: vc.audience === "followers"
          ? `Follow ${vc.vendorName ?? "this venue"} to unlock this coupon.`
          : "This coupon is only available to users who don't follow this venue.",
      });
    }
  }
  // Vendor-lock guard
  if (parsed.data.vendorId && vc.vendorId !== parsed.data.vendorId) {
    return res.status(400).json({
      error: `This code is only valid for ${vc.vendorName ?? "another pub"}. It cannot be used here.`,
    });
  }

  return res.json({
    valid: true,
    discountType: vc.discountType,
    discountValue: Number(vc.discountValue),
    applicableTo: vc.applicableTo,
    vendorId: vc.vendorId,
    vendorName: vc.vendorName,
    isVendorCoupon: true,
  });
});

// ─── Partner coupon management ────────────────────────────────────────────────

const VendorCouponBody = z.object({
  code: z.string().min(3).max(10).transform((v) => v.trim().toUpperCase()).optional(),
  discountType: z.enum(["percent", "fixed"]).default("percent"),
  discountValue: z.number().positive().max(100000),
  applicableTo: z.enum(["ticket", "event", "event_booking", "cover_charge", "both"]).default("both"),
  audience: z.enum(["all", "followers", "non_followers"]).default("all"),
  active: z.boolean().default(true),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

router.get("/partner/coupons", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vRows = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  if (!vRows[0]) return res.status(403).json({ error: "No partner profile found." });
  const rows = await db
    .select()
    .from(vendorCouponsTable)
    .where(eq(vendorCouponsTable.vendorId, vRows[0].id))
    .orderBy(desc(vendorCouponsTable.createdAt));
  return res.json(rows);
});

router.post("/partner/coupons", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const vRows = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  if (!vRows[0]) return res.status(403).json({ error: "No partner profile found." });

  const parsed = VendorCouponBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);

  // Generate a unique 5-char code if not provided
  let code = parsed.data.code ?? genVendorCode();
  // Collision-retry up to 5 times
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.select({ id: vendorCouponsTable.id }).from(vendorCouponsTable).where(eq(vendorCouponsTable.code, code)).limit(1);
    if (!existing[0]) break;
    code = genVendorCode();
  }

  // Follower / non-follower coupons are non-expiring by design.
  const expiresAt = parsed.data.audience === "all"
    ? (parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null)
    : null;

  const [created] = await db
    .insert(vendorCouponsTable)
    .values({
      vendorId: vRows[0].id,
      code,
      discountType: parsed.data.discountType,
      discountValue: String(parsed.data.discountValue),
      applicableTo: parsed.data.applicableTo,
      audience: parsed.data.audience,
      active: parsed.data.active,
      maxUses: parsed.data.maxUses ?? null,
      expiresAt,
    })
    .returning();
  return res.status(201).json(created);
});

router.patch("/partner/coupons/:id", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

  const vRows = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  if (!vRows[0]) return res.status(403).json({ error: "No partner profile found." });

  const existing = await db.select().from(vendorCouponsTable).where(and(eq(vendorCouponsTable.id, id), eq(vendorCouponsTable.vendorId, vRows[0].id))).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Coupon not found." });

  const UpdateBody = VendorCouponBody.partial();
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);

  // Follower / non-follower coupons are non-expiring: force expiry null whenever
  // the effective audience is targeted.
  const effectiveAudience = parsed.data.audience ?? existing[0].audience;
  const expiryUpdate = effectiveAudience !== "all"
    ? { expiresAt: null }
    : (parsed.data.expiresAt !== undefined ? { expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null } : {});

  const [updated] = await db
    .update(vendorCouponsTable)
    .set({
      ...(parsed.data.discountType !== undefined && { discountType: parsed.data.discountType }),
      ...(parsed.data.discountValue !== undefined && { discountValue: String(parsed.data.discountValue) }),
      ...(parsed.data.applicableTo !== undefined && { applicableTo: parsed.data.applicableTo }),
      ...(parsed.data.audience !== undefined && { audience: parsed.data.audience }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
      ...(parsed.data.maxUses !== undefined && { maxUses: parsed.data.maxUses }),
      ...expiryUpdate,
    })
    .where(and(eq(vendorCouponsTable.id, id), eq(vendorCouponsTable.vendorId, vRows[0].id)))
    .returning();
  return res.json(updated);
});

router.delete("/partner/coupons/:id", requireAuth(["vendor", "admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

  const vRows = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  if (!vRows[0]) return res.status(403).json({ error: "No partner profile found." });

  const [deleted] = await db
    .delete(vendorCouponsTable)
    .where(and(eq(vendorCouponsTable.id, id), eq(vendorCouponsTable.vendorId, vRows[0].id)))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Coupon not found." });
  return res.json({ ok: true });
});

// Public: list active vendor coupons for a vendor (for display on booking page).
// Auth is optional — the viewer's follow status decides which follower-gated
// coupons are shown. Logged-out visitors count as non-followers.
router.get("/vendor-coupons/vendor/:vendorId", async (req, res) => {
  const vendorId = Number(req.params["vendorId"]);
  if (!Number.isFinite(vendorId)) return res.status(400).json({ error: "Invalid vendorId" });
  const now = new Date();

  const me = await loadUserFromRequest(req).catch(() => null);
  const following = me ? await isFollowingVendor(me.id, vendorId) : false;

  const rows = await db
    .select({
      id: vendorCouponsTable.id,
      code: vendorCouponsTable.code,
      discountType: vendorCouponsTable.discountType,
      discountValue: vendorCouponsTable.discountValue,
      applicableTo: vendorCouponsTable.applicableTo,
      audience: vendorCouponsTable.audience,
      maxUses: vendorCouponsTable.maxUses,
      usedCount: vendorCouponsTable.usedCount,
      expiresAt: vendorCouponsTable.expiresAt,
    })
    .from(vendorCouponsTable)
    .where(
      and(
        eq(vendorCouponsTable.vendorId, vendorId),
        eq(vendorCouponsTable.active, true),
      ),
    )
    .orderBy(desc(vendorCouponsTable.createdAt));
  // Filter out expired / maxed-out coupons and any the viewer isn't eligible for
  // based on their follow status.
  const available = rows.filter((c) => {
    if (c.expiresAt && new Date(c.expiresAt) < now) return false;
    if (c.maxUses !== null && c.usedCount >= c.maxUses) return false;
    if (!audienceAllows(c.audience, following)) return false;
    return true;
  });
  return res.json(available);
});

// ─── Admin coupon routes ──────────────────────────────────────────────────────

const AdminGrantBody = z.object({
  userId: z.number().int().positive(),
  discountPercent: z.number().int().min(1).max(100).default(10),
});

router.post(
  "/admin/coupons/grant",
  requireAuth(["admin"]),
  async (req, res) => {
    const parsed = AdminGrantBody.safeParse(req.body);
    if (!parsed.success)
      return respondInvalid(res, parsed.error);
    const userExists = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.userId))
      .limit(1);
    if (!userExists[0])
      return res.status(404).json({ error: "User not found" });
    const [c] = await db
      .insert(couponsTable)
      .values({
        userId: parsed.data.userId,
        code: genCode("RV"),
        discountPercent: parsed.data.discountPercent,
        source: "admin_grant",
      })
      .returning();
    return res.json(c);
  },
);

// Admin: grant by email (matches web admin usage)
const AdminGrantByEmailBody = z.object({
  email: z.string().email(),
  discountPercent: z.number().int().min(1).max(100).default(10),
});

router.post("/admin/coupons", requireAuth(["admin"]), async (req, res) => {
  const parsed = AdminGrantByEmailBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const userRows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email.trim().toLowerCase()))
    .limit(1);
  if (!userRows[0]) return res.status(404).json({ error: "User not found" });
  const [c] = await db
    .insert(couponsTable)
    .values({
      userId: userRows[0].id,
      code: genCode("RV"),
      discountPercent: parsed.data.discountPercent,
      source: "admin_grant",
    })
    .returning();
  return res.json(c);
});

router.get("/admin/coupons", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(couponsTable)
    .orderBy(desc(couponsTable.createdAt));
  return res.json(rows);
});

// Admin: deactivate (invalidate) a coupon
router.patch("/admin/coupons/:id/deactivate", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const [c] = await db
    .update(couponsTable)
    .set({ used: true })
    .where(eq(couponsTable.id, id))
    .returning();
  if (!c) return res.status(404).json({ error: "Not found" });
  return res.json(c);
});

// ─── Admin vendor-coupon routes (pub-level coupons created by admin) ──────────

const AdminVendorCouponBody = z.object({
  vendorId: z.number().int().positive(),
  code: z.string().min(3).max(10).transform((v) => v.trim().toUpperCase()).optional(),
  discountType: z.enum(["percent", "fixed"]).default("percent"),
  discountValue: z.number().positive().max(100000),
  applicableTo: z.enum(["ticket", "event", "event_booking", "cover_charge", "both"]).default("both"),
  audience: z.enum(["all", "followers", "non_followers"]).default("all"),
  active: z.boolean().default(true),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

router.post("/admin/vendor-coupons", requireAuth(["admin"]), async (req, res) => {
  const parsed = AdminVendorCouponBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);

  const vRow = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.id, parsed.data.vendorId)).limit(1);
  if (!vRow[0]) return res.status(404).json({ error: "Vendor not found" });

  let code = parsed.data.code ?? genVendorCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.select({ id: vendorCouponsTable.id }).from(vendorCouponsTable).where(eq(vendorCouponsTable.code, code)).limit(1);
    if (!existing[0]) break;
    code = genVendorCode();
  }

  const expiresAt = parsed.data.audience === "all"
    ? (parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null)
    : null;

  const [created] = await db
    .insert(vendorCouponsTable)
    .values({
      vendorId: parsed.data.vendorId,
      code,
      discountType: parsed.data.discountType,
      discountValue: String(parsed.data.discountValue),
      applicableTo: parsed.data.applicableTo,
      audience: parsed.data.audience,
      active: parsed.data.active,
      maxUses: parsed.data.maxUses ?? null,
      expiresAt,
    })
    .returning();
  return res.status(201).json(created);
});

router.get("/admin/vendor-coupons", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select({
      id: vendorCouponsTable.id,
      vendorId: vendorCouponsTable.vendorId,
      code: vendorCouponsTable.code,
      discountType: vendorCouponsTable.discountType,
      discountValue: vendorCouponsTable.discountValue,
      applicableTo: vendorCouponsTable.applicableTo,
      audience: vendorCouponsTable.audience,
      active: vendorCouponsTable.active,
      maxUses: vendorCouponsTable.maxUses,
      usedCount: vendorCouponsTable.usedCount,
      expiresAt: vendorCouponsTable.expiresAt,
      createdAt: vendorCouponsTable.createdAt,
      vendorName: vendorsTable.businessName,
    })
    .from(vendorCouponsTable)
    .leftJoin(vendorsTable, eq(vendorCouponsTable.vendorId, vendorsTable.id))
    .orderBy(desc(vendorCouponsTable.createdAt));
  return res.json(rows);
});

router.patch("/admin/vendor-coupons/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = VendorCouponBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);

  const existing = await db.select({ id: vendorCouponsTable.id, audience: vendorCouponsTable.audience }).from(vendorCouponsTable).where(eq(vendorCouponsTable.id, id)).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Coupon not found." });

  const effectiveAudience = parsed.data.audience ?? existing[0].audience;
  const expiryUpdate = effectiveAudience !== "all"
    ? { expiresAt: null }
    : (parsed.data.expiresAt !== undefined ? { expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null } : {});

  const [updated] = await db
    .update(vendorCouponsTable)
    .set({
      ...(parsed.data.discountType !== undefined && { discountType: parsed.data.discountType }),
      ...(parsed.data.discountValue !== undefined && { discountValue: String(parsed.data.discountValue) }),
      ...(parsed.data.applicableTo !== undefined && { applicableTo: parsed.data.applicableTo }),
      ...(parsed.data.audience !== undefined && { audience: parsed.data.audience }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
      ...(parsed.data.maxUses !== undefined && { maxUses: parsed.data.maxUses }),
      ...expiryUpdate,
    })
    .where(eq(vendorCouponsTable.id, id))
    .returning();
  return res.json(updated);
});

router.delete("/admin/vendor-coupons/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const [deleted] = await db.delete(vendorCouponsTable).where(eq(vendorCouponsTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

export default router;
