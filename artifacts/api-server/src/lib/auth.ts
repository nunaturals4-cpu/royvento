import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SECRET = process.env["SESSION_SECRET"] || "royvento-dev-secret";
const COOKIE_NAME = "royvento_token";
const TOKEN_TTL = "30d";

export type Role = "user" | "vendor" | "admin";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  phone: string;
  about: string;
  profileImage: string;
  createdAt: string;
}

export interface JwtPayload {
  userId: number;
  role: Role;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  if (cookies && cookies[COOKIE_NAME]) {
    return cookies[COOKIE_NAME];
  }
  return null;
}

export async function loadUserFromRequest(
  req: Request,
): Promise<AuthUser | null> {
  const token = extractToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId))
    .limit(1);
  const u = rows[0];
  if (!u) return null;
  return userToPublic(u);
}

export interface AuthedRequest extends Request {
  user: AuthUser;
}

export function requireAuth(allowedRoles?: Role[]) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const user = await loadUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    (req as AuthedRequest).user = user;
    next();
  };
}

export function userToPublic(u: {
  id: number;
  email: string;
  name: string;
  role: string;
  phone?: string | null;
  about?: string | null;
  profileImage?: string | null;
  createdAt: Date;
}): AuthUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    phone: u.phone ?? "",
    about: u.about ?? "",
    profileImage: u.profileImage ?? "",
    createdAt: u.createdAt.toISOString(),
  };
}
