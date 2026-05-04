import { Router, type IRouter } from "express";
import {
  db,
  vendorsTable,
  vendorBankingDetailsTable,
  settlementRequestsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const BankingDetailsBody = z.object({
  accountHolderName: z.string().min(1, "Account holder name is required").max(255),
  bankName: z.string().min(1, "Bank name is required").max(255),
  accountNumber: z.string().min(5, "Account number is required").max(50),
  ifscCode: z.string().regex(/^[A-Z0-9]{11}$/, "IFSC code must be 11 alphanumeric characters"),
});

const SettlementRequestBody = z.object({
  amount: z.number().positive("Amount must be positive").max(10000000, "Amount too large"),
});

async function getVendorForUser(userId: number) {
  const [vendor] = await db
    .select({ id: vendorsTable.id, userId: vendorsTable.userId })
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, userId))
    .limit(1);
  return vendor ?? null;
}

router.get("/partner/banking-details", requireAuth(["vendor"]), async (req, res) => {
  const userId = req.user!.id;
  const vendor = await getVendorForUser(userId);
  if (!vendor) {
    res.status(404).json({ error: "No vendor profile found" });
    return;
  }
  const [row] = await db
    .select()
    .from(vendorBankingDetailsTable)
    .where(eq(vendorBankingDetailsTable.vendorId, vendor.id))
    .limit(1);
  res.json(row ?? null);
});

