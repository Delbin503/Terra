import { useEffect, useRef, useState } from "react";
import { Raycaster, Vector2, Vector3, Plane } from "three";
import {
  SceneCanvas,
  type CameraGuide,
  type CameraHandle,
} from "./SceneCanvas";
import { GlassBar } from "@/components/glass";
import { Icon } from "@/components/icons";
import { EditorTopBar } from "./EditorTopBar";
import { EditorToolBar, type ToolId, type FlyoutAction } from "./EditorToolBar";
import { EditorActions } from "./EditorActions";
import { AssetLibrary } from "./AssetLibrary";
import { Generate3DMeshPanel } from "./Generate3DMeshPanel";
import { MatPreviewPanel, type MatPreview } from "./MatPreviewPanel";
import { EditorToast } from "./EditorToast";
import { ExitProjectDialog } from "./ExitProjectDialog";
import { MatPreviewView } from "./MatPreviewView";
import { AiAgentPanel } from "./AiAgentPanel";
import {
  VOLUME_GIZMO,
  VolumeInspectorPanel,
  VolumeSettingControl,
  VolumeToolbar,
  type VolumeSetting,
  type VolumeTab,
} from "./VolumeInspector";
import { describeVolume, volumeArea } from "./scene-volume";
import { newSeed } from "./arrange";
import { floorY, isOverFootprint } from "./scene-volume";
import { ObjectPropertiesPanel, type SettingKey } from "./ObjectPropertiesPanel";
import { SettingControl } from "./SettingControl";
import { ObjectToolbar, type EditTab } from "./ObjectToolbar";
import { ObjectTitle } from "./ObjectTitle";
import { ObjectInfoPanel } from "./ObjectInfoPanel";
import { SceneLayersPanel } from "./SceneLayersPanel";
import { PanelDock, DOCK_WIDTH } from "./panel-dock";
import { SOURCE_LABEL, type SceneObject } from "./scene-types";
import { CameraPreview } from "./CameraPreview";
import { TerraGenView } from "./TerraGenView";
import { useScene } from "./useScene";
import { useAssets } from "./useAssets";
import { useWorkOrder } from "./useWorkOrder";
import { useWorkOrderRuns } from "./work-order-runs";
import { WorkOrdersDialog } from "./WorkOrdersDialog";
import { CameraPlaceDialog } from "./CameraPlaceDialog";
import { CaptureRunPanel } from "./CaptureRunPanel";
import {
  atDistance,
  azimuthOf,
  distance as vecDistance,
  farLimit,
  groundDistance,
  nearLimit,
  orbitPoint,
  orbitShots,
  planCapture,
  spanLimit,
  withVerticalSpan,
  type CapturePlan,
} from "./camera-rig";
import { computeTotals, rigState } from "./work-order";
import { terraCredits } from "./account-data";
import type { Asset, AssetType, CategoryId } from "./assets-data";

type GizmoMode = "translate" | "rotate" | "scale";

/** How bright the rendered scene is behind the chrome. Drives the glass
 *  lighting variants — see the `[data-scene]` blocks in tokens.css. */
export type SceneTier = "dark" | "dim" | "bright";

/** Transform setting ↔ gizmo handles. Material settings have no gizmo, so the
 *  map is partial and a miss simply leaves the current mode alone. */
const SETTING_GIZMO: Partial<Record<SettingKey, GizmoMode>> = {
  position: "translate",
  rotation: "rotate",
  scale: "scale",
};
// The reverse map is gone with the panel's gizmo switcher — nothing sets the
// mode from the viewport side any more, so nothing has to name the row it
// belongs to.

/**
 * The dock starts on the editor's content line — the same y as the top of the
 * orientation cube, one gutter below the top row of chrome — rather than
 * hanging beneath the cube.
 *
 * Below the cube the stack began ~230px down, so a single panel was already
 * near the fold and two panels ran off the bottom of a laptop screen. The cube
 * costs nothing to move and the dock cannot buy that height back any other way,
 * so the panels take the corner and the cube steps left of them.
 */
const DOCK_TOP = 80;

/** How far the right-hand ornaments (the cube and the camera POV under it) step
 *  left to clear the dock: its own 16px gutter, its width, and a gap. */
const DOCK_INSET = 16 + DOCK_WIDTH + 12;

/**
 * EditorView — the default project view. Full-bleed Three.js viewport with
 * floating glass chrome. Assets drag/drop from the library into the scene;
 * selecting an object shows a transform gizmo, focuses the camera, and opens
 * the contextual toolbar (Adjust / Texture / Delete / Back).
 */
