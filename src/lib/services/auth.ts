"use client";

/* ------------------------------------------------------------------ */
/*  Auth service                                                       */
/*                                                                      */
/*  A local, offline-first provider: accounts + sessions live in the    */
/*  browser. Passwords are salted & hashed with SHA-256 (WebCrypto) —   */
/*  adequate for a private local journal, NOT for a hosted product.     */
/*                                                                      */
/*  To go to production, implement `AuthProvider` against NextAuth /    */
/*  Clerk / Firebase and export that instead. No UI changes needed.     */
/* ------------------------------------------------------------------ */

export interface User {
  id: string;
  name: string;
  email: string;
}

interface StoredUser extends User {
  salt: string;
  hash: string;
  createdAt: number;
}

const USERS_KEY = "edgebook.users";
const SESSION_KEY = "edgebook.session";

export class AuthError extends Error {
  constructor(
    public code:
      | "invalid_credentials"
      | "email_taken"
      | "weak_password"
      | "invalid_email"
      | "storage",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthProvider {
  getSession(): Promise<User | null>;
  signUp(name: string, email: string, password: string): Promise<User>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
}

/* ------------------------------ helpers ------------------------------ */

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as StoredUser[];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomId(): string {
  return `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* --------------------------- implementation --------------------------- */

class LocalAuthProvider implements AuthProvider {
  async getSession(): Promise<User | null> {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const { userId } = JSON.parse(raw) as { userId: string };
      const user = readUsers().find((u) => u.id === userId);
      if (!user) return null;
      return { id: user.id, name: user.name, email: user.email };
    } catch {
      return null;
    }
  }

  async signUp(name: string, email: string, password: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) throw new AuthError("invalid_email", "Enter a valid email address.");
    if (password.length < 8) throw new AuthError("weak_password", "Password must be at least 8 characters.");
    const users = readUsers();
    if (users.some((u) => u.email === cleanEmail))
      throw new AuthError("email_taken", "An account with this email already exists on this device.");

    const salt = crypto.randomUUID();
    const hash = await hashPassword(password, salt);
    const user: StoredUser = {
      id: randomId(),
      name: name.trim() || cleanEmail.split("@")[0],
      email: cleanEmail,
      salt,
      hash,
      createdAt: Date.now(),
    };
    users.push(user);
    writeUsers(users);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
    return { id: user.id, name: user.name, email: user.email };
  }

  async signIn(email: string, password: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    const user = readUsers().find((u) => u.email === cleanEmail);
    // Uniform error whether or not the account exists (no user enumeration).
    if (!user) throw new AuthError("invalid_credentials", "Incorrect email or password.");
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) throw new AuthError("invalid_credentials", "Incorrect email or password.");
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
    return { id: user.id, name: user.name, email: user.email };
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
  }
}

export const auth: AuthProvider = new LocalAuthProvider();
