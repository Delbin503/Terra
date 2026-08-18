import type { IconName } from "@/components/icons";
import type { AssetType } from "./assets-data";
import type { SceneObject } from "./scene-types";

/**
 * AI AGENT — the vocabulary the panel can render, and the scripted brain that
 * produces it.
 *
 * The panel is a *view*: it knows how to draw a turn, a work card, a permission
 * prompt. Everything about WHAT the agent says lives here, as data, so the
 * conversation can be rewritten without touching a single class name — and so
 * the day a real model sits behind this, the panel keeps rendering unchanged and
 * only `planFor` gets replaced.
 *
 * Vocabulary note: the spec this was built from talks about "layers" and
 * "nodes". Terra's equivalent is a scene object, so that's the word used
 * throughout — a node chip points at something in the viewport, and clicking it
 * routes through `scene.select`, exactly like clicking the mesh.
 */

/** A scene object the agent can point at. */
export interface NodeRef {
  id: string;
  name: string;
  type: AssetType;
}

export const nodeRef = (o: SceneObject): NodeRef => ({ id: o.id, name: o.name, type: o.source });

/**
 * One piece of a message. A turn is an array of these rather than a string,
 * because an agent answer is rarely only prose — it interleaves prose with the
 * things it made and the objects it touched.
 */
export type Part =
  /** Markdown: **bold**, *italic*, `code`, [links](url), `- ` lists, and
   *  [[Object Name]] — which resolves against the turn's `refs` into a
   *  clickable deep-link, and falls back to plain text if it doesn't. */
  | { kind: "md"; text: string }
  /** Loose node chips, one per object. */
  | { kind: "nodes"; nodes: NodeRef[] }
  /** Many nodes bundled behind one chip — expands to the list. */
  | { kind: "group"; label: string; nodes: NodeRef[] }
  /** A preview of something the agent made or edited. */
  | { kind: "image"; seed: number; type: AssetType; caption?: string }
  /** Technical output. Collapsed by default; prose shouldn't hide behind it. */
  | { kind: "code"; label: string; code: string }
  /** A reference to another Terra project file. */
  | { kind: "file"; name: string; meta: string; seed: number };

export type TaskStatus = "running" | "done" | "error";

/** A unit of work the agent did, shown as a compact card in the thread. */
export interface TaskCard {
  kind: "task";
  label: string;
  /** category glyph — layout, text, image, style, … */
  icon: IconName;
  status: TaskStatus;
  /** 0–100 for a job long enough to deserve a determinate bar; omit for a spinner */
  progress?: number;
  /** the objects this touched, revealed by expanding the card */
  nodes?: NodeRef[];
  detail?: string;
  error?: string;
  /** an edit that can be rolled back — puts Undo on the finished card */
  revert?: () => void;
  undone?: boolean;
}

/** An action the agent won't take until asked. */
export interface PermissionCard {
  kind: "permission";
  label: string;
  detail: string;
  decided?: "allow" | "deny";
}

export type Card = TaskCard | PermissionCard;

/**
 * A RUN — one agent action that unfolds over time, and the spine of the
 * progress/result experience.
 *
 * While it runs it is a *live activity*: a checklist of steps the user can open
 * to watch what the agent is doing right now (which tool, which object). When it
 * finishes it collapses into a *result*: a one-line summary that opens onto a
 * per-asset breakdown of everything that changed — every affected object a
 * deep-link back into the scene. It is the same object in two costumes, which is
 * why "what it's doing" and "what it did" never drift apart.
 */
export type RunStepStatus = "pending" | "running" | "done" | "error";

/** One thing the agent is doing inside a run — a row in the progress dropdown. */
export interface RunStep {
  id: string;
  label: string;
  detail?: string;
  status: RunStepStatus;
}

/**
 * Everything that changed on ONE asset during a run — the unit the result groups
 * by. A run that touched four objects surfaces four of these, each headed by a
 * node deep-link so the user can click straight to that object in the viewport.
 */
export interface AssetChange {
  node: NodeRef;
  changes: string[];
}

