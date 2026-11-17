/**
 * THE THREE PRDs, AS DATA.
 *
 * The front page (PrdHub) lists them and PrdPage renders one. Kept as data so
 * a requirement is edited in one place and both screens follow.
 *
 * Strings take three bits of inline markup, nothing else: `code`, **bold** and
 * [text](https://link). See Rich in PrdPage.
 */

export type PrdBlock =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "steps"; items: { lead?: string; text: string }[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; text: string }
  | { kind: "flow"; steps: string[] };

export interface Prd {
  id: "platform" | "web" | "phase-2";
  name: string;
  /** small label above the name on the card */
  area: string;
  /** one line on the card */
  summary: string;
  /** the chip: how far along this PRD is */
  status: string;
  /** false = a plan, nothing built */
  built: boolean;
  headline: string;
  /** where the words came from, under the headline */
  source: string;
  intro: string[];
  blocks: PrdBlock[];
}

export const PRD_UPDATED = "17 Nov 2026";

/* ---------------------------------------------------------------- platform */

const platform: Prd = {
  id: "platform",
  name: "Terra Platform",
  area: "Account & billing",
  summary:
    "Home, projects, community and trash, plus the account, organisation and billing settings.",
  status: "Draft from the codebase",
  built: true,
  headline: "Where a team manages its work",
  source:
    "Written from `src/features/home` and `src/features/settings`. Most data on these screens is sample data.",
  intro: [
    "The platform is everything around the editor. People find and open projects, see what is new, manage their organisation, and pay for credits. The editor itself is covered in Terra Web.",
  ],
  blocks: [
    { kind: "h", text: "Areas" },
    {
      kind: "table",
      head: ["Area", "What it covers"],
      rows: [
        ["Home", "Landing page with What's New cards, project shelves, the AI chat launcher and drawer, and a notifications drawer."],
        ["Projects", "All Projects, Folders and Favourites shelves, each with an All / Shared scope. New Project and New Folder, and moving a project into a folder."],
        ["Community", "Browse published worlds, publish one of your own projects, and remix someone else's."],
        ["Trash", "Trashed projects and folders."],
        ["Pricing", "Plans and credit packs, reached from the top bar on every page rather than from the left rail."],
        ["What's New", "Each release note as its own page."],
        ["Settings", "Three groups. Personal: My Profile, Message Preferences, My Organizations. Organisation: Dashboard, Members, Project Access, Activity Logs, Terra Balance, Org Profile. Billing: Payment Details and Billing, with invoices and top-up."],
      ],
    },
    {
      kind: "p",
      text: "The left rail shows four destinations: Home, Projects, Community and Trash. Search and Library were removed because they repeated the command bar and the Projects grid.",
    },
    { kind: "h", text: "Requirements (draft)" },
    {
      kind: "table",
      head: ["Requirement", "In the prototype"],
      rows: [
        ["Create, name, move, favourite and trash projects and folders.", "Screens exist"],
        ["Share a project and control who can open it.", "Shared scope and Project Access page exist"],
        ["Invite and manage members of an organisation.", "Members page, invite dialog and member drawer exist"],
        ["Show what happened in an organisation, with filters.", "Activity Logs page exists, with sample events"],
        ["Show the credit balance, top it up, and show usage.", "Terra Balance page and Top Up dialog exist"],
        ["Choose a plan, manage payment methods and view invoices.", "Plans, Payment Details, Billing and invoice drawers exist"],
        ["Let people choose which messages they get: Platform Updates, Team Invitations & Access, Project Activity, Credit Usage & Balance.", "Message Preferences page exists"],
        ["Publish a project to Community and remix one.", "Publish and Remix dialogs exist"],
      ],
    },
    { kind: "h", text: "Open questions" },
    {
      kind: "ul",
      items: [
        "Which of these screens have a live backend today, and which are design only?",
        "Who can see Terra Balance and Billing: the owner only, or any organisation admin?",
        "Does Community stay in the first release?",
      ],
    },
  ],
};

/* --------------------------------------------------------------------- web */

