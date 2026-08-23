import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import {
  Avatar,
  Button,
  ContextMenu,
  DataTable,
  Select,
  Tabs,
  type Column,
  type MenuItem,
} from "@/components/ui";
import { Chip, DateField, PageTitle, SearchField } from "./settings-parts";
import { ConfirmDialog } from "./settings-dialogs";
import { InviteMembersDialog } from "./InviteMembersDialog";
import { useSettings } from "./settings-store";
import type { AccessMember } from "./settings-data";
import { folders, projects } from "@/features/home/data";

/**
 * PROJECT ACCESS — which projects exist, and who can open them.
 *
 * Two screens, not one. The table answers "what is there and how widely is it
 * shared"; opening a row answers "who exactly", which is a different question
 * with a different shape — a roster split by where those people come from.
 *
 * INTERNAL vs EXTERNAL is the split that matters, because it decides what you
 * are allowed to give them. Someone inside the org can hold a paid Full Access
 * seat. Someone outside cannot — they are a guest on one project, so Viewer is
 * the only seat that exists for them, and the invite dialog for that tab has no
 * seat control at all rather than one that rejects the other choice.
 */

type Scope = "internal" | "external";

/** Derived from the workspace's own projects, so this page and the Projects
 *  page can never disagree about what exists. */
function accessRows() {
  const folderName = (id?: string) => folders.find((f) => f.id === id)?.name ?? "—";
  return projects.map((p) => ({
    id: p.id,
    project: p.name,
    folder: folderName(p.folderId),
    type: p.kind,
    // A shared project has the owner plus a guest; an unshared one is just you.
    members: p.shared ? 2 : 1,
    created: p.editedLabel.replace("Edited ", "Created "),
    shared: !!p.shared,
  }));
}

type AccessRow = ReturnType<typeof accessRows>[number];