export type RunStatus = "running" | "done" | "error";

export type NewTurn =
  | { role: "user"; parts: Part[] }
  | {
      role: "agent";
      parts: Part[];
      refs?: NodeRef[];
      suggestions?: string[];
      /** red-tinted card instead of plain prose — a failure, not an answer */
      tone?: "error";
      /** the prompt to re-run from the error card's "Try again" */
      retry?: string;
    }
  | { role: "card"; ref?: string; card: Card }
  /** A live run: progress while working, a result once done. */
  | {
      role: "run";
      ref?: string;
      title: string;
      status: RunStatus;
      steps: RunStep[];
      /** shown collapsed once done — "Updated 4 objects" */
      summary?: string;
      /** per-asset breakdown revealed by the result dropdown */
      changes?: AssetChange[];
      /** what stopped a failed run */
      error?: string;
      /** a run whose scene edit can be rolled back — puts Undo on the result */
      revert?: () => void;
      undone?: boolean;
    }
  /** An interactive "add an object" chooser — pull from the library, or make a
   *  new mesh. `query` is the thing the user asked for ("chair"). */
  | { role: "add-flow"; query: string }
  | { role: "thinking" };

/** The `run` variant of a turn, on its own — what the RunView renders. */
export type RunTurn = Extract<Turn, { role: "run" }>;

/** The noun the user wants added, or null if this wasn't an "add …" request.
 *  Kept out of `planFor` because the add flow is interactive UI, not a script. */
export function addTarget(text: string): string | null {
  const m = text.match(
    /^\s*(?:add|place|insert|drop|put)\s+(?:a\s+|an\s+|the\s+|some\s+)?(.+?)\s*(?:to|into|in)?(?:\s+the)?(?:\s+scene)?\s*$/i
  );
  if (!m) return null;
  const noun = m[1].trim();
  // "add more spacing" / "add a lane" are scene edits, not object placement.
  if (!noun || /\b(spacing|more|lane|light(ing)?|material|colou?r)\b/i.test(noun)) return null;
  return noun;
}

export type Turn = NewTurn & { id: string };

/** A scripted edit to the thread. `ref` targets a card or run added earlier. */
export type Op =
  | { op: "add"; turn: NewTurn }
  | { op: "patch"; ref: string; card: Partial<TaskCard> & Partial<PermissionCard> }
  /** Merge fields into a live run — status, steps, summary, per-asset changes. */
  | { op: "patch-run"; ref: string; run: Partial<Extract<NewTurn, { role: "run" }>> }
  | { op: "drop-thinking" };

export interface Step {
  /** ms after the previous step */
  after: number;
  ops: Op[];
}

export type Script = Step[];

/* ------------------------------------------------------------------ context */

export interface AgentContext {
  /** real objects in the scene, so the agent points at things that exist */
  nodes: NodeRef[];
  sceneName: string;
  selected: NodeRef | null;
}

/** Objects the script falls back to when the scene is still empty — the agent is
 *  describing what it's about to build, so these are names, not references. */
const DEMO_NODES: NodeRef[] = [
  { id: "demo-road", name: "Road Deck", type: "mesh" },
  { id: "demo-kerb", name: "Kerb Strip", type: "mesh" },
  { id: "demo-sedan", name: "Sedan 01", type: "mesh" },
  { id: "demo-sign", name: "Stop Sign", type: "mesh" },
  { id: "demo-sky", name: "Overcast Sky", type: "environment" },
  { id: "demo-cam", name: "Capture Cam", type: "camera" },
];

/** Prefer what's actually in the scene; top up from the demo set so a script
 *  that talks about four objects always has four to point at. */
function pool(ctx: AgentContext, n: number): NodeRef[] {
  const out = ctx.nodes.slice(0, n);
  for (const d of DEMO_NODES) {
    if (out.length >= n) break;
    if (!out.some((o) => o.name === d.name)) out.push(d);
  }
  return out;
}

/* ------------------------------------------------------------ empty state */

