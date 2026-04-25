import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import {
  hashPassword,
  comparePassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  loadUserFromRequest,
  userToPublic,
  type Role,
} from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error });
    return;
  }
  const { email, password, name, role } = parsed.data;
  const safeRole: Role = role === "vendor" || role === "admin" ? role : "user";

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(usersTable)
    .values({ email, passwordHash, name, role: safeRole })
    .returning();
  if (!created) {
    res.status(500).json({ error: "Failed to create user" });
    return;
  }
  const token = signToken({ userId: created.id, role: safeRole });
  setAuthCookie(res, token);
  res.json({ token, user: userToPublic(created) });
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  const u = rows[0];
  if (!u) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await comparePassword(password, u.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signToken({ userId: u.id, role: u.role as Role });
  setAuthCookie(res, token);
  res.json({ token, user: userToPublic(u) });
});

router.post("/auth/logout", async (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res) => {
  const user = await loadUserFromRequest(req);
  res.json({ user });
});

export default router;
