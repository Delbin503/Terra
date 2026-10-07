import type { SceneApi } from "./useScene";

/**
 * THE GETTING-STARTED GUIDE — what it says, and when each line of it is done.
 * ----------------------------------------------------------------------------
 * A new project opens empty (see useScene), and this is what walks someone
 * from that empty stage to a dispatched Work Order: a world, a hero object, a
 * camera, the Layers panel, the AI tools, and finally the Work Order itself.
 *
 * WRITTEN AS DATA, NOT AS SCREENS. Each step is a list of tips; a tip points at
 * one control (by its `data-ui`) and says one thing about it. Most tips finish
 * themselves — `done` is asked a few times a second, and the moment the user has
 * actually opened the library or placed the sky the guide moves on, so it never
 * asks for a Next click on something they have just done. Tips that only
 * explain carry a `next` button instead.
 *
 * THE THREE PLACING STEPS END ON BACK. Environment, Object and Camera each walk
 * the focus view of the thing just placed — every tile in the bottom bar, then
 * rename and delete — and the step is over only when the user presses Back to
 * leave that focus view. Back is the gesture that says "I'm done with this
 * object", so it is the one that moves the guide on; deselecting some other way
 * (a click on empty space) does not.
 *
 * `done` reads the scene, the DOM and which controls were clicked during the
 * tip, never React state of its own, which is what lets a step that is already
 * true when you reach it (an object placed before the guide asked for one)
 * pass straight through.
 */

export interface GuideContext {
  scene: SceneApi;
  /** the first match of `selector` that is on screen and not covered, or null */
  find: (selector: string) => HTMLElement | null;
  /** whether the control with this `data-ui` has been clicked during this tip */
  clicked: (dataUi: string) => boolean;
}

export interface GuideTip {
  /** the control this tip points at; the first visible match wins */
  target?: string;
  /** which side of the target the bubble sits on */
  side?: "top" | "bottom" | "left" | "right";
  title: string;
  body: string;
  /** true once the user has done what the tip asks — the guide moves on */
  done?: (c: GuideContext) => boolean;
  /** a Next button, and its label — for tips that only explain */
  next?: string;
  /** what the panel says while `target` is not on screen */
  missing?: string;
  /** a shortcut offered beside `missing` — doing the thing for the user */
  action?: { label: string; run: (c: GuideContext) => void };
}

export interface GuideStep {
  id: string;
  title: string;
  /** one line, shown under the step while it is the current one */
  blurb: string;
  /** why the step cannot start yet, or null when it can */
  blocked?: (c: GuideContext) => string | null;
  tips: GuideTip[];
}

/* ------------------------------------------------------------- predicates -- */

const ui = (id: string) => `[data-ui="${id}"]`;

type Obj = SceneApi["objects"][number];

/* PLACING DOES NOT SELECT (see `add` in useScene), so every "here are its
   controls" tip first needs the thing selected. The sky and the object are
   selected by the user, through the Layers panel the guide walks them to;
   `selectCamera` is the one shortcut left, and it picks the newest rig's start
   camera — the one the step just asked for. */
const isSky = (o: Obj) => o.source === "environment" || o.source === "skybox";
const isBody = (o: Obj) => !o.group && !isSky(o) && o.source !== "camera";
const selectCamera = (c: GuideContext) => {
  const rig = c.scene.rigs[c.scene.rigs.length - 1];
  const start = rig ? c.scene.rigCameras(rig).start : null;
  if (start) c.scene.select(start.id);
};
const SELECT_IT = "Select it";

const libraryOpen = (c: GuideContext) => !!c.find(ui("glass-asset-library"));
const layersOpen = (c: GuideContext) => !!c.find(ui("glass-scene-layers"));
const category = (id: string) => (c: GuideContext) =>
  !!c.find(`[data-ui="asset-cat-${id}"][aria-current="true"]`);

