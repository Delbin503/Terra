import { useState } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  Panel, PanelHeader, PanelTitle, PanelSubtitle, PanelClose, PanelBody,
  PanelFooter, PanelSection, PanelRow, PanelAction, Pill,
  Field, TextInput, TextArea, Select,
} from "./ui";
import { AssetThumb } from "./AssetThumb";
import { deriveDetails, suggestSmartTags, type Asset, type AssetType } from "./assets-data";

/** null = viewing · "rename" = name only · "full" = name, type, description, tags. */
type EditMode = "rename" | "full" | null;

/**
 * AssetDetailsPanel — right-docked details for a library asset, opened from
 * "View Info". Shares its shape with ObjectInfoPanel: same width, paddings,
 * header, section rhythm and action rows, so the two info cards read as one
 * component looking at two different things.
 *
 * WHAT'S EDITABLE depends on whose asset it is. An upload belongs to the user,
 * so it gets the full form plus Delete. A library asset does not — the most it
 * accepts is a rename, and offering a Delete that can't be honoured is worse
 * than not offering it.
 *
 * THE ACTIONS ARE PINNED. Edit / Delete / Save live in the footer rather than
 * at the end of the body: this card is as tall as the viewport and its detail
 * list grows, so an action parked after the list is an action you have to go
 * looking for.
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
  const owned = Boolean(asset.uploaded);

  const [mode, setMode] = useState<EditMode>(null);
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState<AssetType>(asset.type);
  const [description, setDescription] = useState(d.description);
  const [smartTags, setSmartTags] = useState<string[]>(d.smartTags);
  const [manualTags, setManualTags] = useState<string[]>(d.manualTags);

  const save = () => {
    onUpdate(
      asset.id,
      mode === "full"
        ? { name: name.trim() || asset.name, type, smartTags, manualTags }
        : { name: name.trim() || asset.name }
    );
    setMode(null);
  };

  const cancel = () => {
    setName(asset.name);
    setType(asset.type);
    setDescription(d.description);
    setSmartTags(d.smartTags);
    setManualTags(d.manualTags);
    setMode(null);
  };

  /** Put back any AI tag that was removed, without disturbing the kept ones. */
  const resuggest = () =>
    setSmartTags((prev) => [...new Set([...prev, ...suggestSmartTags(asset)])]);

  return (
    <Panel
      ui="asset-details"
      /* Right edge flush with the action cluster (16px), top hung below it
         (16 margin + 48 bar + 16 gutter) so the card sits under the top row
         instead of running up behind it. */
      className="fixed bottom-6 right-4 top-20 z-30 w-[320px] max-w-[calc(100vw-3rem)]"
    >
      <PanelHeader align="start" className="p-4">
        <div className="min-w-0">
          <PanelTitle>{mode ? (mode === "rename" ? "Rename Asset" : "Edit Asset") : asset.name}</PanelTitle>
          {!mode && <PanelSubtitle>Created {d.createdAt} · {d.owner}</PanelSubtitle>}
        </div>
        <PanelClose size="sm" label="Close details" onClick={onClose} />
      </PanelHeader>

      <PanelBody className="p-4">
        <div className="mb-4 aspect-[16/10] overflow-hidden rounded-xl ring-1 ring-glass/10">
          <AssetThumb type={type} seed={asset.seed} />
        </div>

        {mode ? (
          <div className="flex flex-col gap-4">
            <Field label="Asset Name" required>
              <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {mode === "full" && (
              <>
                <Field label="Type" required>
                  <Select value={type} onChange={(e) => setType(e.target.value as AssetType)}>
                    {/* The four content kinds first — they're what the
                        catalogue is made of — then Image, which is a working
                        file that only ever lives under Uploads. */}
                    <option value="mesh">3D Asset</option>
                    <option value="skybox">Skybox</option>
                    <option value="environment">HDRI Map</option>
                    <option value="splat">Gaussian Splat</option>
                    <option value="image">Image</option>
                  </Select>
                </Field>
                <Field label="Description" required>
                  <TextArea
                    className="min-h-[110px]"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Field>

                {/* Smart tags are the AI's read of the image, so the field
                    offers removal and a re-suggest rather than free entry —
                    typing one by hand would make it a manual tag wearing the
                    AI's badge. */}
                <TagField
                  ui="smart"
                  label="Smart Tags"
                  hint="Generated from the image"
                  smart
                  tags={smartTags}
                  onRemove={(t) => setSmartTags((prev) => prev.filter((x) => x !== t))}
                  onRegenerate={resuggest}
                  empty="No smart tags — regenerate to ask again."
                />

                <TagField
                  ui="manual"
                  label="Manual Tags"
                  hint="Your own labels"
                  tags={manualTags}
                  onAdd={(t) => setManualTags((prev) => (prev.includes(t) ? prev : [...prev, t]))}
                  onRemove={(t) => setManualTags((prev) => prev.filter((x) => x !== t))}
                  empty="No manual tags yet."
                />
              </>
            )}
          </div>
        ) : (
          <>
            {owned && (
              <Pill ui="saved-in" tone="brand" icon="upload" className="mb-3">
                Your upload
              </Pill>
            )}

            <PanelSection title="Description">
              <p className="type-body-dense leading-relaxed text-content">{d.description}</p>
            </PanelSection>

            <PanelSection title="Smart Tags">
              <Chips items={d.smartTags} smart />
            </PanelSection>

            <PanelSection title="Manual Tags">
              <Chips items={d.manualTags} />
            </PanelSection>

            <div className="my-3 h-px bg-glass/10" />

            <PanelSection title="Details">
              <dl>
                <PanelRow label="Saved In" value={d.savedIn} numeric />
                <PanelRow label="Type" value={d.typeLabel} numeric />
                <PanelRow label="Format" value={<Pill ui="format">{d.format}</Pill>} />
                <PanelRow label="Size" value={d.size} numeric />
                <PanelRow label="Dimensions" value={d.dimensions} numeric />
                <PanelRow label="Owner" value={d.owner} numeric />
                <PanelRow label="Date Created" value={d.createdAt} numeric />
              </dl>
            </PanelSection>
          </>
        )}
      </PanelBody>

      <PanelFooter className={mode ? undefined : "flex-col gap-0 p-0"}>
        {mode ? (
          <>
            <Button variant="secondary" size="sm" className="flex-1 !rounded-lg" onClick={cancel}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" className="flex-1 !rounded-lg" onClick={save} data-ui="details-save">
              Save Changes
            </Button>
          </>
        ) : owned ? (
          <div className="flex w-full flex-col px-4">
            <PanelAction icon="edit" onClick={() => setMode("full")}>
              Edit Asset
            </PanelAction>
            <PanelAction icon="trash" tone="danger" onClick={() => onDelete(asset)}>
              Delete
            </PanelAction>
          </div>
        ) : (
          <div className="flex w-full flex-col px-4">
            <PanelAction icon="edit" onClick={() => setMode("rename")}>
              Rename
            </PanelAction>
          </div>
        )}
      </PanelFooter>
    </Panel>
  );
}

