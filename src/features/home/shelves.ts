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

/* ------------------------------------------------------------- the controls */

/**
 * HOW A SHELF IS LOOKED AT — the layout switch and the card-size range.
 *
 * Here rather than in ProjectsView because Trash is the same shelf with the
 * same two questions asked of it: covers or rows, and how big. They were the
 * page's own constants, so Trash had neither until it grew a second copy of
 * them — which is the point at which two shelves start sizing their cards
 * differently for no reason anyone chose.
 */
export type Layout = "grid" | "list";

export const LAYOUTS: { value: Layout; label: string; icon: IconName }[] = [
  { value: "grid", label: "Grid", icon: "grid" },
  { value: "list", label: "List", icon: "list" },
];

/**
 * HOW THE SHELF IS ORDERED.
 *
 * Two orders, because there are only two questions a person asks of this list:
 * "where is the one called X" and "what was I just working on". Anything else —
 * by kind, by owner, by size — is a filter dressed as a sort, and the toolbar
 * already carries the filters.
 *
 * `updated` is the default because the list is a workspace, not a catalogue:
 * the thing you want is nearly always the thing you touched last.
 */
export type ProjectSort = "updated" | "alphabetical";

export const SORTS: { value: ProjectSort; label: string; hint: string; icon: IconName }[] = [
  { value: "updated", label: "Last Updated", hint: "Most recent first", icon: "render-time" },
  { value: "alphabetical", label: "Alphabetical", hint: "A to Z", icon: "list" },
];

/**
 * Card-size range, as the minimum width a column may be. The initial value is
 * chosen so a full-width window lands on the four-up grid the design shows —
 * the slider is for going denser or bigger than that, not for finding it.
 */
export const CARD_SIZE = { min: 170, max: 380, step: 10, initial: 300 };
