import { Router, type IRouter } from "express";
import {
  db,
  bookingsTable,
  eventsTable,
  vendorsTable,
  usersTable,
  availabilityTable,
  couponsTable,
  referralsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { UpdateBookingStatusBody } from "@workspace/api-zod";
import { requireAuth, loadUserFromRequest, isNewUser } from "../lib/auth";
import {
  sendBookingCreatedEmails,
  sendBookingStatusEmail,
} from "../lib/notifications";

const EVENT_TYPES = [
  "wedding",
  "birthday",
  "casual",
  "surprise",
  "corporate",
  "cultural",
  "other",
] as const;

const CreateBookingBody = z.object({
  eventId: z.number().int().positive(),
  bookingDate: z.string().min(1),
  guests: z.number().int().nonnegative().optional().default(0),
  notes: z.string().optional().default(""),
  eventType: z.enum(EVENT_TYPES).optional().default("other"),
  budgetRange: z.string().optional().default(""),
  couponCode: z.string().optional().default(""),
  pubMode: z.enum(["", "ticket", "event"]).optional().default(""),
  ticketWomen: z.number().int().nonnegative().optional().default(0),
  ticketMen: z.number().int().nonnegative().optional().default(0),
  ticketCouple: z.number().int().nonnegative().optional().default(0),
  selectedPubEvent: z.string().optional().default(""),
  personName: z.string().optional().default(""),
  pointsToUse: z.number().int().nonnegative().optional().default(0),
});

const router: IRouter = Router();

interface BookingRow {
  id: number;
  eventId: number;
  userId: number;
  vendorId: number;
  bookingDate: string;
  guests: number;
  totalPrice: string;
  couponCode: string;
  discountAmount: string;
  finalPrice: string;
  budgetRange: string;
  notes: string;
  eventType: string;
  status: string;
  pubMode: string;
  ticketWomen: number;
  ticketMen: number;
  ticketCouple: number;
  selectedPubEvent: string;
  personName: string;
  pointsUsed: number;
  approvedBy: string;
  rejectionReason: string | null;
  checkedIn: boolean;
  checkedInAt: Date | null;
  createdAt: Date;
}

async function serializeBookings(rows: BookingRow[]) {
  if (rows.length === 0) return [];
  const eventIds = Array.from(new Set(rows.map((r) => r.eventId)));
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const vendorIds = Array.from(new Set(rows.map((r) => r.vendorId)));
  const [events, users, vendors] = await Promise.all([
    db.select().from(eventsTable).where(inArray(eventsTable.id, eventIds)),
    db.select().from(usersTable).where(inArray(usersTable.id, userIds)),
    db.select().from(vendorsTable).where(inArray(vendorsTable.id, vendorIds)),
  ]);
  const eMap = new Map(events.map((e) => [e.id, e]));
  const uMap = new Map(users.map((u) => [u.id, u]));
  const vMap = new Map(vendors.map((v) => [v.id, v]));
  return rows.map((b) => {
    const e = eMap.get(b.eventId);
    const u = uMap.get(b.userId);
    const v = vMap.get(b.vendorId);
    return {
      id: b.id,
      eventId: b.eventId,
      userId: b.userId,
      vendorId: b.vendorId,
      bookingDate: b.bookingDate,
      guests: b.guests,
      totalPrice: Number(b.totalPrice),
      couponCode: b.couponCode,
      discountAmount: Number(b.discountAmount),
      finalPrice: Number(b.finalPrice),
      budgetRange: b.budgetRange,
      notes: b.notes,
      eventType: b.eventType,
      status: b.status,
      pubMode: b.pubMode,
      ticketWomen: b.ticketWomen,
      ticketMen: b.ticketMen,
      ticketCouple: b.ticketCouple,
      selectedPubEvent: b.selectedPubEvent,
      personName: b.personName || u?.name || "",
      pointsUsed: b.pointsUsed,
      approvedBy: b.approvedBy,
      rejectionReason: b.rejectionReason ?? null,
      checkedIn: b.checkedIn,
      checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
      createdAt: b.createdAt.toISOString(),
      eventTitle: e?.title ?? "",
      eventImage: e?.imageUrl ?? "",
      eventType_: e?.type ?? "",
      eventCity: e?.city ?? "",
      eventState: e?.state ?? "",
      eventCountry: e?.country ?? "",
      vendorName: v?.businessName ?? "",
      partnerName: v?.businessName ?? "",
      userName: u?.name ?? "",
      userEmail: u?.email ?? "",
    };
  });
}

router.post("/bookings", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const eRows = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, parsed.data.eventId))
    .limit(1);
  const evt = eRows[0];
  if (!evt) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const rawDate = parsed.data.bookingDate as unknown;
  const dateStr =
    rawDate instanceof Date
      ? rawDate.toISOString().slice(0, 10)
      : String(rawDate).slice(0, 10);

  // Compute base total based on mode
  let totalPrice = 0;
  let guestsCount = parsed.data.guests || 0;

  if (evt.type === "pub" && parsed.data.pubMode === "ticket") {
    const w = parsed.data.ticketWomen || 0;
    const m = parsed.data.ticketMen || 0;
    const c = parsed.data.ticketCouple || 0;
    totalPrice =
      w * Number(evt.priceWomen) +
      m * Number(evt.priceMen) +
      c * Number(evt.priceCouple);
    guestsCount = w + m + c * 2;
  } else {
    totalPrice = Number(evt.price) * Math.max(1, guestsCount);
    if (guestsCount === 0) guestsCount = 1;
  }

  // Apply coupon
  let discountAmount = 0;
  let validCode = "";
  if (parsed.data.couponCode) {
    const couponRows = await db
      .select()
      .from(couponsTable)
      .where(
        and(
          eq(couponsTable.code, parsed.data.couponCode.trim().toUpperCase()),
          eq(couponsTable.userId, user.id),
          eq(couponsTable.used, false),
        ),
      )
      .limit(1);
    const coupon = couponRows[0];
    if (coupon) {
      discountAmount = Math.round(totalPrice * (coupon.discountPercent / 100));
      validCode = coupon.code;
      await db
        .update(couponsTable)
        .set({ used: true })
        .where(eq(couponsTable.id, coupon.id));
    }
  }

  // Apply new-user 20% off (within 10 days of signup, no coupon used)
  if (!validCode && isNewUser(user.createdAt)) {
    const newUserDiscount = Math.round(totalPrice * 0.2);
    discountAmount = Math.max(discountAmount, newUserDiscount);
  }

  // Apply points (1 point = 1 INR)
  const pointsToUse = Math.min(parsed.data.pointsToUse || 0, user.points);
  const pointsCap = Math.max(0, totalPrice - discountAmount);
  const pointsUsed = Math.min(pointsToUse, pointsCap);
  if (pointsUsed > 0) {
    await db
      .update(usersTable)
      .set({ points: user.points - pointsUsed })
      .where(eq(usersTable.id, user.id));
  }

  const finalPrice = Math.max(0, totalPrice - discountAmount - pointsUsed);

  const [b] = await db
    .insert(bookingsTable)
    .values({
      eventId: evt.id,
      userId: user.id,
      vendorId: evt.vendorId,
      bookingDate: dateStr,
      guests: guestsCount,
      totalPrice: String(totalPrice),
      couponCode: validCode,
      discountAmount: String(discountAmount),
      finalPrice: String(finalPrice),
      budgetRange: parsed.data.budgetRange ?? "",
      notes: parsed.data.notes ?? "",
      eventType: parsed.data.eventType ?? "other",
      status: "pending",
      pubMode: parsed.data.pubMode || "",
      ticketWomen: parsed.data.ticketWomen || 0,
      ticketMen: parsed.data.ticketMen || 0,
      ticketCouple: parsed.data.ticketCouple || 0,
      selectedPubEvent: parsed.data.selectedPubEvent || "",
      personName: parsed.data.personName || user.name,
      pointsUsed,
      approvedBy: "",
    })
    .returning();
  if (!b) {
    res.status(500).json({ error: "Failed" });
    return;
  }
  await db
    .insert(availabilityTable)
    .values({ vendorId: evt.vendorId, date: dateStr, status: "booked" })
    .onConflictDoUpdate({
      target: [availabilityTable.vendorId, availabilityTable.date],
      set: { status: "booked" },
    });
  const [out] = await serializeBookings([b]);

  try {
    const vRows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, evt.vendorId))
      .limit(1);
    const vendor = vRows[0];
    let vendorEmail = "";
    let vendorName = out?.vendorName ?? "";
    if (vendor) {
      const vuRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, vendor.userId))
        .limit(1);
      vendorEmail = vuRows[0]?.email ?? "";
      vendorName = vendor.businessName;
    }
    await sendBookingCreatedEmails({
      bookingId: b.id,
      eventTitle: out?.eventTitle ?? evt.title,
      vendorName,
      vendorEmail,
      userName: user.name,
      userEmail: user.email,
      bookingDate: b.bookingDate,
      guests: b.guests,
      totalPrice: Number(b.totalPrice),
      notes: b.notes || undefined,
    });
  } catch (err) {
    console.error("Failed to send booking notifications:", err);
  }

  res.json(out);
});