function Chips({ items, smart }: { items: string[]; smart?: boolean }) {
  if (items.length === 0) {
    return <p className="type-caption text-content-subtle">None</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <Pill key={t} ui={t} icon={smart ? "generate" : undefined}>
          {t}
        </Pill>
      ))}
    </div>
  );
}

/**
 * An editable tag list. Removal is always available; `onAdd` is what separates
 * a list you author from one the AI hands you, and `onRegenerate` is how you
 * ask for that read again.
 */
function TagField({
  ui,
  label,
  hint,
  tags,
  smart,
  empty,
  onAdd,
  onRemove,
  onRegenerate,
}: {
  ui: string;
  label: string;
  hint: string;
  tags: string[];
  smart?: boolean;
  empty: string;
  onAdd?: (tag: string) => void;
  onRemove: (tag: string) => void;
  onRegenerate?: () => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const value = draft.trim();
    if (!value || !onAdd) return;
    onAdd(value);
    setDraft("");
  };

  return (
    <section data-ui={`asset-details-tags-${ui}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="type-eyebrow text-content-muted">{label}</span>
        {onRegenerate ? (
          <button
            type="button"
            data-ui={`asset-details-tags-${ui}-regenerate`}
            onClick={onRegenerate}
            className="type-caption flex items-center gap-1 text-content-subtle transition-colors hover:text-brand"
          >
            <Icon name="retry" size={11} />
            Regenerate
          </button>
        ) : (
          <span className="type-caption text-content-subtle">{hint}</span>
        )}
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              data-ui={`asset-details-tag-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className="type-caption-strong flex items-center gap-1 rounded-full border border-glass/12 bg-glass/6 py-1 pl-2 pr-1 text-content"
            >
              {smart && <Icon name="generate" size={10} className="text-brand" />}
              {t}
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => onRemove(t)}
                className="grid h-4 w-4 place-items-center rounded-full text-content-subtle transition-colors hover:bg-danger/20 hover:text-danger"
              >
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="type-caption text-content-subtle">{empty}</p>
      )}

      {onAdd && (
        <div className="mt-2 flex gap-1.5">
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="Add a tag"
            data-ui={`asset-details-tags-${ui}-input`}
          />
          <Button variant="secondary" size="sm" className="!rounded-lg" disabled={!draft.trim()} onClick={commit}>
            Add
          </Button>
        </div>
      )}
    </section>
  );
}
