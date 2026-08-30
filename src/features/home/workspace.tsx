import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  folders as seedFolders,
  notifications as seedNotifications,
  orgs,
  projects as seedProjects,
  type Folder,
  type Notification,
  type NotificationCategory,
  type Org,
  type Project,
} from "./data";

/**
 * THE WORKSPACE — the projects, folders, bin and notifications, in one place.
 *
 * This used to live inside ProjectsView, which was fine until two other screens
 * needed it: Trash has to show what Projects threw away, and the notification
 * list has to show what happened. A page that unmounts when you navigate can't
 * own state that outlives the visit, so it moved up here.
 *
 * Every mutating action also files a notification, because "what happened to my
 * work" and "the list of what happened" are the same fact — leaving the caller
 * to remember both is how they drift apart.
 */

export interface TrashEntry {
  id: string;
  kind: "project" | "folder";
  name: string;
  /** when it was thrown away, as a label */
  at: string;
  /** the thing itself, so Restore puts it back rather than rebuilding it */
  project?: Project;
  folder?: Folder;
  /**
   * WHAT WENT WITH THE FOLDER.
   *
   * A folder is not a thing so much as a place things are, so throwing one away
   * has to take its contents with it — the confirmation on the Projects shelf
   * has always SAID it does ("the folder and every project inside it go to
   * Trash") while the projects themselves quietly stayed on the shelf, homeless
   * but visible. They travel inside the entry, which is also what makes one
   * Restore put the whole folder back with its work still in it, and Delete
   * forever end all of it at once.
   */
  projects?: Project[];
}

interface Workspace {
  /**
   * WHICH ORGANIZATION YOU ARE IN.
   *
   * Here rather than in the rail that draws it, for the same reason the bin is
   * here: it outlives the component. Switching orgs is a session-wide fact —
   * the shelves, the balance and the plan all belong to one of them — so the
   * rail reads it rather than owning it.
   */
  org: Org;
  orgs: Org[];
  switchOrg: (id: string) => void;

  projects: Project[];
  folders: Folder[];
  trash: TrashEntry[];
  notifications: Notification[];
  unread: number;

  addFolder: (name: string) => string;
  rename: (kind: "project" | "folder", id: string, name: string) => void;
  toggleFavourite: (kind: "project" | "folder", id: string) => void;
  /** file a project into a folder, and let the folder show it */
  moveToFolder: (projectId: string, folderId: string) => void;
  moveToOrganization: (
    kind: "project" | "folder",
    id: string,
    organization: string
  ) => void;
  trashItem: (kind: "project" | "folder", id: string) => void;
  restore: (entryId: string) => void;
  deleteForever: (entryId: string) => void;
  emptyTrash: () => void;
  markNotificationsRead: () => void;
}

const WorkspaceCtx = createContext<Workspace | null>(null);

