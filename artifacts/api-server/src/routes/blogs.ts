import { Router, type IRouter } from "express";
import { db, blogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/blogs", async (_req, res) => {
  const rows = await db
    .select()
    .from(blogsTable)
    .where(eq(blogsTable.published, true))
    .orderBy(desc(blogsTable.createdAt));
  res.json(rows);
});

router.get("/blogs/:slug", async (req, res) => {
  const { slug } = req.params;
  const [blog] = await db
    .select()
    .from(blogsTable)
    .where(eq(blogsTable.slug, slug))
    .limit(1);
  if (!blog || !blog.published) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(blog);
});

export default router;