export function ProjectAccessPage() {
  const { projectAccess } = useSettings();
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(accessRows, []);
  const shown = rows.filter(
    (r) =>
      r.project.toLowerCase().includes(query.trim().toLowerCase()) &&
      (folder === "all" || r.folder === folder)
  );

  const open = rows.find((r) => r.id === openId) ?? null;
  if (open) return <ProjectDetail row={open} onBack={() => setOpenId(null)} />;

  const columns: Column<AccessRow>[] = [
    { key: "project", label: "Project Name", sortValue: (r) => r.project, render: (r) => r.project },
    { key: "folder", label: "Folder Name", sortValue: (r) => r.folder, render: (r) => r.folder },
    { key: "type", label: "Project Type", sortValue: (r) => r.type, render: (r) => r.type },
    {
      key: "members",
      // Reads the edited roster where there is one, so removing someone inside
      // a project doesn't leave the list still claiming they're there.
      label: "Members with Access",
      sortValue: (r) => projectAccess[r.id]?.length ?? r.members,
      render: (r) => {
        const n = projectAccess[r.id]?.length ?? r.members;
        return `${n} Member${n === 1 ? "" : "s"}`;
      },
    },
    {
      key: "created",
      label: "Project Created Date",
      sortValue: (r) => r.created,
      render: (r) => r.created,
    },
    {
      key: "action",
      label: "Action",
      align: "right",
      render: (r) => (
        <button
          type="button"
          aria-label={`Open ${r.project}`}
          onClick={() => setOpenId(r.id)}
          className="inline-grid h-8 w-8 place-items-center rounded-lg border border-glass/10 text-content-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Icon name="chevron-right" size={16} />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Project Access</PageTitle>
        <div className="flex items-center gap-2">
          <Tally icon="folder" tone="accent" value={folders.length} label="Folders" />
          <Tally
            icon="shared"
            tone="brand"
            value={rows.filter((r) => r.shared).length}
            label="Shared projects"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search project"
          className="w-[18rem]"
        />
        <Select
          aria-label="Folder"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          options={[
            { value: "all", label: "All Folders" },
            ...folders.map((f) => ({ value: f.name, label: f.name })),
          ]}
          className="w-[13rem]"
        />
        <DateField label="Select date" />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(r) => r.id}
          pageSize={7}
          empty="No results"
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ detail */

function ProjectDetail({ row, onBack }: { row: AccessRow; onBack: () => void }) {
  const { account, notify, projectAccess, setProjectRoster } = useSettings();
  const [scope, setScope] = useState<Scope>("internal");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ m: AccessMember; at: { x: number; y: number } } | null>(null);
  const [removing, setRemoving] = useState<AccessMember | null>(null);

  /** What the project starts with, before anyone edits it. */
  const seed: AccessMember[] = useMemo(
    () => [
      {
        id: "a1",
        name: account.name,
        email: account.email,
        seat: "Owner",
        scope: "internal",
        status: "active",
        lastActive: "5 mins ago",
        since: "August 23, 2026",
      },
      ...(row.shared
        ? [
            {
              id: "a2",
              name: "R. Whitfield",
              email: "r.whitfield@outsidecorp.com",
              seat: "Viewer" as const,
              scope: "external" as const,
              status: "active" as const,
              lastActive: "2 days ago",
              since: "August 21, 2026",
            },
          ]
        : []),
    ],
    [account.name, account.email, row.shared]
  );

  // The store only holds rosters that have been touched; everything else reads
  // its seed, so going back and reopening a project you DID edit still shows
  // the edit rather than quietly reverting it.
  const roster = projectAccess[row.id] ?? seed;
  const commit = (next: AccessMember[]) => setProjectRoster(row.id, next);

  function openMenu(m: AccessMember, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ m, at: { x: box.left, y: box.bottom + 4 } });
  }

  /** A guest is Viewer-only, so the promotion that would break that is refused
   *  at the source rather than offered and then undone. */
  function changeSeat(m: AccessMember, seat: AccessMember["seat"]) {
    if (m.seat === seat || m.scope === "external") return;
    commit(roster.map((x) => (x.id === m.id ? { ...x, seat } : x)));
    notify(`${m.name} is now ${seat} on ${row.project}.`);
  }

  const shown = roster.filter(
    (m) =>
      m.scope === scope &&
      (m.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        m.email.toLowerCase().includes(query.trim().toLowerCase()))
  );

  const columns: Column<AccessMember>[] = [
    {
      key: "name",
      label: "Name",
      sortValue: (m) => m.name,
      render: (m) => (
        <span className="flex items-center gap-2.5">
          <Avatar
            name={m.name}
            size={32}
            className={cn(m.status === "pending" && "opacity-45 grayscale")}
          />
          <span className="min-w-0">
            <span className="type-body-strong flex items-center gap-1.5 truncate text-content">
              {m.status === "pending" ? "Pending" : m.name}
              {m.status === "pending" && <Chip tone="warning">Invited</Chip>}
            </span>
            <span className="type-body-dense block truncate text-content-muted">{m.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: "seat",
      label: "Seats",
      sortValue: (m) => m.seat,
      render: (m) => {
        const chip = (
          <Chip tone={m.seat === "Owner" ? "brand" : m.seat === "Viewer" ? "warning" : "info"}>
            {m.seat}
          </Chip>
        );
        // The Owner's seat and a guest's seat are both fixed, so neither is
        // drawn as something you can press.
        if (m.seat === "Owner" || m.scope === "external") return chip;
        return (
          <button
            type="button"
            aria-haspopup="menu"
            aria-label={`Change ${m.name}'s access — currently ${m.seat}`}
            onClick={(e) => openMenu(m, e)}
            className="-mx-1 flex items-center gap-1.5 rounded-lg px-1 py-1 transition-colors hover:bg-glass/10"
          >
            {chip}
            <Icon name="chevron-right" size={14} className="text-content-subtle" />
          </button>
        );
      },
    },
    {
      key: "lastActive",
      label: "Last Active On",
      sortValue: (m) => m.lastActive,
      render: (m) => m.lastActive,
    },
    {
      key: "since",
      label: "Access Permitted On",
      sortValue: (m) => m.since,
      render: (m) => m.since,
    },
    {
      key: "action",
      label: "Action",
      align: "right",
      render: (m) => (
        <button
          type="button"
          aria-label={`Manage ${m.status === "pending" ? m.email : m.name}`}
          aria-haspopup="menu"
          onClick={(e) => openMenu(m, e)}
          className="inline-grid h-8 w-8 place-items-center rounded-lg border border-glass/10 text-content-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Icon name="more" size={16} />
        </button>
      ),
    },
  ];

  const external = scope === "external";

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-content transition-colors hover:text-brand"
      >
        <Icon name="chevron-left" size={18} />
        <span className="font-display text-lg font-semibold tracking-tight">{row.project}</span>
      </button>

      <Tabs
        ariaLabel="Member scope"
        value={scope}
        onChange={(id) => setScope(id as Scope)}
        tabs={[
          { id: "internal", label: "Internal Members" },
          { id: "external", label: "External Members" },
        ]}
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold">
          {external ? "External Members" : "Internal Members"}
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search"
            className="w-[16rem]"
          />
          <DateField label="Select date" />
          <Button variant="brand" size="sm" onClick={() => setInviteOpen(true)}>
            <Icon name="create" size={15} />
            {external ? "Invite Viewer" : "Add New Member"}
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(m) => m.id}
          pageSize={7}
          empty={external ? "Nobody outside the org has access" : "No internal members"}
        />
      </div>

      {menu && (
        <ContextMenu
          at={menu.at}
          items={accessMenu(menu.m)}
          onClose={() => setMenu(null)}
          onSelect={(id) => {
            const m = menu.m;
            if (id === "seat-full") changeSeat(m, "Full Access");
            if (id === "seat-viewer") changeSeat(m, "Viewer");
            if (id === "copy") {
              navigator.clipboard?.writeText(m.email);
              notify("Email address copied.");
            }
            if (id === "resend") {
              commit(
                roster.map((x) =>
                  x.id === m.id ? { ...x, lastActive: "Invitation resent just now" } : x
                )
              );
              notify(`Invitation resent to ${m.email}.`);
            }
            if (id === "remove") setRemoving(m);
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={
          removing?.status === "pending" ? "Revoke this invitation?" : "Remove from this project?"
        }
        body={
          removing?.status === "pending" ? (
            <>
              The invitation to <b className="text-content">{removing?.email}</b> for{" "}
              <b className="text-content">{row.project}</b> stops working.
            </>
          ) : (
            <>
              <b className="text-content">{removing?.name}</b> loses access to{" "}
              <b className="text-content">{row.project}</b>. Their organization seat is
              untouched — this only revokes this one project.
            </>
          )
        }
        confirmLabel={removing?.status === "pending" ? "Revoke invitation" : "Remove access"}
        onConfirm={() => {
          if (!removing) return;
          commit(roster.filter((x) => x.id !== removing.id));
          notify(
            removing.status === "pending"
              ? `Invitation to ${removing.email} revoked.`
              : `${removing.name} removed from ${row.project}.`
          );
          setRemoving(null);
        }}
      />

      {/* The external tab offers no seat control at all: a guest can only ever
          hold a Viewer seat, so a picker here would be a choice with one legal
          answer, and offering the other would be a promise the org can't keep. */}
      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        viewerOnly={external}
        title={external ? "Invite External Viewer" : "Invite Internal Member"}
        description={
          external
            ? "Invite someone outside your organisation by email to collaborate on this project."
            : "Invite a member from your organization to collaborate on this project."
        }
        onConfirm={(invited) => {
          commit([
            ...roster,
            ...invited.map((i, n) => ({
              id: `a${Date.now()}${n}`,
              name: i.email.split("@")[0],
              email: i.email,
              seat: (i.seat === "viewer" ? "Viewer" : "Full Access") as AccessMember["seat"],
              scope,
              status: "pending" as const,
              lastActive: "Invitation pending",
              since: "Not yet accepted",
            })),
          ]);
          notify(
            invited.length === 1
              ? `Invitation sent to ${invited[0].email}.`
              : `${invited.length} invitations sent.`
          );
        }}
      />
    </>
  );
}

/**
 * The row menu for one person's access to one project.
 *
 * Shorter than the org-level one on purpose: this screen governs a single
 * project, so "remove" means remove from THIS project and nothing here touches
 * the org seat that person holds. The Owner keeps only the harmless item, and a
 * guest keeps no seat control, because neither can legally change.
 */
function accessMenu(m: AccessMember): MenuItem[] {
  if (m.seat === "Owner") return [{ id: "copy", label: "Copy email address", icon: "copy" }];

  const items: MenuItem[] = [];
  if (m.scope === "internal") {
    items.push({
      id: "seat",
      label: "Change access",
      icon: "shared",
      items: [
        { id: "seat-full", label: "Full Access", icon: "layout" },
        { id: "seat-viewer", label: "Viewer", icon: "visible" },
      ],
    });
  }
  items.push({ id: "copy", label: "Copy email address", icon: "copy" });
  if (m.status === "pending") {
    items.push({ id: "resend", label: "Resend invitation", icon: "send", separated: true });
  }
  items.push({
    id: "remove",
    label: m.status === "pending" ? "Revoke invitation" : "Remove from project",
    icon: "trash",
    danger: true,
    separated: m.status !== "pending",
  });
  return items;
}

function Tally({
  icon,
  tone,
  value,
  label,
}: {
  icon: "folder" | "shared";
  tone: "accent" | "brand";
  value: number;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span
        className={`grid h-8 w-8 place-items-center rounded-lg ${
          tone === "accent" ? "bg-accent-soft text-accent" : "bg-brand-soft text-brand"
        }`}
      >
        <Icon name={icon} size={16} />
      </span>
      <span className="type-numeric grid h-8 min-w-8 place-items-center rounded-lg border border-glass/10 px-2 text-content">
        {value}
      </span>
    </span>
  );
}
