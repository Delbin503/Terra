import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  account as seedAccount,
  members as seedMembers,
  org as seedOrg,
  type AccessMember,
  type MemberRow,
  type SeatKind,
  type SettingsPage,
} from "./settings-data";
import {
  planIdFromLabel,
  planLabel,
  planSpec,
  type BillingCycle,
  type PlanId,
} from "./subscription-data";

/**
 * SETTINGS STORE — the account and org as editable state.
 *
 * The pages used to read `account` and `org` straight out of the data module,
 * which are frozen module constants. That made every control on these screens
 * decorative: Edit opened nothing, Remove removed nothing, and the only way to
 * tell was to click one. A settings screen whose buttons don't answer is worse
 * than one with fewer buttons, because it teaches you not to trust the ones
 * that DO work.
 *
 * So the same shapes live here in state, seeded from the constants. Edits stick
 * for the session and are visible everywhere at once — the rail's org card, the
 * top bar's avatar and the page you edited it on all read the same object.
 *
 * NOT PERSISTED, deliberately. There's no account API behind this yet, and
 * writing to localStorage would make a prototype's edits outlive the prototype
 * — you'd reload tomorrow into a half-real account with no way to reset it.
 */

export interface SettingsAccount {
  firstName: string;
  lastName: string;
  /** derived from the two above — what avatars and greetings read */
  name: string;
  email: string;
  createdAt: string;
  /** object URL of an uploaded photo, or null for the initials avatar */
  photo: string | null;
}

export interface SettingsOrg {
  id: string;
  name: string;
  initials: string;
  plan: string;
  members: number;
  legalName: string;
  billingEmail: string;
  logo: string | null;
  /** false once the plan is cancelled, which the Org Profile toggles */
  planActive: boolean;
}

/** What the org is paying for, and the paperwork a purchase leaves behind. */
export interface Subscription {
  plan: PlanId;
  cycle: BillingCycle;
  /** Full Access seats bought ON TOP of the ones the plan includes */
  extraSeats: number;
  /** null until the first purchase — a Free org has never been billed */
  renewsOn: string | null;
}

export interface Invoice {
  id: string;
  due: string;
  type: string;
  status: string;
  total: string;
}

/** The seat ledger: what the plan bought, and what the roster has spent. */
export interface SeatLedger {
  owner: number;
  /** Full Access seats the plan includes, plus any bought on top */
  fullTotal: number;
  fullUsed: number;
  fullFree: number;
  viewer: number;
  /** every seat currently held, which is what the table foots to */
  assigned: number;
}

interface SettingsStore {
  account: SettingsAccount;
  org: SettingsOrg;
  /** which page the rail is pointing at — in the store because half the
   *  cross-page buttons ("Manage" seats, "View Plans") are really navigation */
  page: SettingsPage;
  go: (p: SettingsPage) => void;
  /** the transient confirmation line under the top bar */
  toast: string | null;
  /** the org roster, as editable state — seats move, people leave */
  members: MemberRow[];
  seatLedger: SeatLedger;
  /** invite by email; each lands as a pending row already holding its seat */
  inviteMembers: (rows: { email: string; seat: "full" | "viewer" }[]) => void;
  setMemberSeat: (id: string, seat: SeatKind) => void;
  /**
   * Per-project rosters, keyed by project id, holding only those that have been
   * EDITED. A project the admin hasn't touched isn't in here at all and falls
   * back to the page's own derived seed — which keeps a prototype from having
   * to invent a roster for every project up front just so one can be changed.
   */
  projectAccess: Record<string, AccessMember[]>;
  setProjectRoster: (projectId: string, roster: AccessMember[]) => void;
  removeMember: (id: string) => void;
  resendInvite: (id: string) => void;
  subscription: Subscription;
  /** what the org has been billed — written by a purchase, read by Billing */
  invoices: Invoice[];
  /** commit a plan change: the plan, its cycle, the seats, and the receipt */
  subscribe: (next: {
    plan: PlanId;
    cycle: BillingCycle;
    extraSeats: number;
    total: number;
  }) => void;
  setAccount: (patch: Partial<SettingsAccount>) => void;
  setOrg: (patch: Partial<SettingsOrg>) => void;
  notify: (message: string) => void;
  dismissToast: () => void;
}

const Ctx = createContext<SettingsStore | null>(null);