const hasSky = (c: GuideContext) => c.scene.objects.some(isSky);
/** Something to be the hero: a body in the world, not a sky, a camera or a group. */
const hasObject = (c: GuideContext) => c.scene.objects.some(isBody);
const hasMaster = (c: GuideContext) => !!c.scene.master;
const hasCamera = (c: GuideContext) => c.scene.rigs.length > 0;
const workOrderOpen = (c: GuideContext) => !!c.find(ui("terragen-view"));

const either =
  (...ps: ((c: GuideContext) => boolean)[]) =>
  (c: GuideContext) =>
    ps.some((p) => p(c));

/* ---------------------------------------------------------- shared tips -- */

/* The tip every placing step opens with. */
const openAssets = (also: (c: GuideContext) => boolean, body: string): GuideTip => ({
  target: ui("toolbar-assets"),
  side: "bottom",
  title: "Open the Asset Library",
  body,
  done: either(libraryOpen, also),
});

const PLACE_HOW =
  "Drag a card into the viewport — or open its ⋯ menu and choose Place in Scene.";

/**
 * The focus-view tips for one kind of thing: what to say when it isn't
 * selected, and how to select it for the user.
 */
interface Focus {
  /** the panel's line while the thing is not selected */
  missing: string;
  /** what counts as "this is the thing" when reading the selection */
  is: (o: Obj) => boolean;
  /**
   * A shortcut offered in the panel, which selects the thing FOR the user.
   *
   * OPTIONAL, AND DELIBERATELY ABSENT ON THE SKY AND THE OBJECT. A button that
   * does the step for you teaches nothing — and selecting from the guide is not
   * a gesture that exists in the editor, so the one thing the user took away
   * was a route they can never use again. Those two steps walk the Layers panel
   * instead (see `openLayersTip`). The camera keeps it: a rig is two objects and
   * picking the right one of them in the viewport is fiddly.
   */
  select?: (c: GuideContext) => void;
}

const SKY: Focus = {
  missing:
    "The sky isn't selected. Open Layers from the toolbar and click its row to bring its controls back.",
  is: isSky,
};
const BODY: Focus = {
  missing:
    "The object isn't selected. Click it in the viewport, or open Layers and click its row, to bring its controls back.",
  is: isBody,
};
const CAMERA: Focus = {
  missing:
    "Click one of the cameras in the viewport (or in Layers) to bring up its controls. If the camera view is open, close it with Esc first.",
  is: (o) => o.source === "camera",
  select: selectCamera,
};

/** True while the thing this step is about is the one selected. */
const isSelected = (f: Focus) => (c: GuideContext) => {
  const sel = c.scene.selected;
  return !!sel && f.is(sel);
};

/**
 * PLACED, NOW SELECT IT — the two tips that stand in for the old shortcut.
 *
 * Placing does not select (see `add` in useScene), so every focus-view tip
 * needs the thing selected first. That used to be a button in the guide panel
 * which selected it for you; these walk the route the user will actually take
 * afterwards — the toolbar's Layers button, then the row in the list.
 *
 * Both finish early if the thing is already selected, so someone who clicked it
 * in the viewport (or had it selected before the guide got here) passes
 * straight through rather than being sent to a panel they do not need.
 */
const openLayersTip = (f: Focus, why: string): GuideTip => ({
  target: ui("toolbar-scene"),
  side: "bottom",
  title: "Open the Layers panel",
  body: `Placing doesn't select anything, ${why} Click Layers to list everything in the scene.`,
  done: either(layersOpen, isSelected(f)),
});

const selectInLayersTip = (f: Focus, what: string): GuideTip => ({
  target: ui("glass-scene-layers"),
  side: "left",
  title: `Select the ${what}`,
  body: `Click the ${what}'s row in the list. That selects it, and its controls appear along the bottom of the viewport.`,
  done: isSelected(f),
  missing: "Open Layers from the toolbar to continue.",
});

/** A tip about one control in the focus view of `f`. */
const focusTip = (f: Focus, tip: Omit<GuideTip, "missing" | "action">): GuideTip => ({
  next: "Next",
  ...tip,
  missing: f.missing,
  ...(f.select ? { action: { label: SELECT_IT, run: f.select } } : {}),
});

