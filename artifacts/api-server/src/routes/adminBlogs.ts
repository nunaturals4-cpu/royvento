import { Router, type IRouter } from "express";
import { db, blogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, loadUserFromRequest } from "../lib/auth";
import { z } from "zod";
import { respondInvalid } from "../lib/validationError";

const router: IRouter = Router();

const BlogBody = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  excerpt: z.string().default(""),
  content: z.string().default(""),
  imageUrl: z.string().default(""),
  authorName: z.string().default("Royvento Editorial"),
  tags: z.array(z.string()).default([]),
  published: z.boolean().default(true),
});

router.get("/admin/blogs", requireAuth(["admin"]), async (_req, res) => {
  const rows = await db.select().from(blogsTable).orderBy(desc(blogsTable.createdAt));
  res.json(rows);
});

router.post("/admin/blogs", requireAuth(["admin"]), async (req, res) => {
  const user = await loadUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const parsed = BlogBody.safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const [blog] = await db.insert(blogsTable).values(parsed.data).returning();
  res.json(blog);
});

router.patch("/admin/blogs/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = BlogBody.partial().safeParse(req.body);
  if (!parsed.success) return respondInvalid(res, parsed.error);
  const [blog] = await db
    .update(blogsTable)
    .set(parsed.data)
    .where(eq(blogsTable.id, id))
    .returning();
  res.json(blog);
});

router.delete("/admin/blogs/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(blogsTable).where(eq(blogsTable.id, id));
  res.json({ ok: true });
});

export default router;