export interface Starter {
  icon: IconName;
  title: string;
  blurb: string;
  prompt: string;
  /**
   * What the scene has to contain for this to be worth offering.
   *
   * The panel used to list all six whatever the scene held, so an empty project
   * opened on "Audit my scene", "Find all red objects" and "Restyle the
   * selection" — three prompts with nothing to act on. A starter that can only
   * answer "there's nothing here" isn't a suggestion, it's a dead end.
   */
  needs?: "objects" | "selection";
}

export const STARTERS: Starter[] = [
  {
    icon: "scene",
    title: "Build a scene",
    blurb: "Lay out a road, kerbs and props from one prompt",
    prompt: "Build a two-lane road scene with kerbs and a parked sedan",
  },
  {
    icon: "info",
    title: "Audit my scene",
    blurb: "Missing materials, scale outliers, orphan cameras",
    prompt: "Audit my scene",
    needs: "objects",
  },
  {
    icon: "search",
    title: "Find all red objects",
    blurb: "Search by colour, material or source type",
    prompt: "Find all red objects",
    needs: "objects",
  },
  {
    icon: "capture",
    title: "Plan a capture run",
    blurb: "Frame count, step distance and a render estimate",
    prompt: "Plan a capture run for the master object",
    needs: "objects",
  },
  {
    icon: "texture",
    title: "Restyle the selection",
    blurb: "Colour, metalness and roughness in one pass",
    prompt: "Make the selection darker and more metallic",
    needs: "selection",
  },
  {
    icon: "input-3d",
    title: "Generate a mesh",
    blurb: "Describe an object and place it in the viewport",
    prompt: "Generate a weathered concrete barrier",
  },
];

/* ------------------------------------------------------------ run builder */

interface RunSpec {
  /** id the run's later patches target */
  ref: string;
  /** shown while working ("Building the scene") — the result rewrites it to `summary` */
  title: string;
  /** the checklist, in order; `ms` is how long that step appears to run */
  steps: { label: string; detail?: string; ms: number }[];
  /** the collapsed result line once done ("Updated 4 objects") */
  summary: string;
  /** per-asset breakdown behind the result dropdown */
  changes?: AssetChange[];
  /** prose + suggestions that follow the result, if any */
  message?: { parts: Part[]; refs?: NodeRef[]; suggestions?: string[] };
  /** ms of quiet before the run turn first appears (a beat of "thinking") */
  leadMs?: number;
}

/**
 * Turns a RunSpec into the timed beats that animate it: the run turn appears with
 * its first step already going, each step lights up in turn, then the whole thing
 * flips to a result. The panel renders every intermediate state — this only
 * decides *when* each one lands, so a scripted flow reads like a real one.
 */
function buildRun(spec: RunSpec): Script {
  // A step is done once we've moved past it, running while it's the frontier,
  // and pending (dimmed, not yet reached) after it.
  const stepsAt = (frontier: number): RunStep[] =>
    spec.steps.map((s, i) => ({
      id: `s${i}`,
      label: s.label,
      detail: s.detail,
      status: i < frontier ? "done" : i === frontier ? "running" : "pending",
    }));

  const beats: Script = [
    {
      after: spec.leadMs ?? 0,
      ops: [
        {
          op: "add",
          turn: {
            role: "run",
            ref: spec.ref,
            title: spec.title,
            status: "running",
            steps: stepsAt(0),
          },
        },
      ],
    },
  ];

  spec.steps.forEach((step, i) => {
    beats.push({ after: step.ms, ops: [{ op: "patch-run", ref: spec.ref, run: { steps: stepsAt(i + 1) } }] });
  });

  beats.push({
    after: 300,
    ops: [
      {
        op: "patch-run",
        ref: spec.ref,
        run: { status: "done", summary: spec.summary, changes: spec.changes },
      },
    ],
  });

  if (spec.message) {
    beats.push({
      after: 250,
      ops: [
        {
          op: "add",
          turn: {
            role: "agent",
            refs: spec.message.refs,
            parts: spec.message.parts,
            suggestions: spec.message.suggestions,
          },
        },
      ],
    });
  }

  return beats;
}

