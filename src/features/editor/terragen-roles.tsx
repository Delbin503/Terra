import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { Pill } from "./ui";
import { isContentObject, ROLE_BADGE, ROLE_CHIP, ROLE_DOT, ROLE_HINT, type ObjectRole } from "./scene-types";
import type { SceneApi } from "./useScene";
import type { SceneRoles } from "./work-order";
import { Cost, Group, Note, PickerBar } from "./terragen-parts";

/**
 * SCENE ROLES — one panel for background, distractor and unassigned objects.
 *
 * WHY THEY MERGED. Background Object and Distractor Objects used to be two axes
 * with two editors, each of which opened by telling you that nothing was marked
 * with its role — because the marking happened somewhere else entirely, in the
 * viewport toolbar. Two panels whose main job was to complain about a third
 * panel is not a model, so the marking moved here: this is where you say what
 * each object IS, in bulk, against the whole scene at once.
 *
 * WHY IT ISN'T AN AXIS. Roles are scene state. They decide what the annotations
 * call each object and what the detector is being taught to ignore; they do not
 * multiply subsets. Nothing here changes the size of the run, which is why the
 * section carries no switch.
 *
 * Master is deliberately absent — it belongs with the cameras that orbit it,
 * and it is exactly-one where these are many.
 */
export function RolesSection({
  scene,
  roles,
  onAutoAssignRoles,
}: {
  scene: SceneApi;
  roles: SceneRoles;
  onAutoAssignRoles: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const assignable = useMemo(
    () => scene.objects.filter((o) => isContentObject(o)),
    [scene.objects]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignable.filter((o) => o.name.toLowerCase().includes(q));
  }, [assignable, query]);

  // A selection can outlive the objects it named — delete one from the
  // viewport, come back, and the count would still claim it. Intersecting with
  // what is actually here keeps the assign bar honest.
  const live = picked.filter((id) => assignable.some((o) => o.id === id));

  const assign = (role: ObjectRole) => {
    live.forEach((id) => scene.setRole(id, role));
    setPicked([]);
  };

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div data-ui="terragen-editor-roles">
      <Cost>
        What each object IS, for the annotations. Roles don't change the size of the run.
      </Cost>

      <Group title="In scene" hint={`${roles.backgroundObjects.length} background · ${roles.distractors.length} distractor`}>
        {assignable.length === 0 ? (
          <Note tone="warn">
            No objects in the scene yet. Place something from the library and it will show up here.
          </Note>
        ) : (
          <>
            <PickerBar
              query={query}
              onQuery={setQuery}
              ui="terragen-roles-search"
              placeholder="Search objects in the scene"
              shown={shown.length}
              selected={live.length}
              onSelectAll={() =>
                setPicked(Array.from(new Set([...live, ...shown.map((o) => o.id)])))
              }
              onClear={() => setPicked([])}
            />

            <div
              data-ui="terragen-roles-list"
              className="max-h-[260px] space-y-1 overflow-y-auto pr-0.5"
            >
              {shown.length === 0 ? (
                <Note>No object matches "{query}".</Note>
              ) : (
                shown.map((o) => {
                  const checked = live.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      data-ui={`terragen-role-row-${o.id}`}
                      onClick={() => toggle(o.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                        checked
                          ? "border-brand/45 bg-brand/10"
                          : "border-glass/10 bg-glass/5 hover:border-glass/25"
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded border",
                          checked ? "border-brand bg-brand text-brand-foreground" : "border-glass/25"
                        )}
                      >
                        {checked && <Icon name="check" size={11} />}
                      </span>
                      <span
                        aria-hidden
                        className={cn("h-2.5 w-2.5 shrink-0 rounded-full border", ROLE_DOT[o.role])}
                      />
                      <span className="type-body grow truncate text-content">{o.name}</span>
                      {o.role !== "none" && (
                        <span
                          className={cn(
                            "type-caption-strong shrink-0 rounded-md border px-2 py-0.5",
                            ROLE_CHIP[o.role]
                          )}
                        >
                          {ROLE_BADGE[o.role]}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </Group>

      {assignable.length > 0 && (
        <>
          {/* The assign bar acts on the selection, so it says what the selection
              is. A row of role buttons that silently did nothing because
              nothing was ticked is the failure this label prevents. */}
          <Group title="Mark selected" hint={live.length > 0 ? `${live.length} selected` : "select some first"}>
            <div className="flex flex-wrap gap-2">
              <RoleButton role="background" disabled={live.length === 0} onClick={() => assign("background")} />
              <RoleButton role="distractor" disabled={live.length === 0} onClick={() => assign("distractor")} />
              <RoleButton role="none" disabled={live.length === 0} onClick={() => assign("none")} />
            </div>

            <dl className="mt-3 space-y-1.5">
              <RoleHint role="background" />
              <RoleHint role="distractor" />
            </dl>
          </Group>

          <Group title="Automatic">
            <Button variant="outline" size="sm" onClick={onAutoAssignRoles}>
              <Icon name="ai" size={15} />
              Let AI assign roles
            </Button>
            <p className="type-caption mt-1.5 text-content-subtle">
              Sorts every unassigned object into background or distractor by what it is and where it
              stands. You can correct anything it gets wrong from the list above.
            </p>
          </Group>
        </>
      )}
    </div>
  );
}

function RoleButton({
  role,
  disabled,
  onClick,
}: {
  role: ObjectRole;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-ui={`terragen-assign-${role}`}
      onClick={onClick}
      className={cn(
        "type-caption-strong flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors",
        ROLE_CHIP[role],
        disabled ? "pointer-events-none opacity-40" : "hover:brightness-110"
      )}
    >
      <span aria-hidden className={cn("h-2 w-2 rounded-full border", ROLE_DOT[role])} />
      {role === "none" ? "Clear role" : ROLE_BADGE[role]}
    </button>
  );
}

function RoleHint({ role }: { role: ObjectRole }) {
  return (
    <div className="flex items-start gap-2">
      <Pill ui={`role-hint-${role}`} tone="muted">
        {ROLE_BADGE[role]}
      </Pill>
      <span className="type-caption pt-0.5 text-content-subtle">{ROLE_HINT[role]}</span>
    </div>
  );
}
