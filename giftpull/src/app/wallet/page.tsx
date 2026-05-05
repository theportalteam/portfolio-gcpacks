"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  cn,
  formatCurrency,
  formatPoints,
  getBrandDisplayName,
} from "@/lib/utils";
import { useGems } from "@/components/providers/SupabaseGemProvider";

// ── Types ──────────────────────────────────────────────

interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  pointsEarned: number;
  createdAt: string;
  giftCard?: { brand: string; denomination: number } | null;
}

interface LedgerEntry {
  id: string;
  amount: number;
  type: string;
  multiplier: number;
  description: string | null;
  createdAt: string;
}

interface OwnedCard {
  id: string;
  brand: string;
  denomination: number;
  code: string;
  rarityTier: string | null;
  fmv: number;
}

// ── Badge helpers ──────────────────────────────────────

function getTransactionTypeBadge(type: string) {
  const map: Record<string, { label: string; variant: "success" | "brand" | "epic" | "warning" | "default" }> = {
    STOREFRONT_PURCHASE: { label: "Purchase", variant: "brand" },
    BUNDLE_PURCHASE: { label: "Bundle", variant: "brand" },
    GACHA_PULL: { label: "Gacha", variant: "epic" },
    BUYBACK: { label: "Buyback", variant: "warning" },
    P2P_PURCHASE: { label: "P2P Buy", variant: "brand" },
    P2P_SALE: { label: "P2P Sale", variant: "success" },
    POINTS_REDEMPTION: { label: "Redeem", variant: "epic" },
    POINTS_PACK_REDEMPTION: { label: "Pack Redeem", variant: "epic" },
  };
  const info = map[type] || { label: type, variant: "default" as const };
  return <Badge variant={info.variant} size="sm">{info.label}</Badge>;
}

function getStatusBadge(status: string) {
  const map: Record<string, { variant: "success" | "warning" | "default" }> = {
    COMPLETED: { variant: "success" },
    PENDING: { variant: "warning" },
    FAILED: { variant: "default" },
    REFUNDED: { variant: "default" },
  };
  const v = map[status]?.variant || "default";
  return <Badge variant={v} size="sm">{status}</Badge>;
}

function getPointsTypeBadge(type: string) {
  const map: Record<string, { label: string; variant: "success" | "brand" | "epic" | "warning" | "default" }> = {
    PURCHASE_EARN: { label: "Earn", variant: "success" },
    GACHA_EARN: { label: "Gacha", variant: "epic" },
    DAILY_LOGIN: { label: "Daily", variant: "brand" },
    STREAK_BONUS: { label: "Streak", variant: "warning" },
    REFERRAL: { label: "Referral", variant: "success" },
    REDEMPTION: { label: "Redeem", variant: "epic" },
    EXPIRY: { label: "Expired", variant: "default" },
    ADMIN_ADJUST: { label: "Admin", variant: "warning" },
  };
  const info = map[type] || { label: type, variant: "default" as const };
  return <Badge variant={info.variant} size="sm">{info.label}</Badge>;
}

// ── Page Component ─────────────────────────────────────