/* ---------------------------------------------------------------- scripts */

const SCAN_OUTPUT = `terra.scene.query({
  where: { material.color: within("#e5675f", 12) }
})

→ 3 matches / 14 objects scanned  (41 ms)
   Sedan 01      #e5675f  exact
   Stop Sign     #d95f57  ΔE 4.2
   Kerb Strip    #e0665f  ΔE 2.8`;

/**
 * The scripted planner. One branch per intent, each written to exercise a
 * different part of the vocabulary — because the fastest way for this panel to
 * regress is for a card type to stop being reachable.
 */
export function planFor(prompt: string, ctx: AgentContext): Script {
  const p = prompt.toLowerCase();

  // Order is the whole design here: the specific verbs are tested first, and the
  // build branch — which owns the broadest nouns — goes last. "Audit my scene"
  // has to reach the audit branch, and it won't if `scene` is still a build word.
  if (/\b(audit|lint|validate|review|check)\b/.test(p)) return auditScript(prompt);
  if (/\b(find|search|locate|which|where)\b/.test(p)) return findScript(ctx);
  if (/\b(dark|darker|metal|metallic|matte|rough|colou?r|restyle|spacing)\b/.test(p))
    return restyleScript(ctx);
  if (/\b(capture|sweep|dataset|frames?|presentation|flow)\b/.test(p)) return captureScript(ctx);
  if (/\b(generate|mesh|model|barrier)\b/.test(p)) return generateScript(ctx);
  if (/\b(build|create|lay ?out|layout|road|scene|page)\b/.test(p)) return buildScript(ctx);
  return fallbackScript(ctx);
}

function buildScript(ctx: AgentContext): Script {
  const nodes = pool(ctx, 4);
  const [road, kerb, sedan, sign] = nodes;
  return buildRun({
    ref: "build",
    title: "Building the scene",
    steps: [
      {
        label: "Read the scene and plan the layout",
        detail: "Two lanes, 6 m deck, kerbs both sides. Reused the scene's material set.",
        ms: 850,
      },
      { label: `Place ${road.name} and ${kerb.name}`, ms: 700 },
      { label: `Park ${sedan.name} in the near lane`, ms: 600 },
      { label: "Assign materials from the scene set", ms: 500 },
    ],
    summary: `Built ${ctx.sceneName} — ${nodes.length} objects placed`,
    changes: [
      { node: road, changes: ["Added as the ground plane, 6 m across", "Material: reused Asphalt Dark"] },
      { node: kerb, changes: ["Ran along both edges, mirrored on X", "Material: reused Concrete Kerb"] },
      { node: sedan, changes: ["Parked in the near lane", "Rotated 4° to face the exit"] },
      { node: sign, changes: ["Placed at the kerb head", "Material: reused Sign Red"] },
    ],
    message: {
      refs: nodes,
      parts: [
        {
          kind: "md",
          text: `Done — the deck is in. I built it from **${nodes.length} objects** so you can move the lanes without dragging the props along. Open the result above to see what landed on each one, or click any object to jump to it in the viewport.`,
        },
        { kind: "image", seed: 314, type: "mesh", caption: "Viewport after the build" },
      ],
      suggestions: ["Make it darker", "Add more spacing", "Try a different layout"],
    },
  });
}

