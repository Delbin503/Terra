import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  folders as seedFolders,
  notifications as seedNotifications,
  projects as seedProjects,
  type Folder,
  type Notification,
  type NotificationCategory,
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
}

interface Workspace {
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

    return {
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
          setFolders((list) => list.filter((f) => f.id !== id));
          setTrash((list) => [
            { id: nextId("t"), kind, name, at: NOW, folder: gone },
            ...list,
          ]);
        }
        notify(
          "project",
          `${kind === "project" ? "Project" : "Folder"} Moved to Trash`,
          `You have moved the ${kind} ${name} to trash`
        );
      },

      restore(entryId) {
        const entry = trash.find((t) => t.id === entryId);
        if (!entry) return;
        if (entry.project) setProjects((list) => [entry.project as Project, ...list]);
        if (entry.folder) setFolders((list) => [entry.folder as Folder, ...list]);
        setTrash((list) => list.filter((t) => t.id !== entryId));
        notify(
          "project",
          `${entry.kind === "project" ? "Project" : "Folder"} Restored`,
          `You have restored ${entry.name} from trash`
        );
      },

      deleteForever(entryId) {
        const entry = trash.find((t) => t.id === entryId);
        setTrash((list) => list.filter((t) => t.id !== entryId));
        if (entry) {
          notify(
            "project",
            `${entry.kind === "project" ? "Project" : "Folder"} Deleted`,
            `You have permanently deleted ${entry.name}`
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
  }, [projects, folders, trash, notifications]);

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
