export type ProjectKind = "FSD" | "HSD";

export interface Project {
  id: string;
  name: string;
  editedLabel: string;
  kind: ProjectKind;
  /** Seeds the stand-in cover render (`AssetThumb`) until real renders land. */
  seed: number;
  /** other people in the workspace can open it — drives the Shared filter */
  shared?: boolean;
  /** the user kept it — drives the Favourites section */
  favourite?: boolean;
  /** the folder it lives in, when it lives in one */
  folderId?: string;
  /** the organization it is filed under — set by "Move to Organization" */
  owner?: string;
}

/**
 * The workspace's projects. The home page shows the first few as a shelf; the
 * Projects page shows all of them, which is why the list is longer than the five
 * that fit across the shelf.
 */
export const projects: Project[] = [
  { id: "p1", name: "Sand Dune Project", editedLabel: "Edited 4 days ago", kind: "HSD", seed: 118, favourite: true },
  { id: "p2", name: "Voxel Valley", editedLabel: "Edited 4 days ago", kind: "FSD", seed: 641, shared: true },
  { id: "p3", name: "Harbor Yard", editedLabel: "Edited 4 days ago", kind: "FSD", seed: 205, folderId: "f1" },
  { id: "p4", name: "Alpine Ridge", editedLabel: "Edited 5 days ago", kind: "FSD", seed: 877, shared: true, favourite: true },
  { id: "p5", name: "Delta Fields", editedLabel: "Edited 6 days ago", kind: "FSD", seed: 432 },
  { id: "p6", name: "Quarry Basin", editedLabel: "Edited 6 days ago", kind: "HSD", seed: 309, shared: true, folderId: "f1" },
  { id: "p7", name: "Pine Crossing", editedLabel: "Edited a week ago", kind: "FSD", seed: 754, favourite: true },
  { id: "p8", name: "Salt Terrace", editedLabel: "Edited a week ago", kind: "FSD", seed: 96, shared: true, folderId: "f2" },
  { id: "p9", name: "Rail Depot", editedLabel: "Edited 2 weeks ago", kind: "HSD", seed: 583, folderId: "f2" },
  { id: "p10", name: "Frost Hollow", editedLabel: "Edited 2 weeks ago", kind: "FSD", seed: 267, favourite: true },
  { id: "p11", name: "Coast Road", editedLabel: "Edited 3 weeks ago", kind: "FSD", seed: 845, shared: true },
  { id: "p12", name: "Mesa Overlook", editedLabel: "Edited last month", kind: "HSD", seed: 471 },
];

export interface Folder {
  id: string;
  name: string;
  /** whose workspace produced it — shown under the name */
  owner: string;
  updatedLabel: string;
  /**
   * Cover seeds for the mosaic, one per project in the folder. The card draws
   * four cells and leaves the unused ones empty, so the count and the covers
   * cannot drift apart: how many projects a folder holds IS how many it shows.
   */
  seeds: number[];
  shared?: boolean;
  favourite?: boolean;
}

export const folders: Folder[] = [
  { id: "f1", name: "Military", owner: "MetaBlock AI", updatedLabel: "Last updated 2 days ago", seeds: [205, 309] },
  { id: "f2", name: "Urban Drive", owner: "MetaBlock AI", updatedLabel: "Last updated 2 days ago", seeds: [96, 583], favourite: true },
  { id: "f3", name: "Warehouse Ops", owner: "Sigmawave AI", updatedLabel: "Last updated 2 days ago", seeds: [118, 432], shared: true },
  { id: "f4", name: "Coastal Survey", owner: "MetaBlock AI", updatedLabel: "Last updated 3 days ago", seeds: [845, 267] },
  { id: "f5", name: "Rooftop Set", owner: "MetaBlock AI", updatedLabel: "Last updated 4 days ago", seeds: [641, 877] },
  { id: "f6", name: "Desert Convoy", owner: "Sigmawave AI", updatedLabel: "Last updated 5 days ago", seeds: [471, 754], shared: true },
  { id: "f7", name: "Harbor Night", owner: "Sigmawave AI", updatedLabel: "Last updated a week ago", seeds: [583, 96], shared: true, favourite: true },
  { id: "f8", name: "Ridge Patrol", owner: "MetaBlock AI", updatedLabel: "Last updated a week ago", seeds: [309, 845], shared: true },
];

export interface FeedItem {
  id: string;
  title: string;
  seed: number;
}

