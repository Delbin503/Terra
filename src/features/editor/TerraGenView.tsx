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
import { CameraSection } from "./terragen-camera";
import { RolesSection } from "./terragen-roles";
import { DispatchReview } from "./terragen-budget";
import type { Asset } from "./assets-data";
import type { SceneApi } from "./useScene";
import type { WorkOrderStore } from "./useWorkOrder";
import {
  AXES,
  axisSummary,
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
  projectName,
  credits,
  onClose,
  onDispatch,
  reframeRig,
  onUploadHdri,
  onAutoAssignRoles,
}: {
  scene: SceneApi;
  store: WorkOrderStore;
  assets: Asset[];
  projectName: string;
  /** workspace balance, for the affordability gate */
  credits: number;
  onClose: () => void;
  onDispatch: (order: WorkOrder) => void;
  /** rebuild the rig's framing around the current master */
  reframeRig: () => void;
  onUploadHdri: (file: File) => void;
  onAutoAssignRoles: () => void;
}) {
  const [dispatched, setDispatched] = useState(false);
  const [reviewing, setReviewing] = useState(false);
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

  // Derived every render, not read from the draft: the rig and the roles keep
  // moving — and now they move from inside this panel too.
  const rig = rigState(scene);
  const roles = sceneRoles(scene);

  if (!order) return null;

  const totals = computeTotals(order, assets, rig.frames);
  const gates = preflight(
    order,
    {
      masterCount: roles.master ? 1 : 0,
      hasRig: rig.hasRig,
      hasEnvironment: scene.objects.some((o) => o.source === "environment"),
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

      {/* ------------------------------------------------------------ render */}
      <SweepRender
        scene={scene}
        rig={rig}
        loading={loading}
        onReady={() => setLoading(false)}
        projectName={projectName}
      />

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
        onReframeRig={reframeRig}
        onUploadHdri={onUploadHdri}
        onAutoAssignRoles={onAutoAssignRoles}
        onReseed={() => store.reseed(scene, assets)}
        onDispatch={() => setReviewing(true)}
        onClose={onClose}
      />

      {reviewing && (
        <DispatchReview
          order={order}
          totals={totals}
          assets={assets}
          credits={credits}
          gates={gates}
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
}: {
  scene: SceneApi;
  rig: ReturnType<typeof rigState>;
  loading: boolean;
  /** the render's assets have resolved — clears the loader */
  onReady: () => void;
  projectName: string;
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
    /* Stops where the dock starts (456px panel + its 12px gutter) rather than
       running underneath it: the render is the thing being judged, and judging
       it through a translucent panel is exactly the bias this mode removes. */
    <div className="absolute inset-y-0 left-0 right-[468px]">
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

      {/* ------------------------------------------------------ frame caption */}
      {!loading && rig.hasMaster && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-glass/15 bg-canvas/75 px-3 py-1.5 backdrop-blur-md">
            <Icon name="camera" size={13} className="shrink-0 text-brand" />
            <span className="type-caption-strong text-content">Scene preview</span>
            <Pill ui="preview-scope" tone="muted">
              Camera only
            </Pill>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- scrubber */}
      {/* Its own dark ground rather than glass alone: this floats over a live
          render that can be any brightness, and over sunlit rock the glass tint
          alone left the readout barely legible. */}
      {!loading && rig.hasMaster && rig.hasRig && (
        <div className="absolute inset-x-0 bottom-0 p-4">
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
  onReframeRig,
  onUploadHdri,
  onAutoAssignRoles,
  onReseed,
  onDispatch,
  onClose,
}: {
  scene: SceneApi;
  order: WorkOrder;
  store: WorkOrderStore;
  assets: Asset[];
  roles: ReturnType<typeof sceneRoles>;
  rig: ReturnType<typeof rigState>;
  gates: ReturnType<typeof preflight>;
  dispatched: boolean;
  blocked: boolean;
  loading: boolean;
  /** for the queued confirmation only — the bill lives in the review */
  subsets: number;
  onReframeRig: () => void;
  onUploadHdri: (file: File) => void;
  onAutoAssignRoles: () => void;
  onReseed: () => void;
  onDispatch: () => void;
  onClose: () => void;
}) {
  // Camera leads: it is where a Work Order starts, and the master it picks is
  // what every other section is measured against.
  const [open, setOpen] = useState<SectionId | null>("camera");
  const first = gates[0];

  const toggleOpen = (id: SectionId) => setOpen((o) => (o === id ? null : id));

  return (
    <Panel
      ui="terragen"
      thickness="thick"
      className="absolute inset-y-3 right-3 w-[456px] overflow-hidden"
    >
      <header
        data-ui="terragen-header"
        className="flex shrink-0 items-center gap-3 border-b border-glass/12 px-4 py-3"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
          <Icon name="generate" size={17} />
        </span>
        <div className="min-w-0 grow">
          <h2 className="type-heading text-content">TerraGen</h2>
          <p className="type-caption text-content-muted">Work Order</p>
        </div>
        <GlassGhostButton
          ui="terragen-reseed"
          icon="retry"
          label="Re-read the scene into every axis"
          onClick={onReseed}
        />
        <GlassGhostButton ui="terragen-close" icon="close" label="Back to editor" onClick={onClose} />
      </header>

      <div data-ui="terragen-body" className="min-h-0 grow overflow-y-auto p-3">
        {loading ? (
          <DockSkeleton />
        ) : (
          <>
            {/* --- the two scene sections ------------------------------- */}
            <Section
              id="camera"
              label="Camera & Master"
              icon="camera"
              summary={cameraSummary(rig)}
              open={open === "camera"}
              onOpen={() => toggleOpen("camera")}
            >
              <CameraSection
                scene={scene}
                rig={rig}
                roles={roles}
                onReframeRig={onReframeRig}
              />
            </Section>

            <Section
              id="roles"
              label="Object Roles"
              icon="input-3d"
              summary={rolesSummary(roles)}
              open={open === "roles"}
              onOpen={() => toggleOpen("roles")}
            >
              <RolesSection
                scene={scene}
                roles={roles}
                onAutoAssignRoles={onAutoAssignRoles}
              />
            </Section>

            {/* --- the axes -------------------------------------------- */}
            {AXES.map((a) => (
              <Section
                key={a.id}
                id={a.id}
                label={a.label}
                icon={a.icon}
                summary={axisSummary(order, a.id, assets)}
                on={order[a.id].on}
                open={open === a.id}
                onOpen={() => toggleOpen(a.id)}
                onToggle={() => store.toggle(a.id)}
              >
                <AxisEditor
                  section={a.id}
                  order={order}
                  store={store}
                  assets={assets}
                  onUploadHdri={onUploadHdri}
                />
              </Section>
            ))}

            {/* Output isn't an axis — it gates what TerraGen computes rather
                than how many times it runs — but it reads as one row. */}
            <Section
              id="output"
              label="Output"
              icon="capture"
              summary={`${order.output.images ? "Images" : "No type"} · ${
                Object.values(order.output.annotations).filter(Boolean).length
              } annotations`}
              open={open === "output"}
              onOpen={() => toggleOpen("output")}
            >
              <AxisEditor
                section="output"
                order={order}
                store={store}
                assets={assets}
                onUploadHdri={onUploadHdri}
              />
            </Section>
          </>
        )}
      </div>

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

function rolesSummary(roles: ReturnType<typeof sceneRoles>): string {
  const parts: string[] = [];
  if (roles.backgroundObjects.length > 0) parts.push(`${roles.backgroundObjects.length} background`);
  if (roles.distractors.length > 0) parts.push(`${roles.distractors.length} distractor`);
  return parts.length > 0 ? parts.join(" · ") : "Nothing marked yet";
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
    <section
      data-ui={`terragen-section-${id}`}
      className={cn(
        "mb-1.5 overflow-hidden rounded-xl border transition-colors",
        open ? "border-glass/20 bg-glass/8" : "border-transparent hover:bg-glass/6"
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        data-ui={`terragen-row-${id}`}
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 px-2.5 py-2.5 text-left"
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

      {open && <div className="border-t border-glass/12 px-3 py-3.5">{children}</div>}
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
