import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { Panel, PanelBody, SearchInput } from "./ui";
import { AssetThumb } from "./AssetThumb";
import { useDismissable } from "./use-dismissable";
import {
  OBJECT_ROLES,
  ROLE_BADGE,
  ROLE_DOT,
  ROLE_LABEL,
  canTakeRole,
  isMaster,
  type ObjectRole,
} from "./scene-types";
import type { Asset } from "./assets-data";
import type { SceneApi } from "./useScene";
import type { SceneRoles } from "./work-order";
import { Cost, Group, Note } from "./terragen-parts";

/** How the gizmo is currently dragging. Mirrors the editor's own three modes. */
export type GizmoMode = "translate" | "rotate" | "scale";

/**
 * MASTER OBJECT — the scene's contents, edited from inside TerraGen.
 *
 * WHY THIS EXISTS AT ALL. Every version of this panel before it opened by
 * telling you what was wrong with the scene and then sending you out of the
 * panel to fix it: no master, nothing marked Distractor, wrong object in frame.
 * A mode you have to leave in order to satisfy it is a mode that shouldn't have
 * been one. So the scene is editable from here — add, swap, select, transform,
 * and say what each object IS — and the viewport on the left answers every one
 * of those actions immediately.
 *
 * WHY ROLES LIVE HERE TOO. They are a statement about the same list of objects
 * this section already shows. Splitting "which object" from "what it is" into
 * two sections meant scrolling between two copies of one list.
 *
 * The master is exactly-one and the rest are many, so the master gets the top
 * block and everything else shares the list beneath it.
 */
