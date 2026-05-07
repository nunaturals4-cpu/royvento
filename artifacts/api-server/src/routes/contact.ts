import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db, contactMessagesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many contact submissions — please try again later." },
});

const ContactBody = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional().default(""),
  subject: z.string().min(1).max(255),
  message: z.string().min(1),
});

router.post("/contact", contactLimiter, async (req, res) => {
  const parsed = ContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const [m] = await db
    .insert(contactMessagesTable)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? "",
      subject: parsed.data.subject,
      message: parsed.data.message,
    })
    .returning();
  req.log.info(
    { name: parsed.data.name, email: parsed.data.email, subject: parsed.data.subject },
    "New contact message received",
  );
  res.json(m);
});

router.get("/admin/messages", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(contactMessagesTable)
    .orderBy(desc(contactMessagesTable.createdAt));
  res.json(rows);
});

router.delete("/admin/messages/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(contactMessagesTable).where(eq(contactMessagesTable.id, id));
  res.json({ ok: true });
});

export default router;
