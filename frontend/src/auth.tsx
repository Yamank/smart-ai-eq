import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, ApiError, cacheGet, cacheSet, KEYS, setApiToken, setUnauthorizedHandler } from "@/src/api";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

export type User = { user_id: string; email: string; name: string; picture: string; role: "admin" | "user" };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

const extractSessionId = (url?: string | null) => {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sent = useRef(new Set<string>());

  const clear = useCallback(async () => {
    await storage.secureRemove(KEYS.token);
    await storage.removeItem(KEYS.user);
    setApiToken(null);
    setUser(null);
  }, []);

  const applySession = useCallback(async (res: { session_token: string; user: User }) => {
    await storage.secureSet(KEYS.token, res.session_token);
    await cacheSet(KEYS.user, res.user);
    setApiToken(res.session_token);
    setUser(res.user);
  }, []);

  const exchange = useCallback(
    async (sessionId: string) => {
      if (sent.current.has(sessionId)) return false;
      sent.current.add(sessionId);
      const res = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: { session_id: sessionId },
      });
      await applySession(res);
      return true;
    },
    [applySession],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
    });
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        // 1) Pending OAuth redirect first
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const sid = extractSessionId(window.location.href);
          if (sid) {
            try {
              await exchange(sid);
              const url = new URL(window.location.href);
              url.searchParams.delete("session_id");
              url.hash = url.hash.replace(/session_id=[^&]+&?/, "").replace(/^#$/, "");
              window.history.replaceState(window.history.state, "", url.toString());
              return;
            } catch {}
          }
        } else {
          const sid = extractSessionId(await Linking.getInitialURL());
          if (sid) {
            try {
              await exchange(sid);
              return;
            } catch {}
          }
        }
        // 2) Existing session
        const t = await storage.secureGet<string | null>(KEYS.token, null);
        if (!t) return;
        setApiToken(t);
        try {
          const me = await api<User>("/auth/me");
          await cacheSet(KEYS.user, me);
          setUser(me);
        } catch (e) {
          if (e instanceof ApiError && e.status === 0) {
            // offline: trust cached user so the app keeps working
            setUser(await cacheGet<User>(KEYS.user));
          } else {
            await clear();
          }
        }
      } finally {
        setLoading(false);
      }
    })();
    if (Platform.OS !== "web") {
      sub = Linking.addEventListener("url", ({ url }) => {
        const sid = extractSessionId(url);
        if (sid) exchange(sid).catch(() => {});
      });
    }
    return () => sub?.remove();
  }, [clear, exchange]);

  const signInGoogle = useCallback(async () => {
    const redirectUrl = Platform.OS === "web" ? `${window.location.origin}/` : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    let captured: string | null = null;
    const l = Linking.addEventListener("url", ({ url }) => {
      captured = url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      const url = (result.type === "success" ? result.url : null) ?? captured ?? (await Linking.getInitialURL());
      const sid = extractSessionId(url);
      if (sid) await exchange(sid);
    } finally {
      l.remove();
    }
  }, [exchange]);

  const signInApple = useCallback(async () => {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!cred.identityToken) throw new Error("Apple did not return a token");
    const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(" ");
    const res = await api("/auth/apple", {
      method: "POST",
      body: { identity_token: cred.identityToken, full_name: fullName, email: cred.email ?? "" },
    });
    await applySession(res);
  }, [applySession]);

  const signInEmail = useCallback(
    async (email: string, password: string) => {
      const res = await api("/auth/login", { method: "POST", body: { email, password } });
      await applySession(res);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clear();
  }, [clear]);

  return (
    <Ctx.Provider value={{ user, loading, signInGoogle, signInApple, signInEmail, signOut }}>{children}</Ctx.Provider>
  );
}