const renameTip = (f: Focus, what: string): GuideTip =>
  focusTip(f, {
    target: ui("object-title-name"),
    side: "right",
    title: "Rename",
    body: `Click the name to rename the ${what}, type, then press Enter. Esc cancels.`,
  });

const deleteTip = (f: Focus, what: string): GuideTip =>
  focusTip(f, {
    target: ui("object-delete"),
    side: "right",
    title: "Delete",
    body: `Delete removes the ${what} from the scene. Changed your mind? Undo, at the top left, puts it back.`,
  });

/** The last tip of a placing step: the step ends when Back is pressed. */
const backTip = (f: Focus, what: string): GuideTip =>
  focusTip(f, {
    target: ui("object-title-back"),
    side: "right",
    title: "Back — finish this step",
    body: `Press Back to leave the ${what}'s focus view. That ends this step and the guide moves on.`,
    next: undefined,
    done: (c) => c.clicked("object-title-back"),
  });

/* ------------------------------------------------------------------ steps -- */

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "environment",
    title: "Environment set-up",
    blurb: "Every scene starts with a world to stand in.",
    tips: [
      openAssets(hasSky, "Everything you put in a scene comes from here. Click Assets."),
      {
        target: ui("asset-cat-environments"),
        side: "right",
        title: "Environments — HDRI maps",
        body:
          "An HDRI is a 360° photo of a real place. It draws the background AND lights every object with that place's light — the quickest way to make a scene look real. Click Environments.",
        done: either(category("environments"), hasSky),
        missing: "Open Assets again to continue.",
      },
      {
        target: ui("asset-cat-skyboxes"),
        side: "right",
        title: "Skyboxes",
        body:
          "A skybox paints the background only — it doesn't light your objects. Use one when you want a backdrop without changing the light. Click Skyboxes to compare.",
        done: either(category("skyboxes"), hasSky),
        missing: "Open Assets again to continue.",
      },
      {
        target: '[data-ui^="asset-card-environment-"], [data-ui^="asset-card-skybox-"]',
        side: "top",
        title: "Place your world",
        body: `Pick an Environment or a Skybox — a scene has one sky at a time. ${PLACE_HOW}`,
        done: hasSky,
        missing: "Open Assets and pick an Environment or a Skybox.",
      },
      openLayersTip(SKY, "and a sky has no body to click in the viewport."),
      selectInLayersTip(SKY, "sky"),
      focusTip(SKY, {
        target: ui("obj-tool-object"),
        side: "top",
        title: "Environment control",
        body:
          "The sky's transform. Rotation turns the sky — that's how you move the sun. Position raises or lowers the horizon (a sky only moves up and down). Scale sets how far the ground reaches before it curves away. Click it to try.",
      }),
      focusTip(SKY, {
        target: ui("obj-tool-appearance"),
        side: "top",
        title: "Appearance control",
        body:
          "Sky Brightness sets how bright the backdrop itself is. Sky Influence sets how much of its light lands on your objects — lower it for a backdrop that doesn't light the scene.",
      }),
      renameTip(SKY, "sky"),
      deleteTip(SKY, "sky"),
      backTip(SKY, "sky"),
    ],
  },
  {
    id: "object",
    title: "Object set-up",
    blurb: "Add the object your dataset is about, and make it the master.",
    tips: [
      openAssets(hasObject, "Open the Asset Library again to add an object."),
      {
        target: ui("asset-cat-all-assets"),
        side: "right",
        title: "All Assets",
        body:
          "All Assets is the catalogue — furniture, vehicles, street props. (3D Models holds the ones you generate with AI.) Click All Assets.",
        done: either(category("all-assets"), hasObject),
        missing: "Open Assets again to continue.",
      },
      {
        target: '[data-ui^="asset-card-mesh-"]',
        side: "top",
        title: "Place an object",
        body: PLACE_HOW,
        done: hasObject,
        missing: "Open Assets and place a 3D model.",
      },
      openLayersTip(BODY, "so your new object has no controls up yet."),
      selectInLayersTip(BODY, "object"),
      focusTip(BODY, {
        target: ui("obj-tool-object"),
        side: "top",
        title: "Object control",
        body:
          "Position, rotation and scale. Drag the gizmo in the viewport to move it by hand, or type exact numbers in the panel on the right.",
      }),
      focusTip(BODY, {
        target: ui("obj-tool-texture"),
        side: "top",
        title: "Texture control",
        body:
          "Change the material on each part of the model — every material slot can take its own colour, roughness, metalness or texture.",
      }),
      focusTip(BODY, {
        target: ui("obj-tool-role"),
        side: "top",
        title: "Master control — make it the master",
        body:
          "The master is the hero of your dataset. Every camera orbits it, every frame is framed on it, and the Work Order is measured against its size — so a run can't start without one. There is one per scene. Click the crown to make this object the master.",
        next: undefined,
        done: hasMaster,
      }),
      renameTip(BODY, "object"),
      deleteTip(BODY, "object"),
      backTip(BODY, "object"),
    ],
  },
  {
    id: "camera",
    title: "Camera set-up",
    blurb: "Place the capture rig that shoots your master.",
    tips: [
      openAssets(hasCamera, "Cameras come from the library too. Click Assets."),
      {
        target: ui("asset-cat-utilities"),
        side: "right",
        title: "Utilities",
        body: "Utilities hold the tools that aren't content: the Camera rig and Spaces. Click Utilities.",
        done: either(category("utilities"), hasCamera),
        missing: "Open Assets again to continue.",
      },
      {
        target: '[data-ui^="asset-card-camera-"]',
        side: "top",
        title: "Place the camera",
        body: `${PLACE_HOW} It arrives as a rig — a Start and an End camera — aimed at your master.`,
        done: hasCamera,
        missing: "Open Assets → Utilities and place the Camera.",
      },
      focusTip(CAMERA, {
        target: ui("obj-tool-object"),
        side: "top",
        title: "Object control",
        body:
          "The rig's placement. Position moves both cameras together. Orbit Rotation swings them around the master. Zoom Distance sets how close the sweep comes in, and Save as set keeps several zooms for the run. Height sets the gap between the two cameras.",
      }),
      focusTip(CAMERA, {
        target: ui("obj-tool-capture"),
        side: "top",
        title: "Capture control",
        body:
          "How the sweep shoots. Rotatable circles the master, Fixed takes one frame. Increments is how many heights the rig stops at; Shots / Rotation is how many frames it takes at each. Increments × Shots is the frame count.",
      }),
      focusTip(CAMERA, {
        target: ui("camera-preview-expand"),
        side: "left",
        title: "Camera view",
        body:
          "This is what the camera sees. Expand it to check the framing at full size. You can only zoom between the reaches set in Zoom Distance: the rig's framing and each saved zoom set. Esc closes it.",
      }),
      backTip(CAMERA, "camera"),
    ],
  },
  {
    id: "layers",
    title: "Layers panel",
    blurb: "Everything in your scene, in one list.",
    tips: [
      {
        target: ui("toolbar-scene"),
        side: "bottom",
        title: "Open Layers",
        body: "Click to list every object in the scene.",
        done: (c) => !!c.find(ui("glass-scene-layers")),
      },
      {
        target: ui("glass-scene-layers"),
        side: "left",
        title: "Manage your scene",
        body:
          "Click a row to select that object. Hover a row to reveal its tools: Lock stops it being moved, Hide takes it out of the view, and the bin deletes it.",
        next: "Done",
        missing: "Open Layers from the toolbar to continue.",
      },
    ],
  },
  {
    id: "ai",
    title: "AI Tools",
    blurb: "Three assistants for building and finishing a scene.",
    tips: [
      {
        target: ui("toolbar-ai"),
        side: "bottom",
        title: "AI Tools",
        body: "Click to open Terra's AI tools.",
        done: (c) => !!c.find(ui("glass-tool-menu")),
      },
      {
        target: ui("tool-menu-sab"),
        side: "right",
        title: "SAB — the scene agent",
        body: "Describe what you want in words and SAB builds or edits the scene for you: placing, moving and swapping objects by prompt.",
        next: "Next",
        missing: "Open AI Tools from the toolbar to continue.",
      },
      {
        target: ui("tool-menu-gen3d"),
        side: "right",
        title: "3D Generate",
        body: "Turns a few images of an object, from different sides, into a 3D mesh you can place in the scene.",
        next: "Next",
        missing: "Open AI Tools from the toolbar to continue.",
      },
      {
        target: ui("tool-menu-mat"),
        side: "right",
        title: "MAT",
        body: "A photorealism pass: it shows how your render looks once it has been adapted to read like a real photo.",
        next: "Done",
        missing: "Open AI Tools from the toolbar to continue.",
      },
    ],
  },
  {
    /* ONE STEP: opening the Work Order and walking it are the same errand, and
       splitting them left a step that was a single click long. */
    id: "work-order",
    title: "Generate work order",
    blurb: "Turn the scene into a dataset order, and what each part of it does.",
    blocked: (c) =>
      hasMaster(c) && hasCamera(c)
        ? null
        : "Set up a master object and a camera first — a Work Order is built around them.",
    tips: [
      {
        target: ui("editor-generate"),
        side: "bottom",
        title: "Generate a Work Order",
        body:
          "Your scene has a master object and a camera — everything a dataset needs. Click Generate to open the Work Order.",
        done: workOrderOpen,
      },
      {
        target: ui("terragen-stage-tabs"),
        side: "bottom",
        title: "Scene preview & Edit scene",
        body:
          "Scene preview shows the scene through the capture camera — step through the sweep with the scrubber below. Edit scene is the normal editor, for moving things.",
        next: "Next",
        missing: "Click Generate to open the Work Order.",
      },
      {
        target: ui("terragen-row-master"),
        side: "left",
        title: "Objects",
        body:
          "The cast: your master, everything around it, and swap objects — stand-ins rendered in an object's place, each one a new variation.",
        next: "Next",
        missing: "Click Generate to open the Work Order.",
      },
      {
        target: ui("terragen-row-camera"),
        side: "left",
        title: "Camera Settings",
        body:
          "How the rig shoots: Rotatable or Fixed, height and increments, the orbit and shots per rotation, and zoom. Increments × shots is the number of frames in each variation.",
        next: "Next",
        missing: "Click Generate to open the Work Order.",
      },
      {
        target: ui("terragen-row-weather"),
        side: "left",
        title: "Weather & Lighting",
        body:
          "Combine Sunny, Cloudy, Rain, Dusty and Snow and tune each one. Save as set to render several conditions in one run.",
        next: "Next",
        missing: "Click Generate to open the Work Order.",
      },
      {
        target: ui("terragen-row-time"),
        side: "left",
        title: "Time of Day",
        body: "Set the sun's clock. Save several times as sets and every variation renders once per time.",
        next: "Next",
        missing: "Click Generate to open the Work Order.",
      },
      {
        target: ui("terragen-row-background"),
        side: "left",
        title: "Scene Environment",
        body: "Add more HDRIs from the library — the whole run renders again under each one.",
        next: "Next",
        missing: "Click Generate to open the Work Order.",
      },
      {
        target: ui("terragen-row-layouts"),
        side: "left",
        title: "Arrangement",
        body:
          "Rearranges your objects inside a drawn space. Ask for several and each one is a new variation, reproducible from its seed. The master never moves.",
        next: "Next",
        missing: "Click Generate to open the Work Order.",
      },
      {
        target: ui("terragen-row-output"),
        side: "left",
        title: "Output",
        body:
          "What comes back with every frame: the image type, the resolution, and annotations such as bounding boxes and segmentation.",
        next: "Next",
        missing: "Click Generate to open the Work Order.",
      },
      {
        target: ui("terragen-dispatch"),
        side: "left",
        title: "Review & dispatch",
        body:
          "Opens the bill — frames, credits and archive size, and why there are that many — before anything is spent. That's the whole tour.",
        next: "Finish",
        missing: "Click Generate to open the Work Order.",
      },
    ],
  },
];
