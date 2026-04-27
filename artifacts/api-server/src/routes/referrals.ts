import { Router, type IRouter } from "express";
import { db, referralsTable, usersTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { requireAuth, loadUserFromRequest, isNewUser, newUserDaysLeft } from "../lib/auth";

const router: IRouter = Router();

router.get("/referrals/me", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const refs = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, user.id))
    .orderBy(desc(referralsTable.createdAt));
  const ids = refs.map((r) => r.referredId);
  const users = ids.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, ids))
    : [];
  const uMap = new Map(users.map((u) => [u.id, u]));
  return res.json({
    code: user.referralCode,
    points: user.points,
    referrals: refs.map((r) => {
      const u = uMap.get(r.referredId);
      return {
        id: r.id,
        referredName: u?.name ?? "",
        referredEmail: u?.email ?? "",
        status: r.status,
        pointsAwarded: r.pointsAwarded,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      };
    }),
  });
});

router.get("/users/me/discounts", requireAuth(), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const newUser = isNewUser(user.createdAt);
  res.json({
    isNewUser: newUser,
    daysLeft: newUserDaysLeft(user.createdAt),
    bookingDiscountPercent: newUser ? 20 : 0,
    subscriptionDiscountPercent: newUser ? 50 : 0,
    points: user.points,
  });
});

export default router;