const web: Prd = {
  id: "web",
  name: "Terra Web",
  area: "Editor & work orders",
  summary:
    "The 3D editor: asset library, object and camera settings, Layers, SAB, 3D Generate, MAT Preview and the Generate work order.",
  status: "Draft from the codebase",
  built: true,
  headline: "Build a scene, then order the dataset",
  source: "Written from `src/features/editor` and the feature sheets in `docs/features`.",
  intro: [
    "Terra Web is the 3D editor. A user builds a scene, sets up a camera rig around the object the dataset is about, chooses the conditions, and dispatches a work order. The generated frames come from Unreal.",
  ],
  blocks: [
    { kind: "h", text: "How a user gets from an empty project to a work order" },
    { kind: "p", text: "This is the order the built-in Getting started guide walks through." },
    {
      kind: "steps",
      items: [
        { lead: "Environment.", text: "Open the Asset Library and pick an HDRI." },
        { lead: "Object.", text: "Place the object the dataset is about, and mark it as the Master." },
        { lead: "Camera.", text: "Place the camera rig from Utilities: a Start and an End camera aimed at the Master." },
        { lead: "Layers.", text: "Manage the scene from one list." },
        { lead: "AI tools.", text: "SAB edits the scene by prompt, 3D Generate makes a model from a photo, MAT previews a photoreal pass." },
        { lead: "Work order.", text: "Open Generate, step through the sections, review and dispatch." },
      ],
    },
    { kind: "h", text: "Areas" },
    {
      kind: "table",
      head: ["Area", "What it does"],
      rows: [
        ["Top bar", "Project name with undo and redo, the Scene / Assets / AI tools, credits, account, and Generate."],
        ["Asset library", "The Sigmawave Assets API catalogue (about 1,690 assets) in 3D Models, Environments, Skyboxes, Uploads and Utilities (Space and Camera). Two rows of cards per page with page controls, search, tags, folders and a View Info panel."],
        ["Objects and settings", "Place by click or drag, then select. Transform has position, rotation and scale with gizmos, and a Snap to Object switch that rests an object on the one below it. Texture has material slots and the PBR factors. Also Master, roles, a bounding box, a reset in every setting, and hide, lock and delete."],
        ["Camera rig", "Rotatable or Fixed mode, camera height with increments, an orbit arc with shots per rotation, and zoom distance with saved zoom sets."],
        ["Groups and Layers", "Group objects from a marquee selection. The Layers tree lists everything and scrolls to the selection."],
        ["SAB", "The scene assistant. Adds and arranges objects inside a Space from a prompt, with undo."],
        ["3D Generate", "Builds a 3D mesh from a photo and keywords."],
        ["MAT Preview", "Captures the current view and runs a photoreal pass, optionally with post-processing. Keeps a history of previews. An optional reference image field is in the local build and is not pushed yet."],
        ["Generate work order", "Sections for Objects, Camera Settings, Weather & Lighting, Time of Day, Scene Environment, Arrangement and Output. Shows the frame count, then Review & dispatch. Weather values are converted to Unreal Ultra Dynamic Sky fields when the order is sent (on the dev branch)."],
        ["Getting started", "A checklist with tips that walks a new user through the six steps above."],
      ],
    },
    { kind: "h", text: "Known gaps" },
    {
      kind: "note",
      text: "Staging differs from this UI in 67 listed items, each with what the UI does and what staging has to change: [Staging updates to match the UI](https://claude.ai/artifact/Xg4Vyu83NaGcggkYe92sHK). Open bugs that touch cameras and the capture run (BUG-013, BUG-027, BUG-030, BUG-035) are in the [Product Testing Bug Report Tracker](https://drive.google.com/file/d/1r_CdhpnGoLmRgKjY0DDCt-11Nn2bnA5k/view?usp=drivesdk).",
    },
    { kind: "h", text: "Open questions" },
    {
      kind: "ul",
      items: [
        "Should a typed Position value or a W A S D move also trigger Snap to Object? Today only gizmo drags do.",
        "Does the MAT reference image change the generated preview, or only sit beside it?",
      ],
    },
  ],
};

/* ----------------------------------------------------------------- phase 2 */

