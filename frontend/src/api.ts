import { storage } from "@/src/utils/storage";

export const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setApiToken = (t: string | null) => {
  token = t;
};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "You're offline. Check your connection.");
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.detail) msg = typeof j.detail === "string" ? j.detail : msg;
    } catch {}
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

// ---------- Local JSON cache (offline support) ----------
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await storage.getItem<string | null>(key, null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown) {
  await storage.setItem(key, JSON.stringify(value));
}

export const KEYS = {
  token: "auth_token",
  user: "cache_user",
  catalog: "cache_catalog",
  selection: "last_selection",
  profiles: "cache_profiles",
  settings: "cache_settings",
  userKey: "user_ai_key",
  userModel: "user_ai_model",
};