router.get("/bookings/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.userId, user.id))
    .orderBy(desc(bookingsTable.createdAt));
  res.json(await serializeBookings(rows));
});

router.get("/bookings/vendor", requireAuth(["vendor"]), async (req, res) => {
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
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.vendorId, vendor.id))
    .orderBy(desc(bookingsTable.createdAt));
  res.json(await serializeBookings(rows));
});

router.patch(
  "/bookings/:bookingId/status",
  requireAuth(["vendor", "admin"]),
  async (req, res) => {
    const id = Number(req.params["bookingId"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateBookingStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const user = await loadUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const bRows = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .limit(1);
    const b = bRows[0];
    if (!b) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let approver: "partner" | "admin" = "admin";
    if (user.role !== "admin") {
      const vRows = await db
        .select()
        .from(vendorsTable)
        .where(
          and(
            eq(vendorsTable.id, b.vendorId),
            eq(vendorsTable.userId, user.id),
          ),
        )
        .limit(1);
      if (!vRows[0]) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      approver = "partner";
    }
    const rejectionReason =
      parsed.data.status === "cancelled"
        ? (parsed.data.rejectionReason ?? null)
        : null;

    if (parsed.data.status === "cancelled" && !rejectionReason?.trim()) {
      res.status(400).json({ error: "A rejection reason is required when cancelling a booking." });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: parsed.data.status, approvedBy: approver, rejectionReason: rejectionReason?.trim() ?? null })
      .where(eq(bookingsTable.id, id))
      .returning();
    if (!updated) {
      res.status(500).json({ error: "Failed" });
      return;
    }

    // Award referral points when booking moves to confirmed (paid)
    if (
      (parsed.data.status === "confirmed" ||
        parsed.data.status === "completed") &&
      b.status !== "confirmed" &&
      b.status !== "completed"
    ) {
      try {
        // Was this user's first paid booking?
        const priorPaid = await db
          .select()
          .from(bookingsTable)
          .where(
            and(
              eq(bookingsTable.userId, b.userId),
              inArray(bookingsTable.status, ["confirmed", "completed"]),
            ),
          );
        const otherPriorCount = priorPaid.filter((p) => p.id !== b.id).length;
        if (otherPriorCount === 0) {
          // Find pending referral row for this user
          const refRows = await db
            .select()
            .from(referralsTable)
            .where(
              and(
                eq(referralsTable.referredId, b.userId),
                eq(referralsTable.status, "pending"),
              ),
            )
            .limit(1);
          const ref = refRows[0];
          if (ref) {
            const [referrer] = await db
              .select()
              .from(usersTable)
              .where(eq(usersTable.id, ref.referrerId))
              .limit(1);
            const [referred] = await db
              .select()
              .from(usersTable)
              .where(eq(usersTable.id, b.userId))
              .limit(1);
            if (referrer) {
              await db
                .update(usersTable)
                .set({ points: (referrer.points || 0) + 50 })
                .where(eq(usersTable.id, referrer.id));
            }
            if (referred) {
              await db
                .update(usersTable)
                .set({ points: (referred.points || 0) + 50 })
                .where(eq(usersTable.id, referred.id));
            }
            await db
              .update(referralsTable)
              .set({
                status: "completed",
                pointsAwarded: 50,
                completedAt: new Date(),
              })
              .where(eq(referralsTable.id, ref.id));
          }
        }
      } catch (err) {
        console.error("Failed to award referral points", err);
      }
    }

    const [out] = await serializeBookings([updated]);

    if (out && b.status !== updated.status) {
      try {
        await sendBookingStatusEmail({
          bookingId: updated.id,
          eventTitle: out.eventTitle,
          vendorName: out.vendorName,
          userName: out.userName,
          userEmail: out.userEmail,
          bookingDate: updated.bookingDate,
          status: updated.status,
        });
      } catch (err) {
        console.error("Failed to send status notification:", err);
      }

      // Create in-app notification for the booking user
      try {
        let notifTitle = "";
        let notifMessage = "";
        if (updated.status === "confirmed") {
          notifTitle = "Booking confirmed!";
          notifMessage = `Your booking for "${out.eventTitle}" has been confirmed.`;
        } else if (updated.status === "cancelled") {
          notifTitle = "Booking rejected";
          notifMessage = `Your booking for "${out.eventTitle}" was cancelled.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`;
        } else if (updated.status === "completed") {
          notifTitle = "Booking completed";
          notifMessage = `Your booking for "${out.eventTitle}" is marked as completed. We hope you had a great time!`;
        }
        if (notifTitle) {
          await db.insert(notificationsTable).values({
            userId: b.userId,
            title: notifTitle,
            message: notifMessage,
          });
        }
      } catch (err) {
        console.error("Failed to create notification:", err);
      }
    }

    res.json(out);
  },
);

// Admin can approve any booking
router.patch(
  "/admin/bookings/:bookingId/status",
  requireAuth(["admin"]),
  async (req, res) => {
    const id = Number(req.params["bookingId"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateBookingStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const bRows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    const b = bRows[0];
    if (!b) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const rejectionReason =
      parsed.data.status === "cancelled"
        ? (parsed.data.rejectionReason ?? null)
        : null;

    if (parsed.data.status === "cancelled" && !rejectionReason?.trim()) {
      res.status(400).json({ error: "A rejection reason is required when cancelling a booking." });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: parsed.data.status, approvedBy: "admin", rejectionReason: rejectionReason?.trim() ?? null })
      .where(eq(bookingsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [out] = await serializeBookings([updated]);

    // Award referral points when booking moves to confirmed/completed (same logic as partner path)
    if (
      (parsed.data.status === "confirmed" || parsed.data.status === "completed") &&
      b.status !== "confirmed" &&
      b.status !== "completed"
    ) {
      try {
        const priorPaid = await db
          .select()
          .from(bookingsTable)
          .where(
            and(
              eq(bookingsTable.userId, b.userId),
              inArray(bookingsTable.status, ["confirmed", "completed"]),
            ),
          );
        const otherPriorCount = priorPaid.filter((p) => p.id !== b.id).length;
        if (otherPriorCount === 0) {
          const refRows = await db
            .select()
            .from(referralsTable)
            .where(
              and(
                eq(referralsTable.referredId, b.userId),
                eq(referralsTable.status, "pending"),
              ),
            )
            .limit(1);
          const ref = refRows[0];
          if (ref) {
            const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, ref.referrerId)).limit(1);
            const [referred] = await db.select().from(usersTable).where(eq(usersTable.id, b.userId)).limit(1);
            if (referrer) {
              await db.update(usersTable).set({ points: (referrer.points || 0) + 50 }).where(eq(usersTable.id, referrer.id));
            }
            if (referred) {
              await db.update(usersTable).set({ points: (referred.points || 0) + 50 }).where(eq(usersTable.id, referred.id));
            }
            await db.update(referralsTable).set({ status: "completed", pointsAwarded: 50, completedAt: new Date() }).where(eq(referralsTable.id, ref.id));
          }
        }
      } catch (err) {
        console.error("Failed to award referral points (admin path)", err);
      }
    }

    if (out && b.status !== updated.status) {
      // Email simulation
      try {
        await sendBookingStatusEmail({
          bookingId: updated.id,
          eventTitle: out.eventTitle,
          vendorName: out.vendorName,
          userName: out.userName,
          userEmail: out.userEmail,
          bookingDate: updated.bookingDate,
          status: updated.status,
        });
      } catch (err) {
        console.error("Failed to send status notification (admin path):", err);
      }

      // Create in-app notification for the booking user
      try {
        let notifTitle = "";
        let notifMessage = "";
        if (updated.status === "confirmed") {
          notifTitle = "Booking confirmed!";
          notifMessage = `Your booking for "${out.eventTitle}" has been confirmed by admin.`;
        } else if (updated.status === "cancelled") {
          notifTitle = "Booking rejected";
          notifMessage = `Your booking for "${out.eventTitle}" was cancelled.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`;
        } else if (updated.status === "completed") {
          notifTitle = "Booking completed";
          notifMessage = `Your booking for "${out.eventTitle}" is marked as completed.`;
        }
        if (notifTitle) {
          await db.insert(notificationsTable).values({
            userId: b.userId,
            title: notifTitle,
            message: notifMessage,
          });
        }
      } catch (err) {
        console.error("Failed to create notification (admin path):", err);
      }
    }

    res.json(out);
  },
);

// Partner ticket scanner
router.post("/partner/scan-ticket", requireAuth(["vendor"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawCode = (req.body as Record<string, unknown>)["code"];
  if (typeof rawCode !== "string" || !rawCode.trim()) {
    res.status(400).json({ code: "INVALID_CODE", message: "Please enter a ticket code." });
    return;
  }
  const code = rawCode.trim().toUpperCase();
  // Accept RV-000042 or RV000042 or just the number
  const match = code.match(/^(?:RV-?)?(\d+)$/);
  if (!match || !match[1]) {
    res.status(400).json({ code: "INVALID_CODE", message: "Invalid ticket code format. Expected e.g. RV-000042." });
    return;
  }
  const bookingId = parseInt(match[1]!, 10);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    res.status(400).json({ code: "INVALID_CODE", message: "Invalid ticket code." });
    return;
  }

  // Load partner's vendor profile
  const vRows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, user.id)).limit(1);
  const vendor = vRows[0];
  if (!vendor) {
    res.status(403).json({ code: "FORBIDDEN", message: "No partner profile found." });
    return;
  }

  // Load booking
  const bRows = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  const b = bRows[0];
  if (!b) {
    res.status(404).json({ code: "NOT_FOUND", message: "Ticket not found. Check the code and try again." });
    return;
  }

  // Verify the booking belongs to this partner's venue
  if (b.vendorId !== vendor.id) {
    res.status(403).json({ code: "WRONG_VENDOR", message: "This ticket belongs to a different partner's event." });
    return;
  }

  // Status checks
  if (b.status === "pending") {
    res.status(422).json({ code: "NOT_CONFIRMED", message: "This booking has not been confirmed yet." });
    return;
  }
  if (b.status === "cancelled") {
    res.status(422).json({ code: "CANCELLED", message: "This booking was cancelled and cannot be used for entry." });
    return;
  }
  if (b.status !== "confirmed" && b.status !== "completed") {
    res.status(422).json({ code: "INVALID_STATUS", message: `Booking is in status "${b.status}" and cannot be used for entry.` });
    return;
  }

  // Already checked in?
  if (b.checkedIn) {
    const checkedInAt = b.checkedInAt ? b.checkedInAt.toISOString() : null;
    const [out] = await serializeBookings([b]);
    res.status(409).json({
      code: "ALREADY_CHECKED_IN",
      message: "This ticket has already been used for entry.",
      checkedInAt,
      booking: out ?? null,
    });
    return;
  }

  // Check in the guest
  const now = new Date();
  const [updated] = await db
    .update(bookingsTable)
    .set({ checkedIn: true, checkedInAt: now })
    .where(eq(bookingsTable.id, b.id))
    .returning();
  if (!updated) {
    res.status(500).json({ code: "SERVER_ERROR", message: "Failed to check in. Please try again." });
    return;
  }

  const [out] = await serializeBookings([updated]);
  res.json({ code: "OK", checkedInAt: now.toISOString(), booking: out ?? null });
});

router.get("/admin/bookings", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(bookingsTable)
    .orderBy(desc(bookingsTable.createdAt));
  res.json(await serializeBookings(rows));
});

export default router;