router.put("/partner/banking-details", requireAuth(["vendor"]), async (req, res) => {
  const userId = req.user!.id;
  const vendor = await getVendorForUser(userId);
  if (!vendor) {
    res.status(404).json({ error: "No vendor profile found" });
    return;
  }
  const parsed = BankingDetailsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { accountHolderName, bankName, accountNumber, ifscCode } = parsed.data;
  const [existing] = await db
    .select({ id: vendorBankingDetailsTable.id })
    .from(vendorBankingDetailsTable)
    .where(eq(vendorBankingDetailsTable.vendorId, vendor.id))
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(vendorBankingDetailsTable)
      .set({ accountHolderName, bankName, accountNumber, ifscCode, updatedAt: new Date() })
      .where(eq(vendorBankingDetailsTable.vendorId, vendor.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(vendorBankingDetailsTable)
      .values({ vendorId: vendor.id, accountHolderName, bankName, accountNumber, ifscCode })
      .returning();
    res.json(created);
  }
});

router.get("/partner/settlement/requests", requireAuth(["vendor"]), async (req, res) => {
  const userId = req.user!.id;
  const vendor = await getVendorForUser(userId);
  if (!vendor) {
    res.status(404).json({ error: "No vendor profile found" });
    return;
  }
  const requests = await db
    .select()
    .from(settlementRequestsTable)
    .where(eq(settlementRequestsTable.vendorId, vendor.id))
    .orderBy(desc(settlementRequestsTable.requestedAt));
  res.json(requests);
});

router.post("/partner/settlement/request", requireAuth(["vendor"]), async (req, res) => {
  const userId = req.user!.id;
  const vendor = await getVendorForUser(userId);
  if (!vendor) {
    res.status(404).json({ error: "No vendor profile found" });
    return;
  }
  const bankDetails = await db
    .select({ id: vendorBankingDetailsTable.id })
    .from(vendorBankingDetailsTable)
    .where(eq(vendorBankingDetailsTable.vendorId, vendor.id))
    .limit(1);
  if (!bankDetails.length) {
    res.status(400).json({ error: "Please save your banking details before requesting a settlement" });
    return;
  }
  const parsed = SettlementRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const [created] = await db
    .insert(settlementRequestsTable)
    .values({ vendorId: vendor.id, amount: String(parsed.data.amount) })
    .returning();
  res.json(created);
});

router.get("/admin/settlement-requests", requireAuth(["admin"]), async (req, res) => {
  const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : null;
  const rows = await db
    .select({
      id: settlementRequestsTable.id,
      vendorId: settlementRequestsTable.vendorId,
      amount: settlementRequestsTable.amount,
      status: settlementRequestsTable.status,
      adminNote: settlementRequestsTable.adminNote,
      requestedAt: settlementRequestsTable.requestedAt,
      processedAt: settlementRequestsTable.processedAt,
      businessName: vendorsTable.businessName,
      city: vendorsTable.city,
    })
    .from(settlementRequestsTable)
    .leftJoin(vendorsTable, eq(settlementRequestsTable.vendorId, vendorsTable.id))
    .orderBy(desc(settlementRequestsTable.requestedAt));

  const filtered = statusFilter
    ? rows.filter((r) => r.status === statusFilter)
    : rows;

  const vendorIds = [...new Set(filtered.map((r) => r.vendorId))];
  let bankMap: Record<number, { id: number; vendorId: number; accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string }> = {};
  if (vendorIds.length > 0) {
    const bankRows = await db
      .select()
      .from(vendorBankingDetailsTable)
      .where(
        vendorIds.length === 1
          ? eq(vendorBankingDetailsTable.vendorId, vendorIds[0]!)
          : inArray(vendorBankingDetailsTable.vendorId, vendorIds),
      );
    for (const b of bankRows) {
      bankMap[b.vendorId] = { id: b.id, vendorId: b.vendorId, accountHolderName: b.accountHolderName, bankName: b.bankName, accountNumber: b.accountNumber, ifscCode: b.ifscCode };
    }
  }

  const result = filtered.map((r) => ({
    ...r,
    bankingDetails: bankMap[r.vendorId] ?? null,
  }));

  res.json(result);
});

router.post("/admin/settlement-requests/:id/approve", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [sr] = await db
    .select({ id: settlementRequestsTable.id, vendorId: settlementRequestsTable.vendorId, status: settlementRequestsTable.status, amount: settlementRequestsTable.amount })
    .from(settlementRequestsTable)
    .where(eq(settlementRequestsTable.id, id))
    .limit(1);
  if (!sr) {
    res.status(404).json({ error: "Settlement request not found" });
    return;
  }
  if (sr.status !== "pending") {
    res.status(409).json({ error: "Request has already been processed" });
    return;
  }
  const [updated] = await db
    .update(settlementRequestsTable)
    .set({ status: "approved", processedAt: new Date() })
    .where(eq(settlementRequestsTable.id, id))
    .returning();

  const [vendor] = await db
    .select({ userId: vendorsTable.userId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, sr.vendorId))
    .limit(1);
  if (vendor) {
    await db.insert(notificationsTable).values({
      userId: vendor.userId,
      title: "Settlement Approved",
      message: `Your settlement request of ₹${Number(sr.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} has been approved. Processing will take up to 24 hours.`,
    });
  }
  res.json(updated);
});

router.post("/admin/settlement-requests/:id/reject", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const note = typeof body["note"] === "string" ? body["note"].trim() : "";

  const [sr] = await db
    .select({ id: settlementRequestsTable.id, vendorId: settlementRequestsTable.vendorId, status: settlementRequestsTable.status, amount: settlementRequestsTable.amount })
    .from(settlementRequestsTable)
    .where(eq(settlementRequestsTable.id, id))
    .limit(1);
  if (!sr) {
    res.status(404).json({ error: "Settlement request not found" });
    return;
  }
  if (sr.status !== "pending") {
    res.status(409).json({ error: "Request has already been processed" });
    return;
  }
  const [updated] = await db
    .update(settlementRequestsTable)
    .set({ status: "rejected", adminNote: note, processedAt: new Date() })
    .where(eq(settlementRequestsTable.id, id))
    .returning();

  const [vendor] = await db
    .select({ userId: vendorsTable.userId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, sr.vendorId))
    .limit(1);
  if (vendor) {
    await db.insert(notificationsTable).values({
      userId: vendor.userId,
      title: "Settlement Request Rejected",
      message: note
        ? `Your settlement request has been rejected. Reason: ${note}`
        : "Your settlement request has been rejected. Please contact support for more information.",
    });
  }
  res.json(updated);
});

export default router;
