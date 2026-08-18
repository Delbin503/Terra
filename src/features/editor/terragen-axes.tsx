import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { NumberInput } from "./ui";
import { FactorCard } from "./controls-ui";
import type { Asset } from "./assets-data";
import {
  ANNOTATIONS,
  axisValues,
  type AxisId,
  type WorkOrder,
} from "./work-order";
import type { WorkOrderStore } from "./useWorkOrder";
import { Cost, Group, Note, InSceneChip, PickerBar, ThumbTile, Check } from "./terragen-parts";

/**
 * TERRAGEN AXIS EDITORS — the body of each axis section.
 *
 * Every editor obeys the same rule, which is what keeps four unrelated controls
 * reading as one panel: the scene's own value is shown first and cannot be
 * removed. It is value #1 of the axis whether the axis is on or off, so the
 * editor never opens as an empty form asking the user to re-enter what they
 * just built.
 *
 * What an editor does NOT carry is the bill. Frame counts, credits and archive
 * size are stated once, in the dispatch review, where they are a decision
 * rather than ambient noise beside a slider.
 *
 * The axis label and on/off switch are not here either: they live in the
 * accordion row that opens this body (TerraGenDock), because the row has to
 * show them while the body is closed.
 */

export interface EditorProps {
  section: AxisId | "output";
  order: WorkOrder;
  store: WorkOrderStore;
  assets: Asset[];
  /** put a user's own HDRI in the library and onto the Background axis */
  onUploadHdri: (file: File) => void;
}

export function AxisEditor(props: EditorProps) {
  switch (props.section) {
    case "background":
      return <BackgroundEditor {...props} />;
    case "layouts":
      return <LayoutsEditor {...props} />;
    case "output":
      return <OutputEditor {...props} />;
  }
}

/* --- background ----------------------------------------------------------- */

function BackgroundEditor({ order, store, assets, onUploadHdri }: EditorProps) {
  const b = order.background;
  const [query, setQuery] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const hdris = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.type === "environment" &&
          a.id !== b.baseAssetId &&
          a.name.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [assets, b.baseAssetId, query]
  );
  // One source of truth for what the axis is worth — the same call the dispatch
  // review and the subset preview make.
  const count = axisValues(order, "background", assets).length;

  const setIds = (assetIds: string[]) => store.patch("background", { assetIds });

  return (
    <div data-ui="terragen-editor-background">
      <Cost>
        {b.on
          ? `${count} environment${count === 1 ? "" : "s"} — one subset each`
          : b.baseLabel
            ? `Off — every frame keeps ${b.baseLabel}.`
            : "Off — and no environment is placed."}
      </Cost>

      <Group title="In scene">
        {b.baseLabel ? (
          <InSceneChip label={b.baseLabel} />
        ) : (
          <Note tone="warn">
            No environment in the scene. Place an HDRI from the library — this axis varies the
            background, it can't supply the first one.
          </Note>
        )}
      </Group>

      <Group title="Add environments" hint={`${b.assetIds.length} selected`}>
        <PickerBar
          query={query}
          onQuery={setQuery}
          ui="terragen-hdri-search"
          shown={hdris.length}
          selected={b.assetIds.length}
          onSelectAll={() =>
            setIds(Array.from(new Set([...b.assetIds, ...hdris.map((a) => a.id)])))
          }
          onClear={() => setIds([])}
        />

        {hdris.length === 0 ? (
          <Note>
            {query ? `No environments match "${query}".` : "No other environments in the library yet."}
          </Note>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {hdris.map((a) => (
              <ThumbTile
                key={a.id}
                asset={a}
                selected={b.assetIds.includes(a.id)}
                onClick={() =>
                  setIds(
                    b.assetIds.includes(a.id)
                      ? b.assetIds.filter((id) => id !== a.id)
                      : [...b.assetIds, a.id]
                  )
                }
              />
            ))}
          </div>
        )}

        {/* Upload lands in the library first, then onto the axis — an HDRI that
            existed only inside a Work Order would be unreachable the next time
            you built one. */}
        <input
          ref={file}
          type="file"
          accept=".hdr,.exr,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadHdri(f);
            e.target.value = "";
          }}
        />
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => file.current?.click()}>
          <Icon name="upload" size={15} />
          Upload HDRI
        </Button>
      </Group>
    </div>
  );
}

/* --- AI layouts ----------------------------------------------------------- */