export function MasterSection({
  scene,
  roles,
  assets,
  gizmoMode,
  onGizmoMode,
  onAutoAssignRoles,
}: {
  scene: SceneApi;
  roles: SceneRoles;
  assets: Asset[];
  gizmoMode: GizmoMode;
  onGizmoMode: (m: GizmoMode) => void;
  /** ask the AI to sort unroled objects into the three groups */
  onAutoAssignRoles: () => void;
}) {
  const master = roles.master;
  const selected = scene.selected;

  /**
   * The one open picker, and what it will do with the mesh you choose.
   *
   * Lifted out of the buttons that open it because an absolutely-positioned
   * popover is clipped by the dock's `overflow-y-auto` — it opened, and the list
   * was cut off two rows down. One inline picker at section level has no
   * clipping to escape, gets the full column width, and makes "add" and "swap"
   * visibly the same act of choosing a mesh.
   */
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "swap"; id: string } | null>(null);

  /** Content objects only — a camera can't be a master and has no role. */
  const contents = useMemo(
    () => scene.objects.filter((o) => canTakeRole(o.source)),
    [scene.objects]
  );

  const meshes = useMemo(() => assets.filter((a) => a.type === "mesh"), [assets]);

  /**
   * Place a library asset into the scene and select it.
   *
   * `scene.add` already selects what it adds, which is the whole point of doing
   * this from here: the object appears in the viewport with the gizmo on it, so
   * "add" and "now place it" are one gesture rather than two.
   */
  const place = (asset: Asset) => scene.add(asset.name, asset.type);

  /**
   * Swap an object's mesh for another, in place.
   *
   * Only the identity changes — the transform, the role and the id all survive,
   * because swapping is "same thing in the scene, different model", not delete
   * and re-add. A re-add would drop the object to the origin and lose whatever
   * the camera rig was framed around.
   */
  const swap = (id: string, asset: Asset) =>
    scene.update(id, { name: asset.name, modelUrl: asset.modelUrl, source: asset.type });

  return (
    <div data-ui="terragen-editor-master">
      <Cost>
        The object every camera orbits, and everything else sharing the frame with it. Editing
        here moves the scene itself — nothing in this section multiplies the run.
      </Cost>

      <Group title="Master" hint={master ? undefined : "not set"}>
        {master ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-master/45 bg-master/10 p-2.5">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border bg-master border-master" />
            <button
              type="button"
              data-ui="terragen-master-select"
              onClick={() => scene.select(master.id)}
              className="type-body-strong min-w-0 grow truncate text-left text-content"
            >
              {master.name}
            </button>
            <Button
              variant="ghost"
              size="sm"
              data-ui="terragen-master-swap"
              onClick={() => setPicker({ mode: "swap", id: master.id })}
            >
              <Icon name="retry" size={14} />
              Swap
            </Button>
          </div>
        ) : (
          <Note tone="warn">
            Nothing is marked Master. Mark an object below — every camera axis orbits it, and the
            sweep has nothing to aim at until you do.
          </Note>
        )}
      </Group>

      <Group title="Scene objects" hint={`${contents.length} in scene`}>
        <Button
          variant="secondary"
          size="sm"
          data-ui="terragen-add-object"
          className="mb-2 w-full"
          onClick={() => setPicker((p) => (p?.mode === "add" ? null : { mode: "add" }))}
        >
          <Icon name="place" size={14} />
          Add from library
          <Icon
            name="chevron-down"
            size={13}
            className={cn("transition-transform", picker?.mode === "add" && "rotate-180")}
          />
        </Button>

        {picker && (
          <AssetPicker
            assets={meshes}
            title={picker.mode === "add" ? "Place a mesh into the scene" : "Replace with"}
            onCancel={() => setPicker(null)}
            onPick={(a) => {
              if (picker.mode === "add") place(a);
              else swap(picker.id, a);
              setPicker(null);
            }}
          />
        )}

        {contents.length === 0 ? (
          <Note>Nothing placed yet. Add an object from the library to start the scene.</Note>
        ) : (
          <>
            <ul className="space-y-1">
              {contents.map((o) => (
                <ObjectRow
                  key={o.id}
                  name={o.name}
                  role={o.role}
                  selected={selected?.id === o.id}
                  onSelect={() => scene.select(o.id)}
                  onSetRole={(r) => scene.setRole(o.id, r === o.role ? "none" : r)}
                  onSwap={() => setPicker({ mode: "swap", id: o.id })}
                />
              ))}
            </ul>

            {/* Tagging a busy scene by hand is the tedious part, so the offer to
                do it for you sits under the list it would act on. */}
            <Button variant="outline" size="sm" className="mt-2" onClick={onAutoAssignRoles}>
              <Icon name="ai" size={15} />
              Let AI assign roles
            </Button>
          </>
        )}
      </Group>

      {/* The gizmo only means anything while something is selected, so the
          control that drives it appears with the selection rather than sitting
          there greyed out. */}
      {selected && canTakeRole(selected.source) && (
        <Group title="Transform" hint={selected.name}>
          <div className="inline-flex rounded-lg border border-glass/12 bg-glass/6 p-0.5">
            {(
              [
                { id: "translate", label: "Move", icon: "move" },
                { id: "rotate", label: "Rotate", icon: "rotate" },
                { id: "scale", label: "Scale", icon: "scale" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={gizmoMode === m.id}
                data-ui={`terragen-gizmo-${m.id}`}
                onClick={() => onGizmoMode(m.id)}
                className={cn(
                  "type-label flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 transition-colors",
                  gizmoMode === m.id
                    ? "bg-brand text-brand-foreground"
                    : "text-content-muted hover:text-content"
                )}
              >
                <Icon name={m.icon} size={14} />
                {m.label}
              </button>
            ))}
          </div>
          <p className="type-caption mt-2 text-content-subtle">
            Drag the handles in the viewport. {isMaster(selected) && "Moving the master carries the camera rig with it."}
          </p>
        </Group>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ parts -- */

/** One object in the scene: select it, say what it is, or replace its mesh. */
function ObjectRow({
  name,
  role,
  selected,
  onSelect,
  onSetRole,
  onSwap,
}: {
  name: string;
  role: ObjectRole;
  selected: boolean;
  onSelect: () => void;
  onSetRole: (r: ObjectRole) => void;
  onSwap: () => void;
}) {
  return (
    <li
      data-ui={`terragen-object-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
        selected ? "border-brand/45 bg-brand/10" : "border-glass/10 bg-glass/5 hover:border-glass/25"
      )}
    >
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full border", ROLE_DOT[role])} />
      {/* Selecting is the row's primary action — it is what puts the gizmo on
          this object in the viewport to the left. */}
      <button type="button" onClick={onSelect} className="min-w-0 grow text-left">
        <span className="type-body block truncate text-content">{name}</span>
        {role !== "none" && (
          <span className="type-caption block text-content-subtle">{ROLE_BADGE[role]}</span>
        )}
      </button>
      <RoleMenu role={role} onSetRole={onSetRole} />
      <Button variant="ghost" size="sm" data-ui={`terragen-swap-${name}`} onClick={onSwap}>
        <Icon name="retry" size={14} />
        Swap
      </Button>
    </li>
  );
}

/** The role picker, as a compact menu on a row. */
function RoleMenu({ role, onSetRole }: { role: ObjectRole; onSetRole: (r: ObjectRole) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), wrap);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Role: ${ROLE_LABEL[role]}`}
        data-ui="terragen-role-menu"
        onClick={() => setOpen((o) => !o)}
        className="grid h-7 w-7 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
      >
        <Icon name="master" size={14} />
      </button>

      {open && (
        <Panel
          ui="terragen-role"
          thickness="overlay"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[212px] !rounded-xl"
        >
          <PanelBody className="p-1.5">
            <div role="menu" className="space-y-0.5">
              {OBJECT_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="menuitemradio"
                  aria-checked={r === role}
                  data-ui={`terragen-role-${r}`}
                  onClick={() => {
                    onSetRole(r);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                    r === role ? "bg-glass/14" : "hover:bg-glass/8"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("h-2 w-2 shrink-0 rounded-full border", ROLE_DOT[r])}
                  />
                  <span className="type-body grow truncate text-content">{ROLE_LABEL[r]}</span>
                  {r === role && <Icon name="check" size={13} className="shrink-0 text-content" />}
                </button>
              ))}
            </div>
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}

/**
 * The asset library, reduced to one question: which mesh?
 *
 * INLINE, NOT A POPOVER. It was a popover first, and the dock's own
 * `overflow-y-auto` clipped it — the list opened and was cut off two rows down.
 * Rendering in flow removes the clipping rather than fighting it with a portal,
 * and in a 456px column a full-width list is easier to read than a floating one
 * anyway.
 */
function AssetPicker({
  assets,
  title,
  onPick,
  onCancel,
}: {
  assets: Asset[];
  /** what choosing will do — "Place a mesh" vs "Replace with" */
  title: string;
  onPick: (a: Asset) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => a.name.toLowerCase().includes(q));
  }, [assets, query]);

  return (
    <div
      data-ui="terragen-asset-picker"
      className="mb-2 rounded-xl border border-glass/15 bg-glass/8 p-2"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="type-eyebrow grow text-content-muted">{title}</span>
        <button
          type="button"
          aria-label="Cancel"
          data-ui="terragen-picker-cancel"
          onClick={onCancel}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/20 hover:text-content"
        >
          <Icon name="close" size={12} />
        </button>
      </div>

      <SearchInput
        value={query}
        onValueChange={setQuery}
        ui="terragen-picker-search"
        placeholder="Search meshes"
        className="mb-2"
      />

      {shown.length === 0 ? (
        <p className="type-caption px-1 py-2 text-content-subtle">
          {query ? `No meshes match "${query}".` : "No meshes in the library yet."}
        </p>
      ) : (
        <ul className="max-h-[220px] space-y-0.5 overflow-y-auto">
          {shown.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                data-ui={`terragen-pick-${a.id}`}
                onClick={() => onPick(a)}
                className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-glass/12"
              >
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md">
                  <AssetThumb type={a.type} seed={a.seed} />
                </span>
                <span className="type-body min-w-0 grow truncate text-content">{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