/**
 * The "What's New" tab — release notes and model drops, as cards.
 *
 * EACH ONE IS A PAGE, not just a cover. "Explore Now" used to select a
 * Community collection, which is what the Community banners do and a release
 * note is not: a note has a body, a date and someone who wrote it, and none of
 * that fits on a 180px card. So the item carries its own story and the card
 * opens it.
 *
 * `tag` is the release's own label, not a position in the list — it is what the
 * page's eyebrow says, and it stays true when the order changes.
 */
export interface NewsItem extends FeedItem {
  tag: string;
  /** one line, under the title — the note in a sentence */
  summary: string;
  /** the note itself, one string per paragraph */
  body: string[];
  author: string;
  /** relative label, like every other clock in this prototype */
  at: string;
}

export const whatsNew: NewsItem[] = [
  {
    id: "n1",
    title: "Terra 2.4 — faster capture runs",
    seed: 512,
    tag: "Release 2.4",
    summary: "The turntable pass schedules its own frames, so a sweep finishes in about half the wall time.",
    body: [
      "A capture run used to render every increment in the order you set it, one shot at a time, whichever way the rig happened to be pointing. 2.4 plans the pass first: frames that share an environment, a time of day and a weather state are rendered together, so the scene is only relit once for each combination rather than once per frame.",
      "Nothing about the Work Order changes. You still pick the increments, the shots per rotation and the annotations you want; the estimate on the dispatch panel is the same number it always was, and the archive comes back in the same shape. What changed is how long you wait for it — a 720-frame sweep that took an hour now lands in a little over half of one.",
      "Runs already queued when you update will finish on the old schedule. Anything dispatched after that takes the new path automatically.",
    ],
    author: "Terra Engineering",
    at: "2 days ago",
  },
  {
    id: "n2",
    title: "New: voxel terrain generator",
    seed: 233,
    tag: "New tool",
    summary: "Block out a landscape from a heightfield and a brush, then let the generator dress it.",
    body: [
      "The terrain generator gives you a ground plane you can actually shape. Paint height with a brush, and the generator fills the surface with rock, scree and planting that follows the slope — steep faces stay bare, shallow ground takes cover.",
      "Everything it makes is a real scene object, so it is selectable in the Layers panel, it can be hidden or locked, and it is annotated like anything else in the capture pass.",
    ],
    author: "Terra Product",
    at: "5 days ago",
  },
  {
    id: "n3",
    title: "Weather presets for every scene",
    seed: 91,
    tag: "New tool",
    summary: "Five conditions, each with its own wind, and each one an axis a run can sweep.",
    body: [
      "Sun, cloud, rain, storm, dust and snow are presets now rather than a set of sliders you rebuild per scene. Pick one and the sky, the light and the surface response move together.",
      "Weather is also an axis on a Work Order: turn it on and every arrangement is captured in each condition you selected, which is how one scene becomes a dataset that holds up in bad light.",
    ],
    author: "Terra Product",
    at: "a week ago",
  },
  {
    id: "n4",
    title: "Camera rigs now export to USD",
    seed: 744,
    tag: "Interop",
    summary: "Take the rig — both cameras, the orbit and the sweep — into any USD pipeline.",
    body: [
      "The two-camera rig, its height span, its orbit arc and every increment on the sweep now export as USD. The frames Terra rendered and the frames your own renderer produces line up, because they are the same camera transforms.",
      "Import is not part of this release. A rig authored elsewhere still has to be rebuilt in the editor.",
    ],
    author: "Terra Engineering",
    at: "a week ago",
  },
  {
    id: "n5",
    title: "Material library refresh",
    seed: 356,
    tag: "Library",
    summary: "Material slots, so one object can wear a different surface in each arrangement.",
    body: [
      "Materials are assigned to slots on an object rather than baked into it, which means a swap is a change of slot rather than a new asset. The library itself has been re-shot against a neutral probe so two materials beside each other can actually be compared.",
    ],
    author: "Terra Product",
    at: "2 weeks ago",
  },
  {
    id: "n6",
    title: "Batch dataset exports",
    seed: 168,
    tag: "Release 2.3",
    summary: "Several Work Orders, one archive, one manifest.",
    body: [
      "Select finished runs in the Work Orders table and take them out together. The manifest records which run each frame came from, so a merged dataset can still be split back apart later.",
    ],
    author: "Terra Engineering",
    at: "3 weeks ago",
  },
  {
    id: "n7",
    title: "Depth + segmentation passes",
    seed: 899,
    tag: "Release 2.3",
    summary: "Two more passes alongside the boxes, written per frame.",
    body: [
      "Semantic segmentation and polygon masks ship with every frame that asks for them, straight from the renderer's own knowledge of the scene — there is nothing to draw and nothing to check.",
      "Oriented boxes and the video scope are still coming; the annotation picker marks them so a Work Order can't be dispatched expecting them.",
    ],
    author: "Terra Engineering",
    at: "a month ago",
  },
  {
    id: "n8",
    title: "Improved HDRI relighting",
    seed: 27,
    tag: "Rendering",
    summary: "The day ramp drives the sky, so time of day is one control instead of four.",
    body: [
      "Move the clock and the sun angle, colour temperature, sky and ambient response all follow it, through night as well as day. Time of day is an axis a run can sweep, which is what makes a scene captured at dawn and at dusk two sets of frames rather than two scenes.",
    ],
    author: "Terra Rendering",
    at: "a month ago",
  },
];