function auditScript(prompt: string): Script {
  return [
    { after: 0, ops: [{ op: "add", turn: { role: "thinking" } }] },
    {
      after: 700,
      ops: [
        { op: "drop-thinking" },
        {
          op: "add",
          turn: {
            role: "card",
            ref: "audit",
            card: { kind: "task", label: "Audit the scene", icon: "info", status: "running" },
          },
        },
      ],
    },
    {
      after: 1600,
      ops: [
        {
          op: "patch",
          ref: "audit",
          card: {
            status: "error",
            error: "Material graph unreadable for 2 objects",
          },
        },
      ],
    },
    {
      after: 300,
      ops: [
        {
          op: "add",
          turn: {
            role: "agent",
            tone: "error",
            retry: prompt,
            parts: [
              {
                kind: "md",
                text: "The audit stopped partway: two objects have a material graph I couldn't read, so a scale or colour report would have been wrong rather than incomplete. Nothing in the scene was changed.",
              },
              {
                kind: "code",
                label: "Audit log",
                code: `terra.audit.run({ scope: "scene" })\n\n✓ transforms      14/14\n✓ orphan cameras  0\n✗ materials       2 unresolved\n   └ node "Sedan 01"  → texture slot 3 empty\n   └ node "Kerb Strip" → normal map missing\n\naborted after 1.4 s`,
              },
            ],
          },
        },
      ],
    },
  ];
}

function findScript(ctx: AgentContext): Script {
  const nodes = pool(ctx, 3);
  return [
    { after: 0, ops: [{ op: "add", turn: { role: "thinking" } }] },
    {
      after: 650,
      ops: [
        { op: "drop-thinking" },
        {
          op: "add",
          turn: {
            role: "card",
            card: {
              kind: "task",
              label: "Scan 14 objects",
              icon: "search",
              status: "done",
              detail: "Matched on base colour within ΔE 12.",
              nodes,
            },
          },
        },
      ],
    },
    {
      after: 350,
      ops: [
        {
          op: "add",
          turn: {
            role: "agent",
            refs: nodes,
            parts: [
              {
                kind: "md",
                text: `Three objects read as red. [[${nodes[0].name}]] is an exact match; the other two are close enough that they'll photograph as the same colour:`,
              },
              { kind: "nodes", nodes },
              {
                kind: "md",
                text: "Nothing else in the scene is within range — the kerb's tint comes from the *environment*, not its own material.",
              },
              { kind: "code", label: "Query", code: SCAN_OUTPUT },
            ],
            suggestions: ["Select all three", "Make them the same red", "Export the list"],
          },
        },
      ],
    },
  ];
}

function captureScript(ctx: AgentContext): Script {
  return [
    { after: 0, ops: [{ op: "add", turn: { role: "thinking" } }] },
    {
      after: 800,
      ops: [
        { op: "drop-thinking" },
        {
          op: "add",
          turn: {
            role: "agent",
            parts: [
              {
                kind: "md",
                text: `A full sweep of **${ctx.sceneName}** comes out at *384 frames* — 24 shots a revolution across 16 passes. That writes about 1.2 GB, so I need you to sign off on the folder first.`,
              },
            ],
          },
        },
        {
          op: "add",
          turn: {
            role: "card",
            ref: "perm",
            card: {
              kind: "permission",
              label: "Write 384 frames to your project folder",
              detail: `Terra AI needs write access to “${ctx.sceneName} / captures”. Existing frames in that folder are left alone.`,
            },
          },
        },
      ],
    },
  ];
}

/** The run itself — only reachable once the permission card is answered. */
export function captureFollowUp(decision: "allow" | "deny", ctx: AgentContext): Script {
  if (decision === "deny") {
    return [
      { after: 0, ops: [{ op: "patch", ref: "perm", card: { decided: "deny" } }] },
      {
        after: 250,
        ops: [
          {
            op: "add",
            turn: {
              role: "agent",
              parts: [
                {
                  kind: "md",
                  text: "Left it alone. The plan is still here if you want it — say the word and I'll re-ask, or point me at a different folder.",
                },
              ],
              suggestions: ["Pick another folder", "Halve the frame count"],
            },
          },
        ],
      },
    ];
  }

  return [
    { after: 0, ops: [{ op: "patch", ref: "perm", card: { decided: "allow" } }] },
    ...buildRun({
      ref: "run",
      leadMs: 250,
      title: "Rendering the capture run",
      steps: [
        { label: "Lock the camera path", ms: 500 },
        { label: "Render 384 frames · 16 passes", detail: "24 shots a revolution, 16 elevations.", ms: 1900 },
        { label: "Write frames to /captures", ms: 800 },
      ],
      summary: "Rendered 384 frames · 1.18 GB",
      message: {
        parts: [
          {
            kind: "md",
            text: "All 384 frames are down, 1.18 GB. The frame naming follows the pass index, so the set drops straight into a training split without renaming.",
          },
          {
            kind: "file",
            name: `${ctx.sceneName} · captures`,
            meta: "384 frames · 1.18 GB · just now",
            seed: 77,
          },
        ],
        suggestions: ["Open the folder", "Run the same sweep at 12 fps"],
      },
    }),
  ];
}

