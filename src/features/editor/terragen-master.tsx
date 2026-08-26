import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { Panel, PanelBody } from "./ui";
import { AssetThumb } from "./AssetThumb";
import { useDismissable } from "./use-dismissable";
import {
  OBJECT_ROLES,
  ROLE_BADGE,
  ROLE_DOT,
  ROLE_LABEL,
  canTakeRole,
  isContentObject,
  isMaster,
  type ObjectRole,
} from "./scene-types";
import type { Asset } from "./assets-data";
import type { SceneApi } from "./useScene";
import { swapsFor, type ObjectSwap, type SceneRoles, type WorkOrder } from "./work-order";
import type { WorkOrderStore } from "./useWorkOrder";
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
 * WHAT "SWAP" MEANS NOW. It used to replace an object's mesh in the scene, one
 * at a time — so "the same dataset over six chairs" was six visits, each one
 * destroying the scene a little more. Swapping is now a SHORTLIST on the Work
 * Order: the scene keeps the arrangement you posed, and the run renders the
 * same rig, weather and framing once per stand-in.
 *
 * AND IT BELONGS TO THE OBJECT, NOT TO THE SECTION. There was one "Swap
 * objects" block under Master, which said swapping was the master's privilege
 * and left the list a long way from the row it described. Every object can hold
 * one now, and each list lives INSIDE its own row: the card says how many
 * stand-ins it carries, and opens to show them. Nothing about the scene is
 * different, so nothing in the viewport moves.
 *
 * The master is exactly-one and the rest are many, so the master gets the top
 * block and everything else shares the list beneath it.
 */