/**
 * THE COMMUNITY — worlds other people published.
 *
 * A community world is somebody else's, so it carries the two things a project
 * doesn't: who made it, and how many people liked it. It keeps `title` and
 * `seed` so the home page's Community tab can keep treating these as plain feed
 * items.
 *
 * `category` is what a world IS; `featured` is a curation on top of it. They are
 * separate fields rather than one list of buckets because a world can be both
 * urban and a staff pick, and the Featured tab has to be able to show it
 * alongside picks from everywhere else.
 */
export type CommunityCategory =
  | "urban"
  | "nature"
  | "industrial"
  | "interior"
  | "aerial";

/** Featured is a curation, so it heads the row and isn't a category. */
export type CommunityTab = "featured" | CommunityCategory;

export const COMMUNITY_TABS: { id: CommunityTab; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "urban", label: "Urban" },
  { id: "nature", label: "Nature" },
  { id: "industrial", label: "Industrial" },
  { id: "interior", label: "Interior" },
  { id: "aerial", label: "Aerial" },
];

/**
 * WHERE A PUBLISHED PROJECT CAN GO.
 *
 * The four categories a person is asked to file their own world under. It is
 * not every tab: "Featured" is a curation nobody nominates themselves into.
 */
export const PUBLISH_CATEGORIES: { value: CommunityCategory; label: string }[] = [
  { value: "urban", label: "Urban" },
  { value: "nature", label: "Nature" },
  { value: "industrial", label: "Industrial" },
  { value: "aerial", label: "Aerial" },
];

export interface CommunityWorld extends FeedItem {
  author: string;
  likes: number;
  /**
   * How many people have remixed this world into a project of their own.
   *
   * A SEPARATE FIELD, NOT A MULTIPLE OF `likes`. The Remix sheet showed
   * "users" derived as `likes × 43`, which is not a fact — it moved when
   * somebody pressed the heart, so liking a world appeared to give it 43 new
   * users. Likes and adoption are two different things people do, and a world
   * can be admired without being used.
   */
  users: number;
  category: CommunityCategory;
  /** a staff pick — shows under Featured as well as under its own category */
  featured?: boolean;
}

