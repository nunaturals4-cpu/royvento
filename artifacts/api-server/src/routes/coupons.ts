import { Router, type IRouter } from "express";
import { db, couponsTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";

const router: IRouter = Router();

function genCode(prefix = "RV"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

router.get("/coupons/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const rows = await db
    .select()
    .from(couponsTable)
    .where(
      and(eq(couponsTable.userId, user.id), eq(couponsTable.used, false)),
    )
    .orderBy(desc(couponsTable.createdAt));
  return res.json(rows);
});

router.post("/coupons/validate", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const parsed = z.object({ code: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const rows = await db
    .select()
    .from(couponsTable)
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
      return res.status(400).json({ error: "Invalid input" });
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

router.get("/admin/coupons", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(couponsTable)
    .orderBy(desc(couponsTable.createdAt));
  return res.json(rows);
});

export default router;