/** Anything created in-session is stamped with this rather than a real time. */
const NOW = "just now";

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${(seq += 1)}`;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [folders, setFolders] = useState<Folder[]>(seedFolders);
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [notifications, setNotifications] =
    useState<Notification[]>(seedNotifications);
  const [orgId, setOrgId] = useState(orgs[0].id);

  const value = useMemo<Workspace>(() => {
    const notify = (
      category: NotificationCategory,
      title: string,
      body: string
    ) =>
      setNotifications((list) => [
        { id: nextId("n"), category, title, body, at: NOW, unread: true },
        ...list,
      ]);

    const nameOf = (kind: "project" | "folder", id: string) =>
      kind === "project"
        ? (projects.find((p) => p.id === id)?.name ?? "project")
        : (folders.find((f) => f.id === id)?.name ?? "folder");

    const org = orgs.find((o) => o.id === orgId) ?? orgs[0];

    return {
      org,
      orgs,
      switchOrg(id) {
        const next = orgs.find((o) => o.id === id);
        if (!next || next.id === org.id) return;
        setOrgId(next.id);
        notify(
          "organization",
          "Organization Switched",
          `You are now working in ${next.name}`
        );
      },

      projects,
      folders,
      trash,
      notifications,
      unread: notifications.filter((n) => n.unread).length,

      addFolder(name) {
        const id = nextId("f");
        setFolders((list) => [
          {
            id,
            name,
            owner: "MetaBlock AI",
            updatedLabel: "Last updated just now",
            seeds: [],
          },
          ...list,
        ]);
        notify("project", "Folder Created", `You have created the folder ${name}`);
        return id;
      },

      rename(kind, id, name) {
        const was = nameOf(kind, id);
        if (kind === "project") {
          setProjects((list) =>
            list.map((p) => (p.id === id ? { ...p, name } : p))
          );
        } else {
          setFolders((list) =>
            list.map((f) => (f.id === id ? { ...f, name } : f))
          );
        }
        notify(
          "project",
          `${kind === "project" ? "Project" : "Folder"} Renamed`,
          `You have renamed ${was} to ${name}`
        );
      },

      toggleFavourite(kind, id) {
        if (kind === "project") {
          setProjects((list) =>
            list.map((p) => (p.id === id ? { ...p, favourite: !p.favourite } : p))
          );
        } else {
          setFolders((list) =>
            list.map((f) => (f.id === id ? { ...f, favourite: !f.favourite } : f))
          );
        }
      },

      moveToFolder(projectId, folderId) {
        const moved = projects.find((p) => p.id === projectId);
        setProjects((list) =>
          list.map((p) => (p.id === projectId ? { ...p, folderId } : p))
        );
        // The destination gained a project, so its mosaic and count should say so.
        setFolders((list) =>
          list.map((f) =>
            f.id === folderId && moved && !f.seeds.includes(moved.seed)
              ? { ...f, seeds: [...f.seeds, moved.seed] }
              : f
          )
        );
        notify(
          "project",
          "Project Moved",
          `You have moved the project ${moved?.name ?? ""} to ${nameOf("folder", folderId)}`
        );
      },

      moveToOrganization(kind, id, organization) {
        const name = nameOf(kind, id);
        if (kind === "project") {
          setProjects((list) =>
            list.map((p) => (p.id === id ? { ...p, owner: organization } : p))
          );
        } else {
          setFolders((list) =>
            list.map((f) => (f.id === id ? { ...f, owner: organization } : f))
          );
        }
        notify(
          "organization",
          `${kind === "project" ? "Project" : "Folder"} Moved`,
          `You have moved ${name} to ${organization}`
        );
      },

      trashItem(kind, id) {
        const name = nameOf(kind, id);
        if (kind === "project") {
          const gone = projects.find((p) => p.id === id);
          if (!gone) return;
          setProjects((list) => list.filter((p) => p.id !== id));
          setTrash((list) => [
            { id: nextId("t"), kind, name, at: NOW, project: gone },
            ...list,
          ]);
        } else {
          const gone = folders.find((f) => f.id === id);
          if (!gone) return;
          const inside = projects.filter((p) => p.folderId === id);
          setFolders((list) => list.filter((f) => f.id !== id));
          setProjects((list) => list.filter((p) => p.folderId !== id));
          setTrash((list) => [
            { id: nextId("t"), kind, name, at: NOW, folder: gone, projects: inside },
            ...list,
          ]);
          notify(
            "project",
            "Folder Moved to Trash",
            inside.length
              ? `You have moved the folder ${name} and its ${inside.length} ${inside.length === 1 ? "project" : "projects"} to trash`
              : `You have moved the folder ${name} to trash`
          );
          return;
        }
        notify(
          "project",
          "Project Moved to Trash",
          `You have moved the project ${name} to trash`
        );
      },

      restore(entryId) {
        const entry = trash.find((t) => t.id === entryId);
        if (!entry) return;
        const inside = entry.projects ?? [];
        if (entry.project) setProjects((list) => [entry.project as Project, ...list]);
        if (entry.folder) setFolders((list) => [entry.folder as Folder, ...list]);
        // A folder comes back as the place it was, with its work back inside it.
        if (inside.length) setProjects((list) => [...inside, ...list]);
        setTrash((list) => list.filter((t) => t.id !== entryId));
        notify(
          "project",
          `${entry.kind === "project" ? "Project" : "Folder"} Restored`,
          inside.length
            ? `You have restored ${entry.name} and its ${inside.length} ${inside.length === 1 ? "project" : "projects"} from trash`
            : `You have restored ${entry.name} from trash`
        );
      },

      deleteForever(entryId) {
        const entry = trash.find((t) => t.id === entryId);
        setTrash((list) => list.filter((t) => t.id !== entryId));
        if (entry) {
          const inside = entry.projects?.length ?? 0;
          notify(
            "project",
            `${entry.kind === "project" ? "Project" : "Folder"} Deleted`,
            inside
              ? `You have permanently deleted ${entry.name} and the ${inside} ${inside === 1 ? "project" : "projects"} inside it`
              : `You have permanently deleted ${entry.name}`
          );
        }
      },

      emptyTrash() {
        const count = trash.length;
        if (!count) return;
        setTrash([]);
        notify(
          "project",
          "Trash Emptied",
          `You have permanently deleted ${count} ${count === 1 ? "item" : "items"}`
        );
      },

      markNotificationsRead() {
        setNotifications((list) => list.map((n) => ({ ...n, unread: false })));
      },
    };
  }, [projects, folders, trash, notifications, orgId]);

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