export function MasterSection({
  scene,
  order,
  store,
  roles,
  assets,
  gizmoMode,
  onGizmoMode,
  onBrowseLibrary,
  onBrowseSwaps,
}: {
  scene: SceneApi;
  order: WorkOrder;
  store: WorkOrderStore;
  roles: SceneRoles;
  assets: Asset[];
  gizmoMode: GizmoMode;
  onGizmoMode: (m: GizmoMode) => void;
  /**
   * Open the real asset library as a bottom sheet.
   *
   * Adding an object is a browse — categories, folders, tags, search, upload —
   * and the inline list here could only ever be a worse copy of the library
   * that already does all of that.
   */
  onBrowseLibrary: () => void;
  /** the same sheet, in the mode where a pick becomes a stand-in for `target` */
  onBrowseSwaps: (target: { id: string; name: string }) => void;
}) {
  const master = roles.master;
  const selected = scene.selected;

  /** Which object's swap list is open. One at a time, like the dock's own
   *  sections — two open lists in a 400px column is a scroll, not a comparison. */
  const [openSwaps, setOpenSwaps] = useState<string | null>(null);

  /**
   * Content objects only — a camera can't be a master and has no role.
   *
   * Groups are out of this LIST while still being promotable from the viewport:
   * every row here carries a swap list, and a group has no asset to swap for
   * another. The Master card above reads whatever holds the role, so a group
   * that is the master still shows up there by name.
   */
  const contents = useMemo(
    () => scene.objects.filter((o) => isContentObject(o)),
    [scene.objects]
  );

  return (
    <div data-ui="terragen-editor-master">
      <Cost>
        The object every camera orbits, and everything else sharing the frame with it. Editing
        here moves the scene itself — only an object's swap list multiplies the run.
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
            <span className="type-caption shrink-0 text-content-subtle">Every camera orbits this</span>
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
          onClick={onBrowseLibrary}
        >
          <Icon name="place" size={14} />
          Add from library
        </Button>

        {contents.length === 0 ? (
          <Note>Nothing placed yet. Add an object from the library to start the scene.</Note>
        ) : (
          <ul className="space-y-1.5">
            {contents.map((o) => (
              <ObjectCard
                key={o.id}
                name={o.name}
                role={o.role}
                swaps={swapsFor(order, o.id)}
                assets={assets}
                selected={selected?.id === o.id}
                swapsOpen={openSwaps === o.id}
                onToggleSwaps={() => setOpenSwaps((id) => (id === o.id ? null : o.id))}
                onSelect={() => scene.select(o.id)}
                onSetRole={(r) => scene.setRole(o.id, r === o.role ? "none" : r)}
                onMakeMaster={() => scene.setRole(o.id, "master")}
                onAddSwaps={() => onBrowseSwaps({ id: o.id, name: o.name })}
                onToggleSwap={(assetId) => store.toggleSwap(o.id, assetId)}
                onRemoveSwap={(assetId) => store.removeSwap(o.id, assetId)}
                onRemove={() => {
                  // The object's swap list goes with it — stand-ins for a thing
                  // that is no longer in the scene would keep multiplying the
                  // run from a row nobody can see.
                  swapsFor(order, o.id).forEach((sw) => store.removeSwap(o.id, sw.assetId));
                  scene.remove(o.id);
                }}
              />
            ))}
          </ul>
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

/**
 * ONE OBJECT, as a card that opens.
 *
 * Closed it is the row it always was — role dot, name, crown, bin — plus one
 * line saying how many stand-ins it carries, because that is the only thing
 * about this object that costs money. Open it is that object's swap list.
 *
 * EVERY SWAP ROW CARRIES ITS OWN CHECKBOX AND ITS OWN BIN, for the reason the
 * weather sets do: shortlisting six meshes is the expensive part, and dropping
 * one out of tonight's run should not mean finding it in the library again
 * tomorrow. Unchecked, a row stays on the list and costs nothing.
 */
function ObjectCard({
  name,
  role,
  swaps,
  assets,
  selected,
  swapsOpen,
  onToggleSwaps,
  onSelect,
  onSetRole,
  onMakeMaster,
  onAddSwaps,
  onToggleSwap,
  onRemoveSwap,
  onRemove,
}: {
  name: string;
  role: ObjectRole;
  swaps: ObjectSwap[];
  assets: Asset[];
  selected: boolean;
  swapsOpen: boolean;
  onToggleSwaps: () => void;
  onSelect: () => void;
  onSetRole: (r: ObjectRole) => void;
  /** promote this object — the crown is a one-click action, not a menu */
  onMakeMaster: () => void;
  onAddSwaps: () => void;
  onToggleSwap: (assetId: string) => void;
  onRemoveSwap: (assetId: string) => void;
  /** take it out of the scene entirely */
  onRemove: () => void;
}) {
  const master = role === "master";
  const inRun = swaps.filter((s) => s.inRun).length;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <li
      data-ui={`terragen-object-${slug}`}
      className={cn(
        "overflow-hidden rounded-lg border transition-colors",
        selected ? "border-brand/45 bg-brand/10" : "border-glass/10 bg-glass/5 hover:border-glass/25"
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* The role dot is the role MENU. It was a decoration next to a crown
            that opened the menu, which left the row with two controls saying
            "role" and neither saying "make this the master". */}
        <RoleMenu role={role} onSetRole={onSetRole} />
        {/* Selecting is the row's primary action — it is what puts the gizmo on
            this object in the viewport to the left. */}
        <button type="button" onClick={onSelect} className="min-w-0 grow text-left">
          <span className="type-body block truncate text-content">{name}</span>
          <span className="type-caption block truncate text-content-subtle">
            {role !== "none" && `${ROLE_BADGE[role]} · `}
            {swaps.length === 0
              ? "No swap objects"
              : `${inRun} of ${swaps.length} swap object${swaps.length === 1 ? "" : "s"} selected`}
          </span>
        </button>
        {/* THE CROWN PROMOTES, IMMEDIATELY. It used to open the role menu, so
            the most common thing anyone does in this list — "no, THAT one is
            the hero" — was two clicks behind an icon that already meant
            master. */}
        <button
          type="button"
          aria-pressed={master}
          aria-label={master ? `${name} is the master object` : `Make ${name} the master object`}
          title={master ? "This is the master object" : "Make this the master object"}
          data-ui={`terragen-make-master-${slug}`}
          onClick={onMakeMaster}
          disabled={master}
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors",
            master
              ? "cursor-default bg-master/15 text-master"
              : "text-content-muted hover:bg-glass/15 hover:text-master"
          )}
        >
          <Icon name="master" size={14} />
        </button>
        {/* Icon-only, and the only red thing on the row: deleting is the one
            action here you can't take back by clicking the same button again. */}
        <button
          type="button"
          aria-label={`Remove ${name} from the scene`}
          title={`Remove ${name} from the scene`}
          data-ui={`terragen-remove-${slug}`}
          onClick={onRemove}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-danger-soft/40 hover:text-danger"
        >
          <Icon name="trash" size={14} />
        </button>
        <button
          type="button"
          aria-expanded={swapsOpen}
          aria-label={`Swap objects for ${name}`}
          title="Swap objects"
          data-ui={`terragen-swaps-${slug}`}
          onClick={onToggleSwaps}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
        >
          <Icon
            name="chevron-down"
            size={14}
            className={cn("transition-transform", swapsOpen && "rotate-180")}
          />
        </button>
      </div>

      {swapsOpen && (
        <div className="border-t border-glass/10 px-2.5 py-2.5">
          <Button
            variant="secondary"
            size="sm"
            data-ui={`terragen-add-swap-${slug}`}
            className="mb-2 w-full"
            onClick={onAddSwaps}
          >
            <Icon name="retry" size={14} />
            Add swap objects
          </Button>

          {swaps.length === 0 ? (
            <Note>
              None. The run renders {name} as it stands — add a stand-in to render the same sweep
              over another mesh.
            </Note>
          ) : (
            <>
              <ul className="space-y-1">
                {swaps.map((sw) => {
                  const asset = assets.find((a) => a.id === sw.assetId);
                  return (
                    <li
                      key={sw.assetId}
                      data-ui={`terragen-swap-${sw.assetId}`}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                        sw.inRun ? "border-brand/40 bg-brand/8" : "border-glass/12 bg-glass/6"
                      )}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={sw.inRun}
                        aria-label={`Render ${sw.name} in place of ${name}`}
                        data-ui={`terragen-swap-${sw.assetId}-inrun`}
                        onClick={() => onToggleSwap(sw.assetId)}
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                          sw.inRun ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                        )}
                      >
                        {sw.inRun && <Icon name="check" size={11} strokeWidth={3} />}
                      </button>

                      <span className="h-7 w-7 shrink-0 overflow-hidden rounded-md">
                        {asset ? (
                          <AssetThumb type={asset.type} seed={asset.seed} />
                        ) : (
                          <span className="block h-full w-full bg-glass/12" />
                        )}
                      </span>

                      <span className="type-body min-w-0 grow truncate text-content">{sw.name}</span>

                      <button
                        type="button"
                        aria-label={`Remove ${sw.name} from ${name}'s swap list`}
                        title={`Remove ${sw.name}`}
                        data-ui={`terragen-swap-${sw.assetId}-remove`}
                        onClick={() => onRemoveSwap(sw.assetId)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-danger-soft/40 hover:text-danger"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <p className="type-caption mt-2 text-content-subtle">
                {inRun > 0
                  ? `This object renders ${inRun + 1} ways — once as ${name}, once per checked stand-in. Nothing in the viewport moves.`
                  : "Nothing checked — the run renders this object as it stands."}
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** The role picker, hung off the row's own role dot. */
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
        title={`Role: ${ROLE_LABEL[role]}`}
        data-ui="terragen-role-menu"
        onClick={() => setOpen((o) => !o)}
        className="grid h-6 w-6 place-items-center rounded-md transition-colors hover:bg-glass/15"
      >
        <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full border", ROLE_DOT[role])} />
      </button>

      {open && (
        <Panel
          ui="terragen-role"
          thickness="overlay"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[212px] !rounded-xl"
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
