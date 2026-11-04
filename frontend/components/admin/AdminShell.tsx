"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { BrushStroke, Logo, PaintCan } from "@/components/brand/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { adminApi } from "@/lib/admin";
import { initials, timeAgo } from "@/lib/format";

import { AdminProvider, useAdmin } from "./AdminContext";
import { Icon, type IconName } from "./icons";
import styles from "./shell.module.css";

const NAV: readonly { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/feedback", label: "Feedback", icon: "feedback" },
  { href: "/admin/customers", label: "Customers", icon: "customers" },
  { href: "/admin/alerts", label: "Alerts", icon: "bell" },
  { href: "/admin/reports", label: "Reports", icon: "reports" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminProvider fallback={<p className={styles.loading}>Checking your session…</p>}>
      <Frame>{children}</Frame>
    </AdminProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { stats, problem, toasts, dismissToast } = useAdmin();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unread = stats?.alerts.unread ?? 0;
  const page = NAV.find((item) => isActive(pathname, item.href))?.label ?? "Dashboard";

  // Unread count in the browser tab, so a rep on another tab still notices.
  useEffect(() => {
    document.title = `${unread > 0 ? `(${unread}) ` : ""}${page} · Company X Paints`;
  }, [unread, page]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className={styles.shell}>
      <aside id="admin-nav" className={styles.sidebar} data-open={drawerOpen} aria-label="Admin">
        <div className={styles.sidebarHead}>
          <Logo size={34} className={styles.logo} />
          <button
            type="button"
            className={styles.drawerClose}
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav>
          <ul className={styles.nav}>
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={styles.navLink}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <Icon name={item.icon} size={21} />
                    <span>{item.label}</span>
                    {item.href === "/admin/alerts" && unread > 0 && (
                      <span className={styles.navBadge}>
                        {unread}
                        <span className="visually-hidden"> unread</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={styles.promo}>
          <BrushStroke tone="warm" className={styles.promoStroke} />
          <PaintCan size={64} />
          <p className={styles.promoTitle}>Better Together</p>
          <p className={styles.promoText}>Every reply turns a let-down customer into a fan.</p>
          <Link href="/admin/customers" className={styles.promoLink} onClick={() => setDrawerOpen(false)}>
            Invite a painter
          </Link>
        </div>
      </aside>
      {drawerOpen && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className={styles.main}>
        <TopBar onMenu={() => setDrawerOpen(true)} menuOpen={drawerOpen} />
        <main className={styles.content}>
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
          {children}
        </main>
      </div>

      <div className={styles.toasts} aria-live="assertive">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast} role="status">
            <Icon name="warning" />
            <span>{toast.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Open/close state for a small popover that closes on Escape or a click elsewhere. */
function usePopover<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return [ref, open, setOpen] as const;
}

function TopBar({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const router = useRouter();
  const { me, stats, openAlerts } = useAdmin();
  const [query, setQuery] = useState("");
  const [bellRef, bellOpen, setBellOpen] = usePopover<HTMLDivElement>();
  const [accountRef, accountOpen, setAccountOpen] = usePopover<HTMLDivElement>();
  const unread = stats?.alerts.unread ?? 0;

  function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/admin/feedback?q=${encodeURIComponent(q)}` : "/admin/feedback");
  }

  async function logout() {
    await adminApi.logout().catch(() => undefined);
    router.replace("/admin/login");
  }

  return (
    <header className={styles.topbar}>
      <button
        type="button"
        className={styles.menuButton}
        aria-label="Open menu"
        aria-controls="admin-nav"
        aria-expanded={menuOpen}
        onClick={onMenu}
      >
        <Icon name="menu" />
      </button>

      <form role="search" className={styles.search} onSubmit={search}>
        <Icon name="search" size={18} />
        <input
          type="search"
          aria-label="Search feedback"
          placeholder="Search feedback, customers…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      <div className={styles.popoverWrap} ref={bellRef}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={unread > 0 ? `Alerts, ${unread} unread` : "Alerts"}
          aria-expanded={bellOpen}
          aria-haspopup="true"
          onClick={() => setBellOpen(!bellOpen)}
        >
          <Icon name="bell" size={22} />
          {unread > 0 && (
            <span className={styles.bellBadge} aria-hidden="true">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        {bellOpen && (
          <div className={`${styles.popover} ${styles.bellPopover}`}>
            <p className={styles.popoverTitle}>Open alerts</p>
            {openAlerts.length === 0 ? (
              <p className={styles.popoverEmpty}>All caught up. No one is waiting for a call back.</p>
            ) : (
              <ul className={styles.bellList}>
                {openAlerts.slice(0, 5).map((alert) => (
                  <li key={alert.id} data-unread={!alert.is_read}>
                    <span className={styles.bellAvatar} aria-hidden="true">
                      {initials(alert.customer_name)}
                    </span>
                    <span>
                      <strong>{alert.customer_name}</strong>
                      <small>
                        Scored {alert.mean.toFixed(2)} · {timeAgo(alert.created_at)}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/alerts" className={styles.popoverLink} onClick={() => setBellOpen(false)}>
              View all alerts <Icon name="arrowRight" size={16} />
            </Link>
          </div>
        )}
      </div>

      <div className={styles.popoverWrap} ref={accountRef}>
        <button
          type="button"
          className={styles.avatarButton}
          aria-label={`Account menu for ${me.display_name}`}
          aria-expanded={accountOpen}
          aria-haspopup="true"
          onClick={() => setAccountOpen(!accountOpen)}
        >
          <span className={styles.avatar} aria-hidden="true">
            {initials(me.display_name)}
          </span>
          <Icon name="chevronDown" size={16} />
        </button>
        {accountOpen && (
          <div className={`${styles.popover} ${styles.accountPopover}`}>
            <p className={styles.accountName}>{me.display_name}</p>
            <p className={styles.accountRole}>
              {me.is_owner ? "Owner · manager" : me.role === "manager" ? "Manager" : "Care rep"}
            </p>
            <hr />
            {/* The owner's password lives in the server's .env, so only staff can change theirs. */}
            {!me.is_owner && (
              <Link href="/admin/settings#password" className={styles.menuItem} onClick={() => setAccountOpen(false)}>
                <Icon name="key" size={18} /> Change password
              </Link>
            )}
            <div className={styles.menuItem}>
              <span>Theme</span>
              <ThemeToggle />
            </div>
            <button type="button" className={styles.menuItem} onClick={logout}>
              <Icon name="logout" size={18} /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
