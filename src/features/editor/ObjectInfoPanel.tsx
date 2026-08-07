import { useState } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  Panel,
  PanelHeader,
  PanelTitle,
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

  return (
    <Panel
      ui="object-info"
      className="fixed bottom-6 right-6 top-20 z-40 w-[320px] max-w-[calc(100vw-3rem)]"
    >
      <PanelHeader align="start" className="px-3.5">
        <PanelTitle>{editing ? "Edit Asset" : object.name}</PanelTitle>
        <PanelClose size="sm" label="Close info" onClick={onClose} />
      </PanelHeader>

      <PanelBody className="p-3.5">
        <div
          className="mb-3.5 grid aspect-[16/10] place-items-center overflow-hidden rounded-xl ring-1 ring-glass/10"
          style={{ background: object.color }}
        >
          <Icon name="input-3d" size={28} className="text-white/70" />
        </div>

        {editing ? (
          <div className="flex flex-col gap-4">
            <Field label="Asset Name" required>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} />
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
          </div>
        ) : (
          <>
            {object.isMaster && (
              <Pill ui="master" tone="master" icon="master" className="mb-3">
                Master Object
              </Pill>
            )}

            <PanelSection title="Description">
              <p className="type-body-dense leading-relaxed text-content">{object.description}</p>
            </PanelSection>

            <div className="my-3 h-px bg-glass/10" />

            <PanelSection title="Details">
              <dl>
                <PanelRow label="Type" value={SOURCE_LABEL[object.source]} numeric />
                <PanelRow label="Master Object" value={object.isMaster ? "Yes" : "No"} numeric />
                <PanelRow
                  label="Position"
                  value={object.position.map((n) => n.toFixed(1)).join(", ")}
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

            <div className="mt-4 flex flex-col">
              <PanelAction icon="edit" onClick={() => setEditing(true)}>
                Edit Asset
              </PanelAction>
              <PanelAction icon="trash" tone="danger" onClick={onDelete}>
                Delete
              </PanelAction>
            </div>
          </>
        )}
      </PanelBody>

      {editing && (
        <PanelFooter>
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
        </PanelFooter>
      )}
    </Panel>
  );
}



