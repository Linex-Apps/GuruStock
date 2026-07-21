/**
 * Auth utilities — password hashing, session management.
 * In-memory session store for MVP simplicity.
 */
import { sql } from "../db";

export interface AuthUser {
  id: number;
  email: string;
  tier: string;
  budget: number;
}

// In-memory session store: token → { userId, email, tier, budget }
const sessions = new Map<string, AuthUser>();

export function createSession(user: AuthUser): string {
  const token = crypto.randomUUID();
  sessions.set(token, user);
  return token;
}

export function getUserFromToken(token: string): AuthUser | null {
  return sessions.get(token) ?? null;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}

/** Extract Bearer token from Authorization header */
export function extractToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/** Hash password with Bun.password */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

/** Verify password against hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

/** Fetch user row from DB by email */
export async function getUserByEmail(email: string): Promise<{
  id: number;
  email: string;
  password_hash: string;
  tier: string;
  budget: string;
} | null> {
  if (!sql) return null;
  const rows = await sql`
    SELECT id, email, password_hash, tier, budget::text FROM users WHERE email = ${email}
  `;
  return rows[0] ?? null;
}

/** Fetch user row from DB by id */
export async function getUserById(id: number): Promise<{
  id: number;
  email: string;
  password_hash: string;
  tier: string;
  budget: string;
} | null> {
  if (!sql) return null;
  const rows = await sql`
    SELECT id, email, password_hash, tier, budget::text FROM users WHERE id = ${id}
  `;
  return rows[0] ?? null;
}
