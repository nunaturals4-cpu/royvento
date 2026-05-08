import { Router, type IRouter } from "express";
import {
  db,
  vendorsTable,
  vendorBankingDetailsTable,
  settlementRequestsTable,
  commissionLedgerTable,
} from "@workspace/db";
import { createUserNotification } from "../lib/notify";
import { eq, desc, inArray, sql, gte, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { RejectSettlementRequestBody, RejectSettlementRequestParams } from "@workspace/api-zod";
import { respondInvalid } from "../lib/validationError";

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
    .select({
      id: vendorsTable.id,
      userId: vendorsTable.userId,
      onlineBalance: vendorsTable.onlineBalance,
      commissionOwed: vendorsTable.commissionOwed,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.userId, userId))
    .limit(1);
  return vendor ?? null;
}

function computePayable(onlineBalance: string | number | null | undefined, commissionOwed: string | number | null | undefined) {
  const ob = Number(onlineBalance ?? 0);
  const owed = Number(commissionOwed ?? 0);
  return Math.max(0, ob - owed);
}



router.get("/partner/banking-details", requireAuth(["vendor"]), async (req, res) => {
  const userId = (req as AuthedRequest).user.id;
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
  const userId = (req as AuthedRequest).user.id;
  const vendor = await getVendorForUser(userId);
  if (!vendor) {
    res.status(404).json({ error: "No vendor profile found" });
    return;
  }
  const parsed = BankingDetailsBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
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

router.get("/partner/settlement/balance", requireAuth(["vendor"]), async (req, res) => {
  const userId = (req as AuthedRequest).user.id;
  const vendor = await getVendorForUser(userId);
  if (!vendor) {
    res.status(404).json({ error: "No vendor profile found" });
    return;
  }
  const onlineBalance = Number(vendor.onlineBalance ?? 0);
  const commissionOwed = Number(vendor.commissionOwed ?? 0);
  res.json({
    onlineBalance,
    commissionOwed,
    payable: computePayable(onlineBalance, commissionOwed),
  });
});

router.get("/partner/settlement/requests", requireAuth(["vendor"]), async (req, res) => {
  const userId = (req as AuthedRequest).user.id;
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
  const userId = (req as AuthedRequest).user.id;
  const vendor = await getVendorForUser(userId);
  if (!vendor) {
    res.status(404).json({ error: "No vendor profile found" });
    return;
  }

  // Fetch full banking details to snapshot — also guards against missing details.
  const [bankDetails] = await db
    .select()
    .from(vendorBankingDetailsTable)
    .where(eq(vendorBankingDetailsTable.vendorId, vendor.id))
    .limit(1);

  if (!bankDetails) {
    res.status(400).json({ error: "Please save your banking details before requesting a settlement" });
    return;
  }

  const parsed = SettlementRequestBody.safeParse(req.body);
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }

  // Payable = onlineBalance − commissionOwed. Vendors cannot withdraw funds
  // that the platform is holding back to cover unpaid COD/free-entry commission.
  const currentBalance = Number(vendor.onlineBalance ?? 0);
  const currentOwed = Number(vendor.commissionOwed ?? 0);
  const payable = computePayable(currentBalance, currentOwed);
  if (parsed.data.amount > payable) {
    res.status(400).json({
      error:
        currentOwed > 0
          ? `Amount exceeds your payable balance of ₹${payable.toLocaleString("en-IN", { minimumFractionDigits: 2 })} (online ₹${currentBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })} − commission owed ₹${currentOwed.toLocaleString("en-IN", { minimumFractionDigits: 2 })})`
          : `Amount exceeds your available online balance of ₹${currentBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    });
    return;
  }

  // Snapshot the banking details at request time so admin always sees the
  // exact details that were on file, even if the partner changes them later.
  const bankingDetailsSnapshot = {
    accountHolderName: bankDetails.accountHolderName,
    bankName: bankDetails.bankName,
    accountNumber: bankDetails.accountNumber,
    ifscCode: bankDetails.ifscCode,
  };

  let created: typeof settlementRequestsTable.$inferSelect | undefined;

  try {
    await db.transaction(async (tx) => {
      // Atomically deduct only the requested amount from onlineBalance,
      // guarded by a SQL check that uses the LIVE commission_owed value (not
      // the pre-tx snapshot) so a concurrent COD/free-entry check-in that
      // increases commission_owed will correctly cause this request to fail.
      // commissionOwed is left in place and is netted out at admin approval
      // time (settlement_offset ledger row).
      const [deducted] = await tx
        .update(vendorsTable)
        .set({ onlineBalance: sql`${vendorsTable.onlineBalance} - ${String(parsed.data.amount)}` })
        .where(
          and(
            eq(vendorsTable.id, vendor.id),
            sql`${vendorsTable.onlineBalance} >= ${vendorsTable.commissionOwed} + ${String(parsed.data.amount)}`,
          ),
        )
        .returning({ id: vendorsTable.id });

      if (!deducted) {
        throw Object.assign(new Error("Insufficient balance"), { code: "INSUFFICIENT_BALANCE" });
      }

      [created] = await tx
        .insert(settlementRequestsTable)
        .values({
          vendorId: vendor.id,
          amount: String(parsed.data.amount),
          bankingDetailsSnapshot,
        })
        .returning();
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "Insufficient balance — another request may have already consumed it." });
      return;
    }
    throw err;
  }

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
      bankingDetailsSnapshot: settlementRequestsTable.bankingDetailsSnapshot,
      businessName: vendorsTable.businessName,
      city: vendorsTable.city,
    })
    .from(settlementRequestsTable)
    .leftJoin(vendorsTable, eq(settlementRequestsTable.vendorId, vendorsTable.id))
    .orderBy(desc(settlementRequestsTable.requestedAt));

  const filtered = statusFilter
    ? rows.filter((r) => r.status === statusFilter)
    : rows;

  // For backward compatibility: rows without a snapshot (created before this migration)
  // fall back to a live lookup of the vendor's current banking details.
  const legacyVendorIds = [
    ...new Set(
      filtered
        .filter((r) => r.bankingDetailsSnapshot == null)
        .map((r) => r.vendorId),
    ),
  ];

  let bankMap: Record<number, { accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string }> = {};
  if (legacyVendorIds.length > 0) {
    const bankRows = await db
      .select()
      .from(vendorBankingDetailsTable)
      .where(
        legacyVendorIds.length === 1
          ? eq(vendorBankingDetailsTable.vendorId, legacyVendorIds[0]!)
          : inArray(vendorBankingDetailsTable.vendorId, legacyVendorIds),
      );
    for (const b of bankRows) {
      bankMap[b.vendorId] = {
        accountHolderName: b.accountHolderName,
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        ifscCode: b.ifscCode,
      };
    }
  }

  const result = filtered.map((r) => ({
    ...r,
    // Prefer the immutable snapshot; fall back to live lookup for legacy rows.
    bankingDetails: r.bankingDetailsSnapshot ?? bankMap[r.vendorId] ?? null,
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

  // Re-validate the payout at approval time using row-locked LIVE values.
  // Between request creation and approval, COD/free check-ins may have
  // increased commissionOwed — we MUST cap the payout so the vendor never
  // receives money the platform now needs to cover newly accrued commission.
  //
  // Conceptually we treat the reserved amount (sr.amount, already deducted at
  // request time) as still belonging to the vendor:
  //   virtual_balance  = current online_balance + sr.amount
  //   virtual_payable  = max(0, virtual_balance - commissionOwed)
  //   final_payout     = min(sr.amount, virtual_payable)   [capped at requested]
  //   offset           = min(commissionOwed, virtual_balance - final_payout)
  //   new_balance      = virtual_balance - final_payout - offset
  //   new_owed         = commissionOwed - offset
  // We refund the unpaid difference (sr.amount - final_payout) to the
  // onlineBalance and persist final_payout + an explanatory adminNote.
  let updated: typeof settlementRequestsTable.$inferSelect | undefined;
  let finalPayoutAmount = Number(sr.amount);
  let cappedNote: string | null = null;
  await db.transaction(async (tx) => {
    const [v] = await tx
      .select({
        id: vendorsTable.id,
        onlineBalance: vendorsTable.onlineBalance,
        commissionOwed: vendorsTable.commissionOwed,
      })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, sr.vendorId))
      .for("update")
      .limit(1);
    if (!v) {
      throw new Error("Vendor not found");
    }
    const requested = Number(sr.amount);
    const liveBalance = Number(v.onlineBalance ?? 0);
    const liveOwed = Number(v.commissionOwed ?? 0);
    const virtualBalance = liveBalance + requested;
    const virtualPayable = Math.max(0, virtualBalance - liveOwed);
    const payout = Math.max(0, Math.min(requested, virtualPayable));
    const offset = Math.max(0, Math.min(liveOwed, virtualBalance - payout));
    finalPayoutAmount = Math.round(payout * 100) / 100;
    const offsetRounded = Math.round(offset * 100) / 100;
    const refundToBalance = Math.round((requested - payout) * 100) / 100;

    // Apply: refund (requested - payout) to onlineBalance, then deduct offset.
    // Net effect on online_balance: + refundToBalance - offsetRounded.
    const balanceDelta = refundToBalance - offsetRounded;
    if (balanceDelta !== 0) {
      await tx
        .update(vendorsTable)
        .set({
          onlineBalance: sql`GREATEST(0, ${vendorsTable.onlineBalance} + ${String(balanceDelta)})`,
        })
        .where(eq(vendorsTable.id, v.id));
    }
    if (offsetRounded > 0) {
      await tx
        .update(vendorsTable)
        .set({
          commissionOwed: sql`GREATEST(0, ${vendorsTable.commissionOwed} - ${String(offsetRounded)})`,
        })
        .where(eq(vendorsTable.id, v.id));
      await tx.insert(commissionLedgerTable).values({
        vendorId: v.id,
        bookingId: null,
        amount: String(offsetRounded),
        bookingType: "settlement_offset",
        trigger: "settlement_offset",
        settlementRequestId: sr.id,
      });
    }

    if (finalPayoutAmount < requested) {
      cappedNote = `Payout capped from ₹${requested.toFixed(2)} to ₹${finalPayoutAmount.toFixed(2)} — commission owed grew to ₹${liveOwed.toFixed(2)} after the request was filed. ₹${refundToBalance.toFixed(2)} refunded to online balance.`;
    }

    [updated] = await tx
      .update(settlementRequestsTable)
      .set({
        status: "approved",
        processedAt: new Date(),
        amount: String(finalPayoutAmount),
        ...(cappedNote ? { adminNote: cappedNote } : {}),
      })
      .where(eq(settlementRequestsTable.id, id))
      .returning();
  });

  const [vendor] = await db
    .select({ userId: vendorsTable.userId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, sr.vendorId))
    .limit(1);
  if (vendor) {
    await createUserNotification({
      userId: vendor.userId,
      title: "Settlement Approved",
      message: cappedNote
        ? `${cappedNote} Processing will take up to 24 hours.`
        : `Your settlement request of ₹${finalPayoutAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} has been approved. Processing will take up to 24 hours.`,
      url: "/dashboard/vendor",
      tag: `settlement-${id}`,
    });
  }
  res.json(updated);
});

router.post("/admin/settlement-requests/:id/reject", requireAuth(["admin"]), async (req, res) => {
  const paramsParsed = RejectSettlementRequestParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const id = paramsParsed.data.id;
  const parsed = RejectSettlementRequestBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    respondInvalid(res, parsed.error);
    return;
  }
  const note = parsed.data.note?.trim() ?? "";

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
  // Refund the deducted amount back to the vendor's onlineBalance so they can
  // request again. commissionOwed was untouched at request time, so nothing to
  // restore there.
  //
  // NOTE on deploy migration: prior to commission-deduction wiring, request
  // creation atomically reset onlineBalance to 0 (deducting the entire balance,
  // not just `amount`). Any settlement_request rows that were already pending
  // at deploy time were created under that old logic — rejecting them now will
  // only refund `amount`, not the full pre-deduction balance. Operators should
  // resolve (approve or manually refund) any pre-existing pending requests
  // before deploying. Backfill is intentionally out of scope here.
  let updated: typeof settlementRequestsTable.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    await tx
      .update(vendorsTable)
      .set({ onlineBalance: sql`${vendorsTable.onlineBalance} + ${String(sr.amount)}` })
      .where(eq(vendorsTable.id, sr.vendorId));
    [updated] = await tx
      .update(settlementRequestsTable)
      .set({ status: "rejected", adminNote: note, processedAt: new Date() })
      .where(eq(settlementRequestsTable.id, id))
      .returning();
  });

  const [vendor] = await db
    .select({ userId: vendorsTable.userId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, sr.vendorId))
    .limit(1);
  if (vendor) {
    await createUserNotification({
      userId: vendor.userId,
      title: "Settlement Request Rejected",
      message: note
        ? `Your settlement request has been rejected. Reason: ${note}`
        : "Your settlement request has been rejected. Please contact support for more information.",
      url: "/dashboard/vendor",
      tag: `settlement-${id}`,
    });
  }
  res.json(updated);
});

export default router;
