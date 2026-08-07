"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Inbox,
  CalendarClock,
  Database,
  Bot,
  Settings,
  Menu,
  X,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ShellAgent = {
  id: string;
  name: string;
  avatar: string;
  status: "active" | "paused";
  unread: number;
};

const NAV = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/schedules", label: "Schedules", icon: CalendarClock },
  { href: "/database", label: "Database", icon: Database },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The app shell. One nav pattern — a sidebar — used on every screen, with the
 * agent switcher at the top. Selecting an agent scopes Inbox, Schedules and
 * Database to it via ?agent=<id>; "All agents" shows the aggregate.
 */
export function Shell({
  agents,
  totalUnread,
  banner,
  children,
}: {
  agents: ShellAgent[];
  totalUnread: number;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeAgentId = params.get("agent");
  const activeAgent = agents.find((a) => a.id === activeAgentId) ?? null;

  // Navigating must close the drawer or it covers the page you just opened.
  // Done on click rather than in an effect on `pathname` — reacting to the route
  // would set state during render of the new page and cascade a second render.
  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--rule)] px-4">
        <NabuMark />
        <span className="text-[15px] font-semibold tracking-tight">Nabu</span>
      </div>

      <div className="border-b border-[var(--rule)] p-3">
        <AgentSwitcher
          agents={agents}
          active={activeAgent}
          totalUnread={totalUnread}
          onNavigate={closeDrawer}
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {NAV.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            // Settings and Agents are instance-wide; the others carry the scope.
            const scoped = !["/settings", "/agents"].includes(item.href);
            const href =
              scoped && activeAgentId ? `${item.href}?agent=${activeAgentId}` : item.href;
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={href}
                  onClick={closeDrawer}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-[7px] px-2.5 text-[13.5px] font-medium transition-colors",
                    isActive
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon size={16} strokeWidth={2} className="shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.href === "/inbox" && totalUnread > 0 && (
                    <span className="pill pill-accent h-5 px-1.5 text-[11px]">{totalUnread}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto shrink-0 border-t border-[var(--rule)] px-4 py-3">
        <p className="text-[11.5px] text-[var(--ink-3)]">
          Nabu · self&#8209;hosted
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="hidden w-[var(--sidebar-w)] shrink-0 border-r border-[var(--rule)] bg-[var(--surface)] md:block">
        {sidebar}
      </aside>

      {drawerOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="animate-fade fixed inset-0 z-40 bg-black/45 md:hidden"
          />
          <aside className="animate-fade fixed inset-y-0 left-0 z-50 w-[min(84vw,var(--sidebar-w))] border-r border-[var(--rule)] bg-[var(--surface)] shadow-[var(--shadow-lg)] md:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              className="btn btn-ghost absolute right-2 top-2 h-9 w-9 !px-0"
            >
              <X size={17} />
            </button>
            {sidebar}
          </aside>
        </>
      )}

      {/* min-w-0 stops a wide table inside from pushing the whole page sideways. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--rule)] bg-[var(--surface)] px-4 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="btn btn-ghost h-9 w-9 !px-0"
          >
            <Menu size={18} />
          </button>
          <NabuMark />
          <span className="text-[15px] font-semibold tracking-tight">Nabu</span>
        </header>

        {banner}

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function AgentSwitcher({
  agents,
  active,
  totalUnread,
  onNavigate,
}: {
  agents: ShellAgent[];
  active: ShellAgent | null;
  totalUnread: number;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const select = (agentId: string | null) => {
    setOpen(false);
    onNavigate();
    const base = ["/settings", "/agents"].includes(pathname) ? "/inbox" : pathname;
    router.push(agentId ? `${base}?agent=${agentId}` : base);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-[7px] border border-[var(--rule-strong)] bg-[var(--surface)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--accent)]"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] bg-[var(--surface-3)] text-[15px] leading-none">
          {active ? active.avatar : "◎"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight">
            {active ? active.name : "All agents"}
          </span>
          <span className="block truncate text-[11.5px] leading-tight text-[var(--ink-3)]">
            {active
              ? active.status === "active"
                ? "Active"
                : "Paused"
              : `${agents.length} agent${agents.length === 1 ? "" : "s"}`}
          </span>
        </span>
        <ChevronDown size={15} className="shrink-0 text-[var(--ink-3)]" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close agent switcher"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="animate-fade absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[320px] overflow-y-auto rounded-[9px] border border-[var(--rule-strong)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]"
          >
            <SwitcherRow
              avatar="◎"
              name="All agents"
              meta={totalUnread > 0 ? `${totalUnread} unread` : "Everything, combined"}
              selected={!active}
              onSelect={() => select(null)}
            />
            {agents.length > 0 && <div className="my-1.5 h-px bg-[var(--rule)]" />}
            {agents.map((agent) => (
              <SwitcherRow
                key={agent.id}
                avatar={agent.avatar}
                name={agent.name}
                meta={
                  agent.unread > 0
                    ? `${agent.unread} unread`
                    : agent.status === "paused"
                      ? "Paused"
                      : "No unread"
                }
                selected={active?.id === agent.id}
                onSelect={() => select(agent.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SwitcherRow({
  avatar,
  name,
  meta,
  selected,
  onSelect,
}: {
  avatar: string;
  name: string;
  meta: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-colors",
        selected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]",
      )}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[5px] bg-[var(--surface-3)] text-[13px] leading-none">
        {avatar}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">{name}</span>
        <span className="block truncate text-[11px] leading-tight text-[var(--ink-3)]">{meta}</span>
      </span>
      {selected && <Check size={14} className="shrink-0 text-[var(--accent)]" />}
    </button>
  );
}

function NabuMark() {
  return (
    <span
      aria-hidden
      className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-[13px] font-bold text-white"
      style={{ background: "linear-gradient(140deg, #6b62ef, #4338ca)" }}
    >
      N
    </span>
  );
}