const phase2: Prd = {
  id: "phase-2",
  name: "Terra (Phase 2)",
  area: "VFX",
  summary:
    "Fire and smoke placed from a new VFX tab in the Asset library, with the real effect rendered in Unreal.",
  status: "Proposal · not started",
  built: false,
  headline: "VFX: fire and smoke on 3D assets",
  source: "Nothing is built yet. Everything below is the plan.",
  intro: [
    "The VFX UI is built as its own screen, apart from the Terra web editor: [Open the VFX prototype](/prototypes/vfx/).",
    "Users place fire on an object or on the ground, so generated datasets include fire events with their own fire and smoke labels. Terra stores the fire settings and shows a quick preview in the editor. Unreal draws the real fire and smoke and renders the frames.",
    "The reference is the 30 second Gate 14 Fire Drill film (`docs/marketing/motion/airport-fire`). Its fire is an AI-generated video, so it shows the target look, not how to build it.",
  ],
  blocks: [
    { kind: "h", text: "Decisions made" },
    {
      kind: "table",
      head: ["Question", "Decision"],
      rows: [
        ["Where do VFX live?", "A separate VFX tab in the Asset library, beside Utilities."],
        ["Do they also show under All Assets?", "No. Only in the VFX tab."],
        ["Can fire stand on empty ground?", "Yes. Dropped on the ground it is a free-standing fire."],
        ["Can fire attach to an object?", "Yes. It follows the object when it is moved, rotated or scaled."],
        ["Which objects can carry it?", "3D models. Not cameras or skies."],
        ["First effect?", "Fire, with smoke. Sparks and others come later as more tiles in the same tab."],
      ],
    },
    { kind: "h", text: "User flow" },
    {
      kind: "steps",
      items: [
        { lead: "Open Assets, then the VFX tab.", text: "The tiles carry a VFX badge, like the Utility and Rig badges. For now there is one tile: Fire." },
        { lead: "Place it.", text: "Drag the tile onto an object; the object under the cursor gets the orange drop ring. Or click the tile, then click a spot on the model. Dropped on empty ground, the fire stands on the ground at that spot." },
        { lead: "See the preview.", text: "A rough flame and smoke plume appears and the fire is selected." },
        { lead: "Adjust it.", text: "The fire's own panel has Intensity, Spread, Smoke and Wind, and the move gizmo slides it along the object, for example from the engine to the wing root. The panel says: \"Preview only. The final fire is rendered in Unreal.\"" },
        { lead: "Manage it in Layers.", text: "The fire is listed under the object it is attached to, with its own hide, lock, rename and delete." },
        { lead: "Check the work order.", text: "The Objects row summarises it, for example \"fire on left engine\"." },
        { lead: "Dispatch.", text: "Unreal spawns the real fire and smoke and renders the frames, with fire and smoke labelled." },
        { lead: "Review.", text: "If it is wrong, select the fire, adjust, and dispatch again." },
      ],
    },
    {
      kind: "note",
      text: "**With SAB.** \"Start a fire in the left engine\" places the Fire tile on the jet, the way SAB places library assets today. \"Make it stronger\" raises Intensity. \"Put the fire out\" deletes it. Naming a part like \"left engine\" works only when the model has named parts.",
    },
    { kind: "h", text: "What is drawn where" },
    {
      kind: "table",
      head: ["Terra editor (three.js)", "Unreal"],
      rows: [
        ["The fire as an item in the scene, with its settings", "The real fire and smoke, as a Niagara effect on the object"],
        ["The VFX tab, drop onto objects, the fire's panel, Layers", "Reading the settings: bigger flames, denser smoke, wind"],
        ["A rough preview of flames, smoke and a flickering light at the right spot and size", "Light and shadow from the fire on the object and the ground"],
        ["The `vfx` entries in the work order, converted for Unreal", "The final frames, with fire and smoke labels"],
      ],
    },
    {
      kind: "flow",
      steps: [
        "Place Fire from the VFX tab",
        "Fire settings saved in the scene",
        "Work order with vfx entries",
        "Unreal spawns Niagara fire and smoke",
        "Dataset frames with fire and smoke labels",
      ],
    },
    {
      kind: "p",
      text: "The editor preview also shows the same settings in three.js, so it only needs to be in the right place at about the right scale. Weather already works this way: the browser draws a preview, and a separate set of values goes to Unreal.",
    },
    { kind: "h", text: "Fire settings" },
    {
      kind: "table",
      head: ["Setting", "What it controls", "Range"],
      rows: [
        ["Intensity", "Flame size, how many flames, how dense the smoke is. The film goes from 1.0 to 2.4.", "To agree with Unreal"],
        ["Spread", "How far the fire reaches from where it was placed, for example engine to wing root.", "To agree with Unreal"],
        ["Smoke", "How dense and tall the smoke column is.", "To agree with Unreal"],
        ["Wind", "Which way the smoke drifts, and how hard.", "To agree with Unreal"],
        ["Position", "Where on the object, or on the ground, the fire sits.", "Set by placing and the move gizmo"],
      ],
    },
    { kind: "h", text: "In the scene and in the work order" },
    {
      kind: "ul",
      items: [
        "A fire is its own scene item, so one object can carry several and any object can carry its own.",
        "The work order carries a list of `vfx` entries. Each names the object it is attached to, the offset from it, and the settings.",
        "Units are converted at the dispatch boundary: metres to centimetres, and Y-up to Z-up. The SAB code already converts degrees to radians the same way.",
      ],
    },
    { kind: "h", text: "How the preview could be built" },
    {
      kind: "p",
      text: "Four layers, as games do it. Worth checking against this project's versions (three 0.169, React Three Fiber 8) before installing anything.",
    },
    {
      kind: "table",
      head: ["Layer", "Technique", "Library to evaluate"],
      rows: [
        ["Flames", "Animated fire sprites around the placement, added together, shifting yellow to orange to red as they rise", "[three.quarks](https://alexandrubagu.github.io/blog/three-quarks-particle-guide.html)"],
        ["Flame core", "A raymarched volumetric flame inside a box", "[@wolffo/three-fire](https://unpkg.com/@wolffo/three-fire@1.3.0/README.md)"],
        ["Smoke", "Large dark particles that grow and fade, pushed by wind into a plume; soft edges where they meet geometry", "three.quarks, or [react-smoke](https://www.npmjs.com/package/react-smoke)"],
        ["Light and glow", "A flickering orange point light, plus bloom on the hot core", "three.js light and `@react-three/postprocessing`"],
      ],
    },
    {
      kind: "p",
      text: "Flame and smoke sprites can come from a free pack, or from sheets baked in [EmberGen](https://jangafx.com/software/embergen), which also exports for Unreal so the preview and the real render could share one look.",
    },
    { kind: "h", text: "Questions for the Unreal team" },
    { kind: "p", text: "1, 4 and 5 block the Terra work. The rest can be settled while building." },
    {
      kind: "steps",
      items: [
        { lead: "Spawning.", text: "Can the generator spawn a Niagara effect today and attach it to an actor from the payload? If not, how much work is it?" },
        { lead: "Effect source.", text: "Is there a fire and smoke system to use (a Fab pack, starter content, in-house), or does one need to be made?" },
        { lead: "Parameters.", text: "Which settings can it expose: intensity, spread radius, smoke density, wind (or follow UDS wind), and where on the actor it sits?" },
        { lead: "Payload format.", text: "Is a per-actor `fire` block right, or a list of `vfx` entries with a parent actor and an offset in centimetres, Z-up?" },
        { lead: "Labels.", text: "Fire and smoke are translucent. Can they get their own boxes or masks, for example through custom depth or stencil? If not, what is possible?" },
        { lead: "Consistency.", text: "Can fire be seeded so the same order gives the same flames? Does it need warm-up time before capture so the first frames are not empty?" },
        { lead: "Variation.", text: "Should fire intensity be a work order axis like weather, varied across subsets, or one fixed value per scene?" },
        { lead: "Cost.", text: "Will heavy fire and smoke slow rendering or need lower settings on large runs?" },
        { lead: "Light.", text: "Will the fire cast light and shadows on the object and the ground?" },
      ],
    },
    { kind: "h", text: "Not decided" },
    {
      kind: "ul",
      items: [
        "Whether fire intensity varies across the dataset or stays one value per scene (question 7).",
        "Which other effects follow fire, and in what order.",
        "Whether the editor preview ever tries to look photoreal. The MAT preview pass is the existing route to a photoreal still.",
      ],
    },
    {
      kind: "p",
      text: "Sources: [three.quarks guide](https://alexandrubagu.github.io/blog/three-quarks-particle-guide.html), [@wolffo/three-fire](https://unpkg.com/@wolffo/three-fire@1.3.0/README.md), [three.js forum: 3D smoke](https://discourse.threejs.org/t/how-to-make-3d-smoke/34520), [three.js forum: soft particles](https://discourse.threejs.org/t/points-transparent-textures-depth-artifacts-soft-particles/5927), [EmberGen](https://jangafx.com/software/embergen).",
    },
  ],
};

export const PRDS: Prd[] = [platform, web, phase2];

export const prdById = (id: string): Prd | undefined => PRDS.find((p) => p.id === id);