function restyleScript(ctx: AgentContext): Script {
  // Restyle is the one intent that really mutates the scene, so it's the one
  // that can't be faked against a placeholder: with nothing selected there is
  // no edit, and a work card claiming one would carry an Undo that undoes
  // nothing. Ask instead.
  if (!ctx.selected) {
    return [
      { after: 0, ops: [{ op: "add", turn: { role: "thinking" } }] },
      {
        after: 600,
        ops: [
          { op: "drop-thinking" },
          {
            op: "add",
            turn: {
              role: "agent",
              parts: [
                {
                  kind: "md",
                  text: "Nothing is selected, so there's nothing for me to restyle yet. Click an object in the viewport — or attach one with the paperclip — and ask again.",
                },
              ],
              suggestions: ["Build a scene first", "Find all red objects"],
            },
          },
        ],
      },
    ];
  }

  const target = ctx.selected;
  return buildRun({
    ref: "style",
    title: `Restyling ${target.name}`,
    steps: [
      { label: "Read the current material", ms: 500 },
      { label: "Darken the base colour two steps", ms: 600 },
      { label: "Raise metalness, drop roughness", ms: 500 },
    ],
    summary: `Restyled ${target.name}`,
    changes: [
      {
        node: target,
        changes: ["Base colour darkened two steps", "Metalness → 0.9", "Roughness → 0.2"],
      },
    ],
    message: {
      refs: [target],
      parts: [
        {
          kind: "md",
          text: `[[${target.name}]] is darker and reads as metal now. I left *roughness* low so it still catches the sky — push it back up if the highlight is too sharp.`,
        },
      ],
      suggestions: ["Make it matte instead", "Match the master object"],
    },
  });
}

function generateScript(ctx: AgentContext): Script {
  return buildRun({
    ref: "gen",
    title: "Generating a mesh",
    steps: [
      { label: "Read the prompt", ms: 500 },
      { label: "Run 4 candidate passes", detail: "Text → mesh, 4 candidates scored on silhouette.", ms: 900 },
      { label: "Pick the best and clean the topology", ms: 700 },
    ],
    summary: "Generated concrete barrier · 4.8k tris",
    message: {
      parts: [
        {
          kind: "md",
          text: "Here's the barrier — 4.8k triangles, one material, origin at the base so it drops flat on the deck.",
        },
        { kind: "image", seed: 512, type: "mesh", caption: "Concrete barrier · 4.8k tris" },
        {
          kind: "md",
          text: `It's in **3D Models** in your library. Place it from there, or say *place it* and I'll drop it beside the ${ctx.sceneName.toLowerCase()} deck.`,
        },
      ],
      suggestions: ["Place it in the scene", "Make it more weathered", "Generate a variant"],
    },
  });
}

function fallbackScript(ctx: AgentContext): Script {
  return [
    { after: 0, ops: [{ op: "add", turn: { role: "thinking" } }] },
    {
      after: 700,
      ops: [
        { op: "drop-thinking" },
        {
          op: "add",
          turn: {
            role: "agent",
            parts: [
              {
                kind: "md",
                text: `I can work on **${ctx.sceneName}** directly — build and place objects, restyle what's selected, scan the scene for something, or plan a capture run. Point me at an object and tell me what to change.`,
              },
            ],
            suggestions: ["Build a scene", "Audit my scene", "Plan a capture run"],
          },
        },
      ],
    },
  ];
}