export const communityWorlds: CommunityWorld[] = [
  { id: "c1", title: "Neon district", seed: 62, author: "L. Okonkwo", likes: 61, users: 2140, category: "urban", featured: true },
  { id: "c2", title: "Rail depot", seed: 673, author: "D. Marchetti", likes: 33, users: 486, category: "urban" },
  { id: "c3", title: "Overpass junction", seed: 411, author: "L. Okonkwo", likes: 45, users: 1310, category: "urban", featured: true },
  { id: "c4", title: "Market quarter", seed: 258, author: "S. Bergström", likes: 28, users: 905, category: "urban" },
  { id: "c5", title: "Tram line", seed: 820, author: "S. Bergström", likes: 7, users: 132, category: "urban" },
  { id: "c6", title: "Old town grid", seed: 139, author: "AyaKotani", likes: 16, users: 610, category: "urban" },

  { id: "c7", title: "Desert canyon", seed: 305, author: "MarkSimon", likes: 10, users: 268, category: "nature", featured: true },
  { id: "c8", title: "Coastal ruins", seed: 448, author: "AyaKotani", likes: 24, users: 1024, category: "nature" },
  { id: "c9", title: "Frost valley", seed: 781, author: "MarkSimon", likes: 8, users: 149, category: "nature" },
  { id: "c10", title: "Terraced hills", seed: 194, author: "R. Halvorsen", likes: 17, users: 774, category: "nature", featured: true },
  { id: "c11", title: "Pine basin", seed: 84, author: "MarkSimon", likes: 9, users: 203, category: "nature" },
  { id: "c12", title: "Alpine pass", seed: 692, author: "R. Halvorsen", likes: 22, users: 1466, category: "nature" },
  { id: "c13", title: "Dune sea", seed: 373, author: "MarkSimon", likes: 31, users: 812, category: "nature", featured: true },
  { id: "c14", title: "Salt flats", seed: 526, author: "AyaKotani", likes: 12, users: 357, category: "nature" },

  { id: "c15", title: "Harbour cranes", seed: 937, author: "D. Marchetti", likes: 19, users: 693, category: "industrial", featured: true },
  { id: "c16", title: "Foundry yard", seed: 145, author: "AyaKotani", likes: 14, users: 420, category: "industrial" },
  { id: "c17", title: "Tank farm", seed: 588, author: "S. Bergström", likes: 11, users: 188, category: "industrial" },
  { id: "c18", title: "Quarry works", seed: 271, author: "D. Marchetti", likes: 26, users: 1197, category: "industrial" },
  { id: "c19", title: "Container port", seed: 704, author: "L. Okonkwo", likes: 38, users: 1583, category: "industrial" },

  { id: "c20", title: "Warehouse floor", seed: 162, author: "R. Halvorsen", likes: 21, users: 965, category: "interior" },
  { id: "c21", title: "Office atrium", seed: 495, author: "AyaKotani", likes: 13, users: 344, category: "interior", featured: true },
  { id: "c22", title: "Metro station", seed: 836, author: "S. Bergström", likes: 42, users: 1902, category: "interior" },
  { id: "c23", title: "Hangar bay", seed: 349, author: "MarkSimon", likes: 18, users: 517, category: "interior" },
  { id: "c24", title: "Lab corridor", seed: 617, author: "D. Marchetti", likes: 9, users: 126, category: "interior" },

  { id: "c25", title: "Above the ridge", seed: 228, author: "MarkSimon", likes: 35, users: 1358, category: "aerial", featured: true },
  { id: "c26", title: "Cloud deck", seed: 761, author: "R. Halvorsen", likes: 27, users: 731, category: "aerial" },
  { id: "c27", title: "River delta", seed: 484, author: "L. Okonkwo", likes: 15, users: 409, category: "aerial" },
  { id: "c28", title: "Coast approach", seed: 913, author: "AyaKotani", likes: 20, users: 866, category: "aerial" },
  { id: "c29", title: "Farm patchwork", seed: 356, author: "S. Bergström", likes: 6, users: 97, category: "aerial" },
];

/**
 * The promoted strip at the top of Community. Each banner stands for a
 * collection, which is what "Explore Now" takes you to — the tabs below are the
 * same collections, so the banner doesn't need a screen of its own.
 */
export interface CommunityBanner {
  id: string;
  eyebrow: string;
  headline: string;
  seed: number;
  tab: CommunityTab;
}

export const communityBanners: CommunityBanner[] = [
  { id: "b1", eyebrow: "What's New", headline: "Inspired from Our Latest Creator's Choices", seed: 305, tab: "featured" },
  { id: "b2", eyebrow: "What's New", headline: "Voxel cities, built in an afternoon", seed: 62, tab: "urban" },
  { id: "b3", eyebrow: "What's New", headline: "Above the cloud line, in one prompt", seed: 228, tab: "aerial" },
  { id: "b4", eyebrow: "What's New", headline: "Street sets ready for detection runs", seed: 673, tab: "industrial" },
  { id: "b5", eyebrow: "What's New", headline: "Forests that hold up under a close camera", seed: 441, tab: "nature" },
  { id: "b6", eyebrow: "What's New", headline: "Rooms furnished from a single photo", seed: 118, tab: "interior" },
];

/**
 * NOTIFICATIONS — the account's activity log.
 *
 * Six categories, because they answer six different questions and you rarely
 * want two of them at once: what happened to my work, to my org, to my bill, to
 * my account, to the people I share with, and to the product itself.
 */
export type NotificationCategory =
  | "project"
  | "organization"
  | "billing"
  | "security"
  | "collaboration"
  | "system";

export const NOTIFICATION_TABS: { id: NotificationCategory; label: string }[] = [
  { id: "project", label: "Project Activity" },
  { id: "organization", label: "Organization" },
  { id: "billing", label: "Subscription & Billing" },
  { id: "security", label: "Account & Security" },
  { id: "collaboration", label: "Collaboration" },
  { id: "system", label: "System Updates" },
];

export interface Notification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** relative label, not a timestamp — this is a prototype's clock */
  at: string;
  unread?: boolean;
}

