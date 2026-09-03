import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { seedLedger, type CreditEntry } from "./credits-data";
import {
  creditsInvoice,
  renewalInvoice,
  seedInvoices,
  type Invoice as InvoiceRecord,
} from "./invoice-data";
import type { Destination as AppDestination } from "@/features/home/Sidebar";

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

/**
 * A card on file, as the app is allowed to know it.
 *
 * BRAND AND LAST FOUR, NOTHING ELSE. Terra never holds a card number: the
 * details go straight to the processor and what comes back is a token plus
 * enough to recognise the card by. Every screen that spends money reads this
 * shape, so there is nowhere for a PAN to be stored even by accident.
 */
export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expires: string;
  /** the name on it — the only part a person can correct after the fact */
  holder: string;
  /** the one every charge goes to. Exactly one card carries it. */
  primary?: boolean;
  /**
   * WHERE THE CARD IS BILLED. Held beside the token because the processor is
   * given it at authorisation time and an admin has to be able to correct it
   * without retyping the number — which is the one thing they cannot do.
   */
  billing: BillingAddress;
}

/** The address a card authorises against. `apt` and `city` are optional in
 *  practice, so they are stored as written rather than as null. */
export interface BillingAddress {
  address: string;
  apt: string;
  country: string;
  city: string;
  postal: string;
}

export const EMPTY_BILLING: BillingAddress = {
  address: "",
  apt: "",
  country: "",
  city: "",
  postal: "",
};

/** How a card reads on a receipt — "Visa ···· 4242". */
export const cardLabel = (c: SavedCard) => `${c.brand} ···· ${c.last4}`;

/* An invoice is a receipt with a body, not four strings — see invoice-data.
   Re-exported here because Billing has always asked the store for the type it
   renders, and the store is still where the list lives. */
export type { Invoice } from "./invoice-data";

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
  /**
   * Leave Settings for a destination in the app shell.
   *
   * Some buttons in here are not settings navigation at all: "View Plans" on
   * Payment Details is asking for the PRICING page, which lives out in the app.
   * Without this the page's only options were to send you to a second, older
   * plan picker or to fake it with a raw hash write from halfway down a form.
   */
  exit: (to?: AppDestination) => void;
  /**
   * A plan somebody has already chosen, waiting for the checkout to pick it up.
   *
   * Two screens outside Subscription ask "which plan" — the Pricing page in the
   * app shell, and the plan sheet on Payment Details — and both used to answer
   * it by dropping you on a picker that asked again. This carries the answer
   * across, and `clearPlanIntent` is how the checkout says it has taken it, so
   * a Back out of the flow lands on the picker instead of bouncing straight
   * back into the plan you just left.
   */
  planIntent: PlanId | null;
  setPlanIntent: (plan: PlanId) => void;
  clearPlanIntent: () => void;
  /** the transient confirmation, top-right. A headline, and the sentence that
   *  says what actually changed — see SettingsToast. */
  toast: Toast | null;
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
  /**
   * Renamed and deleted projects, kept the same way as the rosters above: only
   * what has been TOUCHED is stored, and the page falls back to the workspace's
   * own project list for everything else. A rename here has to survive going
   * back to the table and reopening — the detail screen's local state would
   * lose it the moment you left.
   */
  projectNames: Record<string, string>;
  renameProject: (projectId: string, name: string) => void;
  deletedProjects: string[];
  deleteProject: (projectId: string) => void;
  removeMember: (id: string) => void;
  resendInvite: (id: string) => void;
  grantAdmin: (id: string) => void;
  /** hand the org over: they become Owner, you keep a Full Access seat */
  transferOwnership: (id: string) => void;
  /** buy n more Full Access seats — what a seat upgrade does when none are free */
  buySeats: (n: number) => void;
  subscription: Subscription;
  /** what the org has been billed — written by a purchase, read by Billing */
  invoices: InvoiceRecord[];
  /**
   * THE ONE BALANCE. Runs are priced in credits and credits are bought; there
   * is no second monthly allowance to reconcile against.
   */
  creditBalance: number;
  /** every top-up and every run that spent, newest first */
  creditLog: CreditEntry[];
  /** the card top-ups are charged to — the primary, null until one is added */
  card: SavedCard | null;
  /** every card on file, in the order they were added */
  cards: SavedCard[];
  /**
   * Add one.
   *
   * `number` is passed, read for its last four and a brand, and NOT kept — see
   * `SavedCard`. It is a parameter rather than state so there is no render in
   * which a full number is sitting in this store.
   */
  addCard: (input: {
    number: string;
    expires: string;
    holder: string;
    billing: BillingAddress;
    /** make it the card every charge goes to, ahead of whatever holds it now */
    primary?: boolean;
  }) => void;
  /** correct what a card says — everything about it except the number */
  updateCard: (
    id: string,
    patch: {
      expires?: string;
      holder?: string;
      billing?: BillingAddress;
      primary?: boolean;
    }
  ) => void;
  removeCard: (id: string) => void;
  /** make one the card charges go to */
  setPrimaryCard: (id: string) => void;
  /** charge the card on file and land the credits. No-op without a card. */
  buyCredits: (next: { credits: number; usd: number; label: string }) => void;
  /** commit a plan change: the plan, its cycle, the seats, and the receipt */
  subscribe: (next: {
    plan: PlanId;
    cycle: BillingCycle;
    extraSeats: number;
    total: number;
  }) => void;
  setAccount: (patch: Partial<SettingsAccount>) => void;
  setOrg: (patch: Partial<SettingsOrg>) => void;
  notify: (title: string, body?: string) => void;
  dismissToast: () => void;
}

