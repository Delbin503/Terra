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
  ConfirmDialog,
  type Column,
  type MenuItem,
} from "@/components/ui";
import { Chip, DateField, PageTitle, SearchField } from "./settings-parts";
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
  const { projectAccess, projectNames, deletedProjects } = useSettings();
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  // The workspace's projects, with whatever this admin has renamed or deleted
  // applied on top. Kept here rather than in the detail screen so the table and
  // the screen it opens can never disagree about what a project is called.
  const rows = useMemo(
    () =>
      accessRows()
        .filter((r) => !deletedProjects.includes(r.id))
        .map((r) => (projectNames[r.id] ? { ...r, project: projectNames[r.id] } : r)),
    [projectNames, deletedProjects]
  );
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
          onChange={setFolder}
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
  const { account, notify, projectAccess, setProjectRoster, renameProject, deleteProject } =
    useSettings();
  const [scope, setScope] = useState<Scope>("internal");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ m: AccessMember; at: { x: number; y: number } } | null>(null);
  const [removing, setRemoving] = useState<AccessMember | null>(null);
  /** The project's own menu, hanging off the title. */
  const [titleMenu, setTitleMenu] = useState<{ x: number; y: number } | null>(null);
  /** Renaming happens IN the title rather than in a dialog — you are editing a
   *  word you can see, and a modal would cover the thing being renamed. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Who the details panel is showing, if anyone. */
  const [detail, setDetail] = useState<AccessMember | null>(null);

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
        /* Opens the member's details rather than the same seat menu the Seats
           column already offers — two controls on one row that did the same
           thing meant the Action column had no reason to exist. */
        <button
          type="button"
          aria-label={`Details for ${m.status === "pending" ? m.email : m.name}`}
          data-ui={`access-detail-${m.id}`}
          onClick={() => setDetail(m)}
          className="inline-grid h-8 w-8 place-items-center rounded-lg border border-glass/10 text-content-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Icon name="chevron-right" size={16} />
        </button>
      ),
    },
  ];

  const external = scope === "external";

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Back to all projects"
          onClick={onBack}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content transition-colors hover:bg-glass/10 hover:text-brand"
        >
          <Icon name="chevron-left" size={18} />
        </button>

        {renaming === null ? (
          <>
            <h1 className="font-display text-lg font-semibold tracking-tight text-content">
              {row.project}
            </h1>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={!!titleMenu}
              aria-label={`Actions for ${row.project}`}
              data-ui="project-title-menu"
              onClick={(e) => {
                const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setTitleMenu({ x: b.left, y: b.bottom + 6 });
              }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-subtle transition-colors hover:bg-glass/10 hover:text-content"
            >
              <Icon name="chevron-down" size={16} />
            </button>
          </>
        ) : (
          /* Enter commits, Escape abandons, blur commits — the three ways out of
             an inline edit, all of them ending the edit rather than leaving the
             field open behind whatever you click next. */
          <input
            autoFocus
            aria-label="Project name"
            data-ui="project-rename-input"
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setRenaming(null);
                e.currentTarget.blur();
              }
            }}
            onBlur={() => {
              if (renaming === null) return;
              const next = renaming.trim();
              if (next && next !== row.project) {
                renameProject(row.id, next);
                notify(`Renamed to “${next}”.`);
              }
              setRenaming(null);
            }}
            className="field-well font-display min-w-0 flex-1 rounded-lg border px-2.5 py-1 text-lg font-semibold tracking-tight text-content outline-none focus:border-brand/60"
          />
        )}
      </div>

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

      {/* The project's own menu. Restore is present but disabled unless the
          project is actually in the trash — offering it live would imply there
          is something to come back from. */}
      {titleMenu && (
        <ContextMenu
          at={titleMenu}
          onClose={() => setTitleMenu(null)}
          /* Figma also shows a Restore item. It is left out until Trash can
             actually hand a project back: ContextMenu has no disabled state, so
             it would render as a live control that does nothing. */
          items={[
            { id: "rename", label: "Rename", icon: "edit" },
            { id: "copy", label: "Copy Link", icon: "link" },
            { id: "delete", label: "Permanently Delete", icon: "trash", danger: true, separated: true },
          ]}
          onSelect={(id) => {
            if (id === "rename") setRenaming(row.project);
            if (id === "copy") {
              navigator.clipboard?.writeText(`${window.location.origin}/#project/${row.id}`);
              notify("Project link copied.");
            }
            if (id === "delete") setDeleting(true);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Permanently Delete Project"
        body="This action will permanently delete the project and all its data. This cannot be undone. Are you sure you want to proceed?"
        confirmLabel="Confirm Delete"
        onConfirm={() => {
          deleteProject(row.id);
          notify(`“${row.project}” was deleted.`);
          onBack();
        }}
      />

      <MemberDetails
        member={detail}
        project={row.project}
        onClose={() => setDetail(null)}
        onRemove={(m) => {
          setDetail(null);
          setRemoving(m);
        }}
      />

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

/**
 * MEMBER DETAILS — one person's standing on one project.
 *
 * The Action column used to open the same seat menu the Seats column already
 * offers, which left two controls on a row doing one job. This is the other
 * question a row raises: not "change their seat" but "what exactly do they
 * have here, and since when".
 *
 * Read-only apart from the one destructive act, because everything else about a
 * member belongs to the org — their seat is bought there, their name comes from
 * their account. The only thing this project owns is whether they can open it.
 */
function MemberDetails({
  member,
  project,
  onClose,
  onRemove,
}: {
  member: AccessMember | null;
  project: string;
  onClose: () => void;
  onRemove: (m: AccessMember) => void;
}) {
  if (!member) return null;
  const pending = member.status === "pending";

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <aside
        aria-label={`Details for ${pending ? member.email : member.name}`}
        data-ui="member-details"
        /* `glass-overlay`, not plain glass: this covers the roster and the page's
           own controls rather than a 3D scene, and at the regular tier the
           orange Add New Member button read straight through it. */
        className="glass glass-overlay fixed right-0 top-0 z-50 flex h-screen w-[22rem] animate-panel-in flex-col !rounded-none border-y-0 border-r-0"
      >
        <header className="flex items-start gap-3 border-b border-glass/10 p-5">
          <Avatar
            name={member.name}
            size={38}
            className={cn(pending && "opacity-45 grayscale")}
          />
          <div className="min-w-0 flex-1">
            <p className="type-body-strong flex items-center gap-1.5 truncate text-content">
              {pending ? "Pending" : member.name}
              {pending && <Chip tone="warning">Invited</Chip>}
            </p>
            <p className="type-body-dense truncate text-content-muted">{member.email}</p>
          </div>
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="type-body-strong text-content">Member Details</p>

          {/* Two columns, because these are four facts rather than a form — a
              stack of full-width rows would read as fields you can edit. */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            <Detail label="Access Permitted On">{member.since}</Detail>
            <Detail label="Last Active On">{pending ? "—" : member.lastActive}</Detail>
            <Detail label="Seat Type">
              <span className="flex items-center gap-1.5">
                <Chip tone={member.seat === "Viewer" ? "warning" : "brand"}>{member.seat}</Chip>
              </span>
            </Detail>
            <Detail label="Member">
              {member.scope === "external" ? "External Member" : "Internal Member"}
            </Detail>
          </dl>

          <Button
            variant="outline"
            className="mt-6 w-full border-danger/50 text-danger hover:border-danger hover:text-danger"
            data-ui="member-details-remove"
            onClick={() => onRemove(member)}
          >
            {pending ? "Revoke this invitation" : "Remove from this Project"}
          </Button>

          <p className="type-caption mt-3 text-center text-content-subtle">
            Removing only affects {project}. Their seat in the organization stays.
          </p>
        </div>
      </aside>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="type-body-dense text-content-muted">{label}</dt>
      <dd className="type-body mt-1 truncate text-content">{children}</dd>
    </div>
  );
}
