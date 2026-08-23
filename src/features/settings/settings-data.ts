import type { IconName } from "@/components/icons";

/**
 * SETTINGS — the account, the organization, and what it has been doing.
 *
 * Mostly read-only material: seats, invoices, logs. The numbers are deliberately
 * near-empty, because this is a fresh Free-plan org and a settings screen full of
 * plausible-looking activity hides whether the empty states actually work.
 */

export type SettingsPage =
  | "profile"
  | "messages"
  | "organizations"
  | "dashboard"
  | "members"
  | "project-access"
  | "activity"
  | "balance"
  | "org-profile"
  | "payment"
  | "billing"
  /** the subscription flow — reached from Payment Details and Billing, never
   *  from the rail: it's a task you finish and leave, not a place to sit. */
  | "plans";

export const SETTINGS_NAV: {
  section: string;
  items: { id: SettingsPage; label: string; icon: IconName }[];
}[] = [
  {
    section: "Personal Account",
    items: [
      { id: "profile", label: "My Profile", icon: "person" },
      { id: "messages", label: "Message Preferences", icon: "mail" },
      { id: "organizations", label: "My Organizations", icon: "community" },
    ],
  },
  {
    section: "Organization Management",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "dashboard" },
      { id: "members", label: "Members", icon: "shared" },
      { id: "project-access", label: "Project Access", icon: "file" },
      { id: "activity", label: "Activity Logs", icon: "activity-log" },
      { id: "balance", label: "Terra Balance", icon: "balance" },
      { id: "org-profile", label: "Org Profile", icon: "edit" },
    ],
  },
  {
    section: "Payment & Plans",
    items: [
      { id: "payment", label: "Payment Details", icon: "payment" },
      { id: "billing", label: "Billing", icon: "balance" },
    ],
  },
];

export const account = {
  name: "GG TOE",
  email: "mgmgblack66@gmail.com",
  /** the label under Delete your account, which cites when the account began */
  createdAt: "11:27 AM on August 8, 2026",
};

export const org = {
  id: "gg",
  name: "gg",
  initials: "GG",
  plan: "Free Plan",
  members: 2,
  /** what Payment Details calls the subscription's owner */
  legalName: "Meta Block AI's org",
  billingEmail: "**********@gmail.com",
};

/** The quota pill in the settings top bar, and the Terra Balance cards. */
export const quota = {
  images: { used: 10, total: 0 },
  videos: { used: 0, total: 0 },
  credits: 0,
  planExpires: "May 26, 2025",
};

export const seats = {
  total: 1,
  /** the one seat that can't be revoked or reassigned */
  owner: 1,
  assigned: 0,
  available: 0,
  viewer: 0,
  /** what My Organizations totals at the foot of the table */
  assignedLabel: "1 assigned seats",
};

/**
 * A seat is what someone COSTS; a role is what they're called. They move
 * together for the Owner and come apart for everyone else, which is why they're
 * two fields: an Admin can hold a Viewer seat, and the bill only knows about
 * the seat.
 */
export type SeatKind = "owner" | "full" | "viewer";

/** Invited but not yet accepted. A pending row holds a seat all the same —
 *  otherwise the seat count changes when someone gets round to reading email. */
export type MemberStatus = "active" | "pending";

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
  seat: SeatKind;
  status: MemberStatus;
  projects: number;
  lastActive: string;
}

/**
 * What each seat lets you do, in a sentence. Derived rather than stored: the
 * Includes column and the seat picker were quoting the same rule from two
 * places, and the row that had its seat changed kept the old sentence.
 */
export const SEAT_LABEL: Record<SeatKind, string> = {
  owner: "Owner",
  full: "Full Access",
  viewer: "Viewer",
};

export const SEAT_INCLUDES: Record<SeatKind, string> = {
  owner: "Can create, manage, and invite others across projects.",
  full: "Can create, manage, and invite others across projects.",
  viewer: "Can edit but cannot create new projects or manage team roles.",
};

