import { useEffect, useRef, useState } from "react";
import { Raycaster, Vector2, Vector3, Plane } from "three";
import { cn } from "@/lib/utils";
import { SceneCanvas, type CameraHandle } from "./SceneCanvas";
import { EditorTopBar } from "./EditorTopBar";
import { EditorLeftRail, type RailTool, type FlyoutAction } from "./EditorLeftRail";
import { EditorActions } from "./EditorActions";
import { AssetLibrary } from "./AssetLibrary";
import { AiChatPanel } from "./AiChatPanel";
import { ObjectPropertiesPanel, type SettingKey } from "./ObjectPropertiesPanel";
import { SettingControl } from "./SettingControl";
import { ObjectToolbar, type EditTab } from "./ObjectToolbar";
import { ObjectTitle } from "./ObjectTitle";
import { ObjectInfoPanel } from "./ObjectInfoPanel";
import { SOURCE_LABEL } from "./scene-types";
import { GlassIconButton } from "@/components/glass";
import { Tooltip } from "@/components/ui";
import { useScene } from "./useScene";
import type { AssetType } from "./assets-data";

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
const GIZMO_SETTING: Record<GizmoMode, SettingKey> = {
  translate: "position",
  rotate: "rotation",
  scale: "scale",
};

/**
 * EditorView — the default project view. Full-bleed Three.js viewport with
 * floating glass chrome. Assets drag/drop from the library into the scene;
 * selecting an object shows a transform gizmo, focuses the camera, and opens
 * the contextual toolbar (Adjust / Texture / Delete / Back).
 */
export function EditorView({
  projectName = "Traffic Scene",
  userName = "Terra User",
}: {
  projectName?: string;
  userName?: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const savedViewRef = useRef<{ pos: [number, number, number]; target: [number, number, number] } | null>(null);

  const saveView = () => {
    const cam = cameraRef.current?.camera;
    const controls = controlsRef.current;
    if (!cam || !controls) return;
    savedViewRef.current = {
      pos: [cam.position.x, cam.position.y, cam.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    };
  };

  const resetCamera = () => {
    const cam = cameraRef.current?.camera;
    const controls = controlsRef.current;
    if (!cam || !controls) return;
    const saved = savedViewRef.current;
    if (saved) {
      cam.position.set(...saved.pos);
      controls.target.set(...saved.target);
      controls.update();
    } else {
      controls.reset();
    }
  };

  const scene = useScene();
  const [tool, setTool] = useState<RailTool | null>(null);
  const [editTab, setEditTab] = useState<EditTab | null>(null);
  const [activeSetting, setActiveSetting] = useState<SettingKey | null>(null);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [chatOpen, setChatOpen] = useState(false);
  const [titleDark, setTitleDark] = useState(false);
  const [sceneTier, setSceneTier] = useState<SceneTier>("dim");
  const [infoOpen, setInfoOpen] = useState(false);

  const selectTool = (t: RailTool) => setTool((cur) => (cur === t ? null : t));

  // The Transform rows and the viewport gizmo are ONE control, driven both ways:
  // picking Position/Rotation/Scale switches the gizmo to the matching handles,
  // and switching the gizmo highlights the row + opens its numeric control.
  // Without the pairing the two can disagree — the panel says Rotation while the
  // viewport still shows translate arrows.
  const selectSetting = (k: SettingKey) => {
    setActiveSetting(k);
    const mode = SETTING_GIZMO[k];
    if (mode) setGizmoMode(mode);
  };

  const selectGizmoMode = (m: GizmoMode) => {
    setGizmoMode(m);
    setActiveSetting(GIZMO_SETTING[m]);
  };

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

  const handleFlyout = (a: FlyoutAction) => {
    setTool(null); // close the flyout
    if (a === "chat") setChatOpen(true);
    // ASA / MAT panels are not built yet — the flyout just closes for now.
  };

  // Place an asset in the scene at a world point (defaults to the origin).
  const place = (name: string, type: AssetType, point?: [number, number, number], modelUrl?: string) => {
    setTool(null);
    scene.add(name, type, point, modelUrl);
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
    let point: [number, number, number] = [0, 0.5, 0];
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
      if (ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), hit)) {
        point = [hit.x, 0.5, hit.z];
      }
    }
    place(name, type, point, modelUrl);
  };

  const selected = scene.selected;

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
        showGizmo={editTab === "object"}
        controlsRef={controlsRef}
        cameraRef={cameraRef}
      />

      {/* Overlay chrome */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Layer order inside the overlay is explicit, because two things make
            it non-obvious: `.glass` sets backdrop-filter, which creates a
            stacking context — so a popover's own z-index can't escape its bar —
            and an element with no z-index paints in DOM order regardless of how
            high its children reach. The top bar owns the emoji popover, so it
            has to sit above the rail and the object title. */}
        <div className="absolute left-4 top-4 z-40">
          <EditorTopBar projectName={projectName} />
        </div>

        <div
          className={cn(
            "absolute left-4 top-28 z-20 transition-opacity duration-300",
            selected ? "pointer-events-none opacity-0" : "opacity-100"
          )}
        >
          <EditorLeftRail
            active={tool}
            onSelect={selectTool}
            onFlyoutAction={handleFlyout}
            onCloseFlyout={() => setTool(null)}
          />
        </div>

        {selected && (
          <ObjectTitle
            name={selected.name}
            dark={titleDark}
            isMaster={selected.isMaster}
            typeLabel={SOURCE_LABEL[selected.source]}
            description={selected.description}
            onRename={(name) => scene.update(selected.id, { name })}
            onBack={deselect}
            onViewInfo={() => setInfoOpen(true)}
            onDelete={() => scene.remove(selected.id)}
          />
        )}

        {chatOpen && <AiChatPanel scene={scene} onClose={() => setChatOpen(false)} />}

        <div className="absolute right-4 top-4">
          <EditorActions userName={userName} />
        </div>

        <div className="pointer-events-auto absolute right-4 top-24 flex flex-col gap-2">
          <Tooltip label="Reset to saved view">
            <GlassIconButton tone="regular" ui="gizmo-reset" size="sm" icon="gizmo-reset" label="Reset to saved view" onClick={resetCamera} />
          </Tooltip>
          <Tooltip label="Save current view as default">
            <GlassIconButton tone="regular" ui="gizmo-save" size="sm" icon="gizmo-save" label="Save current view as default" onClick={saveView} />
          </Tooltip>
        </div>

        {tool === "assets" && (
          <AssetLibrary onClose={() => setTool(null)} onPlace={(a) => place(a.name, a.type, undefined, a.modelUrl)} />
        )}
      </div>

      {/* Per-object controls: bottom toolbar → filtered right panel → setting */}
      {selected && (
        <ObjectToolbar
          tab={editTab}
          isMaster={selected.isMaster}
          onTab={(t) => {
            setEditTab(t);
            setActiveSetting(null);
          }}
          onToggleMaster={() => scene.update(selected.id, { isMaster: !selected.isMaster })}
        />
      )}
      {selected && editTab && (
        <ObjectPropertiesPanel
          object={selected}
          group={editTab === "object" ? "Transform" : "Material"}
          active={activeSetting}
          onSelect={selectSetting}
          gizmoMode={gizmoMode}
          setGizmoMode={selectGizmoMode}
        />
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
          setting={activeSetting}
          onChange={(patch) => scene.update(selected.id, patch)}
          onClose={() => setActiveSetting(null)}
        />
      )}
    </div>
  );
}
