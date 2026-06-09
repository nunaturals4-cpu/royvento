import { Router, type IRouter } from "express";
import { db, blogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/blogs", async (_req, res) => {
  // Public, anonymous (published posts only) — edge-cache so the listing is
  // served from Cloudflare. Same pattern as the events/vendors catalogs.
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
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
  // Public blog post — identical for every reader. Edge-cache on success only.
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.json(blog);
});

export default router;