function LayoutsEditor({ order, store }: EditorProps) {
  const l = order.layouts;
  const [draft, setDraft] = useState("");

  const addConcept = () => {
    const v = draft.trim();
    if (!v || l.concepts.includes(v)) return;
    store.patch("layouts", { concepts: [...l.concepts, v] });
    setDraft("");
  };

  return (
    <div data-ui="terragen-editor-layouts">
      <Cost>
        {l.on
          ? `${l.count} arrangements — one subset each`
          : "Off — objects stay exactly where you placed them."}
      </Cost>

      <Note>
        TerraArrange authors these arrangements; TerraGen only executes them. This is a request,
        not a placement tool — you'll see what came back before anything renders.
      </Note>

      <div className="mt-4">
        <Group title="How many">
          <FactorCard
            label="Arrangements"
            value={l.count}
            min={1}
            max={24}
            step={1}
            precision={0}
            onChange={(v) => store.patch("layouts", { count: v })}
          />
        </Group>

        <Group title="Volume" hint="metres">
          <div className="grid grid-cols-3 gap-2">
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <NumberInput
                key={axis}
                bordered
                className="w-full text-left"
                aria-label={`Volume ${axis}`}
                value={l.volume[i]}
                min={1}
                step={0.5}
                onChange={(e) => {
                  const next = [...l.volume] as [number, number, number];
                  next[i] = parseFloat(e.target.value) || 1;
                  store.patch("layouts", { volume: next });
                }}
              />
            ))}
          </div>
        </Group>

        <Group title="Concepts to scatter" hint={`${l.concepts.length} listed`}>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addConcept();
                }
              }}
              placeholder="traffic cone, kerb, bollard…"
              data-ui="terragen-concept-input"
              className="field-well type-body w-full rounded-lg border px-2.5 py-2 text-content outline-none placeholder:text-content-subtle"
            />
            <Button variant="secondary" size="sm" onClick={addConcept} disabled={!draft.trim()}>
              Add
            </Button>
          </div>
          {l.concepts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {l.concepts.map((c) => (
                <button
                  key={c}
                  type="button"
                  data-ui={`terragen-concept-${c.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  onClick={() =>
                    store.patch("layouts", { concepts: l.concepts.filter((x) => x !== c) })
                  }
                  className="type-caption-strong flex items-center gap-1 rounded-full border border-glass/12 bg-glass/6 px-2.5 py-1 text-content hover:border-danger/40 hover:text-danger"
                >
                  {c}
                  <Icon name="close" size={11} />
                </button>
              ))}
            </div>
          )}
        </Group>

        <Button variant="outline" size="sm" disabled>
          <Icon name="ai" size={15} />
          Preview layouts
        </Button>
        <p className="type-caption mt-1.5 text-content-subtle">
          Previews arrive with the TerraArrange service.
        </p>
      </div>
    </div>
  );
}

/* --- output --------------------------------------------------------------- */

function OutputEditor({ order, store }: EditorProps) {
  const o = order.output;
  const perFrame = ANNOTATIONS.filter((a) => a.scope === "frame");
  const perVideo = ANNOTATIONS.filter((a) => a.scope === "video");

  return (
    <div data-ui="terragen-editor-output">
      <Cost>
        What TerraGen computes for every frame. This doesn't change the frame count — it changes
        what comes back in the archive.
      </Cost>

      <Group title="Dataset type">
        <div className="space-y-2">
          <Check
            label="Static images"
            checked={o.images}
            onChange={() => store.setOutput({ images: !o.images })}
          />
          <Check label="Video" checked={false} disabled comingSoon onChange={() => {}} />
        </div>
      </Group>

      <Group title="Per-frame annotations" hint="applies to images">
        <div className="space-y-2">
          {perFrame.map((a) => (
            <Check
              key={a.id}
              label={a.label}
              note={a.note}
              comingSoon={a.comingSoon}
              disabled={a.comingSoon || !o.images}
              checked={o.annotations[a.id]}
              onChange={() => store.toggleAnnotation(a.id)}
            />
          ))}
        </div>
      </Group>

      <Group title="Per-video annotations" hint="needs the Video type">
        <div className="space-y-2">
          {perVideo.map((a) => (
            <Check
              key={a.id}
              label={a.label}
              note={a.note}
              comingSoon
              disabled
              checked={false}
              onChange={() => {}}
            />
          ))}
        </div>
      </Group>

      {/* A fact, not a toggle — MAT runs as a post-render step either way. */}
      <div className="flex items-center gap-2 rounded-lg border border-glass/10 bg-glass/6 px-2.5 py-2">
        <Icon name="mat" size={14} className="text-accent" />
        <span className="type-body text-content-muted">
          MAT photorealism is applied to every frame after render.
        </span>
      </div>

      <p className="type-caption mt-3 flex items-center gap-1.5 text-content-subtle">
        <Icon name="info" size={13} className="shrink-0" />
        <span>Frames, archive size and credits are shown in the dispatch review.</span>
      </p>
    </div>
  );
}
