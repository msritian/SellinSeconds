"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const supabase = createSupabaseBrowser();

type AuthContextType = {
  user: User | null;
  session: { access_token: string } | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      // Refresh session so we have a valid access token (avoids "Invalid token" on first API calls)
      if (s) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        const sessionToUse = refreshed ?? s;
        setSession(sessionToUse ? { access_token: sessionToUse.access_token } : null);
        setUser(sessionToUse?.user ?? null);
      } else {
        setSession(null);
        setUser(null);
      }
      setLoading(false);
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ? { access_token: s.access_token } : null);
      setUser(s?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
