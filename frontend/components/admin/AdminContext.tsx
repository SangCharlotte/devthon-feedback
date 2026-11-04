"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { adminApi, UnauthorizedError, type AlertItem, type Me, type Stats } from "@/lib/admin";

export const RANGES = [7, 30, 90] as const;
export type Days = (typeof RANGES)[number];

// Polling is simple and reliable: every 15 s the shell asks "anything new?".
export const REFRESH_MS = 15_000;
const DAYS_KEY = "admin-days";

export type Toast = { id: number; text: string };

export type AdminState = {
  me: Me;
  /** One date range scopes every page, so the numbers always agree. */
  days: Days;
  setDays: (days: Days) => void;
  stats: Stats | null;
  openAlerts: AlertItem[];
  ai: { enabled: boolean; demo: boolean };
  /** Bumps after every poll: pages that keep their own lists refetch on it. */
  tick: number;
  refresh: () => Promise<void>;
  /** Shown as a banner: anything that went wrong outside a card's own error handling. */
  problem: string | null;
  handleError: (error: unknown) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
};

const AdminContext = createContext<AdminState | null>(null);

export function useAdmin(): AdminState {
  const state = useContext(AdminContext);
  if (!state) throw new Error("useAdmin must be used inside <AdminProvider>");
  return state;
}

function storedDays(): Days {
  try {
    const saved = Number(sessionStorage.getItem(DAYS_KEY));
    return RANGES.find((range) => range === saved) ?? 30;
  } catch {
    return 30;
  }
}

/** Holds the session, the range and the polled numbers; renders children only once signed in. */
export function AdminProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [days, setDaysState] = useState<Days>(() => (typeof window === "undefined" ? 30 : storedDays()));
  const [stats, setStats] = useState<Stats | null>(null);
  const [openAlerts, setOpenAlerts] = useState<AlertItem[]>([]);
  const [ai, setAi] = useState({ enabled: false, demo: false });
  const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const seenAlerts = useRef<Set<number> | null>(null);

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof UnauthorizedError) router.replace("/admin/login");
      else setProblem(error instanceof Error ? error.message : "Something went wrong.");
    },
    [router],
  );

  // The pages are public HTML; the API decides who may see data. 401 -> login page.
  useEffect(() => {
    adminApi.me().then((signedIn) => {
      setMe(signedIn);
      // AI is optional: if the status check fails, AI features just stay switched off.
      adminApi.aiStatus().then(setAi, () => setAi({ enabled: false, demo: false }));
    }, handleError);
  }, [handleError]);

  const refresh = useCallback(async () => {
    try {
      const [nextStats, open] = await Promise.all([adminApi.stats(days), adminApi.alerts("open")]);
      setStats(nextStats);
      setOpenAlerts(open);
      setTick((t) => t + 1);
      setProblem(null);

      // In-app notification for detractors that arrived since the last check.
      const seen = seenAlerts.current;
      if (seen) {
        const fresh = open.filter((a) => !seen.has(a.id));
        setToasts((current) => [
          ...current,
          ...fresh.map((a) => ({
            id: a.id,
            text: `New detractor: ${a.customer_name} (${a.customer_email ?? a.customer_phone}) scored ${a.mean.toFixed(2)}`,
          })),
        ]);
      }
      seenAlerts.current = new Set([...(seen ?? []), ...open.map((a) => a.id)]);
    } catch (error) {
      handleError(error);
    }
  }, [days, handleError]);

  useEffect(() => {
    if (!me) return;
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [me, refresh]);

  const setDays = useCallback((next: Days) => {
    setDaysState(next);
    try {
      sessionStorage.setItem(DAYS_KEY, String(next));
    } catch {
      // Storage blocked: the range still changes for this page view.
    }
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((t) => t.id !== id)), []);

  if (!me) return fallback;

  return (
    <AdminContext.Provider
      value={{ me, days, setDays, stats, openAlerts, ai, tick, refresh, problem, handleError, toasts, dismissToast }}
    >
      {children}
    </AdminContext.Provider>
  );
}