/**
 * HOW OLD A RELATIVE LABEL IS, in days.
 *
 * The prototype's clock is a string — "4 days ago", "just now" — because
 * nothing here has a real timestamp to format. The notification panel still has
 * to answer "only this week", so the labels are read back into a number rather
 * than a `Date` field being bolted onto data that has no dates.
 *
 * Anything unrecognised comes back as `Infinity`: it survives "Any time" and
 * falls out of every narrowing, which is the safe direction — a filter that
 * silently invents a date for a row it can't read is worse than one that admits
 * it doesn't know.
 */
export function daysAgo(at: string): number {
  const t = at.trim().toLowerCase();
  if (t === "just now" || t === "now" || t === "today") return 0;
  if (t === "yesterday") return 1;

  const m = t.match(/^(a|an|\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (!m) return Infinity;

  const n = m[1] === "a" || m[1] === "an" ? 1 : Number(m[1]);
  const perUnit: Record<string, number> = {
    minute: 0,
    hour: 0,
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };
  return n * perUnit[m[2]];
}

export const notifications: Notification[] = [
  { id: "n1", category: "project", title: "Project Created", body: "You have created the project Mesa Overlook for MetaBlock AI", at: "2 days ago" },
  { id: "n2", category: "project", title: "Capture Run Finished", body: "Alpine Ridge finished 240 frames across 4 cameras", at: "4 days ago" },
  { id: "n3", category: "organization", title: "Member Added", body: "AyaKotani joined MetaBlock AI as an editor", at: "3 days ago", unread: true },
  { id: "n4", category: "organization", title: "Organization Renamed", body: "Sigmawave was renamed to Sigmawave AI", at: "2 weeks ago" },
  { id: "n5", category: "billing", title: "Credits Topped Up", body: "3,000 credits were added to your Pro Plan", at: "5 days ago", unread: true },
  { id: "n6", category: "billing", title: "Invoice Available", body: "Your July invoice is ready to download", at: "3 weeks ago" },
  { id: "n7", category: "security", title: "New Sign-in", body: "A new sign-in from Chrome on macOS was approved", at: "6 days ago" },
  { id: "n8", category: "security", title: "Password Changed", body: "Your account password was updated", at: "a month ago" },
  { id: "n9", category: "collaboration", title: "Shared With You", body: "L. Okonkwo shared Neon district with your workspace", at: "an hour ago", unread: true },
  { id: "n10", category: "collaboration", title: "Comment", body: "D. Marchetti commented on Rail depot", at: "8 days ago" },
  { id: "n11", category: "system", title: "Terra 2.4", body: "Faster capture runs and a new voxel terrain generator", at: "a week ago" },
  { id: "n12", category: "system", title: "Scheduled Maintenance", body: "Rendering will pause for 20 minutes on Sunday 02:00 UTC", at: "2 weeks ago" },
];

/**
 * THE ORGANIZATIONS THIS ACCOUNT BELONGS TO.
 *
 * One list, two jobs. The rail's card names the one you are working in and lets
 * you switch; `Move to Organization` files work into any of them. They were
 * separate before — a bare array of names for the move dialog, and a single
 * hard-coded string in the rail — which is why the rail could show a workspace
 * that was not in the list you could move things to.
 *
 * `plan` rides along because the rail card shows it, and because it is the
 * thing that actually differs between two orgs the same person owns.
 */
export interface Org {
  id: string;
  name: string;
  plan: string;
}

export const orgs: Org[] = [
  { id: "metablock", name: "MetaBlock Aldjada", plan: "Pro Plan" },
  { id: "sigmawave", name: "Sigmawave AI", plan: "Free Plan" },
];

/** The move dialog files into names, not ids. */
export const organizations = orgs.map((o) => o.name);

export const user = {
  name: "Delbin Arkar",
  /** where the account starts — the rail can switch it from there */
  workspace: orgs[0].name,
  plan: orgs[0].plan,
};

/*
 * THE BALANCE IS NOT HERE ANY MORE.
 *
 * It was a frozen `credits.balance` that the rail and the top bar read, beside
 * a second constant in the editor and a third in the settings store — three
 * numbers for one fact, none of which a top-up could move. The balance is a
 * property of the org, so it lives with the rest of the account state (see
 * settings-store), which is mounted above the router in App and therefore
 * readable by every surface that shows a credit figure.
 *
 * What was GENERATED is a different question with a different time base, and it
 * is answered in Settings → Terra Balance → Usage History.
 */
