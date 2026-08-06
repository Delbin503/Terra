import { useState } from "react";
import { GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SOURCE_LABEL, type SceneObject } from "./scene-types";
import type { AssetType } from "./assets-data";

const TYPES: AssetType[] = ["image", "environment", "video", "mesh"];

/**
 * ObjectInfoPanel — right-docked details for the focused scene object, opened
 * from "View Info" under the object title. View mode shows description, tags and
 * the details table; Edit Asset swaps to an inline form that commits via
 * onUpdate. Mirrors AssetDetailsPanel's shape, but reads a SceneObject rather
 * than a library Asset.
 */
export function ObjectInfoPanel({
  object,
  onClose,
  onUpdate,
  onDelete,
}: {
  object: SceneObject;
  onClose: () => void;
  onUpdate: (patch: Partial<SceneObject>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(object.name);
  const [type, setType] = useState<AssetType>(object.source);
  const [description, setDescription] = useState(object.description);

  const save = () => {
    onUpdate({ name: name.trim() || object.name, source: type, description });
    setEditing(false);
  };

  const cancel = () => {
    setName(object.name);
    setType(object.source);
    setDescription(object.description);
    setEditing(false);
  };

  const field =
    "w-full rounded-lg border border-glass/14 bg-black/20 px-2.5 py-2 text-xs text-content outline-none focus:border-brand/60";

  return (
    <GlassPanel
      ui="object-info-panel"
      thickness="thick"
      className="pointer-events-auto fixed bottom-6 right-6 top-20 z-40 flex w-[320px] max-w-[calc(100vw-3rem)] flex-col !rounded-3xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-glass/10 px-3.5 py-3">
        <h2 className="truncate font-display text-sm font-semibold text-content">
          {editing ? "Edit Asset" : object.name}
        </h2>
        <button
          type="button"
          aria-label="Close info"
          data-ui="object-info-close"
          onClick={onClose}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-content-muted hover:bg-glass/15 hover:text-content"
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        <div
          className="mb-3.5 grid aspect-[16/10] place-items-center overflow-hidden rounded-xl ring-1 ring-glass/10"
          style={{ background: object.color }}
        >
          <Icon name="input-3d" size={28} className="text-white/70" />
        </div>

        {editing ? (
          <div className="flex flex-col gap-4">
            <Field label="Asset Name" required>
              <input
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-ui="object-edit-name"
              />
            </Field>
            <Field label="Type" required>
              <select
                className={field}
                value={type}
                onChange={(e) => setType(e.target.value as AssetType)}
                data-ui="object-edit-type"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" required>
              <textarea
                className={field + " min-h-[110px] resize-y leading-relaxed"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-ui="object-edit-description"
              />
            </Field>
          </div>
        ) : (
          <>
            {object.isMaster && (
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-master/55 bg-master/15 px-2 py-0.5 text-2xs font-medium text-master">
                <Icon name="master" size={11} />
                Master Object
              </span>
            )}

            <Section title="Description">
              <p className="text-xs leading-relaxed text-content">{object.description}</p>
            </Section>

            <div className="my-3 h-px bg-glass/10" />

            <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-content-muted">Details</h3>
            <dl className="text-sm">
              <Row k="Type" v={SOURCE_LABEL[object.source]} />
              <Row k="Master Object" v={object.isMaster ? "Yes" : "No"} />
              <Row
                k="Position"
                v={object.position.map((n) => n.toFixed(1)).join(", ")}
              />
              <Row k="Scale" v={`${object.scale[0].toFixed(2)}×`} />
              <Row
                k="Color"
                v={
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-3 w-3 rounded-full ring-1 ring-glass/25"
                      style={{ background: object.color }}
                    />
                    <span className="uppercase tabular-nums">{object.color}</span>
                  </span>
                }
              />
            </dl>

            <div className="mt-4 flex flex-col">
              <button
                type="button"
                data-ui="object-info-edit"
                onClick={() => setEditing(true)}
                className="flex items-center gap-2.5 border-b border-glass/8 py-2.5 text-sm font-medium text-content transition-colors hover:text-brand"
              >
                <Icon name="edit" size={15} />
                Edit Asset
              </button>
              <button
                type="button"
                data-ui="object-info-delete"
                onClick={onDelete}
                className="flex items-center gap-2.5 py-2.5 text-sm font-medium text-danger transition-colors hover:brightness-110"
              >
                <Icon name="trash" size={15} />
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {editing && (
        <div className="flex gap-2.5 border-t border-glass/10 p-3">
          <Button variant="secondary" className="h-9 flex-1 !rounded-lg text-xs" onClick={cancel}>
            Cancel
          </Button>
          <Button
            variant="brand"
            className="h-9 flex-1 !rounded-lg text-xs"
            onClick={save}
            data-ui="object-info-save"
          >
            Save Changes
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-content-muted">{title}</h3>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-glass/6 py-2 last:border-0">
      <dt className="text-content-muted">{k}</dt>
      <dd className="text-2xs tabular-nums text-content-subtle">{v}</dd>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-content-muted">
        {label} {required && <span className="text-brand">*</span>}
      </span>
      {children}
    </label>
  );
}