export default function WalletPage() {
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const router = useRouter();
  const { portalUser, gemBalance, loginWithGoogle, grantGems, spendGems } = useGems();
  const [gemAction, setGemAction] = useState<string | null>(null);

  const [usdcBalance, setUsdcBalance] = useState(0);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [portalBalance, setPortalBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ownedCards, setOwnedCards] = useState<OwnedCard[]>([]);
  const [activeTab, setActiveTab] = useState<"transactions" | "points">("transactions");
  const [loading, setLoading] = useState(true);

  // Withdraw modal
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  // Buyback
  const [sellingBack, setSellingBack] = useState<string | null>(null);

  // ── Fetch data ─────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [walletRes, pointsRes, cardsRes] = await Promise.all([
        fetch("/api/wallet/balance"),
        fetch("/api/points/balance"),
        fetch("/api/gacha/history?limit=50"),
      ]);

      if (walletRes.ok) {
        const walletData = await walletRes.json();
        setUsdcBalance(walletData.usdcBalance);
        setPointsBalance(walletData.pointsBalance);
        setPortalBalance(walletData.portalBalance ?? 0);
        setTransactions(walletData.recentTransactions || []);
      }

      if (pointsRes.ok) {
        const pointsData = await pointsRes.json();
        setPointsBalance(pointsData.balance);
        setLedger(pointsData.recentLedger || []);
      }

      // Fetch owned cards from inventory (cards with status RESERVED belonging to user)
      try {
        const myCardsRes = await fetch("/api/storefront/cards?owned=true");
        if (myCardsRes.ok) {
          const myCardsData = await myCardsRes.json();
          setOwnedCards(myCardsData.cards || []);
        }
      } catch {
        // Cards endpoint may not support owned filter — ignore
      }
    } catch (error) {
      console.error("Failed to fetch wallet data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (sessionStatus === "authenticated") {
      fetchData();
    }
  }, [sessionStatus, router, fetchData]);

  // ── Withdraw handler ───────────────────────────────
  const handleWithdraw = async () => {
    setWithdrawError("");
    setWithdrawSuccess(false);

    const amount = parseFloat(withdrawAmount);
    if (!withdrawAddress.trim()) {
      setWithdrawError("Wallet address is required");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError("Enter a valid positive amount");
      return;
    }
    if (amount > usdcBalance) {
      setWithdrawError("Amount exceeds your USDC balance");
      return;
    }

    setWithdrawing(true);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toAddress: withdrawAddress.trim(), amount }),
      });

      const data = await res.json();
      if (!res.ok) {
        setWithdrawError(data.error || "Withdrawal failed");
        return;
      }

      setUsdcBalance(data.newBalance);
      setWithdrawSuccess(true);
      setWithdrawAddress("");
      setWithdrawAmount("");
      await updateSession();

      // Refresh transactions
      setTimeout(() => {
        fetchData();
        setShowWithdraw(false);
        setWithdrawSuccess(false);
      }, 2000);
    } catch {
      setWithdrawError("Network error. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  };

  // ── Sell back handler ──────────────────────────────
  const handleSellBack = async (cardId: string) => {
    setSellingBack(cardId);
    try {
      const res = await fetch("/api/gacha/buyback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pullId: cardId }),
      });

      if (res.ok) {
        fetchData();
        await updateSession();
      }
    } catch {
      // ignore
    } finally {
      setSellingBack(null);
    }
  };

  // ── Loading state ──────────────────────────────────
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">Loading wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* ── Header ─────────────────────────────────── */}
        <h1 className="text-3xl font-bold text-text-primary mb-8">My Wallet</h1>

        {/* ── Balance Cards ──────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* USDC Balance */}
          <Card className="relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-none bg-primary/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-text-secondary text-sm font-medium">USDC Balance</p>
                  <p className="text-3xl font-bold text-text-primary">
                    {formatCurrency(usdcBalance)}
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowWithdraw(true);
                  setWithdrawError("");
                  setWithdrawSuccess(false);
                }}
              >
                Withdraw USDC
              </Button>
            </div>
          </Card>

          {/* Points Balance */}
          <Card className="relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#7d00ff]/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-none bg-[#7d00ff]/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#7d00ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>
                <div>
                  <p className="text-text-secondary text-sm font-medium">Points Balance</p>
                  <p className="text-3xl font-bold text-text-primary">
                    {formatPoints(pointsBalance)}
                    <span className="text-lg text-text-secondary ml-1">pts</span>
                  </p>
                </div>
              </div>
              <p className="text-xs text-text-secondary">
                Earn points from purchases, daily logins, and streaks
              </p>
            </div>
          </Card>

          {/* PORTAL Balance */}
          <Card className="relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#9333ea]/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-none bg-[#9333ea]/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#9333ea]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                  </svg>
                </div>
                <div>
                  <p className="text-text-secondary text-sm font-medium">$PORTAL Balance</p>
                  <p className="text-3xl font-bold text-text-primary">
                    {formatCurrency(portalBalance)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-text-secondary">
                Save 50% on fees &bull; 5% off gacha pulls
              </p>
            </div>
          </Card>

          {/* Portal Gems Balance */}
          <Card className="relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#f0c870]/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-none bg-[#f0c870]/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#f0c870]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.09 6.26L21 9.27l-5.18 4.73L17.82 21 12 17.27 6.18 21l1.64-6.73L3 9.27l6.91.99L12 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-text-secondary text-sm font-medium">Portal Gems</p>
                  {portalUser ? (
                    <p className="text-3xl font-bold text-[#f0c870]">
                      {gemBalance}
                      <span className="text-lg text-text-secondary ml-1">gems</span>
                    </p>
                  ) : (
                    <p className="text-sm text-text-secondary">Not connected</p>
                  )}
                </div>
              </div>
              {portalUser ? (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={gemAction === "grant"}
                    onClick={async () => {
                      setGemAction("grant");
                      await grantGems(50);
                      setGemAction(null);
                    }}
                  >
                    +50 Gems
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={gemAction === "spend"}
                    onClick={async () => {
                      setGemAction("spend");
                      const ok = await spendGems(10, "gcpacks_test");
                      setGemAction(null);
                      if (!ok) alert("Spend failed — insufficient gems or network error");
                    }}
                  >
                    Spend 10
                  </Button>
                </div>
              ) : (
                <Button variant="primary" size="sm" onClick={loginWithGoogle}>
                  Connect Google
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* ── Tab Switcher ───────────────────────────── */}
        <div className="flex gap-1 p-1 bg-surface rounded-none mb-6 w-fit">
          <button
            onClick={() => setActiveTab("transactions")}
            className={cn(
              "px-5 py-2 rounded-none text-sm font-semibold transition-all",
              activeTab === "transactions"
                ? "bg-primary text-white shadow-lg shadow-primary/25"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            Transactions
          </button>
          <button
            onClick={() => setActiveTab("points")}
            className={cn(
              "px-5 py-2 rounded-none text-sm font-semibold transition-all",
              activeTab === "points"
                ? "bg-[#7d00ff] text-white shadow-lg shadow-[#7d00ff]/25"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            Points Ledger
          </button>
        </div>

        {/* ── Transactions Tab ───────────────────────── */}
        {activeTab === "transactions" && (
          <Card padding="sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Type</th>
                    <th className="text-right text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Amount</th>
                    <th className="text-left text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Currency</th>
                    <th className="text-left text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-left text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-text-secondary py-12">
                        No transactions yet
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-b border-border-subtle/50 hover:bg-surface-light/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-text-secondary whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          {getTransactionTypeBadge(tx.type)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-primary text-right font-mono font-semibold">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {tx.currency}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(tx.status)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {tx.paymentMethod.replace("_", " ")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── Points Ledger Tab ──────────────────────── */}
        {activeTab === "points" && (
          <Card padding="sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Type</th>
                    <th className="text-right text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Amount</th>
                    <th className="text-right text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Multiplier</th>
                    <th className="text-left text-xs text-text-secondary font-semibold uppercase tracking-wider px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-text-secondary py-12">
                        No points activity yet
                      </td>
                    </tr>
                  ) : (
                    ledger.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-border-subtle/50 hover:bg-surface-light/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-text-secondary whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          {getPointsTypeBadge(entry.type)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-sm text-right font-mono font-semibold",
                            entry.amount >= 0 ? "text-[#10B981]" : "text-red-400"
                          )}
                        >
                          {entry.amount >= 0 ? "+" : ""}
                          {formatPoints(entry.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary text-right">
                          {entry.multiplier !== 1 ? `${entry.multiplier}x` : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary max-w-xs truncate">
                          {entry.description || "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── My Cards Section ───────────────────────── */}
        {ownedCards.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-text-primary mb-4">My Cards</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ownedCards.map((card) => (
                <Card key={card.id} variant="interactive" padding="md">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-text-primary">
                      {getBrandDisplayName(card.brand)}
                    </span>
                    {card.rarityTier && (
                      <Badge
                        variant={
                          card.rarityTier === "LEGENDARY"
                            ? "legendary"
                            : card.rarityTier === "EPIC"
                            ? "epic"
                            : card.rarityTier === "RARE"
                            ? "brand"
                            : card.rarityTier === "UNCOMMON"
                            ? "success"
                            : "default"
                        }
                        size="sm"
                      >
                        {card.rarityTier}
                      </Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-text-primary mb-1">
                    {formatCurrency(card.denomination)}
                  </p>
                  <p className="text-xs text-text-secondary font-mono mb-4 tracking-wider">
                    {card.code}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    loading={sellingBack === card.id}
                    onClick={() => handleSellBack(card.id)}
                  >
                    Sell Back ({formatCurrency(card.fmv * 0.7)})
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Withdraw Modal ─────────────────────────── */}
      <Modal
        isOpen={showWithdraw}
        onClose={() => setShowWithdraw(false)}
        title="Withdraw USDC"
      >
        {withdrawSuccess ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#10B981]/15 flex items-center justify-center">
              <svg className="w-8 h-8 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              Withdrawal Submitted
            </h3>
            <p className="text-text-secondary text-sm">
              Your USDC withdrawal is being processed.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-surface-light rounded-none">
              <p className="text-xs text-text-secondary mb-0.5">Available Balance</p>
              <p className="text-lg font-bold text-text-primary">
                {formatCurrency(usdcBalance)} USDC
              </p>
            </div>
            <Input
              label="Wallet Address"
              placeholder="0x..."
              value={withdrawAddress}
              onChange={(e) => setWithdrawAddress(e.target.value)}
            />
            <Input
              label="Amount (USDC)"
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
            {withdrawError && (
              <p className="text-sm text-red-400">{withdrawError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowWithdraw(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                loading={withdrawing}
                onClick={handleWithdraw}
              >
                Withdraw
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
