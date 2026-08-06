import { useState } from "react";
import { GlassPanel } from "@/components/glass";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AssetThumb } from "./AssetThumb";
import { deriveDetails, type Asset, type AssetType } from "./assets-data";

/**
 * AssetDetailsPanel — right-docked glass panel. View mode shows preview,
 * description, smart + manual tags, and the details table with Edit/Delete.
 * Edit mode is an inline form → Save Changes commits via onUpdate.
 */
export function AssetDetailsPanel({
  asset,
  onClose,
  onUpdate,
  onDelete,
}: {
  asset: Asset;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Asset>) => void;
  onDelete: (a: Asset) => void;
}) {
  const d = deriveDetails(asset);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState<AssetType>(asset.type);
  const [description, setDescription] = useState(d.description);

  const save = () => {
    onUpdate(asset.id, { name: name.trim() || asset.name, type });
    setEditing(false);
  };

  return (
    <GlassPanel
      ui="asset-details-panel"
      thickness="thick"
      className="pointer-events-auto fixed bottom-6 right-6 top-6 z-30 flex w-[440px] max-w-[calc(100vw-3rem)] flex-col !rounded-3xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-glass/10 p-5">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-bold text-content">
            {editing ? "Edit Asset" : asset.name}
          </h2>
          {!editing && (
            <p className="mt-1 text-xs text-content-subtle">Created {d.createdAt} · {d.owner}</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close details"
          data-ui="details-close"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-muted hover:bg-glass/15 hover:text-content"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {/* Preview */}
        <div className="mb-5 aspect-[16/10] overflow-hidden rounded-2xl ring-1 ring-glass/10">
          <AssetThumb type={type} seed={asset.seed} />
        </div>

        {editing ? (
          <EditForm
            name={name}
            setName={setName}
            type={type}
            setType={setType}
            description={description}
            setDescription={setDescription}
            smartTags={d.smartTags}
          />
        ) : (
          <>
            <Section title="Description">
              <p className="text-sm leading-relaxed text-content">{d.description}</p>
            </Section>

            <Section title="Smart Tags">
              <Chips items={d.smartTags} smart />
            </Section>

            <Section title="Manual Tags">
              <Chips items={d.manualTags} />
            </Section>

            <div className="my-4 h-px bg-glass/10" />

            <h3 className="mb-2 text-md font-semibold text-content">Details</h3>
            <dl className="text-sm">
              <Row k="Saved In" v={d.savedIn} />
              <Row k="Type" v={d.typeLabel} />
              <Row k="Format" v={<span className="rounded-md bg-glass/12 px-2 py-0.5 text-xs font-semibold">{d.format}</span>} />
              <Row k="Size" v={d.size} />
              <Row k="Dimensions" v={d.dimensions} />
              <Row k="Owner" v={d.owner} />
              <Row k="Date Created" v={d.createdAt} />
            </dl>

            <div className="mt-5 flex flex-col">
              <button
                type="button"
                data-ui="details-edit"
                onClick={() => setEditing(true)}
                className="flex items-center gap-3 border-b border-glass/8 py-3.5 text-md font-medium text-content transition-colors hover:text-brand"
              >
                <Icon name="edit" size={18} />
                Edit Asset
              </button>
              <button
                type="button"
                data-ui="details-delete"
                onClick={() => onDelete(asset)}
                className="flex items-center gap-3 py-3.5 text-md font-medium text-danger transition-colors hover:brightness-110"
              >
                <Icon name="trash" size={18} />
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {/* Edit footer */}
      {editing && (
        <div className="flex gap-3 border-t border-glass/10 p-4">
          <Button variant="secondary" className="h-11 flex-1 !rounded-xl" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button variant="brand" className="h-11 flex-1 !rounded-xl" onClick={save} data-ui="details-save">
            Save Changes
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">{title}</h3>
      {children}
    </div>
  );
}

function Chips({ items, smart }: { items: string[]; smart?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <span
          key={t}
          className="flex items-center gap-1.5 rounded-lg border border-glass/12 bg-glass/6 px-2.5 py-1.5 text-xs text-content"
        >
          {smart && <Icon name="generate" size={12} className="text-brand" />}
          {t}
        </span>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-glass/6 py-2.5 last:border-0">
      <dt className="text-content-subtle">{k}</dt>
      <dd className="font-medium text-content">{v}</dd>
    </div>
  );
}

function EditForm({
  name,
  setName,
  type,
  setType,
  description,
  setDescription,
  smartTags,
}: {
  name: string;
  setName: (v: string) => void;
  type: AssetType;
  setType: (v: AssetType) => void;
  description: string;
  setDescription: (v: string) => void;
  smartTags: string[];
}) {
  const field = "w-full rounded-xl border border-glass/14 bg-black/20 px-3.5 py-3 text-sm text-content outline-none focus:border-brand/60";
  return (
    <div className="flex flex-col gap-4">
      <Field label="Asset Name" required>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} data-ui="edit-name" />
      </Field>
      <Field label="Type" required>
        <select className={field} value={type} onChange={(e) => setType(e.target.value as AssetType)}>
          <option value="image">Image</option>
          <option value="environment">Environment</option>
          <option value="video">Video</option>
          <option value="mesh">3D Mesh</option>
        </select>
      </Field>
      <Field label="Description" required>
        <textarea
          className={field + " min-h-[110px] resize-y leading-relaxed"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Smart Tags" required>
        <Chips items={smartTags} smart />
      </Field>
      <Field label="Manual Tags" required>
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-glass/20 bg-black/15 px-3.5 py-3 text-sm text-content-subtle">
          <Icon name="create" size={15} />
          Add new tag
        </div>
      </Field>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-content-muted">
        {label} {required && <span className="text-brand">*</span>}
      </span>
      {children}
    </label>
  );
}
