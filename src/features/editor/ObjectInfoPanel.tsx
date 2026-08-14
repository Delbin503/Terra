import { useState } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PlaceholderImage } from "./PlaceholderImage";
import {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelSubtitle,
  PanelClose,
  PanelBody,
  PanelFooter,
  PanelSection,
  PanelRow,
  PanelAction,
  Field,
  TextInput,
  TextArea,
  Select,
  Pill,
} from "./ui";
import {
  ROLE_LABEL,
  ROLE_PILL_TONE,
  SOURCE_LABEL,
  canTakeRole,
  type SceneObject,
} from "./scene-types";
import { defaultManualTags, defaultSmartTags, type AssetType } from "./assets-data";

const TYPES: AssetType[] = ["image", "environment", "video", "mesh"];

/** A stable number from an object id, so its default tags don't reshuffle. */
function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 997;
}

/**
 * ObjectInfoPanel — right-docked details for the focused scene object, opened
 * from "View Info" under the object title.
 *
 * DELIBERATELY THE SAME CARD AS `AssetDetailsPanel`. Same width and insets, same
 * header, the same thumbnail → Description → Smart Tags → Manual Tags → rule →
 * Details rhythm, and the same pinned footer. The two answer the same question
 * ("what is this thing?") about a library asset and about a placed object, and
 * when they diverged the placed-object one read as a different, lesser panel:
 * no tags at all, and its actions parked at the end of a scrolling list where
 * `AssetDetailsPanel` had already learned to pin them.
 *
 * What differs is only what the two things ACTUALLY differ on. A placed object
 * has a transform and a material, so Position / Scale / Color are rows a library
 * asset has no answer for; a library asset has a file, so Format / Size /
 * Dimensions are rows a placed object has no answer for.
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
  const seed = seedOf(object.id);
  const smart = object.smartTags ?? defaultSmartTags(seed);
  const manual = object.manualTags ?? defaultManualTags(seed);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(object.name);
  const [type, setType] = useState<AssetType>(object.source);
  const [description, setDescription] = useState(object.description);
  const [smartTags, setSmartTags] = useState<string[]>(smart);
  const [manualTags, setManualTags] = useState<string[]>(manual);

  const save = () => {
    onUpdate({
      name: name.trim() || object.name,
      source: type,
      description,
      smartTags,
      manualTags,
    });
    setEditing(false);
  };

  const cancel = () => {
    setName(object.name);
    setType(object.source);
    setDescription(object.description);
    setSmartTags(smart);
    setManualTags(manual);
    setEditing(false);
  };

  /** Put back any AI tag that was removed, without disturbing the kept ones. */
  const resuggest = () => setSmartTags((prev) => [...new Set([...prev, ...defaultSmartTags(seed)])]);

  return (
    <Panel
      ui="object-info"
      /* Right edge flush with the action cluster (16px), top hung below it
         (16 margin + 48 bar + 16 gutter) — the same berth AssetDetailsPanel
         takes, one z-layer up so it wins when both could be open. */
      className="fixed bottom-6 right-4 top-20 z-40 w-[320px] max-w-[calc(100vw-3rem)]"
    >
      <PanelHeader align="start" className="p-4">
        <div className="min-w-0">
          <PanelTitle>{editing ? "Edit Object" : object.name}</PanelTitle>
          {!editing && <PanelSubtitle>Placed in scene · {SOURCE_LABEL[object.source]}</PanelSubtitle>}
        </div>
        <PanelClose size="sm" label="Close info" onClick={onClose} />
      </PanelHeader>

      <PanelBody className="p-4">
        <div className="mb-4 aspect-[16/10] overflow-hidden rounded-xl ring-1 ring-glass/10">
          <PlaceholderImage
            className="h-full w-full object-cover"
            fallback={
              <div
                className="grid h-full w-full place-items-center"
                style={{ background: object.color }}
              >
                <Icon name="input-3d" size={28} className="text-white/70" />
              </div>
            }
          />
        </div>

        {editing ? (
          <div className="flex flex-col gap-4">
            <Field label="Object Name" required>
              <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Type" required>
              <Select value={type} onChange={(e) => setType(e.target.value as AssetType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" required>
              <TextArea
                className="min-h-[110px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <TagField
              ui="smart"
              label="Smart Tags"
              hint="Generated from the object"
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
          </div>
        ) : (
          <>
            {object.role !== "none" && (
              <Pill
                ui={`role-${object.role}`}
                tone={ROLE_PILL_TONE[object.role]}
                icon="master"
                className="mb-3"
              >
                {ROLE_LABEL[object.role]}
              </Pill>
            )}

            <PanelSection title="Description">
              <p className="type-body-dense leading-relaxed text-content">{object.description}</p>
            </PanelSection>

            <PanelSection title="Smart Tags">
              <Chips items={smart} smart />
            </PanelSection>

            <PanelSection title="Manual Tags">
              <Chips items={manual} />
            </PanelSection>

            <div className="my-3 h-px bg-glass/10" />

            <PanelSection title="Details">
              <dl>
                <PanelRow label="Saved In" value="This scene" numeric />
                <PanelRow label="Type" value={SOURCE_LABEL[object.source]} numeric />
                {/* Cameras and HDRIs can't take one, so the row would only
                    ever read "No role" — a fact about the app, not the object. */}
                {canTakeRole(object.source) && (
                  <PanelRow label="Role" value={ROLE_LABEL[object.role]} numeric />
                )}
                <PanelRow
                  label="Position"
                  value={object.position.map((n) => n.toFixed(1)).join(", ")}
                  numeric
                />
                <PanelRow
                  label="Rotation"
                  value={object.rotationDeg.map((n) => `${Math.round(n)}°`).join(", ")}
                  numeric
                />
                <PanelRow label="Scale" value={`${object.scale[0].toFixed(2)}×`} numeric />
                <PanelRow
                  label="Color"
                  numeric
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-3 w-3 rounded-full ring-1 ring-glass/25"
                        style={{ background: object.color }}
                      />
                      <span className="type-code-sm uppercase">{object.color}</span>
                    </span>
                  }
                />
              </dl>
            </PanelSection>
          </>
        )}
      </PanelBody>

      {/* Pinned, for the same reason the asset card pins them: this card is as
          tall as the viewport and its detail list grows, so an action parked
          after the list is an action you have to go looking for. */}
      <PanelFooter className={editing ? undefined : "flex-col gap-0 p-0"}>
        {editing ? (
          <>
            <Button variant="secondary" size="sm" className="flex-1 !rounded-lg" onClick={cancel}>
              Cancel
            </Button>
            <Button
              variant="brand"
              size="sm"
              className="flex-1 !rounded-lg"
              onClick={save}
              data-ui="object-info-save"
            >
              Save Changes
            </Button>
          </>
        ) : (
          /* A placed object is the user's own instance — deleting it only
             removes it from this scene, so both actions always apply. */
          <div className="flex w-full flex-col px-4">
            <PanelAction icon="edit" onClick={() => setEditing(true)}>
              Edit Object
            </PanelAction>
            <PanelAction icon="trash" tone="danger" onClick={onDelete}>
              Delete
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
    <section data-ui={`object-info-tags-${ui}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="type-eyebrow text-content-muted">{label}</span>
        {onRegenerate ? (
          <button
            type="button"
            data-ui={`object-info-tags-${ui}-regenerate`}
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
              data-ui={`object-info-tag-${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
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
            data-ui={`object-info-tags-${ui}-input`}
          />
          <Button variant="secondary" size="sm" className="!rounded-lg" disabled={!draft.trim()} onClick={commit}>
            Add
          </Button>
        </div>
      )}
    </section>
  );
}