export function EditorView({
  projectName: initialProjectName = "Traffic Scene",
  userName = "Terra User",
}: {
  projectName?: string;
  userName?: string;
}) {
  /* The project name is editable from the top bar, and four other surfaces
     quote it — the chatbot's context line, the Work Order, the capture panel.
     It lives here so a rename reaches all of them at once rather than being a
     private edit inside the bar that the rest of the editor never hears about. */
  const [projectName, setProjectName] = useState(initialProjectName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  /** the stand-in mesh waiting for a generation pass to replace it */
  const meshPlaceholder = useRef<string | null>(null);

  const scene = useScene();
  // The library's contents live here, not in the panel — a generation can
  // finish while the library is closed, and its result has to still be there.
  const assets = useAssets();
  const [tool, setTool] = useState<ToolId | null>(null);
  /** Which distance handle is in hand — drives which ring reads as live and
   *  where the ghost pair is drawn. */
  const [spanHandle, setSpanHandle] = useState<"min" | "max" | null>(null);
  /** the layer tree — its own switch, so opening the library can't close it */
  const [layersOpen, setLayersOpen] = useState(false);
  const [editTab, setEditTab] = useState<EditTab | null>(null);
  const [activeSetting, setActiveSetting] = useState<SettingKey | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [gen3dOpen, setGen3dOpen] = useState(false);
  const [matOpen, setMatOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  /**
   * Define mode: the next drag on the ground draws a footprint.
   *
   * It lives here rather than in the Space panel because the VIEWPORT is what
   * acts on it — the panel only asks. Keeping it in the panel would mean the
   * canvas reading state out of a sibling, which is the arrangement that made
   * the old floating panels so hard to reason about.
   */
  const [drawingSpace, setDrawingSpace] = useState(false);
  /** Which of the focused space's three tiles is lit, if any. */
  const [volumeTab, setVolumeTab] = useState<VolumeTab | null>(null);
  /** Which row of the space inspector is open — and therefore which gizmo. */
  const [volumeSetting, setVolumeSetting] = useState<VolumeSetting | null>(null);
  /**
   * A resize grip is in hand.
   *
   * Everything the focused space normally shows gets out of the way while this
   * is true — the title, the tiles and the inspector are three panels over the
   * box whose shape you are trying to judge, and the readout riding the box is
   * already saying the numbers.
   */
  const [volumeDragging, setVolumeDragging] = useState(false);
  const [volumeSeed, setVolumeSeed] = useState(newSeed);
  const [volumeReport, setVolumeReport] = useState<string | null>(null);
  /** the TerraGen sheet — the Work Order author behind Generate */
  const [terraGenOpen, setTerraGenOpen] = useState(false);
  /** text handed from TerraGen's prompt row to the chatbot when it opens */
  // NOTE: TerraGen used to hand its prompt row's text to SAB when it opened the
  // chatbot. The takeover mode has no prompt row, so nothing seeds this any
  // more — the state is gone rather than left as a permanent empty string.

  // The draft lives out here, not in the sheet: closing the panel to go nudge
  // the master object must not throw away an authored Work Order.
  const workOrder = useWorkOrder();
  /** Dispatched runs — the list behind the Download button. Owned here so a run
   *  outlives the TerraGen mode that queued it. */
  const runs = useWorkOrderRuns(projectName);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState<CategoryId>("all");
  // Two panels borrow the library as an image chooser, and only one library is
  // ever mounted — so the request says who asked and how many slots are free,
  // and the result is routed back to that panel alone.
  const [pickReq, setPickReq] = useState<{ target: "mesh" | "mat"; max: number } | null>(null);
  const [meshRefs, setMeshRefs] = useState<Asset[] | null>(null);
  const [matRef, setMatRef] = useState<Asset | null>(null);
  /**
   * Every MAT preview this project has produced, newest first, plus how many
   * of them nobody has looked at yet.
   *
   * There used to be exactly one, reachable from a play button in the top bar
   * for as long as it was the latest — generate a second and the first was
   * gone. Keeping the list is what makes "view all the previews in this
   * project" a thing the panel can answer, and the unseen count is what the
   * toolbar badge is counting.
   */
  const [matPreviews, setMatPreviews] = useState<MatPreview[]>([]);
  const [matUnseen, setMatUnseen] = useState(0);
  const [matHistoryOpen, setMatHistoryOpen] = useState(false);
  const [matToast, setMatToast] = useState(false);
  /**
   * A finished generation pass, announced in the bottom-left corner.
   *
   * Both passes raise it now, and it is no longer suppressed while the panel is
   * open. The old rule — the panel's footer says it, so the toast would be a
   * second notice — assumed the user is looking at the panel when it lands, and
   * a multi-view pass is exactly long enough that they aren't.
   */
  const [genToast, setGenToast] = useState<"multiview" | "mesh" | null>(null);
  /**
   * "That went in the room, not where you let go."
   *
   * A drop outside an armed volume still lands INSIDE it, which is correct and
   * also surprising — the object appears somewhere the pointer never was. The
   * toast is the sentence that stops it reading as a bug.
   */
  const [spaceToast, setSpaceToast] = useState<string | null>(null);
  /** "Saved" — nothing to open, so it says its piece and goes */
  const [savedToast, setSavedToast] = useState(false);
  /** the leave-the-editor confirm */
  const [exitAsking, setExitAsking] = useState(false);
  /** the one-time nudge at the play button, armed when a preview lands */
  /** the preview "tab" is showing instead of the editor */
  /** the preview being viewed full-screen, if any */
  const [previewTab, setPreviewTab] = useState<MatPreview | null>(null);
  /** drop point of a camera awaiting the focus-on-master question */
  const [pendingCamera, setPendingCamera] = useState<[number, number, number] | null>(null);
  /** the capture currently running, frozen at the moment Generate was pressed */
  const [capture, setCapture] = useState<CapturePlan | null>(null);
  const [titleDark, setTitleDark] = useState(false);
  const [sceneTier, setSceneTier] = useState<SceneTier>("dim");
  const [infoOpen, setInfoOpen] = useState(false);

  /**
   * A toolbar click toggles its own surface and touches nothing else.
   *
   * It used to close the chatbot and swap `tool`, so opening the library threw
   * away whatever you were reading. Now every tool panel lives in the right-hand
   * dock and they stack, so the only thing a click decides is whether ITS panel
   * is open — the rest stay exactly as the user left them.
   */
  const selectTool = (t: ToolId) => {
    if (t === "scene") {
      setLayersOpen((v) => !v);
      return;
    }
    if (t === "ai") {
      setTool((cur) => (cur === "ai" ? null : "ai"));
      return;
    }
    // Assets is the one tool that ends focus mode. The library is a full-width
    // sheet for choosing what to bring in NEXT, which is a different job from
    // inspecting the thing already selected — and its dock would sit under the
    // object toolbar anyway. Scene and AI leave the selection alone, because
    // reading the tree or asking the agent about what you've got selected is
    // the whole reason you'd reach for them mid-focus.
    if (scene.selectedId) deselect();
    setLibraryCategory("all");
    setPickReq(null);
    setTool((cur) => (cur === "assets" ? null : "assets"));
  };

  /** Which toolbar buttons read as lit — one per open surface. */
  const activeTools: ToolId[] = [
    ...(layersOpen ? (["scene"] as const) : []),
    ...(tool === "assets" ? (["assets"] as const) : []),
    ...(agentOpen || gen3dOpen || matOpen || tool === "ai" ? (["ai"] as const) : []),
  ];

  /** The dock ends above the asset library's bottom sheet when it's open. */
  const dockBottom = tool === "assets" ? "calc(3rem + clamp(260px, 40vh, 392px))" : 24;

  /** Anything in the dock — the cube and everything anchored to it step left
   *  for it, and step back the moment the last panel closes so an empty corner
   *  is never held open for nothing. */
  const dockBusy = layersOpen || agentOpen || gen3dOpen || matOpen;
  const gizmoInset = dockBusy ? DOCK_INSET : 0;

  /** Open the library focused on one category — used by "Click to view". */
  const openLibraryAt = (cat: CategoryId) => {
    setLibraryCategory(cat);
    setTool("assets");
  };

  /**
   * Generate opens the Work Order author. The axes read the scene in on the
   * first open only — after that the draft is what the user has been editing,
   * and re-deriving would silently overwrite it. The sheet's own Re-read
   * control is how you ask for a fresh read.
   */
  const openTerraGen = () => {
    workOrder.seedIfEmpty(scene, assets.assets);
    setTerraGenOpen(true);
  };

  /** A camera that belongs to a capture rig — the one object whose rotation is
   *  its rig's bearing around the master rather than its own spin. */
  const isRigCamera = scene.selected?.source === "camera" && !!scene.selected?.rigId;

  // The Transform rows and the viewport gizmo are ONE control, driven both ways:
  // picking Position/Rotation/Scale switches the gizmo to the matching handles,
  // and switching the gizmo highlights the row + opens its numeric control.
  // Without the pairing the two can disagree — the panel says Rotation while the
  // viewport still shows translate arrows.
  const selectSetting = (k: SettingKey) => {
    setActiveSetting(k);
    const mode = SETTING_GIZMO[k];
    // "Rotation" on a rig camera means ORBIT — swing the pair around the
    // master — so it must not arm the per-object rotate handles. Those turn one
    // camera on its own axis, which a lens locked on the master immediately
    // overrides, and the spinning rings read as the real control while doing
    // nothing. The orbit ring is the control.
    if (mode && !(isRigCamera && mode === "rotate")) setGizmoMode(mode);
  };

  // No `selectGizmoMode` any more: the properties panel's gizmo switcher is
  // gone, and the pairing now runs one way only — pick a row, get its handles.

  /** Nothing docks on the left edge any more — every tool panel stacks in the
   *  right-hand dock — so the selection chrome no longer has to duck anything. */
  const leftInset = 0;

  const deselect = () => {
    scene.select(null);
    setEditTab(null);
    setActiveSetting(null);
    setInfoOpen(false);
  };

  // Sample the rendered frame twice per tick, from one readback:
  //
  //   · upper-left region → flips the object title light/dark so it reads
  //     against whatever is directly behind it.
  //   · whole frame       → picks the glass lighting tier. Glass is translucent
  //     over an unpredictable scene, so a single tuning can't work everywhere:
  //     over a dark scene the dark ink has nothing to darken and the panel reads
  //     as an edgeless slab; over a bright one the light label loses contrast.
  //     The tier drives the --glass-* overrides in tokens.css.
  //
  // Runs whenever the canvas exists — the glass tier matters even with nothing
  // selected, which is why this no longer early-returns on `selectedId`.
  const selectedId = scene.selectedId;
  useEffect(() => {
    const off = document.createElement("canvas");
    off.width = 16;
    off.height = 10;
    const ctx = off.getContext("2d", { willReadFrequently: true });

    /** Mean relative luminance of whatever was last drawn into `off`. */
    const readLum = () => {
      const { data } = ctx!.getImageData(0, 0, 16, 10);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * (data[i + 3] / 255);
      }
      return sum / (data.length / 4) / 255;
    };

    let dark = titleDark;
    let tier = sceneTier;
    const id = window.setInterval(() => {
      const dom = cameraRef.current?.dom as HTMLCanvasElement | undefined;
      if (!dom || !ctx || !dom.width) return;
      try {
        // 1 — region behind the title
        ctx.drawImage(dom, 0, dom.height * 0.2, dom.width * 0.42, dom.height * 0.4, 0, 0, 16, 10);
        const titleLum = readLum();
        // hysteresis to avoid flicker near the threshold
        if (titleLum > 0.58 && !dark) {
          dark = true;
          setTitleDark(true);
        } else if (titleLum < 0.48 && dark) {
          dark = false;
          setTitleDark(false);
        }

        // 2 — whole frame, for the glass tier.
        //
        // Thresholds are calibrated against real frames, not intuition: the
        // default desert HDRI measures ~0.39 mean luminance, and glass at the
        // `dim` tuning is already hard to read over it. A frame only exceeds
        // ~0.6 if a blown-out sky fills it, so anchoring `bright` up there would
        // mean the tier never fired in practice.
        //
        // Each bound has a dead band (enter vs stay) so a slow orbit across a
        // boundary doesn't oscillate the entire chrome.
        ctx.drawImage(dom, 0, 0, dom.width, dom.height, 0, 0, 16, 10);
        const sceneLum = readLum();
        const next: SceneTier =
          sceneLum > (tier === "bright" ? 0.3 : 0.36)
            ? "bright"
            : sceneLum < (tier === "dark" ? 0.21 : 0.15)
              ? "dark"
              : "dim";
        if (next !== tier) {
          tier = next;
          setSceneTier(next);
        }
      } catch {
        /* canvas not ready */
      }
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /**
   * Save.
   *
   * There is no backend yet, so what this actually does is say it happened —
   * which is the part that was missing. A save button that gives no answer is
   * one people press three times, and the corner toast is the answer the rest
   * of the editor's background jobs already use.
   */
  const handleSave = () => {
    setSavedToast(true);
    // Announced, not persistent: the other corner cards wait to be dismissed
    // because they point somewhere, and this one has nowhere to go.
    window.setTimeout(() => setSavedToast(false), 4000);
  };

  /** Which AI panels are open — the menu ticks these. */
  const openAiTools: FlyoutAction[] = [
    ...(agentOpen ? (["sab"] as const) : []),
    ...(gen3dOpen ? (["gen3d"] as const) : []),
    ...(matOpen ? (["mat"] as const) : []),
  ];

  /**
   * A menu row TOGGLES its panel and leaves the menu up.
   *
   * The three panels stack in the dock and run together, so opening two used to
   * be two trips out to the AI button — the fan closed on every pick. Keeping
   * the menu open is what makes "all three at once" a thing you can actually
   * arrange, and toggling is what lets the same row close what it opened.
   */
  const handleFlyout = (a: FlyoutAction) => {
    if (a === "gen3d") setGen3dOpen((v) => !v);
    if (a === "mat") {
      // Opening MAT while results are waiting opens them: the badge said there
      // was something to see, so the click that answers it shouldn't land on an
      // empty form with the previews still one more control away.
      if (!matOpen && matUnseen > 0) openMatHistory();
      else setMatOpen((v) => !v);
    }
    // The chatbot is the SAB tool, and only SAB opens it.
    if (a === "sab") setAgentOpen((v) => !v);
  };

  /** Leave the editor for one preview at full size. */
  const openPreviewTab = (preview: MatPreview) => {
    setMatToast(false);
    setPreviewTab(preview);
  };

  /**
   * Show the previews. The toast's action and the AI menu's badge both land
   * here: open the MAT panel with its history expanded, which is now the one
   * place results live. Seeing the list is what marks them read — opening a
   * single one would leave the rest counted as new forever.
   */
  const openMatHistory = () => {
    setMatToast(false);
    setMatUnseen(0);
    setMatHistoryOpen(true);
    setMatOpen(true);
  };

  /** How big the master reads, for framing a camera around it. */
  const masterRadius = () =>
    scene.master ? 0.7 * Math.max(...scene.master.scale) : 1;

  // Place an asset in the scene at a world point (defaults to the origin).
  //
  // A camera isn't an asset in the ordinary sense — it drops in as a linked
  // start/end rig, and if there's a master to aim at we ask where the rig
  // should begin before committing it.
  const place = (name: string, type: AssetType, point?: [number, number, number], modelUrl?: string) => {
    setTool(null);
    if (type === "camera") {
      const at = point ?? [0, 1.5, 0];
      if (scene.master) setPendingCamera(at);
      else scene.addCameraRig(at);
      return;
    }
    scene.add(name, type, point, modelUrl);
  };

  /**
   * "Place into Scene" on a mesh that doesn't exist yet. A stand-in goes in
   * immediately so the click has an answer in the viewport, and the finished
   * asset takes its place — same object, same transform, so anything the user
   * did to the placeholder meanwhile survives.
   */
  const placeMeshPlaceholder = () => {
    // The panel stays mounted on purpose: the generation pass lives inside it,
    // so closing it here would strand the placeholder in the scene forever.
    // Minimising is the way to watch the viewport while it runs.
    const id = scene.add("Generating mesh…", "mesh");
    scene.update(id, {
      pending: true,
      description: "A placeholder for a mesh still being generated. It becomes the real asset when the pass finishes.",
    });
    meshPlaceholder.current = id;
  };

  const resolveMeshPlaceholder = (asset: Asset) => {
    const id = meshPlaceholder.current;
    meshPlaceholder.current = null;
    // The placeholder can be gone by the time the pass lands — deleted, or the
    // scene reset — in which case the asset just gets placed normally.
    if (!id || !scene.objects.some((o) => o.id === id)) {
      place(asset.name, asset.type, undefined, asset.modelUrl);
      return;
    }
    scene.update(id, {
      pending: false,
      name: asset.name,
      modelUrl: asset.modelUrl,
      description: "A 3D model generated from your prompt and reference images.",
    });
  };

  const dropCameraRig = (focus: boolean) => {
    const at = pendingCamera ?? [0, 1.5, 0];
    scene.addCameraRig(
      at,
      focus && scene.master
        ? { position: scene.master.position, radius: masterRadius() }
        : undefined
    );
    setPendingCamera(null);
  };

  // Raycast the drop point onto the ground plane, then place there.
  const handleDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("application/terra-asset");
    if (!raw) return;
    e.preventDefault();
    let name = "3D object";
    let type: AssetType = "mesh";
    let modelUrl: string | undefined;
    try {
      const p = JSON.parse(raw);
      name = p.name ?? name;
      type = p.type ?? type;
      modelUrl = p.modelUrl;
    } catch {
      /* ignore */
    }
    /**
     * WHERE THE DROP RAY LANDS.
     *
     * With a volume armed the ray meets the VOLUME'S FLOOR rather than the
     * infinite ground at y = 0 — so a room raised onto a mezzanine takes drops
     * on its own deck instead of underneath it. `useScene.add` clamps whatever
     * comes out of this, so a drop in the garden still ends up in the room; the
     * footprint test is only so we can SAY that is what happened rather than
     * silently teleporting the thing the user just let go of.
     */
    const vol = scene.activeVolume;
    const ground = vol ? floorY(vol) : 0;
    let point: [number, number, number] = [0, ground + 0.5, 0];
    let landedOutside = false;
    const cam = cameraRef.current;
    if (cam) {
      const rect = cam.dom.getBoundingClientRect();
      const ndc = new Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const ray = new Raycaster();
      ray.setFromCamera(ndc, cam.camera);
      const hit = new Vector3();
      if (ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -ground), hit)) {
        point = [hit.x, ground + 0.5, hit.z];
        landedOutside = !!vol && vol.contain && !isOverFootprint(vol, hit.x, hit.z);
      }
    }
    place(name, type, point, modelUrl);
    setSpaceToast(landedOutside ? `${name} snapped into ${vol!.name}` : null);
  };

  const selected = scene.selected;
  const focusedVolume = scene.selectedVolume;

  /**
   * Escape backs out of define mode.
   *
   * It is the ONLY way out now that the Space panel and its Cancel button are
   * gone — and it is the way out anyone would try first. Without it a mis-click
   * on the library tile leaves the viewport waiting for a footprint drag with
   * no way to say "never mind" but drawing a room and deleting it.
   */
  useEffect(() => {
    if (!drawingSpace) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawingSpace(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawingSpace]);

  /**
   * A capture camera's relationship to the master: how far the rig reaches, and
   * how the master is turned in front of it.
   *
   * All of it is DERIVED from the two camera positions and the master's own
   * rotation rather than stored — the scene's geometry already says these
   * things, and a second copy would be one more thing to keep in step with a
   * dragged gizmo.
   */
  const cameraRelation = (() => {
    const rig = scene.selectedRig;
    const master = scene.master;
    if (!rig || !master || selected?.source !== "camera") return null;
    const { start, end } = scene.rigCameras(rig);
    if (!start || !end) return null;

    return {
      rig,
      master,
      start,
      end,
      /**
       * The rig's bearing around the master. Both cameras share it — orbiting
       * swings the pair together — so either one reports it.
       */
      orbit: azimuthOf(master.position, start.position),
      /**
       * The rig's reach, as ONE number.
       *
       * Straight-line distance, not ground distance: the pair differs in
       * ELEVATION, and holding both at the same radius is what makes the sweep
       * an arc over the master rather than a diagonal away from it. Measured on
       * the start camera because the two are kept equal by `setRigDistance`.
       */
      /**
       * The rig's reach, as TWO numbers — one per end of the sweep.
       *
       * This replaces the single shared distance. The pair differs in height
       * AND in reach now: the near camera is where the sweep starts, the far
       * one where it ends, and `planCapture` already interpolates between the
       * two poses, so both controls feed the frames that actually get rendered.
       */
      /**
       * The near end is the rig's SAVED reach, not a camera position.
       *
       * The pair stands at the far distance between edits, so measuring the
       * near end off the start camera would just report the far one twice. The
       * number lives on the rig; the viewport previews it while the Distance
       * control is open (see `cameraGuide`) and the capture travels down to it.
       */
      nearDistance: Math.min(
        rig.nearDistance,
        vecDistance(master.position, end.position)
      ),
      farDistance: vecDistance(master.position, end.position),
      nearLimit: nearLimit(master.scale),
      farLimit: farLimit(master.scale),
      /** the climb — how far the far camera stands above the near one */
      span: end.position[1] - start.position[1],
      /**
       * The tallest climb this rig can express. The far camera travels on the
       * sphere of its own reach, so straight overhead is the ceiling — asking
       * for more would need it to leave that sphere and silently change the
       * furthest distance the user set.
       */
      spanMax: spanLimit(farLimit(master.scale)),
    };
  })();

  /**
   * Turn the master to `deg` on its turntable.
   *
   * This is the rotation a capture camera can actually express: the camera is
   * locked on the master, so spinning the camera changes nothing about the
   * frame, and swinging the rig around the object is a different edit (its
   * distance and height, which the Position and Distance controls own).
   */
  const orbitRig = (deg: number) => {
    const rel = cameraRelation;
    if (!rel) return;
    // Applied as a DELTA, so each camera keeps whatever bearing offset it has
    // rather than being snapped onto one shared heading. `orbitPoint` preserves
    // each one's height and ground radius, so the pair swings around the master
    // without changing the shot's framing — only where it's taken from.
    const delta = deg - rel.orbit;
    [rel.start, rel.end].forEach((cam) => {
      scene.updateOne(cam.id, {
        position: orbitPoint(
          rel.master.position,
          cam.position,
          azimuthOf(rel.master.position, cam.position) + delta
        ),
      });
    });
  };

  /**
   * Set the sweep's NEAR reach — a number on the rig, not a camera move.
   *
   * The far end is where the pair physically stands and is set by dragging the
   * cameras; the near end is how far in the capture travels. Keeping it as data
   * is what lets the viewport preview it and then put the rig back without an
   * edit having happened.
   */
  const setRigEndDistance = (metres: number) => {
    const rel = cameraRelation;
    if (!rel) return;
    // Bounded by the rig's own far reach as well as the master's bounds: a near
    // end beyond the far one would invert the sweep.
    const d = Math.min(rel.farDistance, Math.max(rel.nearLimit, metres));
    scene.updateRig(rel.rig.id, { nearDistance: d });
  };

  /**
   * Set the sweep's climb — how far the far camera stands above the near one.
   *
   * Only the far camera moves, and it moves along the sphere it already sits
   * on, so the rig's distance from the master survives the edit. That is the
   * link between this gesture and the Distance control: they are two ways of
   * moving the same camera over the same object, and neither may quietly undo
   * the other.
   */
  const setRigSpan = (metres: number) => {
    const rel = cameraRelation;
    if (!rel) return;
    const top = spanLimit(rel.farLimit);
    scene.updateOne(rel.end.id, {
      position: withVerticalSpan(
        rel.start.position,
        rel.end.position,
        Math.max(0, Math.min(top, metres))
      ),
    });
  };

  /**
   * What this rig would capture as it stands — the stops, the shots at each, and
   * the frame total.
   *
   * Planned from the NEAR pose down to the far one, because that is the sweep:
   * the pair parks at the far distance, and `nearDistance` is where the capture
   * travels in to. Passing the parked start camera instead would plan a sweep
   * with no travel at all.
   */
  const capturePlan = (() => {
    const rel = cameraRelation;
    if (!rel) return null;
    return planCapture(
      atDistance(rel.master.position, rel.start.position, rel.nearDistance),
      rel.end.position,
      rel.rig
    );
  })();

  /** What the viewport draws while a camera setting is open. */
  const cameraGuide: CameraGuide | null = (() => {
    const rel = cameraRelation;
    if (!rel) return null;
    const centre = rel.master.position;

    if (activeSetting === "distance") {
      // THE PREVIEW. The pair is drawn where the near reach puts them, with
      // yellow afterimages left at the far positions they'll return to — and
      // the real cameras hidden, because two solid rigs a metre apart is a
      // picture of two rigs. Nothing is moved: closing the control simply stops
      // drawing this, which is why the near number survives the edit.
      const near = [rel.start, rel.end].map((cam) =>
        atDistance(centre, cam.position, rel.nearDistance)
      );
      return {
        kind: "distance",
        centre,
        near: {
          y: near[0][1],
          radius: Math.max(0.2, groundDistance(centre, near[0])),
        },
        far: {
          y: rel.end.position[1],
          radius: Math.max(0.2, groundDistance(centre, rel.end.position)),
        },
        active: spanHandle,
        previews: near,
        afterimages: [rel.start.position, rel.end.position],
        hides: [rel.start.id, rel.end.id],
      };
    }

    if (activeSetting === "rotation") {
      // The ring is drawn where the CAMERAS travel, not around the master's
      // footprint: rotation swings the rig around the object, so the circle the
      // handle runs along has to be the circle the cameras run along.
      return {
        kind: "orbit",
        centre,
        y: rel.start.position[1],
        radius: Math.max(0.9, groundDistance(centre, rel.start.position)),
        azimuth: rel.orbit,
        arc: { start: rel.rig.orbitStart, end: rel.rig.orbitEnd },
      };
    }

    // Either capture count open: draw the shots themselves.
    if (activeSetting === "shotsPerDistance" || activeSetting === "shotsPerRotation") {
      const plan = capturePlan;
      if (!plan) return null;
      return {
        kind: "shots",
        centre,
        stops: plan.passes.map((pass: { position: [number, number, number] }) => ({
          position: pass.position,
          y: pass.position[1],
          radius: Math.max(0.2, groundDistance(centre, pass.position)),
        })),
        bearings: orbitShots(rel.rig.orbitStart, rel.rig.orbitEnd, rel.rig.shotsPerRotation),
        focus: activeSetting === "shotsPerDistance" ? "distance" : "rotation",
      };
    }

    // Nothing being edited numerically: draw the rig itself, grabbable. The
    // handles ARE the control here, so they can't wait for a panel to open.
    return {
      kind: "rig",
      centre,
      start: rel.start.position,
      end: rel.end.position,
    };
  })();

  // Transform edits from the setting panel. A camera rig routes specially: the
  // pair is one rig and always moves as one — a position edit as a shared
  // delta, everything else as the same value on both.
  const applyTransform = (patch: Partial<SceneObject>) => {
    if (!selected) return;
    const rig = scene.selectedRig;
    if (rig && selected.source === "camera") {
      const { start, end } = scene.rigCameras(rig);
      const cams = [start, end].filter(Boolean) as SceneObject[];
      if (patch.position) {
        const d = [
          patch.position[0] - selected.position[0],
          patch.position[1] - selected.position[1],
          patch.position[2] - selected.position[2],
        ] as const;
        cams.forEach((c) =>
          scene.updateOne(c.id, {
            position: [c.position[0] + d[0], c.position[1] + d[1], c.position[2] + d[2]],
          })
        );
      } else {
        cams.forEach((c) => scene.updateOne(c.id, patch));
      }
      return;
    }
    scene.update(selected.id, patch);
  };

  return (
    <div
      data-ui="editor-view"
      /* Glass retunes itself to the scene behind it — the --glass-* overrides
         for each tier live in tokens.css and inherit to every ornament below. */
      data-scene={sceneTier}
      className="fixed inset-0 overflow-hidden bg-canvas"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      {/* Themed backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, hsl(var(--brand) / 0.08), transparent 45%), radial-gradient(90% 80% at 85% 15%, hsl(var(--accent) / 0.07), transparent 50%)",
        }}
      />

      {/* 3D viewport */}
      <SceneCanvas
        scene={scene}
        gizmoMode={gizmoMode}
        // A camera never gets the rotate gizmo. Turning a lens that's locked on
        // the master changes nothing about the shot, so the handles would spin
        // an object whose orientation the scene immediately overrides — the
        // orbit ring around the master is the real control, and two rotation
        // affordances that disagree is worse than one that works.
        showGizmo={editTab === "object" && !(isRigCamera && gizmoMode === "rotate")}
        controlsRef={controlsRef}
        cameraRef={cameraRef}
        cameraGuide={cameraGuide}
        onOrbit={orbitRig}
        onSpan={setRigSpan}
        /* Handles only while the Space panel is open. The box itself always
           draws — you need to see the room you are dropping into — but grips
           that resize it with nothing on screen to say what changed would be
           an edit nobody asked for. */
        /* Handles follow the FOCUS. Selecting a space is what says "I am
           editing this" — and while one is being drawn there is no space to
           select yet, so define mode arms it on its own. */
        volumeEdit={
          drawingSpace || scene.selectedVolumeId
            ? {
                drawing: drawingSpace,
                onDrawn: (center, size) => {
                  scene.addVolume(center, size);
                  setDrawingSpace(false);
                },
                onCancelDraw: () => setDrawingSpace(false),
                onResize: (patch) => {
                  if (scene.selectedVolumeId) scene.updateVolume(scene.selectedVolumeId, patch);
                },
                onDragging: setVolumeDragging,
                gizmo: volumeSetting ? VOLUME_GIZMO[volumeSetting] : undefined,
              }
            : undefined
        }
        gizmoInset={gizmoInset}
      />

      {/* Overlay chrome */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Layer order inside the overlay is explicit, because two things make
            it non-obvious: `.glass` sets backdrop-filter, which creates a
            stacking context — so a popover's own z-index can't escape its bar —
            and an element with no z-index paints in DOM order regardless of how
            high its children reach. The top bar owns the emoji popover, so it
            has to sit above the tool bar and the object title. */}
        <div className="absolute left-4 top-4 z-40">
          <EditorTopBar
            projectName={projectName}
            onRename={setProjectName}
            onUndo={scene.undo}
            onRedo={scene.redo}
            canUndo={scene.canUndo}
            canRedo={scene.canRedo}
          />
        </div>

        {/* The tools sit in the middle of the top row, between the project
            cluster and the action cluster — same top-4, same h-12, so the three
            share one band. Centred on the viewport rather than on the gap
            between the other two, because those two change width (a long project
            name, a credits chip) and a bar that drifted with them would never
            settle anywhere. */}
        {/* Stays up while an object is focused. It used to fade out, on the
            reasoning that focus mode is its own context — but the layer tree and
            the chatbot are exactly what you want WHILE inspecting something, and
            hiding their only entry point meant deselecting to reach them and
            losing the focus you came in with. */}
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <EditorToolBar
            active={activeTools}
            openTools={openAiTools}
            flyoutOpen={tool === "ai"}
            /* A finished MAT pass announces itself on the tool that made it and
               keeps announcing until someone looks — the toast is gone in a few
               seconds, and anything generated while the user was elsewhere used
               to leave no trace at all. */
            badges={{ ai: matUnseen }}
            menuBadges={{
              mat: {
                count: matUnseen,
                note: `${matUnseen} preview image${matUnseen === 1 ? "" : "s"} ready to view`,
              },
            }}
            onSelect={selectTool}
            onFlyoutAction={handleFlyout}
            onCloseFlyout={() => setTool(null)}
          />
        </div>

        {selected && (
          <ObjectTitle
            name={selected.name}
            dark={titleDark}
            role={selected.role}
            typeLabel={SOURCE_LABEL[selected.source]}
            description={selected.description}
            insetLeft={leftInset}
            onRename={(name) => scene.update(selected.id, { name })}
            onBack={deselect}
            onViewInfo={() => setInfoOpen(true)}
            onDelete={() => scene.remove(selected.id)}
          />
        )}




        {/* One corner, one shape, one at a time — the newest wins. Stacking
            them would push the oldest up over the object toolbar, and three
            cards about three finished jobs is a log, not a notification. */}
        {matToast ? (
          <EditorToast
            ui="mat-preview-toast"
            icon="mat"
            message="MAT preview generation completed."
            dockOpen={tool === "assets"}
            onView={openMatHistory}
            onDismiss={() => setMatToast(false)}
          />
        ) : genToast === "mesh" ? (
          <EditorToast
            ui="mesh-done-toast"
            icon="input-3d"
            message="3D mesh generation completed."
            dockOpen={tool === "assets"}
            onView={() => {
              setGenToast(null);
              openLibraryAt("meshes");
            }}
            onDismiss={() => setGenToast(null)}
          />
        ) : genToast === "multiview" ? (
          /* No `onView`: the four angles live in the generate panel that made
             them, which is already on screen or one click from the AI menu —
             there is no library page to send anyone to. */
          <EditorToast
            ui="multiview-done-toast"
            icon="input-2d"
            message="Multi-view images generated — front, left, right and back."
            dockOpen={tool === "assets"}
            onDismiss={() => setGenToast(null)}
          />
        ) : spaceToast ? (
          <EditorToast
            ui="space-snap-toast"
            icon="space"
            message={spaceToast}
            dockOpen={tool === "assets"}
            onDismiss={() => setSpaceToast(null)}
          />
        ) : savedToast ? (
          <EditorToast
            ui="saved-toast"
            icon="save"
            tone="brand"
            message={`${projectName} saved.`}
            dockOpen={tool === "assets"}
            onDismiss={() => setSavedToast(false)}
          />
        ) : null}

        {/* z-40 lifts the whole action cluster above the panel dock (z-30):
            the `.glass` bar's backdrop-filter traps the preview hint in its own
            stacking context, so the hint can only clear the dock if its bar does. */}
        <div className="absolute right-4 top-4 z-40">
          <EditorActions
            userName={userName}
            onGenerate={openTerraGen}
            onSave={handleSave}
            onExit={() => setExitAsking(true)}
            onDownload={() => setOrdersOpen(true)}
            activeRuns={runs.active}
          />
        </div>

        {tool === "assets" && (
          <AssetLibrary
            // Remount when the target category or the pick request changes, so
            // "Click to view" lands on 3D Meshes and the chooser opens in pick
            // mode even if the library was already open.
            key={`${libraryCategory}:${pickReq ? `${pickReq.target}-${pickReq.max}` : "browse"}`}
            store={assets}
            initialCategory={libraryCategory}
            pick={
              pickReq === null
                ? undefined
                : {
                    max: pickReq.max,
                    purpose:
                      pickReq.target === "mat"
                        ? "a source image"
                        : `up to ${pickReq.max} reference ${pickReq.max === 1 ? "image" : "images"}`,
                    onConfirm: (picked) => {
                      if (pickReq.target === "mat") setMatRef(picked[0] ?? null);
                      else setMeshRefs(picked);
                      setPickReq(null);
                      setTool(null);
                    },
                    onCancel: () => {
                      setPickReq(null);
                      setTool(null);
                    },
                  }
            }
            onClose={() => setTool(null)}
            onPlace={(a) => place(a.name, a.type, undefined, a.modelUrl)}
            onDefineSpace={() => {
              // Straight into define mode, library closed: the gesture is the
              // point, and a tile that only opened a panel would be one more
              // click in front of the drag. The draft's own readout carries the
              // instructions — "drag the footprint", then "click to place".
              setTool(null);
              setDrawingSpace(true);
            }}
            onGenerate3D={() => {
              setTool(null);
              setGen3dOpen(true);
            }}
          />
        )}

        {/* ------------------------------------------------------------ dock */}
        {/* Every tool panel, stacked in one right-hand column under the
            orientation cube. They open and close independently and none of
            them closes another — see panel-dock.tsx for why. */}
        <PanelDock top={DOCK_TOP} bottom={dockBottom}>
          {layersOpen && (
            <SceneLayersPanel
              scene={scene}
              onClose={() => setLayersOpen(false)}
              onBrowseAssets={() => selectTool("assets")}
              onViewInfo={() => setInfoOpen(true)}
            />
          )}
          {matOpen && (
            <MatPreviewPanel
              incoming={matRef}
              history={matPreviews}
              historyOpen={matHistoryOpen}
              onToggleHistory={() => {
                setMatHistoryOpen((open) => {
                  // Opening the list is reading it.
                  if (!open) setMatUnseen(0);
                  return !open;
                });
              }}
              onOpenPreview={openPreviewTab}
              onClose={() => {
                setMatOpen(false);
                setPickReq(null);
              }}
              onComplete={(preview) => {
                // The panel STAYS open, holding the result in its history — it's
                // the only route to it now that the top bar's play button is
                // gone. The toast and the toolbar badge say it arrived.
                setMatPreviews((prev) => [preview, ...prev]);
                setMatUnseen((n) => n + 1);
                setMatToast(true);
              }}
              onPickFromLibrary={() => {
                setPickReq({ target: "mat", max: 1 });
                setLibraryCategory("uploads");
                setTool("assets");
              }}
              onIncomingConsumed={() => setMatRef(null)}
            />
          )}
          {gen3dOpen && (
            <Generate3DMeshPanel
              store={assets}
              incoming={meshRefs}
              onClose={() => {
                setGen3dOpen(false);
                setPickReq(null);
              }}
              onPlacePlaceholder={placeMeshPlaceholder}
              onResolvePlaceholder={resolveMeshPlaceholder}
              onViewResult={() => {
                setGen3dOpen(false);
                openLibraryAt("meshes");
              }}
              onPickFromLibrary={(remaining) => {
                setPickReq({ target: "mesh", max: remaining });
                setLibraryCategory("uploads");
                setTool("assets");
              }}
              onIncomingConsumed={() => setMeshRefs(null)}
              // Both passes raise the corner toast. The panel's own footer
              // announces them too, but only while the panel is open and only
              // where the user happens to be looking — and a multi-view pass is
              // long enough that they're usually elsewhere by the time it lands.
              onDone={(kind) => setGenToast(kind)}
            />
          )}
          {agentOpen && (
            <AiAgentPanel
              scene={scene}
              store={assets}
              projectName={projectName}
              onClose={() => setAgentOpen(false)}
              onPlaceAsset={(a) => place(a.name, a.type, undefined, a.modelUrl)}
              onOpenGenerate3D={() => {
                setAgentOpen(false);
                setGen3dOpen(true);
              }}
            />
          )}
        </PanelDock>
      </div>

      {/* Define mode has to say so.
          The Space panel used to carry this sentence, and taking the panel away
          left a mode with no evidence it was on: the viewport looked exactly as
          it had a moment before, and the only clue that a drag would draw a room
          was remembering you had clicked the tile. */}
      {drawingSpace && (
        <div
          data-ui="space-draw-hint"
          className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2"
          style={{ marginLeft: leftInset / 2 }}
        >
          <GlassBar ui="space-draw" shape="pill" className="pointer-events-auto h-11 gap-2.5 px-4">
            <Icon name="space" size={16} className="shrink-0 text-accent" />
            <span className="type-body text-content">
              Drag a rectangle on the ground, then move up to raise it
            </span>
            <button
              type="button"
              data-ui="space-draw-cancel"
              onClick={() => setDrawingSpace(false)}
              className="type-caption-strong ml-1 shrink-0 rounded-md border border-glass/15 px-2 py-1 text-content-muted transition-colors hover:border-glass/30 hover:text-content"
            >
              Esc
            </button>
          </GlassBar>
        </div>
      )}

      {/* ------------------------------------------------- the focused space */}
      {/* A space wears exactly the chrome an object does — same title, same
          bottom tiles, same inspector column — because it IS a thing in the
          scene. All three go away while a grip is in hand: see `volumeDragging`. */}
      {focusedVolume && !volumeDragging && (
        <ObjectTitle
          name={focusedVolume.name}
          dark={titleDark}
          role="none"
          typeLabel="Space"
          description={`${describeVolume(focusedVolume)} · ${volumeArea(focusedVolume).toFixed(
            1
          )} m² floor. ${
            focusedVolume.contain
              ? "Anything you place while this is selected lands inside it."
              : "Containment is off — objects come and go freely."
          }`}
          insetLeft={leftInset}
          onRename={(name) => scene.updateVolume(focusedVolume.id, { name })}
          onBack={() => scene.selectVolume(null)}
          onDelete={() => scene.removeVolume(focusedVolume.id)}
        />
      )}
      {focusedVolume && !volumeDragging && (
        <VolumeToolbar
          tab={volumeTab}
          insetLeft={leftInset}
          onTab={(t) => {
            setVolumeTab((cur) => (cur === t ? null : t));
            // A different tab is a different set of rows, so whatever was open
            // in the old one has no row to point at any more.
            setVolumeSetting(null);
          }}
        />
      )}
      {focusedVolume && volumeSetting && !volumeDragging && (
        <VolumeSettingControl
          volume={focusedVolume}
          setting={volumeSetting}
          patch={(next) => scene.updateVolume(focusedVolume.id, next)}
          onClose={() => setVolumeSetting(null)}
        />
      )}
      {focusedVolume && volumeTab && !volumeDragging && (
        <div
          data-ui="volume-inspector-column"
          className="pointer-events-none fixed bottom-6 right-4 z-30 flex w-[320px] flex-col items-stretch gap-2.5"
        >
          <VolumeInspectorPanel
            scene={scene}
            volume={focusedVolume}
            tab={volumeTab}
            active={volumeSetting}
            seed={volumeSeed}
            report={volumeReport}
            /* Toggling, like the object list: clicking the open row closes its
               control and disarms its gizmo, leaving the space selected. */
            onSelect={(k) => setVolumeSetting((cur) => (cur === k ? null : k))}
            onSeed={setVolumeSeed}
            onReport={setVolumeReport}
          />
        </div>
      )}

      {/* Per-object controls: bottom toolbar → filtered right panel → setting */}
      {selected && (
        <ObjectToolbar
          tab={editTab}
          role={selected.role}
          source={selected.source}
          insetLeft={leftInset}
          // The tiles TOGGLE. Clicking the open tab again closes the panel and
          // its setting control, so the viewport can be cleared without giving
          // up the selection — deselecting to see the object was the only way
          // before, and that threw away the thing you were looking at.
          onTab={(t) => {
            setEditTab((cur) => (cur === t ? null : t));
            setActiveSetting(null);
          }}
          onSetRole={(role) => scene.setRole(selected.id, role)}
        />
      )}
      {/* Bottom-right column: the selected camera's live POV, stacked directly
          on top of the properties panel.

          The POV used to hang under the orientation cube in the opposite
          corner, which put the picture of what a camera sees as far as the
          screen allows from the controls that aim it. One column keeps the
          two together, sharing an edge and a width — and it clears the top
          corner entirely, so the POV no longer has to step aside for the
          dock the way the cube does. */}
      {selected && (editTab || selected.source === "camera") && (
        <div
          data-ui="inspector-column"
          className="pointer-events-none fixed bottom-6 right-4 z-30 flex w-[320px] flex-col items-stretch gap-2.5"
        >
          {selected.source === "camera" && (
            <CameraPreview scene={scene} camera={selected} label={selected.name} />
          )}
          {editTab && (
            <ObjectPropertiesPanel
              object={selected}
              rig={scene.selectedRig}
              group={
                editTab === "object" ? "Transform" : editTab === "capture" ? "Capture" : "Material"
              }
              active={activeSetting}
              onSelect={selectSetting}
              orbit={cameraRelation?.orbit ?? null}
              distance={cameraRelation?.nearDistance ?? null}
              height={cameraRelation?.span ?? null}
            />
          )}
        </div>
      )}
      {selected && infoOpen && (
        <ObjectInfoPanel
          object={selected}
          onClose={() => setInfoOpen(false)}
          onUpdate={(patch) => scene.update(selected.id, patch)}
          onDelete={() => {
            scene.remove(selected.id);
            setInfoOpen(false);
          }}
        />
      )}
      {selected && editTab && activeSetting && (
        <SettingControl
          object={selected}
          rig={scene.selectedRig}
          setting={activeSetting}
          camera={
            cameraRelation
              ? {
                  orbit: cameraRelation.orbit,
                  masterName: cameraRelation.master.name,
                  nearDistance: cameraRelation.nearDistance,
                  farDistance: cameraRelation.farDistance,
                  nearLimit: cameraRelation.nearLimit,
                  farLimit: cameraRelation.farLimit,
                  span: cameraRelation.span,
                  spanMax: cameraRelation.spanMax,
                  sweep: capturePlan?.span ?? 0,
                }
              : null
          }
          onChange={applyTransform}
          onRigChange={(patch) =>
            scene.selectedRig && scene.updateRig(scene.selectedRig.id, patch)
          }
          onOrbit={orbitRig}
          onDistance={setRigEndDistance}
          onDistanceHandle={setSpanHandle}
          onHeight={setRigSpan}
          onClose={() => setActiveSetting(null)}
        />
      )}

      {exitAsking && (
        <ExitProjectDialog
          projectName={projectName}
          onCancel={() => setExitAsking(false)}
          onConfirm={() => {
            setExitAsking(false);
            // The app is a hash router — clearing the hash IS going home.
            window.location.hash = "";
          }}
        />
      )}

      {pendingCamera && scene.master && (
        <CameraPlaceDialog
          masterName={scene.master.name}
          onFocus={() => dropCameraRig(true)}
          onAtCursor={() => dropCameraRig(false)}
          onCancel={() => setPendingCamera(null)}
        />
      )}

      {capture && (
        <CaptureRunPanel
          plan={capture}
          masterName={scene.master?.name ?? "Scene"}
          store={assets}
          onClose={() => setCapture(null)}
          onViewResult={() => {
            setCapture(null);
            // Drop the rig selection first: its toolbar and properties panel
            // occupy the same corner as the library dock, and you're done with
            // the camera at the point you go looking at what it produced.
            deselect();
            openLibraryAt("uploads");
          }}
        />
      )}

      {terraGenOpen && (
        <TerraGenView
          scene={scene}
          store={workOrder}
          assets={assets.assets}
          assetStore={assets}
          projectName={projectName}
          credits={terraCredits}
          reframeRig={() => {
            // One rig today, so this frames the first — the model allows more,
            // and the panel's camera axes read rig[0] the same way.
            const rig = scene.rigs[0];
            if (rig && scene.master) {
              scene.reframeRig(rig.id, scene.master.position, masterRadius());
            }
          }}
          onClose={() => setTerraGenOpen(false)}
          onDispatch={(order) => {
            // The dispatch now lands somewhere the user can find it again. The
            // total comes from the order itself so the row's denominator is the
            // number the review screen just charged for.
            const weatherSets = scene.savedWeather.filter((s) => s.inRun).length;
            const totals = computeTotals(order, assets.assets, rigState(scene).frames, weatherSets);
            runs.add({ project: projectName, total: totals.frames });
          }}
        />
      )}

      {ordersOpen && <WorkOrdersDialog store={runs} onClose={() => setOrdersOpen(false)} />}

      {previewTab && (
        <MatPreviewView
          preview={previewTab}
          projectName={projectName}
          onBack={() => setPreviewTab(null)}
        />
      )}
    </div>
  );
}
