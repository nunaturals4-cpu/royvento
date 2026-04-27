import { Router, type IRouter } from "express";
import {
  db,
  vendorRequestsTable,
  usersTable,
  vendorsTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";

const router: IRouter = Router();

const CreateBody = z.object({
  businessName: z.string().min(1).max(255),
  category: z.string().min(1).max(100),
  message: z.string().max(2000).optional().default(""),
});

async function joinUser(rows: { userId: number }[]) {
  if (rows.length === 0) return new Map<number, { name: string; email: string; phone: string }>();
  const ids = Array.from(new Set(rows.map((r) => r.userId)));
  const users = await db.select().from(usersTable);
  const map = new Map<number, { name: string; email: string; phone: string }>();
  for (const u of users) {
    if (ids.includes(u.id)) map.set(u.id, { name: u.name, email: u.email, phone: u.phone });
  }
  return map;
}

router.post("/vendor-requests", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "user") {
    res.status(400).json({ error: "Only standard users can request vendor access" });
    return;
  }
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const existing = await db
    .select()
    .from(vendorRequestsTable)
    .where(
      and(
        eq(vendorRequestsTable.userId, user.id),
        eq(vendorRequestsTable.status, "pending"),
      ),
    )
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "You already have a pending request" });
    return;
  }
  const [created] = await db
    .insert(vendorRequestsTable)
    .values({
      userId: user.id,
      businessName: parsed.data.businessName,
      category: parsed.data.category,
      message: parsed.data.message ?? "",
      status: "pending",
    })
    .returning();
  res.json(created);
});

router.get("/vendor-requests/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(vendorRequestsTable)
    .where(eq(vendorRequestsTable.userId, user.id))
    .orderBy(desc(vendorRequestsTable.createdAt))
    .limit(1);
  res.json({ request: rows[0] ?? null });
});

router.get("/admin/vendor-requests", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(vendorRequestsTable)
    .orderBy(desc(vendorRequestsTable.createdAt));
  const userMap = await joinUser(rows);
  res.json(
    rows.map((r) => ({
      ...r,
      user: userMap.get(r.userId) ?? { name: "", email: "", phone: "" },
    })),
  );
});

router.post(
  "/admin/vendor-requests/:id/approve",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const rows = await db
      .select()
      .from(vendorRequestsTable)
      .where(eq(vendorRequestsTable.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .update(vendorRequestsTable)
      .set({ status: "approved" })
      .where(eq(vendorRequestsTable.id, id));
    // Promote the user to vendor role
    await db
      .update(usersTable)
      .set({ role: "vendor" })
      .where(eq(usersTable.id, r.userId));
    // Auto-create the vendor profile if it doesn't already exist
    const existing = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.userId, r.userId))
      .limit(1);
    if (!existing[0]) {
      await db.insert(vendorsTable).values({
        userId: r.userId,
        businessName: r.businessName,
        category: r.category,
        description: "",
        location: "",
        status: "approved",
      });
    }
    res.json({ ok: true });
  },
);

router.post(
  "/admin/vendor-requests/:id/reject",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db
      .update(vendorRequestsTable)
      .set({ status: "rejected" })
      .where(eq(vendorRequestsTable.id, id));
    res.json({ ok: true });
  },
);

export default router;