/**
 * A confirmation.
 *
 * TWO PARTS, because the messages this app raises are two different sentences:
 * "Default Payment Method Changed" is what happened, and "All future charges
 * will use ···· 3432" is the consequence you are actually being told about.
 * Squeezing both into one line either loses the consequence or buries the
 * headline. `body` stays optional — most confirmations are still one clause.
 */
export interface Toast {
  title: string;
  body?: string;
}

const Ctx = createContext<SettingsStore | null>(null);

let cardSeq = 1;
const nextCardId = () => `card-${(cardSeq += 1)}`;

/** The card every charge goes to: the primary, or the only one there is. */
const primaryOf = (list: SavedCard[]) => list.find((c) => c.primary) ?? list[0] ?? null;

/** Initials follow the name — an org renamed to "Acme" must not keep showing GG. */
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

export function SettingsProvider({
  children,
  start,
  startPlan,
  onExit,
}: {
  children: ReactNode;
  /** the page to open on, when a link arrives pointing at one */
  start?: SettingsPage;
  /** the plan a link arrived asking to buy — `#settings/plans/pro` */
  startPlan?: PlanId;
  /** how a page leaves Settings — see `exit` on the store */
  onExit?: (to?: AppDestination) => void;
}) {
  const [account, setAccountState] = useState<SettingsAccount>(() => {
    const [first = "", ...rest] = seedAccount.name.split(" ");
    return { ...seedAccount, firstName: first, lastName: rest.join(" "), photo: null };
  });
  const [org, setOrgState] = useState<SettingsOrg>({
    ...seedOrg,
    logo: null,
    planActive: true,
  });
  const [toast, setToast] = useState<Toast | null>(null);
  const [page, setPage] = useState<SettingsPage>(start ?? "profile");

  /* A link that arrives while Settings is ALREADY open still has to land. The
     initial value covers arriving from outside; this covers the hash changing
     under a mounted shell, which is what a second `#settings/<page>` link from
     a panel floating over Settings would do. Rail clicks don't re-fire it —
     `start` hasn't changed. */
  useEffect(() => {
    if (start) setPage(start);
  }, [start]);

  const [planIntent, setPlanIntentState] = useState<PlanId | null>(startPlan ?? null);
  /* Same reason as `start` above: a second `#settings/plans/<id>` link arriving
     under an already-mounted shell has to land too. */
  useEffect(() => {
    if (startPlan) setPlanIntentState(startPlan);
  }, [startPlan]);
  const setPlanIntent = useCallback((plan: PlanId) => setPlanIntentState(plan), []);
  const clearPlanIntent = useCallback(() => setPlanIntentState(null), []);
  const [subscription, setSubscription] = useState<Subscription>({
    plan: planIdFromLabel(seedOrg.plan),
    cycle: "monthly",
    extraSeats: 0,
    renewsOn: null,
  });
  /* Seeded from the clock, like the credit ledger below and for the same
     reason: an empty Invoices tab can't show what a row looks like, and one
     dated to a fixed month reads as stale the day after it was written. */
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => seedInvoices(Date.now()));
  /* Seeded from the clock once, like the run history is, so the ledger is dated
     relative to whenever the app is opened rather than to a day in the past. */
  const [creditLog, setCreditLog] = useState<CreditEntry[]>(() => seedLedger(Date.now()));
  const [creditBalance, setCreditBalance] = useState(3_728);
  /* A placeholder card so the top-up path is walkable end to end. Real cards
     arrive from the processor as a token plus a brand and four digits — which
     is why the list below holds no number and the add form throws the one it
     is given away the moment it has read the end off it. */
  const [cards, setCards] = useState<SavedCard[]>([
    {
      id: "card-1",
      brand: "Visa",
      last4: "4242",
      expires: "04/28",
      holder: "GG TOE",
      primary: true,
      billing: {
        address: "1027 East Coast Parkway",
        apt: "#01-18 Marine Cove",
        country: "Singapore",
        city: "Singapore",
        postal: "449876",
      },
    },
  ]);
  const card = primaryOf(cards);
  /* The confirmations below name the card they are about ("···· 3432"), which
     the setState updater cannot reach and a `cards` dependency would pay for by
     rebuilding every card handler on every keystroke elsewhere. A ref reads the
     list as it stands when the handler runs, which is what the message needs. */
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const [members, setMembers] = useState<MemberRow[]>(seedMembers);
  const [projectAccess, setProjectAccessState] = useState<Record<string, AccessMember[]>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [deletedProjects, setDeletedProjects] = useState<string[]>([]);

  /** Toasts replace rather than queue: two confirmations stacked up is noise,
   *  and the last thing you did is the one you're checking. */
  const notify = useCallback((title: string, body?: string) => {
    setToast({ title, body });
    window.clearTimeout((notify as unknown as { t?: number }).t);
    /* A two-line toast takes longer to read than a one-line one, so it stays
       up longer rather than being dismissed mid-sentence. */
    (notify as unknown as { t?: number }).t = window.setTimeout(
      () => setToast(null),
      body ? 4800 : 3200
    );
  }, []);

  /**
   * WHAT A BRAND IS, from the first digit.
   *
   * Enough to draw the right word beside four digits, which is all this
   * prototype has to do. A real integration is told the brand by the processor
   * along with the token; nothing here should ever be the authority on it.
   */
  const brandOf = (digits: string) => {
    if (/^4/.test(digits)) return "Visa";
    if (/^5[1-5]/.test(digits)) return "Mastercard";
    if (/^35/.test(digits)) return "JCB";
    if (/^3[47]/.test(digits)) return "Amex";
    if (/^6/.test(digits)) return "Discover";
    return "Card";
  };

  const addCard = useCallback<SettingsStore["addCard"]>(
    ({ number, expires, holder, billing, primary }) => {
      const digits = number.replace(/\D/g, "");
      if (digits.length < 12) return;
      const added: SavedCard = {
        id: nextCardId(),
        brand: brandOf(digits),
        last4: digits.slice(-4),
        expires,
        holder: holder.trim(),
        billing,
      };
      setCards((list) => {
        // The first card on file is the primary by definition — a card nothing
        // charges is not a payment method, it is a note. After that it is only
        // primary if the person adding it asked for that.
        const takesOver = primary || list.length === 0;
        const next = takesOver ? list.map((c) => ({ ...c, primary: false })) : list;
        return [...next, { ...added, primary: takesOver }];
      });
      notify(
        "New Payment Method Added",
        `A new payment method ending in ···· ${added.last4} has been added to your account.`
      );
    },
    [notify]
  );

  const updateCard = useCallback<SettingsStore["updateCard"]>(
    (id, patch) => {
      const { primary, ...rest } = patch;
      setCards((list) =>
        list.map((c) => {
          const edited = c.id === id ? { ...c, ...rest } : c;
          // Promoting one card demotes the rest in the same write, so the list
          // is never briefly carrying two cards that both claim the charges.
          return primary === undefined ? edited : { ...edited, primary: c.id === id ? primary : false };
        })
      );
      const last4 = cardsRef.current.find((c) => c.id === id)?.last4 ?? "";
      notify(
        "Payment Details Updated Successfully",
        `Your payment method ending in ···· ${last4} has been successfully updated. Future payments will use the updated details.`
      );
    },
    [notify]
  );

  const removeCard = useCallback(
    (id: string) => {
      setCards((list) => {
        const next = list.filter((c) => c.id !== id);
        // Removing the primary promotes the next one rather than leaving the
        // org with cards on file and nothing to charge.
        return next.length && !next.some((c) => c.primary)
          ? next.map((c, i) => (i === 0 ? { ...c, primary: true } : c))
          : next;
      });
      notify(
        "Payment Method Removed",
        `···· ${cardsRef.current.find((c) => c.id === id)?.last4 ?? ""} is no longer available for charges.`
      );
    },
    [notify]
  );

  const setPrimaryCard = useCallback<SettingsStore["setPrimaryCard"]>(
    (id) => {
      setCards((list) => list.map((c) => ({ ...c, primary: c.id === id })));
      const last4 = cardsRef.current.find((c) => c.id === id)?.last4 ?? "";
      notify(
        "Default Payment Method Changed",
        `Your default payment method is now ···· ${last4}. All future charges will use this method.`
      );
    },
    [notify]
  );

  /**
   * Buy credits.
   *
   * THREE WRITES THAT BELONG TOGETHER — the balance, the ledger row and the
   * receipt — for the same reason `subscribe` keeps its three together: a
   * top-up that lands the credits but leaves no record is money the user can't
   * account for later.
   *
   * The card is charged by the processor, not here. This records the outcome.
   */
  const buyCredits = useCallback<SettingsStore["buyCredits"]>(
    (next) => {
      if (!card) return;
      const at = Date.now();
      const id = `TX-${String(at).slice(-6)}`;
      setCreditBalance((b) => b + next.credits);
      setCreditLog((log) => [
        {
          id,
          at,
          kind: "purchase",
          detail: next.label,
          credits: next.credits,
          usd: next.usd,
          method: cardLabel(card),
        },
        ...log,
      ]);
      setInvoices((prev) => [
        creditsInvoice({
          at,
          credits: next.credits,
          usd: next.usd,
          label: next.label,
          method: cardLabel(card),
        }),
        ...prev,
      ]);
      notify(`${next.credits.toLocaleString()} credits added — ${cardLabel(card)} charged.`);
    },
    [card, notify]
  );

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
        /* The invoice prices ITSELF off the plan and the seats, rather than
           being handed the checkout's total: the drawer shows the breakdown, and
           a body built from one set of rates under a total taken from another is
           a receipt that doesn't add up. */
        setInvoices((list) => [
          renewalInvoice({
            at: today.getTime(),
            plan,
            cycle,
            extraSeats,
            status: "paid",
            /* The card as it stands when the purchase lands — read off the ref
               rather than closed over, so this handler isn't rebuilt on every
               keystroke in the card form. */
            method: primaryOf(cardsRef.current) ? cardLabel(primaryOf(cardsRef.current)!) : null,
          }),
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

  const grantAdmin = useCallback<SettingsStore["grantAdmin"]>((id) => {
    setMembers((list) => list.map((m) => (m.id === id ? { ...m, role: "Admin" } : m)));
  }, []);

  /**
   * Ownership is a swap, not a grant. There is exactly one Owner seat, so
   * handing it over has to demote the person handing it over in the same write
   * — otherwise the roster briefly has two owners and the seat ledger counts
   * one of them twice.
   */
  const transferOwnership = useCallback<SettingsStore["transferOwnership"]>((id) => {
    setMembers((list) =>
      list.map((m) => {
        if (m.id === id) return { ...m, seat: "owner", role: "Owner", status: "active" };
        if (m.seat === "owner") return { ...m, seat: "full", role: "Admin" };
        return m;
      })
    );
  }, []);

  const buySeats = useCallback<SettingsStore["buySeats"]>((n) => {
    setSubscription((s) => ({ ...s, extraSeats: s.extraSeats + n }));
  }, []);

  const setProjectRoster = useCallback<SettingsStore["setProjectRoster"]>(
    (projectId, roster) => setProjectAccessState((all) => ({ ...all, [projectId]: roster })),
    []
  );

  const renameProject = useCallback<SettingsStore["renameProject"]>((projectId, name) => {
    const next = name.trim();
    if (!next) return; // an empty title is not a rename, it is a mistake
    setProjectNames((all) => ({ ...all, [projectId]: next }));
  }, []);

  const deleteProject = useCallback<SettingsStore["deleteProject"]>((projectId) => {
    setDeletedProjects((all) => (all.includes(projectId) ? all : [...all, projectId]));
  }, []);

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
      exit: onExit ?? (() => undefined),
      planIntent,
      setPlanIntent,
      clearPlanIntent,
      toast,
      members,
      seatLedger,
      inviteMembers,
      setMemberSeat,
      removeMember,
      resendInvite,
      grantAdmin,
      transferOwnership,
      buySeats,
      projectAccess,
      setProjectRoster,
      projectNames,
      renameProject,
      deletedProjects,
      deleteProject,
      subscription,
      invoices,
      creditBalance,
      creditLog,
      card,
      cards,
      addCard,
      updateCard,
      removeCard,
      setPrimaryCard,
      buyCredits,
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
      onExit,
      planIntent,
      setPlanIntent,
      clearPlanIntent,
      toast,
      members,
      seatLedger,
      inviteMembers,
      setMemberSeat,
      removeMember,
      resendInvite,
      grantAdmin,
      transferOwnership,
      buySeats,
      projectAccess,
      setProjectRoster,
      projectNames,
      renameProject,
      deletedProjects,
      deleteProject,
      subscription,
      invoices,
      creditBalance,
      creditLog,
      card,
      cards,
      addCard,
      updateCard,
      removeCard,
      setPrimaryCard,
      buyCredits,
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
