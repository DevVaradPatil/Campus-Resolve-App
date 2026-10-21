"use client";

import { onIdTokenChanged, signInWithCustomToken, signOut as fbSignOut } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Me } from "@/lib/server/auth";
import { api, ApiError } from "./api";
import { auth } from "./firebase";

type State =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; me: Me }
  | { status: "error"; message: string };

const Ctx = createContext<{
  state: State;
  signInWithToken: (token: string) => Promise<Me>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
} | null>(null);

/** Session lives in the Firebase client SDK; the profile and role always come from /api/me. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const loadMe = useCallback(async () => {
    try {
      const me = await api<Me>("/api/me");
      setState({ status: "signedIn", me });
      return me;
    } catch (e) {
      // 401 means deactivated or revoked: drop the local session too.
      if (e instanceof ApiError && e.status === 401) {
        await fbSignOut(auth);
        setState({ status: "signedOut" });
      } else setState({ status: "error", message: (e as Error).message });
      throw e;
    }
  }, []);

  useEffect(
    () =>
      onIdTokenChanged(auth, (u) => {
        if (u) loadMe().catch(() => {});
        else setState({ status: "signedOut" });
      }),
    [loadMe],
  );

  const signInWithToken = useCallback(
    async (token: string) => {
      await signInWithCustomToken(auth, token);
      return loadMe();
    },
    [loadMe],
  );

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    setState({ status: "signedOut" });
  }, []);

  const refresh = useCallback(async () => void (await loadMe()), [loadMe]);

  return (
    <Ctx.Provider value={{ state, signInWithToken, signOut, refresh }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
