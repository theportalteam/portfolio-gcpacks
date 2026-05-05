"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User, RealtimeChannel } from "@supabase/supabase-js";

interface GemContextValue {
  portalUser: User | null;
  gemBalance: number;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logoutPortal: () => Promise<void>;
  syncGems: () => Promise<void>;
  grantGems: (amount: number) => Promise<void>;
  spendGems: (amount: number, reason: string) => Promise<boolean>;
}

const GemContext = createContext<GemContextValue>({
  portalUser: null,
  gemBalance: 0,
  loading: true,
  loginWithGoogle: async () => {},
  logoutPortal: async () => {},
  syncGems: async () => {},
  grantGems: async () => {},
  spendGems: async () => false,
});

export const useGems = () => useContext(GemContext);

const API_BASE = "https://portal-gameteam.vercel.app/api";

export function SupabaseGemProvider({ children }: { children: React.ReactNode }) {
  const [portalUser, setPortalUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [gemBalance, setGemBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [realtimeSub, setRealtimeSub] = useState<RealtimeChannel | null>(null);

  // Sync gem balance from backend
  const syncGems = useCallback(async () => {
    if (!accessToken) return;
    try {
      const resp = await fetch(`${API_BASE}/billing/balance`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (resp.ok) {
        const { coins } = await resp.json();
        setGemBalance(coins);
      }
    } catch {
      // ignore
    }
  }, [accessToken]);

  // Subscribe to Realtime balance changes
  const subscribeRealtime = useCallback(
    (userId: string) => {
      if (realtimeSub) {
        realtimeSub.unsubscribe();
      }
      const channel = supabase
        .channel("balance-sync")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "balances", filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as { coins?: number } | undefined;
            if (row && typeof row.coins === "number") {
              setGemBalance(row.coins);
            }
          }
        )
        .subscribe();
      setRealtimeSub(channel);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Handle session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setPortalUser(data.session.user);
        setAccessToken(data.session.access_token);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setPortalUser(session.user);
        setAccessToken(session.access_token);
      } else {
        setPortalUser(null);
        setAccessToken(null);
        setGemBalance(0);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Sync gems + subscribe when user changes
  useEffect(() => {
    if (portalUser && accessToken) {
      syncGems();
      subscribeRealtime(portalUser.id);
    }
    return () => {
      if (realtimeSub) realtimeSub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalUser?.id, accessToken]);

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  };

  const logoutPortal = async () => {
    if (realtimeSub) realtimeSub.unsubscribe();
    setRealtimeSub(null);
    await supabase.auth.signOut();
    setPortalUser(null);
    setAccessToken(null);
    setGemBalance(0);
  };

  const grantGems = async (amount: number) => {
    if (!portalUser) return;
    const { data: row } = await supabase
      .from("balances")
      .select("coins")
      .eq("user_id", portalUser.id)
      .maybeSingle();
    const newCoins = (row?.coins ?? 0) + amount;
    await supabase
      .from("balances")
      .upsert({ user_id: portalUser.id, coins: newCoins, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setGemBalance(newCoins);
  };

  const spendGems = async (amount: number, reason: string): Promise<boolean> => {
    if (!accessToken) return false;
    try {
      const resp = await fetch(`${API_BASE}/billing/spend`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount, reason }),
      });
      if (resp.ok) {
        const { coins } = await resp.json();
        setGemBalance(coins);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <GemContext.Provider value={{ portalUser, gemBalance, loading, loginWithGoogle, logoutPortal, syncGems, grantGems, spendGems }}>
      {children}
    </GemContext.Provider>
  );
}
