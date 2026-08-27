import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui";
import { GlassGhostButton } from "@/components/glass";
import { Panel, Pill } from "./ui";
import { SceneWorld } from "./SceneCanvas";
import { AxisEditor } from "./terragen-axes";
import { AxisSwitch } from "./terragen-parts";
import { WeatherSection } from "./terragen-weather";
import { describeLayers } from "./weather";
import { CameraSection } from "./terragen-camera";
import { MasterSection, type GizmoMode } from "./terragen-master";
import { SceneCanvas, type CameraGuide, type CameraHandle } from "./SceneCanvas";
import {
  atDistance,
  azimuthOf,
  groundDistance,
  orbitPoint,
  orbitShots,
  planCapture,
  withVerticalSpan,
} from "./camera-rig";
import { DispatchReview, orderChanges } from "./terragen-budget";
import { AssetLibrary } from "./AssetLibrary";
import type { Asset } from "./assets-data";
import type { AssetStore } from "./useAssets";
import { OBJECT_COLORS, isContentObject, shapeForSeed, type SceneObject } from "./scene-types";
import type { SceneApi } from "./useScene";
import type { WorkOrderStore } from "./useWorkOrder";
import {
  PANEL_AXES,
  axisSummary,
  offsetFromPose,
  swapPose,
  computeTotals,
  formatCount,
  frameSample,
  preflight,
  rigState,
  sceneRoles,
  type SectionId,
  type WorkOrder,
} from "./work-order";

type Vec3 = [number, number, number];

/** The camera control currently in hand, or null for "just show me the rig". */
export type CameraEdit = "distance" | "orbit" | "shotsDistance" | "shotsRotation" | null;

/**
 * What a pick in the library sheet is FOR.
 *
 *   · place — put the asset in the scene (Objects → Add from library)
 *   · swap  — shortlist it as a stand-in for ONE named object
 *   · env   — shortlist it as an environment the run sweeps
 *
 * Swap carries its target because every object has its own list now: the sheet
 * has to know whose list a pick joins, and the button on it says the name.
 */
export type LibraryMode =
  | { kind: "place" }
  | { kind: "env" }
  | { kind: "swap"; target: { id: string; name: string } };

/**
 * Safety net on the loader, not its duration.
 *
 * The loader clears when the render's assets actually resolve. This only exists
 * so that a texture which never loads leaves you with a usable panel instead of
 * a spinner forever — it must stay comfortably longer than a real cold load
 * (the environment map is a 4K EXR) or it would start hiding a loader that is
 * still telling the truth.
 */
const LOAD_TIMEOUT_MS = 15_000;

/**
 * The dock's width, and what the stage owes it.
 *
 * ITS OWN NUMBER, not the editor dock's. It used to read `DOCK_WIDTH`, on the
 * reasoning that TerraGen's panel should be exactly as wide as Layers and MAT
 * Preview — same glass, same place, same size. That held until the editor dock
 * was narrowed to 320 for its own reasons and took this panel with it: the
 * weather dials are a 104px label, a track and a boxed value on ONE line, and
 * below ~380 the value box ran out past the section's border.
 *
 * The two columns answer to different content. A tool panel holds a form; this
 * holds a spreadsheet of a render's worth of parameters, and it is the only
 * thing on screen while it's open — it can afford the width and needs it.
 *
 * Everything that has to keep clear of the panel derives from this rather than
 * repeating a number: these were four separate literals once, and changing the
 * panel meant finding all of them.
 */
const TERRAGEN_WIDTH = 400;
const DOCK_GUTTER = 12;
const STAGE_INSET = TERRAGEN_WIDTH + DOCK_GUTTER;

/** Collapsed, the dock is a header-height bar — the stage owes it nothing but
 *  the corner it sits in, so every overlay reclaims the full width. */
const COLLAPSED_INSET = 0;

/**
 * TERRAGEN — the Work Order author, as a mode.
 * ------------------------------------------------------------------
 * Pressing Generate leaves the editor and enters this. It is a takeover, not a
 * dialog: a full-bleed render of what TerraGen will actually shoot on the left,
 * the section stack on the right, and no way to edit the scene while you're
 * here — except through the sections themselves, which is the point of the
 * Camera and Roles panels: the two things you always have to go back out to fix
 * are now fixable from in here.
 *
 * WHY A TAKEOVER RATHER THAN A PANEL OVER THE VIEWPORT. The thing being
 * authored is a picture — "will the master still be in frame at the top of the
 * climb?" — and that question can't be answered against a viewport showing the
 * artist's own orbit camera with gizmos and toolbars over it. So the viewport
 * chrome goes, the camera is pinned to the sweep, and what's left is the frame
 * the dataset will contain.
 *
 * WHY IT MOUNTS OVER THE EDITOR RATHER THAN REPLACING IT. Same reason
 * MatPreviewView does: unmounting the editor tears down its WebGL context and
 * reloads the HDRI on the way back — a cold start measured in seconds — and
 * loses the camera where the user left it.
 *
 * WHERE THE BILL LIVES. Nowhere on this screen. Frames, archive size and
 * credits appear once, in the dispatch review, at the moment they become a
 * decision. The trade is deliberate: the running cost is no longer ambient, and
 * what it buys is a mode that is about the dataset rather than about the meter.
 */
