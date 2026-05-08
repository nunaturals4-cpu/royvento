import { Router, type IRouter } from "express";
import { db, availabilityTable, vendorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { SetAvailabilityBody } from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { respondInvalid } from "../lib/validationError";

const router: IRouter = Router();

interface AvailabilityRow {
  id: number;
  vendorId: number;
  date: string;
  status: string;
}

function serialize(a: AvailabilityRow) {
  return {
    id: a.id,
    vendorId: a.vendorId,
    date: a.date,
    status: a.status,
  };
}

router.get("/availability/vendor/:vendorId", async (req, res) => {
  const id = Number(req.params["vendorId"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(availabilityTable)
    .where(eq(availabilityTable.vendorId, id));
  res.json(rows.map(serialize));
});

router.post("/availability", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = SetAvailabilityBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const vRows = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, user.id))
    .limit(1);
  const vendor = vRows[0];
  if (!vendor) {
    res.status(400).json({ error: "Vendor profile required" });
    return;
  }
  const rawDate = parsed.data.date as unknown;
  const dateStr =
    rawDate instanceof Date
      ? rawDate.toISOString().slice(0, 10)
      : String(rawDate).slice(0, 10);
  const [a] = await db
    .insert(availabilityTable)
    .values({
      vendorId: vendor.id,
      date: dateStr,
      status: parsed.data.status,
    })
    .onConflictDoUpdate({
      target: [availabilityTable.vendorId, availabilityTable.date],
      set: { status: parsed.data.status },
    })
    .returning();
  if (!a) {
    res.status(500).json({ error: "Failed" });
    return;
  }
  res.json(serialize(a));
});

router.delete(
  "/availability/:availabilityId",
  requireAuth(["vendor"]),
  async (req, res) => {
    const id = Number(req.params["availabilityId"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const user = await loadUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const vRows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.userId, user.id))
      .limit(1);
    const vendor = vRows[0];
    if (!vendor) {
      res.json({ ok: true });
      return;
    }
    await db
      .delete(availabilityTable)
      .where(
        and(
          eq(availabilityTable.id, id),
          eq(availabilityTable.vendorId, vendor.id),
        ),
      );
    res.json({ ok: true });
  },
);

export default router;