/** Initials follow the name — an org renamed to "Acme" must not keep showing GG. */
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [account, setAccountState] = useState<SettingsAccount>(() => {
    const [first = "", ...rest] = seedAccount.name.split(" ");
    return { ...seedAccount, firstName: first, lastName: rest.join(" "), photo: null };
  });
  const [org, setOrgState] = useState<SettingsOrg>({
    ...seedOrg,
    logo: null,
    planActive: true,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState<SettingsPage>("profile");
  const [subscription, setSubscription] = useState<Subscription>({
    plan: planIdFromLabel(seedOrg.plan),
    cycle: "monthly",
    extraSeats: 0,
    renewsOn: null,
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [members, setMembers] = useState<MemberRow[]>(seedMembers);
  const [projectAccess, setProjectAccessState] = useState<Record<string, AccessMember[]>>({});

  /** Toasts replace rather than queue: two confirmations stacked up is noise,
   *  and the last thing you did is the one you're checking. */
  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout((notify as unknown as { t?: number }).t);
    (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const setAccount = useCallback(
    (patch: Partial<SettingsAccount>) =>
      setAccountState((a) => {
        const next = { ...a, ...patch };
        // `name` is never set directly — it follows the two parts, so an avatar
        // can't keep showing initials the profile no longer says.
        next.name = `${next.firstName} ${next.lastName}`.trim();
        return next;
      }),
    []
  );

  const setOrg = useCallback(
    (patch: Partial<SettingsOrg>) =>
      setOrgState((o) => ({
        ...o,
        ...patch,
        initials: patch.name ? initialsOf(patch.name) : o.initials,
      })),
    []
  );

  /**
   * A purchase is three writes that have to happen together: the subscription
   * itself, the plan label the rest of Settings reads off the org, and the
   * invoice. Splitting them across the pages that trigger them is how a
   * prototype ends up showing "Pro" in the rail and an empty Billing tab.
   */
  const subscribe = useCallback<SettingsStore["subscribe"]>(
    ({ plan, cycle, extraSeats, total }) => {
      const today = new Date();
      const renews = new Date(today);
      if (cycle === "annual") renews.setFullYear(renews.getFullYear() + 1);
      else renews.setMonth(renews.getMonth() + 1);
      const date = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

      setSubscription({ plan, cycle, extraSeats, renewsOn: plan === "free" ? null : date(renews) });
      setOrgState((o) => ({ ...o, plan: planLabel(plan), planActive: true }));

      // A free downgrade isn't a charge, so it doesn't leave an invoice.
      if (total > 0) {
        setInvoices((list) => [
          {
            id: `inv-${Date.now()}`,
            due: date(today),
            type: `${planLabel(plan)} · ${cycle === "annual" ? "Annual" : "Monthly"}`,
            status: "Paid",
            total: total.toLocaleString("en-US", { style: "currency", currency: "USD" }),
          },
          ...list,
        ]);
      }
    },
    []
  );

  /**
   * Seats are counted off the roster rather than stored beside it. A stored
   * count is a second source of truth that drifts the first time someone is
   * removed from a screen that forgot to decrement it — and the number in the
   * header strip is the one an admin uses to decide whether they can invite.
   */
  const seatLedger = useMemo<SeatLedger>(() => {
    const fullTotal = planSpec(subscription.plan).seats.full + subscription.extraSeats;
    const owner = members.filter((m) => m.seat === "owner").length;
    // The owner occupies one of the plan's Full Access seats, not a seat of its
    // own — otherwise a 3-seat plan appears to seat four people.
    const fullUsed = members.filter((m) => m.seat === "full").length + owner;
    return {
      owner,
      fullTotal,
      fullUsed,
      fullFree: Math.max(0, fullTotal - fullUsed),
      viewer: members.filter((m) => m.seat === "viewer").length,
      assigned: members.length,
    };
  }, [members, subscription.plan, subscription.extraSeats]);

  const inviteMembers = useCallback<SettingsStore["inviteMembers"]>((rows) => {
    setMembers((list) => [
      ...list,
      ...rows.map((r, i) => ({
        id: `m${Date.now()}${i}`,
        // Nobody has told us their name yet — the invitation went to an address.
        name: r.email.split("@")[0],
        email: r.email,
        role: (r.seat === "viewer" ? "Viewer" : "Editor") as MemberRow["role"],
        seat: r.seat as SeatKind,
        status: "pending" as const,
        projects: 0,
        lastActive: "Invitation pending",
      })),
    ]);
  }, []);

  /** The Owner's seat is the one seat that can't be reassigned or released. */
  const setMemberSeat = useCallback<SettingsStore["setMemberSeat"]>((id, seat) => {
    setMembers((list) =>
      list.map((m) =>
        m.id !== id || m.seat === "owner"
          ? m
          : { ...m, seat, role: seat === "viewer" ? "Viewer" : "Editor" }
      )
    );
  }, []);

  const removeMember = useCallback<SettingsStore["removeMember"]>((id) => {
    setMembers((list) => list.filter((m) => !(m.id === id && m.seat !== "owner")));
  }, []);

  const setProjectRoster = useCallback<SettingsStore["setProjectRoster"]>(
    (projectId, roster) => setProjectAccessState((all) => ({ ...all, [projectId]: roster })),
    []
  );

  const resendInvite = useCallback<SettingsStore["resendInvite"]>((id) => {
    setMembers((list) =>
      list.map((m) => (m.id === id ? { ...m, lastActive: "Invitation resent just now" } : m))
    );
  }, []);

  const go = useCallback((p: SettingsPage) => {
    setPage(p);
    // A cross-page jump lands at the top: arriving mid-scroll on a page you
    // didn't choose to scroll is disorienting.
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(
    () => ({
      account,
      org,
      page,
      go,
      toast,
      members,
      seatLedger,
      inviteMembers,
      setMemberSeat,
      removeMember,
      resendInvite,
      projectAccess,
      setProjectRoster,
      subscription,
      invoices,
      subscribe,
      setAccount,
      setOrg,
      notify,
      dismissToast: () => setToast(null),
    }),
    [
      account,
      org,
      page,
      go,
      toast,
      members,
      seatLedger,
      inviteMembers,
      setMemberSeat,
      removeMember,
      resendInvite,
      projectAccess,
      setProjectRoster,
      subscription,
      invoices,
      subscribe,
      setAccount,
      setOrg,
      notify,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