export function TerraGenView({
  scene,
  store,
  assets,
  assetStore,
  projectName,
  credits,
  onClose,
  onDispatch,
  reframeRig,
}: {
  scene: SceneApi;
  store: WorkOrderStore;
  assets: Asset[];
  /** the library itself, for the bottom sheet the Objects section opens */
  assetStore: AssetStore;
  projectName: string;
  /** workspace balance, for the affordability gate */
  credits: number;
  onClose: () => void;
  onDispatch: (order: WorkOrder) => void;
  /** rebuild the rig's framing around the current master */
  reframeRig: () => void;
}) {
  const [dispatched, setDispatched] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  /**
   * Which stage is in front. THE CAMERA'S VIEW IS THE DEFAULT.
   *
   * It used to open on the editable scene, on the reasoning that the mode is
   * mostly authoring and the preview is a thing you check. That had it backwards:
   * this mode exists to produce frames, and the only picture that tells you what
   * the frames will contain is the one the capture camera sees. Opening on the
   * orbit view meant every session began by looking at something the dataset will
   * never include, and you had to know to press a button to see the actual
   * subject. Edit mode is one click away and still has the gizmos.
   */
  const [stage, setStage] = useState<StageId>("camera");
  const preview = stage === "camera";
  /**
   * The stand-in currently standing in — which object, and which asset.
   *
   * PREVIEWING IS NOT AN EDIT. Nothing about the scene changes while this is
   * set: the substitution happens at draw time in `SceneCanvas`, and the gizmo's
   * output is routed into the swap's own offset. Leaving the preview therefore
   * needs no undo and no restore — the object was never replaced.
   */
  const [swapPreview, setSwapPreview] = useState<{ targetId: string; assetId: string } | null>(
    null
  );
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  /**
   * The dock, folded away.
   *
   * The mode's whole argument is that the picture is the thing being authored,
   * and a 400px panel covers a third of it. Collapsing is how you actually look
   * at the frame you just changed without leaving the mode and losing the
   * sweep position — so it folds to its own header rather than closing, and
   * every overlay that was keeping clear of it reclaims the width.
   */
  const [collapsed, setCollapsed] = useState(false);
  /**
   * The asset library, as a bottom sheet over the stage — and what picking in
   * it means this time.
   *
   * ONE SHEET, THREE ERRANDS. Placing an object, shortlisting stand-ins for the
   * master and shortlisting environments are all "find a thing in the library",
   * and each used to have its own cut-down picker inline in the dock — three
   * worse copies of the browser that already has folders, tags, search and
   * upload. The mode says what a click does with what it finds; the sheet is
   * the same one in all three cases.
   */
  const [library, setLibrary] = useState<LibraryMode | null>(null);

  const stageInset = collapsed ? COLLAPSED_INSET : STAGE_INSET;

  /**
   * The mode assembles before it shows anything.
   *
   * This is not decoration. Entering TerraGen mounts a SECOND WebGL canvas,
   * which re-fetches the environment map from scratch — a 4K EXR that takes
   * seconds on a cold cache. Without a gate the mode opens onto a black
   * rectangle that looks broken.
   */
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, []);

  const order = store.order;
  // A dispatched order stops being a draft — but the moment an axis moves it is
  // one again, so the footer can't keep claiming something is queued while the
  // user edits what it was queued from.
  useEffect(() => setDispatched(false), [order]);

  /**
   * THE STAND-IN, AS SOMETHING THE VIEWPORT CAN DRAW.
   *
   * It is the target object with its identity swapped out: the asset's name, its
   * mesh (or its placeholder shape and colour, derived from the asset's own seed
   * so a stand-in looks the same every time it is previewed), and the pose the
   * swap's offset puts it at. Keeping the TARGET'S ID is what lets selection,
   * mesh registration and the gizmo carry on knowing nothing about swaps.
   */
  const standIn = (() => {
    if (!swapPreview || !order) return null;
    const swap = order.swaps.find(
      (s) => s.targetId === swapPreview.targetId && s.assetId === swapPreview.assetId
    );
    const target = scene.objects.find((o) => o.id === swapPreview.targetId);
    if (!swap || !target) return null;
    const asset = assets.find((a) => a.id === swap.assetId);
    const pose = swapPose(target, swap);
    const object: SceneObject = {
      ...target,
      name: swap.name,
      modelUrl: asset?.modelUrl,
      shape: shapeForSeed(asset?.seed ?? 0),
      color: OBJECT_COLORS[Math.abs(asset?.seed ?? 0) % OBJECT_COLORS.length],
      ...pose,
    };
    return { swap, target, object };
  })();

  const substitute = standIn
    ? {
        object: standIn.object,
        onTransform: (pose: {
          position: [number, number, number];
          rotationDeg: [number, number, number];
          scale: [number, number, number];
        }) =>
          store.setSwapOffset(
            standIn.swap.targetId,
            standIn.swap.assetId,
            offsetFromPose(standIn.target, pose)
          ),
      }
    : null;

  /**
   * Preview a stand-in: show it, and put the user where they can adjust it.
   *
   * It selects the object it replaces — the gizmo follows the selection in this
   * mode — and leaves the camera preview if that is what was in front, because a
   * stand-in you cannot reach the handles of is a picture, not an adjustment.
   */
  const previewSwap = (targetId: string, assetId: string) => {
    const same = swapPreview?.targetId === targetId && swapPreview?.assetId === assetId;
    if (same) {
      setSwapPreview(null);
      return;
    }
    setSwapPreview({ targetId, assetId });
    setStage("edit");
    scene.select(targetId);
  };

  /**
   * The Arrangement axis follows whichever space is armed in the scene.
   *
   * SYNCED HERE, NOT IN THE AXIS EDITOR. The editor only mounts while its
   * section is open, so an order whose Arrangement section was never expanded
   * would carry whatever volume existed when the draft was first seeded — and
   * the preflight gate and the dispatched job both read that field. This runs
   * for as long as the panel is up, which is every path that can reach Dispatch.
   */
  const armedVolumeId = scene.activeVolumeId;
  const orderVolumeId = order?.layouts.volumeId ?? null;
  useEffect(() => {
    if (order && orderVolumeId !== armedVolumeId) {
      store.patch("layouts", { volumeId: armedVolumeId });
    }
    // `order` is deliberately absent: it changes on every edit, and the two ids
    // are the only things that decide whether this has work to do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderVolumeId, armedVolumeId, store]);

  // Derived every render, not read from the draft: the rig and the roles keep
  // moving — and now they move from inside this panel too.
  const rig = rigState(scene);
  const roles = sceneRoles(scene);

  /**
   * THE RIG ALWAYS FRAMES THE MASTER. There is no Framing button any more.
   *
   * It was a control that could only ever be pressed for one reason — the rig
   * no longer frames the thing the run is about — which makes it a chore rather
   * than a choice, and a sweep aimed at nothing is not a state worth being able
   * to author. So TerraGen re-frames it itself.
   *
   * KEYED ON IDENTITY AND SIZE, not on position: `scene` already carries the
   * rig along when the master is dragged, so re-framing on every move would
   * only throw away a distance or a climb the user had set on purpose. A
   * different master, a first camera, or a resize of the master are the three
   * cases where the old framing genuinely no longer fits.
   *
   * The callback comes from the editor and is a fresh closure every render, so
   * it is held in a ref — in the deps it would re-frame on its own output,
   * forever.
   */
  const reframe = useRef(reframeRig);
  reframe.current = reframeRig;
  const masterId = roles.master?.id ?? null;
  const rigId = rig.rig?.id ?? null;
  const masterSize = roles.master?.scale.join("×") ?? "";
  useEffect(() => {
    if (masterId && rigId) reframe.current();
  }, [masterId, rigId, masterSize]);

  /**
   * WHICH CAMERA CONTROL IS IN HAND, and therefore what the viewport draws.
   *
   * The camera section edits the rig, and until now the edit stage showed none
   * of it: `SceneCanvas` was mounted here without a guide, so dragging Nearest
   * moved a number the viewport had no way to draw (the near reach is data on
   * the rig, not a camera position) and changing the shot counts moved nothing
   * at all. You were tuning a sweep against a still picture.
   *
   * The guides are the editor's own — the same distance halos, the same shot
   * markers, the same grabbable rig handles — so a control in this panel and
   * the same control in Terra Web put identical geometry on screen.
   */
  const [cameraEdit, setCameraEdit] = useState<CameraEdit>(null);

  /**
   * Put the rig on screen, because the camera controls are about to move it.
   *
   * Touching Distance or Climb while the sweep preview is in front changes the
   * picture in ways that are almost impossible to read — the preview is shot
   * FROM the camera, so moving the camera moves the whole world. The edit stage
   * shows the rig itself, and selecting one of its cameras makes SceneCanvas
   * fly to and frame the pair (see `FocusRig`), which is the same thing that
   * happens when you click a camera in Terra Web.
   */
  const focusCamera = () => {
    const cam = rig.start ?? rig.end;
    if (!cam) return;
    setStage("edit");
    scene.select(cam.id);
  };

  /**
   * What the edit stage draws over the scene while the rig is being worked on.
   *
   * Mirrors EditorView's `cameraGuide` case for case, because it IS that
   * picture: the distance preview stands the pair at the near reach and leaves
   * afterimages where they will return to (nothing moves — the near reach is a
   * saved number), the shot markers draw every stop and every frame, and with
   * no control in hand the rig itself is drawn with its handles live.
   */
  const cameraGuide: CameraGuide | null = (() => {
    const { rig: cameraRig, start, end, target } = rig;
    if (!cameraRig || !start || !end) return null;
    const camSelected = scene.selected?.source === "camera";
    if (!cameraEdit && !camSelected) return null;

    if (cameraEdit === "distance") {
      const near = [start, end].map((cam) => atDistance(target, cam.position, rig.nearDistance));
      return {
        kind: "distance",
        centre: target,
        near: { y: near[0][1], radius: Math.max(0.2, groundDistance(target, near[0])) },
        far: { y: end.position[1], radius: Math.max(0.2, groundDistance(target, end.position)) },
        active: null,
        previews: near,
        afterimages: [start.position, end.position],
        hides: [start.id, end.id],
      };
    }

    if (cameraEdit === "orbit") {
      // The ring is drawn where the CAMERAS travel, not around the master's
      // footprint: orbiting swings the rig around the object, so the circle the
      // handle runs along has to be the circle the cameras run along. The arc
      // laid over it is the wedge the master actually turns through.
      return {
        kind: "orbit",
        centre: target,
        y: start.position[1],
        radius: Math.max(0.9, groundDistance(target, start.position)),
        azimuth: azimuthOf(target, end.position),
        arc: { start: cameraRig.orbitStart, end: cameraRig.orbitEnd },
      };
    }

    if (cameraEdit === "shotsDistance" || cameraEdit === "shotsRotation") {
      const plan = planCapture(
        atDistance(target, start.position, rig.nearDistance),
        end.position,
        cameraRig
      );
      return {
        kind: "shots",
        centre: target,
        stops: plan.passes.map((pass) => ({
          position: pass.position,
          y: pass.position[1],
          radius: Math.max(0.2, groundDistance(target, pass.position)),
        })),
        bearings: orbitShots(cameraRig.orbitStart, cameraRig.orbitEnd, cameraRig.shotsPerRotation),
        focus: cameraEdit === "shotsDistance" ? "distance" : "rotation",
      };
    }

    return { kind: "rig", centre: target, start: start.position, end: end.position };
  })();

  /** The rig's own handles, dragged in the viewport — same edits the panel's
   *  sliders make, so the two are one control with two grips. */
  const orbitRig = (deg: number) => {
    const { start, end, target } = rig;
    if (!start || !end) return;
    const delta = deg - azimuthOf(target, end.position);
    [start, end].forEach((cam) =>
      scene.updateOne(cam.id, {
        position: orbitPoint(target, cam.position, azimuthOf(target, cam.position) + delta),
      })
    );
  };

  const spanRig = (metres: number) => {
    const { start, end } = rig;
    if (!start || !end) return;
    scene.updateOne(end.id, {
      position: withVerticalSpan(start.position, end.position, Math.max(0, metres)),
    });
  };

  if (!order) return null;

  // Weather sets multiply the sweep — the count comes off the scene, since that
  // is where weather lives (see weather.ts).
  const weatherSets = scene.savedWeather.filter((s) => s.inRun).length;
  const totals = computeTotals(order, assets, rig.frames, weatherSets);
  const gates = preflight(
    order,
    {
      masterCount: roles.master ? 1 : 0,
      hasRig: rig.hasRig,
      credits,
    },
    totals
  );
  const blockers = gates.filter((g) => g.level === "block");

  return (
    <div data-ui="terragen-view" className="fixed inset-0 z-50 overflow-hidden bg-canvas">
      {/* Same themed backdrop as the editor — the two views are one project. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, hsl(var(--brand) / 0.08), transparent 45%), radial-gradient(90% 80% at 85% 15%, hsl(var(--accent) / 0.07), transparent 50%)",
        }}
      />

      {/* ------------------------------------------------------------ stage */}
      {/* Both are mounted; only one is visible. Toggling must not cost a
          WebGL context and a 4K environment reload each way. */}
      <EditStage
        scene={scene}
        gizmoMode={gizmoMode}
        hidden={preview}
        inset={stageInset}
        cameraGuide={cameraGuide}
        substitute={substitute}
        onOrbit={orbitRig}
        onSpan={spanRig}
      />

      {/* WHAT YOU ARE LOOKING AT, while a stand-in is standing in.
          Without it the viewport is simply showing the wrong object: the torus
          has become a chair with no explanation, and the gizmo is writing
          somewhere the panel can't be seen from. */}
      {standIn && !preview && (
        <div
          data-ui="terragen-swap-preview-bar"
          className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2"
          style={{ marginLeft: -stageInset / 2 }}
        >
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-brand/50 bg-surface-overlay/90 px-4 py-2.5 shadow-lg backdrop-blur">
            <Icon name="retry" size={15} className="shrink-0 text-brand" />
            <span className="type-body text-content">
              <span className="text-content-muted">Standing in for</span> {standIn.swap.targetName}
              <span className="text-content-muted"> · </span>
              {standIn.swap.name}
            </span>
            <span className="type-caption hidden text-content-subtle sm:block">
              move, turn or scale it — only this stand-in changes
            </span>
            <button
              type="button"
              data-ui="terragen-swap-preview-done"
              onClick={() => setSwapPreview(null)}
              className="type-caption-strong ml-1 shrink-0 rounded-md border border-brand/50 bg-brand/15 px-2.5 py-1 text-brand-on-glass transition-colors hover:bg-brand/25"
            >
              Done
            </button>
          </div>
        </div>
      )}
      <SweepRender
        scene={scene}
        rig={rig}
        loading={loading}
        onReady={() => setLoading(false)}
        projectName={projectName}
        hidden={!preview}
        inset={stageInset}
      />

      {/* The mode switch. Top-left, where the editor keeps its project bar, so
          the corner that says "where am I" keeps saying it. */}
      <div className="absolute left-4 top-4 z-20">
        <StageTabs value={stage} onChange={setStage} />
      </div>

      {/* The library, as the bottom sheet it is everywhere else in Terra Web.
          Same component as the editor's, so folders, tags, search and upload
          all behave here exactly as they do out there. */}
      {library && (
        <AssetLibrary
          /* Keyed on the errand: the category it opens on and whether
             multi-select is armed are read at mount, so switching from
             "add swap objects" to "add from library" while the sheet is
             already up has to remount it — otherwise you get the swap
             sheet's environment filter over the place sheet's job. */
          key={library.kind === "swap" ? `swap-${library.target.id}` : library.kind}
          store={assetStore}
          /* All Assets, NOT 3D Models. "3D Models" is the AI-output folder —
             `filterByCategory` narrows it to meshes with `generated` set — so
             opening there showed an empty grid and a Generate 3D button to
             someone who only wanted to place a chair. The catalogue is in All
             Assets, which is what "add from library" means. Environments open
             on their own category, since that errand has exactly one type. */
          initialCategory={library.kind === "env" ? "environments" : "all"}
          /* The button says what the pick will do. Both shortlists arm the
             library's own multi-select, so the checkbox on every card is the
             one the user asked for rather than a second one drawn here. */
          placeLabel={
            library.kind === "swap"
              ? `Swap for ${library.target.name}`
              : library.kind === "env"
                ? "Add to run"
                : undefined
          }
          rightInset={stageInset}
          onClose={() => setLibrary(null)}
          onPlace={(a) => {
            /* THE TWO SHORTLISTS KEEP THE SHEET OPEN. Both are multi-select by
               nature — six stand-ins, four skies — and closing on the first
               pick would mean re-opening, re-searching and re-scrolling for
               every one after it. The dock's list updates live behind the
               sheet, so what you have chosen so far is visible while you
               choose the rest, and you close when you're done. */
            if (library.kind === "swap")
              return store.addSwap(library.target, { id: a.id, name: a.name });
            if (library.kind === "env") return store.addEnv(a.id);
            // Placing is the opposite: `scene.add` selects what it adds, so the
            // object arrives with the gizmo already on it — and the sheet
            // closes, because the next thing you want is the viewport it just
            // landed in.
            scene.add(a.name, a.type, undefined, a.modelUrl);
            setLibrary(null);
          }}
          onGenerate3D={() => setLibrary(null)}
        />
      )}

      {/* --------------------------------------------------------------- dock */}
      <TerraGenDock
        scene={scene}
        order={order}
        store={store}
        assets={assets}
        roles={roles}
        rig={rig}
        gates={gates}
        dispatched={dispatched}
        blocked={blockers.length > 0}
        loading={loading}
        subsets={totals.subsets}
        gizmoMode={gizmoMode}
        onGizmoMode={setGizmoMode}
        onReseed={() => store.reseed(scene, assets)}
        onDispatch={() => setReviewing(true)}
        onClose={onClose}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        onBrowseLibrary={(mode) => {
          // The sheet covers the bottom of the stage, and the section it was
          // opened from is what you check the result against — so the dock
          // stays up rather than being folded away for it.
          setCollapsed(false);
          setLibrary(mode);
        }}
        previewedSwap={swapPreview}
        onPreviewSwap={previewSwap}
        onFocusCamera={focusCamera}
        onCameraEdit={setCameraEdit}
      />

      {reviewing && (
        <DispatchReview
          order={order}
          totals={totals}
          assets={assets}
          credits={credits}
          gates={gates}
          /* The scene's own two contributions to the list: how much is in the
             frame, and how many weather sets are checked into the run. Both
             live on the scene rather than on the order, so they are counted
             here and handed over. */
          changes={orderChanges(order, {
            // Containers aren't things in the frame — counting a group and the
            // four crates inside it as five objects overstates the scene.
            objects: scene.objects.filter((o) => isContentObject(o)).length,
            weatherSets,
          })}
          onCancel={() => setReviewing(false)}
          onConfirm={() => {
            setReviewing(false);
            onDispatch(order);
            setDispatched(true);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- the tabs -- */

type StageId = "camera" | "edit";

const STAGES: { id: StageId; label: string; icon: IconName }[] = [
  { id: "camera", label: "Scene preview", icon: "camera" },
  { id: "edit", label: "Edit scene", icon: "input-3d" },
];

/**
 * Which stage is in front — as two tabs rather than one toggle.
 *
 * A single button had to be labelled for where it TOOK you, so the control
 * showing "Edit scene" meant you were in the preview. That reads backwards
 * every time: the one word on screen names the thing you are NOT looking at.
 * Two tabs name both stages and mark the current one, so the control answers
 * "where am I" and "where else can I go" at once.
 *
 * Its own dark ground rather than plain glass, matching the frame caption and
 * the scrubber: all three float over a live render that can be any brightness,
 * and glass tint alone loses the label over sunlit rock.
 */
function StageTabs({ value, onChange }: { value: StageId; onChange: (id: StageId) => void }) {
  return (
    <div
      role="tablist"
      aria-label="TerraGen stage"
      data-ui="terragen-stage-tabs"
      className="flex items-center gap-1 rounded-full border border-glass/15 bg-canvas/75 p-1 backdrop-blur-md"
    >
      {STAGES.map((s) => {
        const on = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-ui={`terragen-stage-${s.id}`}
            onClick={() => onChange(s.id)}
            className={cn(
              "type-button-sm flex h-8 items-center gap-1.5 rounded-full px-3.5 transition-colors",
              on
                ? "bg-brand text-brand-foreground"
                : "text-content-muted hover:bg-glass/15 hover:text-content"
            )}
          >
            <Icon name={s.icon} size={15} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- the render -- */

/**
 * The left-hand picture: the scene, from the pose TerraGen would shoot frame N
 * from, with a scrubber across the rig's own sweep.
 *
 * The sweep comes from `planCapture` — the same plan the viewport's capture
 * runs — so scrubbing here and dragging a camera out there are two views of one
 * thing. It previews the CAMERA only: weather, HDRI and layout changes can't be
 * rendered by this client, and a preview that silently ignored half the order
 * would be worse than none, so the caption says so.
 */
function SweepRender({
  scene,
  rig,
  loading,
  onReady,
  projectName,
  hidden,
  inset,
}: {
  scene: SceneApi;
  rig: ReturnType<typeof rigState>;
  loading: boolean;
  /** the render's assets have resolved — clears the loader */
  onReady: () => void;
  projectName: string;
  /** width the dock is occupying — the overlays hold to the band left of it */
  inset: number;
  /**
   * The edit viewport is in front. The sweep render stays MOUNTED underneath
   * rather than unmounting, because tearing it down would drop its WebGL
   * context and re-fetch the 4K environment map every time you toggled — the
   * exact cold start the loader exists to cover.
   */
  hidden?: boolean;
}) {
  const frames = rig.frames;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  // A scrub position is only meaningful against a given sweep length. Shrinking
  // the sweep under a parked scrubber would otherwise leave it past the end,
  // showing a frame the rig no longer contains.
  useEffect(() => {
    setFrame((f) => (f >= frames ? 0 : f));
  }, [frames]);

  useEffect(() => {
    if (!playing || frames <= 1) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % frames), 220);
    return () => window.clearInterval(id);
  }, [playing, frames]);

  const sample = frameSample(rig, frame);
  const position = sample.position;

  const round = (v: number) => Math.round(v * 10) / 10;
  const heading = ((Math.round(sample.yaw) % 360) + 360) % 360;

  return (
    /* Full-bleed, the way the editor's own viewport is: the render fills the
       mode and the dock floats over it as one more glass panel, rather than the
       render stopping at the panel's edge. The dock's own translucency is what
       keeps the frame readable behind it — the same deal every other Terra Web
       panel makes with the scene under it. The overlays below (caption,
       scrubber) still hold to the visible band left of the dock so they never
       hide under it. */
    <div
      className={cn(
        "absolute inset-0",
        // Hidden, not unmounted — see `hidden` above.
        hidden && "pointer-events-none invisible"
      )}
    >
      {/* The canvas mounts DURING the load, not after it — it is the thing
          doing the loading. The loader is painted over it and lifts when
          `Ready` reports the Suspense boundary resolved. */}
      {rig.hasMaster && (
        <Canvas
          className="!absolute inset-0"
          dpr={[1, 1.75]}
          gl={{ alpha: true, antialias: true }}
          camera={{ position, fov: 50, near: 0.05, far: 1000 }}
        >
          <Suspense fallback={null}>
            <PoseRig position={position} target={rig.target} />
            {/* The capture cameras are excluded — TerraGen doesn't render its
                own rig into the dataset, so showing it here would preview a
                frame that never gets shot. */}
            <SceneWorld scene={scene} interactive={false} hideCameras />
            <Ready onReady={onReady} />
          </Suspense>
        </Canvas>
      )}

      {/* No master means no canvas, so nothing is loading and `loading` would
          sit true until its timeout — the empty state has to win over it, or
          a scene with no hero shows "Preparing" for fifteen seconds. */}
      {!rig.hasMaster ? (
        <div className="absolute inset-0 grid place-items-center bg-canvas px-8 text-center">
          <p className="type-body max-w-sm text-content-subtle">
            Pick a Master object in the Camera section — the camera has nothing to orbit until you
            do.
          </p>
        </div>
      ) : (
        loading && (
          <div className="absolute inset-0 grid place-items-center bg-canvas px-8 text-center">
            <Loading projectName={projectName} />
          </div>
        )
      )}

      {/* ---------------------------------------------------------- scrubber */}
      {/* Its own dark ground rather than glass alone: this floats over a live
          render that can be any brightness, and over sunlit rock the glass tint
          alone left the readout barely legible. */}
      {!loading && rig.hasMaster && rig.hasRig && (
        <div className="absolute bottom-0 left-0 p-4" style={{ right: inset }}>
          <div className="mx-auto flex max-w-[560px] items-center gap-2.5 rounded-2xl border border-glass/15 bg-canvas/75 px-3 py-2.5 backdrop-blur-md">
            <button
              type="button"
              aria-label={playing ? "Pause sweep" : "Play sweep"}
              data-ui="terragen-preview-play"
              disabled={frames <= 1}
              onClick={() => setPlaying((p) => !p)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-glass/12 bg-glass/8 text-content-muted transition-colors hover:text-content disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon name={playing ? "minimize" : "preview"} size={13} />
            </button>
            <input
              type="range"
              aria-label="Preview frame"
              data-ui="terragen-preview-scrub"
              min={0}
              max={Math.max(0, frames - 1)}
              value={frame}
              disabled={frames <= 1}
              onChange={(e) => {
                setPlaying(false);
                setFrame(Number(e.target.value));
              }}
              className="h-1 grow accent-brand disabled:opacity-40"
            />
            {/* The pose, not the frame number: where the camera is standing is
                what this preview is for, and a count belongs to the bill. */}
            <span className="type-numeric-sm shrink-0 tabular-nums text-content-subtle">
              {round(sample.pitch)}° · {heading}° · {round(sample.distance)} m
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * THE EDIT VIEWPORT — the same canvas the editor uses, inside the mode.
 *
 * `SceneCanvas` already owns selection, the transform gizmo, orbit controls and
 * the rig guides, so this is that component rather than a second, thinner copy
 * of it. That matters beyond saving code: the object you drag here is dragged by
 * exactly the machinery that drags it in Terra Web, so there is no second
 * implementation to fall out of step with the first.
 *
 * It sits where the sweep preview sits and the two swap, because they answer
 * different questions about the same scene: this one is "what is in it and
 * where", the preview is "what will the camera actually shoot".
 */
function EditStage({
  scene,
  gizmoMode,
  hidden,
  inset,
  cameraGuide,
  substitute,
  onOrbit,
  onSpan,
}: {
  scene: SceneApi;
  gizmoMode: GizmoMode;
  hidden?: boolean;
  /** width the dock is occupying — keeps the cube and handles clear of it */
  inset: number;
  /** what the rig is doing right now — see `cameraGuide` in TerraGenView */
  cameraGuide: CameraGuide | null;
  /** a stand-in drawn in place of the object it replaces, and where the gizmo's
   *  output goes while it is */
  substitute: React.ComponentProps<typeof SceneCanvas>["substitute"];
  onOrbit: (deg: number) => void;
  onSpan: (metres: number) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<CameraHandle | null>(null);

  return (
    <div
      data-ui="terragen-edit-stage"
      className={cn(
        // Full-bleed like the editor's own viewport; the dock floats over it and
        // `gizmoInset` keeps the cube and handles clear of the panel.
        "absolute inset-0",
        hidden && "pointer-events-none invisible"
      )}
    >
      <SceneCanvas
        scene={scene}
        gizmoMode={gizmoMode}
        // The gizmo follows the selection here rather than an Object tab: this
        // mode has no tabs, and a selection with no handles would leave the
        // Transform control in the panel pointing at nothing.
        showGizmo={scene.selected != null}
        controlsRef={controlsRef}
        cameraRef={cameraRef}
        // Clear of the dock, the same way the editor clears its own.
        gizmoInset={inset}
        cameraGuide={cameraGuide}
        substitute={substitute}
        onOrbit={onOrbit}
        onSpan={onSpan}
      />
    </div>
  );
}

/**
 * Reports that the render is up.
 *
 * It sits INSIDE the Suspense boundary, so React only mounts it once every
 * suspended resource in there — the environment map above all — has resolved.
 * That makes "loaded" mean the same thing to the loader as it does to the
 * canvas, instead of being a guess about how long loading takes.
 */
function Ready({ onReady }: { onReady: () => void }) {
  // Read through a ref: the caller passes a fresh arrow every render, so
  // depending on it directly would re-arm the effect forever.
  const cb = useRef(onReady);
  cb.current = onReady;

  // three's loading manager, which is what the environment map actually
  // reports to. Mounting inside Suspense is NOT enough on its own — measured
  // here, the boundary resolved a good three seconds before the scene painted,
  // and the loader lifted onto a black frame. `active` covers that tail.
  const active = useProgress((s) => s.active);
  const total = useProgress((s) => s.total);

  // Nothing has started loading yet on the first frames, so `!active` alone
  // would clear the loader instantly — which is the bug this replaced. Only a
  // manager that went busy and came back is "settled".
  const started = useRef(false);
  if (active || total > 0) started.current = true;
  const settled = started.current && !active;

  // A scene with genuinely nothing to fetch never goes busy at all, so waiting
  // on `settled` alone would hang it until the outer timeout. Give the loaders
  // a beat to register, then stop waiting.
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setGraceOver(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  const ready = settled || (graceOver && !started.current);

  useEffect(() => {
    if (!ready) return;
    // One frame's grace so the first paint lands before the cover lifts.
    const id = requestAnimationFrame(() => cb.current());
    return () => cancelAnimationFrame(id);
  }, [ready]);

  return null;
}

/** Pins the preview camera to the sampled pose, looking at the master. */
function PoseRig({ position, target }: { position: Vec3; target: Vec3 }) {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(target[0], target[1], target[2]);
  });
  return null;
}

/** The mode assembling. Named steps rather than a bare spinner — the wait is
 *  short, but "Reading the scene" is the difference between a pause and a
 *  hang. */
function Loading({ projectName }: { projectName: string }) {
  return (
    <div data-ui="terragen-loading" className="flex flex-col items-center gap-3">
      <span className="relative grid h-12 w-12 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
        <span className="relative grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
          <Icon name="generate" size={22} />
        </span>
      </span>
      <p className="type-body-strong text-content">Preparing TerraGen</p>
      <p className="type-caption text-content-subtle">Reading {projectName} into the Work Order…</p>
    </div>
  );
}

/* --------------------------------------------------------------- the dock -- */

/**
 * The right-hand column: Camera, Roles, four axes, Output.
 *
 * ACCORDION RATHER THAN A NAV + EDITOR SPLIT. At this width there is no room
 * for both a list and a form, and the list is the more important of the two —
 * the panel's job is to show what is armed and what each section is set to. So
 * every section is a row carrying its own summary, and the one being edited
 * expands in place underneath its row.
 *
 * ONE OPEN AT A TIME. Two open sections put the control you are dragging and
 * the row you are comparing it against on different screens.
 *
 * THE FIRST TWO ROWS EDIT THE SCENE, NOT THE ORDER. Camera moves the rig and
 * picks the master; Roles marks what everything else is. Neither carries a
 * switch, because neither multiplies anything — they decide what a single
 * subset even looks like.
 */
function TerraGenDock({
  scene,
  order,
  store,
  assets,
  roles,
  rig,
  gates,
  dispatched,
  blocked,
  loading,
  subsets,
  gizmoMode,
  onGizmoMode,
  onReseed,
  onDispatch,
  onClose,
  collapsed,
  onToggleCollapsed,
  onBrowseLibrary,
  previewedSwap,
  onPreviewSwap,
  onFocusCamera,
  onCameraEdit,
}: {
  scene: SceneApi;
  /** which stand-in is standing in right now, if any */
  previewedSwap: { targetId: string; assetId: string } | null;
  /** show this stand-in in the viewport, or put it away if it already is */
  onPreviewSwap: (targetId: string, assetId: string) => void;
  order: WorkOrder;
  store: WorkOrderStore;
  assets: Asset[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onBrowseLibrary: (mode: LibraryMode) => void;
  /** show the rig in the edit stage, framed — see `focusCamera` */
  onFocusCamera: () => void;
  /** which camera control is in hand, so the stage can draw its guide */
  onCameraEdit: (edit: CameraEdit) => void;
  roles: ReturnType<typeof sceneRoles>;
  rig: ReturnType<typeof rigState>;
  gates: ReturnType<typeof preflight>;
  dispatched: boolean;
  blocked: boolean;
  loading: boolean;
  /** for the queued confirmation only — the bill lives in the review */
  subsets: number;
  gizmoMode: GizmoMode;
  onGizmoMode: (m: GizmoMode) => void;
  onReseed: () => void;
  onDispatch: () => void;
  onClose: () => void;
}) {
  // Camera leads: it is where a Work Order starts, and the master it picks is
  // what every other section is measured against.
  const [open, setOpen] = useState<SectionId | null>("master");
  const first = gates[0];

  const toggleOpen = (id: SectionId) => setOpen((o) => (o === id ? null : id));

  /**
   * Folded: the header alone, in the corner the panel came from.
   *
   * It keeps its identity — same mark, same word — so the way back is the thing
   * you just collapsed rather than a new button somewhere else. Section state,
   * the open accordion and the draft are all untouched, because the panel is
   * still mounted; only its body is gone.
   */
  if (collapsed) {
    return (
      <Panel
        ui="terragen"
        thickness="thick"
        className="absolute right-3 top-3 flex-row items-center gap-2 overflow-hidden py-2 pl-3 pr-2"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
          <Icon name="generate" size={15} />
        </span>
        <span className="type-body-strong text-content">Generate</span>
        <GlassGhostButton
          ui="terragen-expand"
          size="sm"
          icon="sidebar-expand"
          label="Expand the Work Order panel"
          onClick={onToggleCollapsed}
        />
      </Panel>
    );
  }

  return (
    <Panel
      ui="terragen"
      thickness="thick"
      className="absolute inset-y-3 right-3 overflow-hidden"
      style={{ width: TERRAGEN_WIDTH }}
    >
      <header
        data-ui="terragen-header"
        className="flex shrink-0 items-center gap-3 border-b border-glass/12 px-4 py-3"
      >
        {/* ONE TITLE, NO MARK. It was a brand-filled sparkle disc, "Generate",
            and "Work Order" underneath — three things saying one thing, and the
            two-line title made the header taller than the sections it sits over
            while still not naming what the panel is. It is the Generate Work
            Order panel, so that is what it says. */}
        <div className="min-w-0 grow">
          <h2 className="type-heading truncate text-content">Generate Work Order</h2>
        </div>
        <GlassGhostButton
          ui="terragen-reseed"
          icon="retry"
          label="Re-read the scene into every axis"
          onClick={onReseed}
        />
        {/* Fold, don't close: the panel gets out of the way of the render it is
            describing without discarding the Work Order in it. */}
        <GlassGhostButton
          ui="terragen-collapse"
          icon="sidebar-collapse"
          label="Collapse the Work Order panel"
          onClick={onToggleCollapsed}
        />
        <GlassGhostButton ui="terragen-close" icon="close" label="Back to editor" onClick={onClose} />
      </header>

      <div data-ui="terragen-body" className="min-h-0 grow overflow-y-auto p-3">
        {loading ? (
          <DockSkeleton />
        ) : (
          <>
            {/* --- the two scene sections ------------------------------- */}
            {/* These edit the SCENE, not the order, so neither carries a
                switch: they decide what a single subset even looks like. */}
            <Section
              id="master"
              /* "Objects", not "Master Object": the section holds the whole
                 cast — the master, everything sharing the frame with it, and the
                 way in from the library. Naming it after one of its rows made
                 the other two look like they were in the wrong place. */
              label="Objects"
              icon="scene"
              summary={masterSummary(roles)}
              open={open === "master"}
              onOpen={() => toggleOpen("master")}
            >
              <MasterSection
                scene={scene}
                order={order}
                store={store}
                roles={roles}
                assets={assets}
                gizmoMode={gizmoMode}
                onGizmoMode={onGizmoMode}
                onBrowseLibrary={() => onBrowseLibrary({ kind: "place" })}
                onBrowseSwaps={(target) => onBrowseLibrary({ kind: "swap", target })}
                previewedSwap={previewedSwap}
                onPreviewSwap={onPreviewSwap}
              />
            </Section>

            <Section
              id="camera"
              label="Camera Settings"
              icon="camera"
              summary={cameraSummary(rig)}
              open={open === "camera"}
              onOpen={() => {
                // Opening the section is already the statement "I am about to
                // move the rig", so the stage answers before the first drag
                // rather than after it. Closing it puts the guides away.
                if (open !== "camera") onFocusCamera();
                else onCameraEdit(null);
                toggleOpen("camera");
              }}
            >
              <CameraSection
                scene={scene}
                rig={rig}
                onFocusCamera={onFocusCamera}
                onEditing={onCameraEdit}
              />
            </Section>

            {/* Weather is the third scene section: it edits the scene, not the
                order, and multiplies nothing — so like Master and Camera it
                carries no switch. It used to be two axes (Weather + Time of
                Day); both folded into this one scene-owned configuration. */}
            <Section
              id="weather"
              label="Weather & Lighting"
              icon="sunny"
              /* Conditions only. The row used to append the wind bearing and
                 the sun clock, and neither is editable in the section any more —
                 a summary of controls that aren't there is a dead end. */
              summary={describeLayers(scene.weather)}
              open={open === "weather"}
              onOpen={() => toggleOpen("weather")}
            >
              <WeatherSection scene={scene} />
            </Section>

            {/* --- the axes -------------------------------------------- */}
            {/* NO SWITCH ON THESE ROWS ANY MORE. The environment axis has one
                control and one list, and an empty list already says "off" —
                the switch only added a second way to say it, and a third state
                to get stuck in (rows chosen, axis silently off). The axis arms
                itself from its picks; see `useWorkOrder.addEnv`. */}
            {PANEL_AXES.map((a) => (
              <Section
                key={a.id}
                id={a.id}
                label={a.label}
                icon={a.icon}
                summary={axisSummary(order, a.id, assets)}
                on={order[a.id].on}
                open={open === a.id}
                onOpen={() => toggleOpen(a.id)}
              >
                <AxisEditor
                  section={a.id}
                  order={order}
                  store={store}
                  scene={scene}
                  assets={assets}
                  onBrowseLibrary={() => onBrowseLibrary({ kind: "env" })}
                />
              </Section>
            ))}

          </>
        )}
      </div>

      {/* Output sits OUTSIDE the scroll, directly above Dispatch.
          It isn't an axis — it gates what TerraGen computes rather than how many
          times it runs — and it is the last thing you check before spending, so
          it belongs next to the button that spends rather than at the bottom of
          a list you have to scroll to reach. */}
      {!loading && (
        // Capped and scrollable: open, the annotation list is taller than the
        // room below the axes, and without this it would push Dispatch off the
        // bottom of the panel.
        /* The top border and the ink under it are what make this read as PINNED.
           Without them the axis list simply stopped mid-row at the scroll edge —
           a half-cut "Fog" with a card starting under it, which reads as content
           the panel has covered up rather than content you can scroll to. */
        <div className="max-h-[48vh] shrink-0 overflow-y-auto border-t border-glass/12 bg-glass/8 px-3 pb-1 pt-2">
          <Section
            id="output"
            label="Output"
            icon="capture"
            summary={outputSummary(order)}
            open={open === "output"}
            onOpen={() => toggleOpen("output")}
          >
            <AxisEditor
              section="output"
              order={order}
              store={store}
              scene={scene}
              assets={assets}
              onBrowseLibrary={() => onBrowseLibrary({ kind: "env" })}
            />
          </Section>
        </div>
      )}

      <footer
        data-ui="terragen-footer"
        className="flex shrink-0 flex-col gap-2.5 border-t border-glass/12 p-3"
      >
        {dispatched ? (
          <>
            <p className="type-body flex items-start gap-2 text-content">
              <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
              Work Order queued — {formatCount(subsets)} {subsets === 1 ? "subset" : "subsets"}.
            </p>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Back to scene
            </Button>
          </>
        ) : (
          <>
            {/* A live validity strip beats failing on click: by the time
                someone reaches for Dispatch they should already know. */}
            {first && (
              <p
                data-ui="terragen-preflight"
                className={cn(
                  "type-caption flex items-start gap-1.5 rounded-lg border px-2.5 py-2",
                  first.level === "block"
                    ? "border-danger/40 bg-danger-soft/40 text-danger-on-glass"
                    : "border-warning/40 bg-warning-soft/40 text-warning"
                )}
              >
                <Icon
                  name={first.level === "block" ? "error" : "warning"}
                  size={13}
                  className="mt-px shrink-0"
                />
                <span className="grow">{first.message}</span>
                {gates.length > 1 && (
                  <Pill ui="preflight-more" tone={first.level === "block" ? "danger" : "muted"}>
                    +{gates.length - 1}
                  </Pill>
                )}
              </p>
            )}

            <Button
              variant="brand"
              size="sm"
              data-ui="terragen-dispatch"
              disabled={blocked || loading}
              onClick={onDispatch}
            >
              <Icon name="generate" size={15} />
              Review & dispatch
            </Button>
          </>
        )}
      </footer>
    </Panel>
  );
}

/** The camera row, closed: what it shoots and how far it reaches. Deliberately
 *  no frame count — that is the bill, and the bill is stated once. */
function cameraSummary(rig: ReturnType<typeof rigState>): string {
  if (!rig.hasMaster) return "No master object";
  if (!rig.hasRig) return `${rig.masterName} · no camera placed`;
  const reach =
    rig.nearDistance === rig.farDistance
      ? `${rig.nearDistance} m`
      : `${rig.nearDistance}–${rig.farDistance} m`;
  return `${rig.masterName} · ${reach}`;
}

/** The output row, closed: what comes back, at what size, with how much on it. */
function outputSummary(order: WorkOrder): string {
  const { width, height } = order.output.resolution;
  const annotations = Object.values(order.output.annotations).filter(Boolean).length;
  return `${order.output.images ? "Images" : "No type"} · ${width}×${height} · ${annotations} annotations`;
}

/** The master row, closed: the hero first, then what else is in the frame with
 *  it — since this section now owns the whole object list. */
function masterSummary(roles: ReturnType<typeof sceneRoles>): string {
  const hero = roles.master?.name ?? "No master object";
  const others: string[] = [];
  if (roles.backgroundObjects.length > 0) others.push(`${roles.backgroundObjects.length} background`);
  if (roles.distractors.length > 0) others.push(`${roles.distractors.length} distractor`);
  return others.length > 0 ? `${hero} · ${others.join(" · ")}` : hero;
}

/** One accordion row. The row opens the section; the switch arms the axis.
 *  Keeping those two as separate targets is what lets someone arm an axis
 *  without losing the editor they're reading, and open one without arming it. */
function Section({
  id,
  label,
  icon,
  summary,
  on,
  open,
  onOpen,
  onToggle,
  children,
}: {
  id: SectionId;
  label: string;
  icon: IconName;
  summary: string;
  on?: boolean;
  open: boolean;
  onOpen: () => void;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    /* A card, open or closed. The rows used to be transparent until opened,
       which left the stack reading as loose text on glass; giving every section
       the same filled surface is what makes them read as the six things this
       panel is made of. */
    <section
      data-ui={`terragen-section-${id}`}
      className={cn(
        "mb-2 overflow-hidden rounded-xl border bg-glass/8 transition-colors",
        open ? "border-glass/25" : "border-glass/12 hover:border-glass/20"
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        data-ui={`terragen-row-${id}`}
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <Icon
          name={icon}
          size={15}
          className={cn("shrink-0", on || onToggle == null ? "text-brand" : "text-content-subtle")}
        />
        <span className="min-w-0 grow">
          <span className="type-body-strong block truncate text-content">{label}</span>
          <span className="type-caption block truncate text-content-subtle">{summary}</span>
        </span>
        {onToggle && (
          <AxisSwitch label={label} on={!!on} onToggle={onToggle} ui={`terragen-switch-${id}`} />
        )}
        <Icon
          name="chevron-down"
          size={14}
          className={cn("shrink-0 text-content-subtle transition-transform", open && "rotate-180")}
        />
      </button>

      {open && <div className="border-t border-glass/12 px-3.5 py-4">{children}</div>}
    </section>
  );
}

/** Placeholder rows while the mode assembles, so the dock has the shape it is
 *  about to have rather than collapsing and jumping. */
function DockSkeleton() {
  return (
    <div aria-hidden className="space-y-1.5">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5">
          <span className="h-4 w-4 shrink-0 animate-pulse rounded bg-glass/12" />
          <span className="grow space-y-1.5">
            <span className="block h-3 w-1/3 animate-pulse rounded bg-glass/12" />
            <span className="block h-2.5 w-1/2 animate-pulse rounded bg-glass/8" />
          </span>
          <span className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-glass/12" />
        </div>
      ))}
    </div>
  );
}