/**
 * The org starts with two people, not one. A roster of just yourself can't
 * show what this screen is FOR — granting admin, transferring ownership and
 * changing someone's seat are all things you do to another person, and with
 * nobody else on the list every one of those states is unreachable.
 */
export const members: MemberRow[] = [
  {
    id: "m1",
    name: "GG TOE",
    email: "mgmgblack66@gmail.com",
    role: "Owner",
    seat: "owner",
    status: "active",
    projects: 0,
    lastActive: "less than a minute ago",
  },
  {
    id: "m2",
    name: "Henry William",
    email: "henrysalmon@gmail.com",
    role: "Editor",
    seat: "full",
    status: "active",
    projects: 0,
    lastActive: "1 day ago",
  },
];

export interface OrgRow {
  id: string;
  name: string;
  initials: string;
  plan: string;
  members: number;
  seat: string;
  lastActive: string;
  joined: string;
  current?: boolean;
}

export const myOrganizations: OrgRow[] = [
  {
    id: "gg",
    name: "gg",
    initials: "GG",
    plan: "Free Plan",
    members: 1,
    seat: "Owner",
    lastActive: "5 mins ago",
    joined: "—",
    current: true,
  },
];

export type LogCategory = "Prj" | "Auth" | "Org" | "Bill";

export interface LogRow {
  id: string;
  time: string;
  date: string;
  name: string;
  role?: string;
  category: LogCategory;
  code: string;
  description: string;
  status: "Success" | "Failed";
}

export const activityLogs: LogRow[] = [
  { id: "l1", time: "23:45:57", date: "Aug 21, 2026", name: "GG TOE", role: "Owner", category: "Prj", code: "PROJECT_TRASHED", description: "GG TOE moved project nn to trash", status: "Success" },
  { id: "l2", time: "14:37:35", date: "Aug 13, 2026", name: "GG TOE", category: "Auth", code: "AUTH_LOGIN", description: "GG TOE logged in successfully", status: "Success" },
  { id: "l3", time: "12:03:42", date: "Aug 08, 2026", name: "GG TOE", role: "Owner", category: "Prj", code: "PROJECT_CREATED", description: "GG TOE created a new project nn", status: "Success" },
  { id: "l4", time: "12:03:35", date: "Aug 08, 2026", name: "GG TOE", role: "Owner", category: "Prj", code: "FOLDER_CREATED", description: "GG TOE created a new folder jj", status: "Success" },
  { id: "l5", time: "11:27:46", date: "Aug 08, 2026", name: "GG TOE", category: "Auth", code: "AUTH_LOGIN", description: "GG TOE logged in successfully", status: "Success" },
];

/** Today's counters above the log. Derived so they can't contradict the rows. */
export const logStats = {
  today: activityLogs.filter((l) => l.date === "Aug 21, 2026").length,
  activeMembers: 1,
  failed: activityLogs.filter((l) => l.status === "Failed").length,
};

/** Message Preferences — the four topics, in the order the design shows them. */
export const messageTopics: { id: string; label: string; body: string }[] = [
  { id: "platform", label: "Platform Updates", body: "Major feature launches, UI changes, and critical improvements." },
  { id: "invites", label: "Team Invitations & Access", body: "Alerts when someone invites you to a project or joins your team." },
  { id: "activity", label: "Project Activity", body: "Notifications when projects are modified, shared, or generated." },
  { id: "credits", label: "Credit Usage & Balance", body: "Reminders on low credit, balance top-ups, and usage breakdowns." },
];

/** The org's own switches, under "Notify me when:". */
export const orgNotifyRows = [
  "Someone joins the team",
  "Someone requests a seat access",
  "A member leaves the organization",
  "A project is shared outside the org",
];


/**
 * One person's access to ONE project, as opposed to their seat in the org.
 * The two are different facts: an org member with a Full Access seat still has
 * to be added to a project before they can open it, and an external guest holds
 * no org seat at all.
 */
export interface AccessMember {
  id: string;
  name: string;
  email: string;
  seat: "Owner" | "Full Access" | "Viewer";
  scope: "internal" | "external";
  status: MemberStatus;
  lastActive: string;
  since: string;
}
