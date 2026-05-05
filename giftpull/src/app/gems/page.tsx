"use client";

import { useState } from "react";
import { useGems } from "@/components/providers/SupabaseGemProvider";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function GemsPage() {
  const { portalUser, gemBalance, loading, loginWithGoogle, logoutPortal, grantGems, spendGems, syncGems } = useGems();
  const [action, setAction] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#f0c870] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!portalUser) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-headline font-black uppercase tracking-tighter italic text-[#f0c870] mb-4">
            PORTAL GEMS
          </h1>
          <p className="text-text-secondary mb-8">Sign in with your Portal Google account to manage gems</p>
          <button
            onClick={loginWithGoogle}
            className="w-full py-3 px-4 bg-white hover:bg-gray-100 text-gray-800 font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-headline font-black uppercase tracking-tighter italic text-[#f0c870]">
            PORTAL GEMS
          </h1>
          <div className="text-right">
            <p className="text-xs text-text-secondary">{portalUser.email}</p>
            <button onClick={logoutPortal} className="text-xs text-red-400 hover:text-red-300 mt-1">
              Disconnect
            </button>
          </div>
        </div>

        {/* Balance Card */}
        <Card className="relative overflow-hidden mb-8">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#f0c870]/10 blur-3xl" />
          <div className="relative text-center py-8">
            <p className="text-text-secondary text-sm font-medium mb-2">Your Gem Balance</p>
            <p className="text-6xl font-bold text-[#f0c870] mb-1">{gemBalance}</p>
            <p className="text-text-secondary text-sm">GEMS</p>
          </div>
        </Card>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Button
            variant="primary"
            loading={action === "grant"}
            onClick={async () => {
              setAction("grant");
              await grantGems(50);
              addLog("+50 gems granted (faucet)");
              setAction(null);
            }}
            className="w-full"
          >
            +50 Gems
          </Button>
          <Button
            variant="secondary"
            loading={action === "spend"}
            onClick={async () => {
              setAction("spend");
              const ok = await spendGems(10, "gcpacks_test");
              addLog(ok ? "Spent 10 gems via backend" : "Spend failed (insufficient or error)");
              setAction(null);
            }}
            className="w-full"
          >
            Spend 10
          </Button>
          <Button
            variant="secondary"
            loading={action === "sync"}
            onClick={async () => {
              setAction("sync");
              await syncGems();
              addLog("Balance synced from backend");
              setAction(null);
            }}
            className="w-full"
          >
            Sync
          </Button>
        </div>

        {/* Info */}
        <Card className="mb-6">
          <p className="text-xs text-text-secondary leading-relaxed">
            <strong className="text-text-primary">Cross-platform test:</strong> Open{" "}
            <a href="https://portal-gameteam.vercel.app" target="_blank" rel="noopener" className="text-[#f0c870] underline">
              portal-gameteam
            </a>{" "}
            or{" "}
            <a href="https://gemtest-theta.vercel.app" target="_blank" rel="noopener" className="text-[#f0c870] underline">
              gemtest
            </a>{" "}
            in another tab. Grant or spend gems here and watch it sync in real-time via Supabase Realtime.
          </p>
        </Card>

        {/* Log */}
        <Card padding="sm">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider px-4 py-2">Activity Log</h3>
          <div className="max-h-48 overflow-y-auto">
            {log.length === 0 ? (
              <p className="text-text-secondary text-xs px-4 py-4 text-center">No activity yet — try granting or spending gems</p>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="text-xs text-text-secondary px-4 py-1.5 border-t border-bg-border/30 font-mono">
                  {entry}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
