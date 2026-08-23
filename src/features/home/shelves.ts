import type { IconName } from "@/components/icons";

/**
 * The three shelves of the Projects page.
 *
 * They live in their own module because two things need them: the app rail,
 * which lists them under Projects, and the page itself, which uses the rest of
 * each entry to configure its toolbar. Everything that differs between the
 * shelves is here rather than in branches inside the page — what it is called,
 * what its search box is searching, which two-way filter it carries, and what
 * its primary button makes.
 */

export type Shelf = "all" | "folders" | "favourites";

/** The second axis: who can see it, or — on Favourites — which kind of thing. */
export type Scope = "all" | "shared" | "projects" | "folders";

export interface ShelfSpec {
  id: Shelf;
  icon: IconName;
  label: string;
  searchLabel: string;
  scopes: { value: Scope; label: string }[];
  action: { icon: IconName; label: string };
}

export const SHELVES: ShelfSpec[] = [
  {
    id: "all",
    icon: "file",
    label: "All Projects",
    searchLabel: "Search project",
    scopes: [
      { value: "all", label: "All" },
      { value: "shared", label: "Shared" },
    ],
    action: { icon: "file", label: "New Project" },
  },
  {
    id: "folders",
    icon: "folder",
    label: "Folders",
    searchLabel: "Search folder",
    scopes: [
      { value: "all", label: "All" },
      { value: "shared", label: "Shared" },
    ],
    action: { icon: "folder-add", label: "New Folder" },
  },
  {
    id: "favourites",
    icon: "favourite",
    label: "Favourites",
    searchLabel: "Search project",
    scopes: [
      { value: "projects", label: "Projects" },
      { value: "folders", label: "Folders" },
    ],
    action: { icon: "folder-add", label: "New Folder" },
  },
];

export const shelfSpec = (id: Shelf) =>
  SHELVES.find((s) => s.id === id) ?? SHELVES[0];

/** Where a shelf starts: Favourites opens on projects, the others on everything. */
export const initialScope = (id: Shelf): Scope =>
  id === "favourites" ? "projects" : "all";
