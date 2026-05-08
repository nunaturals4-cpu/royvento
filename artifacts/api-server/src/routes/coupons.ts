import { Router, type IRouter } from "express";
import { db, couponsTable, usersTable, vendorsTable } from "@workspace/db";
import { eq, desc, and, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";

const router: IRouter = Router();

function genCode(prefix = "RV"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

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
        eq(couponsTable.code, parsed.data.code.trim().toUpperCase()),
        eq(couponsTable.userId, user.id),
        eq(couponsTable.used, false),
      ),
    )
    .limit(1);
  const coupon = rows[0];
  if (!coupon) return res.status(404).json({ error: "Invalid or used coupon" });
  if (coupon.vendorId !== null && coupon.vendorId !== undefined) {
    if (parsed.data.vendorId && coupon.vendorId !== parsed.data.vendorId) {
      return res.status(400).json({
        error: `This code is only valid for ${coupon.vendorName ?? "another pub"}. It cannot be used here.`,
      });
    }
    return res.json({ valid: true, discountPercent: coupon.discountPercent, vendorId: coupon.vendorId, vendorName: coupon.vendorName });
  }
  return res.json({ valid: true, discountPercent: coupon.discountPercent });
});

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

export default router;
