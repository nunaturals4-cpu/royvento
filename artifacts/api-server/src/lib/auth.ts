import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function resolveSessionSecret(): string {
  const value = process.env["SESSION_SECRET"];
  if (value && value.length > 0) return value;
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "SESSION_SECRET environment variable is required in production. " +
        "Set a long random value before starting the server.",
    );
  }
  return "royvento-dev-secret";
}

export const SESSION_SECRET: string = resolveSessionSecret();
const SECRET = SESSION_SECRET;
const COOKIE_NAME = "royvento_token";
const TOKEN_TTL = "30d";

export type Role = "user" | "vendor" | "admin" | "organizer" | "game_organizer";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  phone: string;
  about: string;
  profileImage: string;
  referralCode: string;
  referredBy: number | null;
  points: number;
  gender: string | null;
  genderCompleted: boolean;
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
  referralCode?: string | null;
  referredBy?: number | null;
  points?: number | null;
  gender?: string | null;
  genderCompleted?: boolean | null;
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
    referralCode: u.referralCode ?? "",
    referredBy: u.referredBy ?? null,
    points: u.points ?? 0,
    gender: u.gender ?? null,
    genderCompleted: u.genderCompleted ?? false,
    createdAt: u.createdAt.toISOString(),
  };
}

export function isNewUser(createdAt: string | Date): boolean {
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const tenDays = 10 * 24 * 60 * 60 * 1000;
  return Date.now() - d.getTime() <= tenDays;
}

export function newUserDaysLeft(createdAt: string | Date): number {
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const tenDays = 10 * 24 * 60 * 60 * 1000;
  const remaining = tenDays - (Date.now() - d.getTime());
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}
