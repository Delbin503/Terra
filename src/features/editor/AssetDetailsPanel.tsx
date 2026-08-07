import { useState } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  Panel, PanelHeader, PanelTitle, PanelSubtitle, PanelClose, PanelBody,
  PanelFooter, PanelSection, PanelRow, PanelAction, Pill,
  Field, TextInput, TextArea, Select,
} from "./ui";
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
    <Panel
      ui="asset-details"
      className="fixed bottom-6 right-6 top-6 z-30 w-[440px] max-w-[calc(100vw-3rem)]"
    >
      <PanelHeader align="start" className="p-5">
        <div className="min-w-0">
          <PanelTitle className="type-title">{editing ? "Edit Asset" : asset.name}</PanelTitle>
          {!editing && <PanelSubtitle>Created {d.createdAt} · {d.owner}</PanelSubtitle>}
        </div>
        <PanelClose label="Close details" onClick={onClose} />
      </PanelHeader>

      <PanelBody className="p-5">
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
            <PanelSection title="Description">
              <p className="type-body leading-relaxed text-content">{d.description}</p>
            </PanelSection>

            <PanelSection title="Smart Tags">
              <Chips items={d.smartTags} smart />
            </PanelSection>

            <PanelSection title="Manual Tags">
              <Chips items={d.manualTags} />
            </PanelSection>

            <div className="my-4 h-px bg-glass/10" />

            <PanelSection title="Details">
              <dl>
                <PanelRow label="Saved In" value={d.savedIn} />
                <PanelRow label="Type" value={d.typeLabel} />
                <PanelRow label="Format" value={<Pill ui="format">{d.format}</Pill>} />
                <PanelRow label="Size" value={d.size} />
                <PanelRow label="Dimensions" value={d.dimensions} />
                <PanelRow label="Owner" value={d.owner} />
                <PanelRow label="Date Created" value={d.createdAt} />
              </dl>
            </PanelSection>

            <div className="mt-5 flex flex-col">
              <PanelAction icon="edit" onClick={() => setEditing(true)}>
                Edit Asset
              </PanelAction>
              <PanelAction icon="trash" tone="danger" onClick={() => onDelete(asset)}>
                Delete
              </PanelAction>
            </div>
          </>
        )}
      </PanelBody>

      {editing && (
        <PanelFooter className="gap-3 p-4">
          <Button variant="secondary" size="lg" className="flex-1 !rounded-xl" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button variant="brand" size="lg" className="flex-1 !rounded-xl" onClick={save} data-ui="details-save">
            Save Changes
          </Button>
        </PanelFooter>
      )}
    </Panel>
  );
}


function Chips({ items, smart }: { items: string[]; smart?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <Pill key={t} ui={t} size="md" icon={smart ? "generate" : undefined}>
          {t}
        </Pill>
      ))}
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
  return (
    <div className="flex flex-col gap-4">
      <Field label="Asset Name" required>
        <TextInput size="md" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Type" required>
        <Select size="md" value={type} onChange={(e) => setType(e.target.value as AssetType)}>
          <option value="image">Image</option>
          <option value="environment">Environment</option>
          <option value="video">Video</option>
          <option value="mesh">3D Mesh</option>
        </Select>
      </Field>
      <Field label="Description" required>
        <TextArea
          size="md"
          className="min-h-[110px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Smart Tags" required>
        <Chips items={smartTags} smart />
      </Field>
      <Field label="Manual Tags" required>
        <div data-ui="field-manual-tags-add" className="field-well type-body flex items-center gap-2 rounded-xl border border-dashed border-glass/20 px-3.5 py-3 text-content-subtle">
          <Icon name="create" size={15} />
          Add new tag
        </div>
      </Field>
    </div>
  );
}

