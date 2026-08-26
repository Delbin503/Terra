import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel, GlassGhostButton } from "@/components/glass";
import { DockPanel } from "./panel-dock";
import { Icon, type IconName } from "@/components/icons";
import { AssetThumb } from "./AssetThumb";
import { typeIcon } from "./assets-data";
import { MessagePart, PermissionCardView, RunView, TaskCardView, Thinking } from "./ai-agent-parts";
import { AddObjectFlow } from "./ai-agent-add-flow";
import {
  addTarget,
  captureFollowUp,
  nodeRef,
  planFor,
  STARTERS,
  type AgentContext,
  type NodeRef,
  type Op,
  type Part,
  type Script,
  type Turn,
} from "./ai-agent-script";
import type { SceneApi } from "./useScene";
import type { AssetStore } from "./useAssets";
import type { Asset } from "./assets-data";
import { describeSpawn, matchSpawn, parseSpawn } from "./sab-spawn";
import { arrange, makeRule, newSeed, type Arrangeable } from "./arrange";
import { LOOSE_SPREAD, expandVolume } from "./scene-volume";

/**
 * AiAgentPanel — the conversational agent, docked full-height on the left.
 *
 * Three things shape the layout:
 *
 * The agent's answers carry no bubble. Only the user's side gets one, so the
 * thread reads as *one voice talking to you* with your own asides pinned to the
 * right — the same asymmetry every assistant surface has converged on, and the
 * reason a 380px column can hold a long answer without feeling like a chat log.
 *
 * Work is separated from prose. When the agent does something to the scene it
 * emits a WORK CARD rather than describing it in a sentence: a label, a category
 * glyph, a status, and Undo once it's finished. Prose says what it means; the
 * card says what changed. That split is what makes the transcript auditable, and
 * it's why the card carries the affected objects behind a disclosure.
 *
 * Everything that points at the scene is live. A node chip is not a label — it
 * routes through `scene.select`, so clicking one in the transcript flies the
 * camera exactly as clicking the mesh would. The restyle intent really does
 * mutate the selected object's material, and its Undo really restores it; the
 * remaining intents are scripted (see ai-agent-script.ts), which is where a real
 * model would slot in without this file changing.
 */

const MODELS = [
  { id: "terra", name: "Terra AI", blurb: "Balanced — plans, builds, restyles" },
  { id: "fast", name: "Terra AI Fast", blurb: "Quicker, shallower edits" },
  { id: "pro", name: "Terra AI Pro", blurb: "Long capture plans and audits" },
] as const;

/** Seeded near the cap so the limit warning is visible in this build. */
const USAGE = { used: 17, limit: 20 };

/**
 * What the composer is carrying into the next message.
 *
 * `auto` marks the two chips the panel adds ON THE USER'S BEHALF — the object
 * they have selected in the viewport, and the space they have armed. Both are
 * context they can already see on screen, so putting them in the composer is
 * telling them what the agent will assume rather than asking them to say it
 * again. The flag is what lets an "x" mean "not this time" instead of being
 * undone by the next render.
 */
type Attachment =
  | { id: string; kind: "node"; node: NodeRef; auto?: boolean }
  | { id: string; kind: "space"; volumeId: string; label: string; auto?: boolean }
  | { id: string; kind: "image"; name: string; seed: number; auto?: never }
  | { id: string; kind: "mention"; label: string; auto?: never };

/** Two steps down each channel — enough to read as darker without going muddy. */
function darken(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * 0.68));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** The example the composer offers while a space is armed. It is a real
 *  request — typing it verbatim builds the room it describes. */
const SPACE_PROMPT = "Add in door, chair, two people and a car in this confined space";

export function AiAgentPanel({
  scene,
  store,
  projectName,
  onClose,
  onPlaceAsset,
  onOpenGenerate3D,
  initialPrompt = "",
}: {
  scene: SceneApi;
  /** the asset library — the chatbot pulls objects from it in the add flow */
  store: AssetStore;
  projectName: string;
  onClose: () => void;
  /** drop a library asset into the scene */
  onPlaceAsset: (asset: Asset) => void;
  /** hand off to the full 3D Generate panel (closes the chatbot) */
  onOpenGenerate3D: () => void;
  /**
   * Text to open with, handed over from another surface — today the TerraGen
   * sheet's "Describe your dataset" row. It seeds the composer rather than
   * sending: the prompt arrived from a form, so the user gets to read it back
   * before it becomes a turn.
   */
  initialPrompt?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(initialPrompt);
  const [attached, setAttached] = useState<Attachment[]>([]);
  const [model, setModel] = useState<(typeof MODELS)[number]>(MODELS[0]);
  const [modelOpen, setModelOpen] = useState(false);
  const [menu, setMenu] = useState<null | "attach">(null);
  const [showContext, setShowContext] = useState(true);
  // Start clean: the usage/limit banner is noise the moment the chatbot opens,
  // so it stays hidden until something actually needs to raise it.
  const [showLimit, setShowLimit] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<number[]>([]);
  const ids = useRef(0);
  const nextId = () => `t${(ids.current += 1)}`;
  /** script ref → the turn id it was given when it was added */
  const cardIds = useRef(new Map<string, string>());

  const ctx: AgentContext = useMemo(
    () => ({
      nodes: scene.objects.map(nodeRef),
      sceneName: projectName,
      selected: scene.selected ? nodeRef(scene.selected) : null,
    }),
    [scene.objects, scene.selected, projectName]
  );

  /**
   * Chips the panel adds itself, and the one the user waved away.
   *
   * `dismissed` is cleared at the top of each effect run — the effect only runs
   * when the selection or the armed space actually CHANGES, so clearing it there
   * means an "x" holds for as long as that thing stays selected and lets the
   * chip come back the next time it is picked up again.
   */
  const dismissed = useRef<string | null>(null);
  const selectedId = scene.selectedId;
  // The SELECTED space, not merely the active one. Containment follows the
  // selection now, so "add a chair in this confined space" has to mean the same
  // room a drop would land in — otherwise the agent and the drag would disagree
  // about which space "this" is.
  const armedVolumeId = scene.selectedVolumeId;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    dismissed.current = null;
    const live = sceneRef.current;
    const object = live.objects.find((o) => o.id === selectedId) ?? null;
    const volume = live.volumes.find((v) => v.id === armedVolumeId) ?? null;

    setAttached((prev) => {
      const manual = prev.filter((a) => !a.auto);
      const auto: Attachment[] = [];
      // The space comes first: it is the wider context, and it is the one that
      // changes what the composer offers to write.
      if (volume) {
        auto.push({ id: `auto-space`, kind: "space", volumeId: volume.id, label: volume.name, auto: true });
      }
      if (object && !manual.some((a) => a.kind === "node" && a.node.id === object.id)) {
        auto.push({ id: `auto-node`, kind: "node", node: nodeRef(object), auto: true });
      }
      return [...auto, ...manual];
    });
    // Only the two ids. Depending on `scene` would re-add a dismissed chip on
    // every unrelated edit — a rename, a drag, anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, armedVolumeId]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // Auto-expanding composer: grow to five lines, then scroll inside.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 5 * 20 + 16)}px`;
  }, [input]);

  /**
   * Applies one scripted step. Turn ids are minted OUTSIDE the state updater:
   * an updater has to be pure, and StrictMode invokes it twice in development —
   * minting inside would hand the ref map an id that the kept render threw away.
   */
  const applyOps = useCallback((ops: Op[], revert?: () => void) => {
    const minted = ops.map((op) => (op.op === "add" ? { op, id: nextId() } : { op, id: "" }));
    minted.forEach(({ op, id }) => {
      // Both cards and runs are targeted later by ref, so both register their id.
      if (op.op === "add" && "ref" in op.turn && op.turn.ref) cardIds.current.set(op.turn.ref, id);
    });

    setTurns((prev) => {
      let next = prev;
      for (const { op, id } of minted) {
        if (op.op === "drop-thinking") {
          next = next.filter((t) => t.role !== "thinking");
        } else if (op.op === "add") {
          next = [...next, { ...op.turn, id }];
        } else if (op.op === "patch-run") {
          const target = cardIds.current.get(op.ref);
          next = next.map((t) => {
            if (t.id !== target || t.role !== "run") return t;
            // A finished run that really edited the scene earns an Undo — graft the
            // revert closure on at exactly the patch that flips it to done.
            const patch = revert && op.run.status === "done" ? { ...op.run, revert } : op.run;
            return { ...t, ...patch };
          });
        } else {
          const target = cardIds.current.get(op.ref);
          next = next.map((t) => {
            if (t.id !== target || t.role !== "card") return t;
            // A finished EDIT is the only thing that earns an Undo button, so the
            // revert closure is grafted on at exactly the patch that finishes it.
            const patch = revert && op.card.status === "done" ? { ...op.card, revert } : op.card;
            return { ...t, card: { ...t.card, ...patch } };
          });
        }
      }
      return next;
    });
  }, []);

  const run = useCallback(
    (script: Script, revert?: () => void) => {
      setBusy(true);
      let at = 0;
      script.forEach((step, i) => {
        at += step.after;
        timers.current.push(
          window.setTimeout(() => {
            applyOps(step.ops, revert);
            if (i === script.length - 1) setBusy(false);
          }, at)
        );
      });
    },
    [applyOps]
  );

  /** The one intent that really touches the scene — and so the one with a real Undo. */
  const applyStyleEdit = (text: string): (() => void) | undefined => {
    const sel = scene.selected;
    if (!sel || !/\b(dark|darker|metal|metallic|matte|rough|restyle|style)\b/i.test(text)) return;
    const before = { color: sel.color, metalness: sel.metalness, roughness: sel.roughness };
    const patch: Partial<typeof before> = {};
    if (/\bdark(er)?\b/i.test(text)) patch.color = darken(sel.color);
    if (/\b(matte|rough)\b/i.test(text)) Object.assign(patch, { metalness: 0.05, roughness: 1 });
    else Object.assign(patch, { metalness: 0.9, roughness: 0.2 });
    scene.update(sel.id, patch);
    return () => scene.update(sel.id, before);
  };

  /**
   * BUILD WHAT THE SENTENCE ASKED FOR, INSIDE THE ARMED SPACE.
   *
   * The one thing in this panel that really changes the scene. Everything else
   * here is a script; this reads a list of nouns, places one object per item,
   * and hands the lot to the same `arrange()` the Space panel and the
   * Arrangement axis use — so a room the agent builds and a room the Scatter
   * button builds are the same kind of room.
   *
   * It honours containment the way the Scatter button does: with the fence down
   * the objects still cluster on the space but are free to land outside it.
   *
   * Returns null when the sentence wasn't a spawn request, which is how `send`
   * decides whether this is the right answer at all.
   */
  const spawnIntoSpace = (text: string): boolean => {
    const volume = scene.selectedVolume;
    if (!volume) return false;
    const requests = parseSpawn(text);
    if (requests.length === 0) return false;

    const matches = matchSpawn(requests, store.assets);
    const before = scene.objects.map((o) => o.id);

    // Place first, arrange second. Every object needs an id before the solver
    // can be told to keep them apart, and `add` is the only thing that mints
    // one — so this is two passes over the same list rather than one.
    const created: { id: string; name: string }[] = [];
    matches.forEach((m) => {
      for (let i = 0; i < m.count; i++) {
        const id = scene.add(m.name, "mesh", volume.center, m.asset?.modelUrl);
        created.push({ id, name: m.name });
      }
    });

    /**
     * The solver is given the objects we just MINTED, not a re-read of the scene.
     *
     * `scene.add` is a state setter: `scene.objects` in this closure is still the
     * list from before the first call, so filtering it for "what's new" returns
     * nothing and the whole room silently stacks up at the volume's centre. Every
     * one of these arrives from `makeSceneObject` at unit scale and no rotation,
     * so describing them here is stating what they are, not guessing.
     */
    const movable: Arrangeable[] = created.map((c) => ({
      id: c.id,
      position: volume.center,
      rotationDeg: [0, 0, 0],
      scale: [1, 1, 1],
    }));
    const region = volume.contain ? volume : expandVolume(volume, LOOSE_SPREAD);
    const result = arrange(
      {
        volume,
        region,
        movable,
        // Everything that was already in the room is something to place around.
        fixed: scene.objects.filter(
          (o) => before.includes(o.id) && o.source !== "camera" && o.source !== "environment"
        ),
        rules: movable.map((o) => makeRule(o.id)),
      },
      newSeed()
    );
    scene.applyPlacements(result.placements);

    const nodes: NodeRef[] = created.map((c) => ({ id: c.id, name: c.name, type: "mesh" }));
    const standIns = matches.filter((m) => !m.asset);
    const summary = `Placed ${created.length} ${created.length === 1 ? "object" : "objects"} in ${volume.name}`;

    applyOps([
      {
        op: "add",
        turn: {
          role: "card",
          card: {
            kind: "task",
            label: summary,
            icon: "arrange",
            status: "done",
            nodes,
            detail: [
              `${describeSpawn(matches)} — arranged inside ${volume.name}.`,
              standIns.length > 0 &&
                `No ${standIns.map((m) => m.label).join(" or ")} in your library, so ${
                  standIns.length === 1 ? "it is" : "they are"
                } standing in as placeholder meshes.`,
              !volume.contain &&
                "Containment is off, so some of them landed outside the space.",
              result.unplaced.length > 0 &&
                `${result.unplaced.length} couldn't be fitted — widen the space or lower the clearance.`,
            ]
              .filter(Boolean)
              .join(" "),
            // One undo for one sentence: the whole room the agent just built.
            revert: () => created.forEach((c) => scene.remove(c.id)),
          },
        },
      },
    ]);
    return true;
  };

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;

    // The composer's attachments become part of the message that carries them.
    const parts: Part[] = [{ kind: "md", text }];
    const nodes = attached.filter((a) => a.kind === "node").map((a) => a.node);
    if (nodes.length) parts.push({ kind: "nodes", nodes });
    attached
      .filter((a): a is Extract<Attachment, { kind: "image" }> => a.kind === "image")
      .forEach((a) => parts.push({ kind: "image", seed: a.seed, type: "image", caption: a.name }));
    const mentions = attached.filter((a) => a.kind === "mention");
    if (mentions.length)
      parts.push({ kind: "md", text: mentions.map((m) => `\`@${m.label}\``).join(" ") });
    const space = attached.find((a) => a.kind === "space");
    if (space && space.kind === "space") parts.push({ kind: "md", text: `\`${space.label}\`` });

    applyOps([{ op: "add", turn: { role: "user", parts } }]);
    setInput("");
    // Manual attachments were consumed by the message they were attached to.
    // The automatic ones describe what is STILL selected and still armed, so
    // clearing them would be the panel forgetting something it can see.
    setAttached((prev) => prev.filter((a) => a.auto));

    /**
     * A LIST OF THINGS "IN THIS SPACE" IS ANSWERED BY BUILDING IT.
     *
     * Checked before the single-object add flow below, because that flow asks a
     * question — library or fresh mesh? — and asking it four times for one
     * sentence is not an answer. It only fires when a space is armed; without
     * one there is nowhere to put anything and the ordinary flow is right.
     */
    if (scene.selectedVolume) {
      run([{ after: 0, ops: [{ op: "add", turn: { role: "thinking" } }] }]);
      const built = spawnIntoSpace(text);
      if (built) {
        applyOps([{ op: "drop-thinking" }]);
        return;
      }
      applyOps([{ op: "drop-thinking" }]);
    }

    // "add a chair" is a placement request, not a scripted plan — answer it with
    // the interactive fork (library vs. new mesh) instead of prose.
    const target = addTarget(text);
    if (target) {
      run([
        { after: 0, ops: [{ op: "add", turn: { role: "thinking" } }] },
        {
          after: 500,
          ops: [
            { op: "drop-thinking" },
            {
              op: "add",
              turn: {
                role: "agent",
                parts: [
                  {
                    kind: "md",
                    text: `Sure — I can add a **${target}** to ${ctx.sceneName}. Pull one from your library, or generate a fresh mesh:`,
                  },
                ],
              },
            },
            { op: "add", turn: { role: "add-flow", query: target } },
          ],
        },
      ]);
      return;
    }

    run(planFor(text, ctx), applyStyleEdit(text));
  };

  const decide = (d: "allow" | "deny") => run(captureFollowUp(d, ctx));

  const focusNode = (id: string) => {
    if (scene.objects.some((o) => o.id === id)) scene.select(id);
  };

  const undo = (turnId: string) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;

    // A run and a task card both carry a revert closure and an `undone` flag, so
    // Undo works the same on either — it just lives at a different depth.
    if (turn.role === "run") {
      turn.revert?.();
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId && t.role === "run" ? { ...t, undone: true } : t))
      );
      return;
    }

    if (turn.role !== "card" || turn.card.kind !== "task") return;
    turn.card.revert?.();
    setTurns((prev) =>
      prev.map((t) =>
        t.id === turnId && t.role === "card"
          ? { ...t, card: { ...t.card, undone: true } }
          : t
      )
    );
  };

  const addAttachment = (a: Attachment) => {
    setAttached((prev) => (prev.length >= 4 ? prev : [...prev, a]));
    setMenu(null);
  };

  const nearLimit = USAGE.used / USAGE.limit >= 0.75;
  const empty = turns.length === 0;

  /** The worked example, offered only while there is a space to put things in. */
  const spacePrompt = attached.some((a) => a.kind === "space") ? SPACE_PROMPT : null;

  /* The composer is pinned under the transcript, so the dock shell takes it
     as a footer rather than as the last child of a scrolling body. */
  const footer = (
      <div className="shrink-0 border-t border-glass/10 p-2.5">
        {attached.length > 0 && (
          <div data-ui="ai-attachments" className="mb-2 flex flex-wrap gap-1.5">
            {attached.map((a) => (
              <AttachmentChip
                key={a.id}
                item={a}
                onRemove={() => {
                  // A dismissed auto chip must not reappear on the next render.
                  // The effect that adds it only runs when the selection or the
                  // armed space changes, so simply removing it is enough — the
                  // ref is what stops a re-add if something else re-triggers it.
                  if (a.auto) dismissed.current = a.id;
                  setAttached((prev) => prev.filter((x) => x.id !== a.id));
                }}
              />
            ))}
          </div>
        )}

        {/* The well carries the focus state, not the textarea. The global
            :focus-visible ring is right for a button, but on a composer that
            autofocuses on open it draws a brand-coloured box around the whole
            control before the user has typed anything. */}
        <div className="field-well rounded-xl border transition-colors focus-within:border-brand/50">
          <textarea
            ref={inputRef}
            data-ui="ai-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            /* The placeholder is the offer. With a space armed it spells out a
               request that actually works — typing it verbatim builds the room
               it describes — because "Ask AI anything" in front of a box you
               just drew tells you nothing about what the box is for. */
            placeholder={spacePrompt ?? "Ask AI anything…"}
            className="type-body max-h-28 w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-content outline-none placeholder:text-content-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            <div className="relative">
              <GlassGhostButton
                ui="ai-attach"
                size="sm"
                icon="attach"
                label="Attach objects, images or files"
                onClick={() => setMenu((m) => (m === "attach" ? null : "attach"))}
              />
              {menu === "attach" && (
                <PickerMenu
                  onClose={() => setMenu(null)}
                  items={[
                    {
                      icon: "scene",
                      label: scene.selected ? `Selected: ${scene.selected.name}` : "No selection",
                      disabled: !scene.selected,
                      onPick: () =>
                        scene.selected &&
                        addAttachment({
                          id: nextId(),
                          kind: "node",
                          node: nodeRef(scene.selected),
                        }),
                    },
                    {
                      icon: "input-2d",
                      label: "Image from library",
                      onPick: () =>
                        addAttachment({
                          id: nextId(),
                          kind: "image",
                          name: "ref-overcast-02.png",
                          seed: 219,
                        }),
                    },
                    {
                      icon: "upload",
                      label: "Upload a file",
                      onPick: () =>
                        addAttachment({
                          id: nextId(),
                          kind: "image",
                          name: "brief-v3.pdf",
                          seed: 402,
                        }),
                    },
                  ]}
                />
              )}
            </div>

            <div className="flex-1" />

            <button
              type="button"
              data-ui="ai-send"
              onClick={() => send()}
              disabled={!input.trim() || busy}
              aria-label="Send"
              className="grid h-8 w-8 place-items-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand-hover disabled:bg-glass/15 disabled:text-content-subtle"
            >
              <Icon name={busy ? "spinner" : "send"} size={15} className={cn(busy && "animate-spin")} />
            </button>
          </div>
        </div>

        <p className="type-caption mt-1.5 text-center text-content-subtle">
          <kbd className="font-sans">Enter</kbd> to send ·{" "}
          <kbd className="font-sans">Shift</kbd>+<kbd className="font-sans">Enter</kbd> for a new
          line
        </p>
      </div>
  );

  return (
    <DockPanel
      ui="ai-agent"
      title="AI"
      defaultHeight={400}
      /* No percentage: a reply has no measurable progress, and a bar that
         invents one would be the only dishonest thing in the dock. The shell
         runs the indeterminate track instead. */
      job={busy ? { title: "Terra AI is working", hint: "Reading the scene and drafting a reply" } : null}
      /* The transcript already shows a thinking row while it works, so the
         shell only steps in when the transcript isn't on screen. */
      jobDisplay="collapsed"
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((c) => !c)}
      onClose={onClose}
      /* The AI header still overrides the shell's default row, because its title
         is a CONTROL — the model picker — not a label. But it now looks like
         every other panel's title and nothing more: the badge and the "AI"
         eyebrow that used to sit in front of it made this one header in the dock
         wear a costume, and the panel is already named by the model it's set to.
         The only thing marking it as interactive is the chevron. */
      headerOverride={
      <div className="flex w-full items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            data-ui="ai-model-select"
            onClick={() => setModelOpen((v) => !v)}
            className="-mx-1.5 flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-glass/15"
          >
            <span className="type-panel-title truncate text-content">{model.name}</span>
            <Icon
              name="chevron-down"
              size={14}
              className={cn(
                "shrink-0 text-content-subtle transition-transform",
                modelOpen && "rotate-180"
              )}
            />
          </button>
          {modelOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} aria-hidden />
              <GlassPanel
                thickness="overlay"
                ui="ai-model-menu"
                className="absolute left-0 top-full z-20 mt-1 w-56 !rounded-xl p-1"
              >
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setModel(m);
                      setModelOpen(false);
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-glass/15"
                  >
                    <Icon
                      name="check"
                      size={13}
                      className={cn(
                        "mt-0.5 shrink-0 text-brand",
                        m.id !== model.id && "invisible"
                      )}
                    />
                    <span className="min-w-0">
                      <span className="type-label-strong block text-content">{m.name}</span>
                      <span className="type-caption block text-content-subtle">{m.blurb}</span>
                    </span>
                  </button>
                ))}
              </GlassPanel>
            </>
          )}
        </div>

        <GlassGhostButton
          ui="ai-collapse"
          size="sm"
          icon="chevron-down"
          label={collapsed ? "Expand AI panel" : "Collapse AI panel"}
          onClick={() => setCollapsed((c) => !c)}
          className={cn("transition-transform", collapsed && "-rotate-90")}
        />
        <GlassGhostButton ui="ai-close" size="sm" icon="close" label="Close AI panel" onClick={onClose} />
      </div>
      }
      footer={footer}
    >

      {/* ----------------------------------------------------------- banners */}
      {nearLimit && showLimit && (
        <div
          data-ui="ai-rate-limit"
          className="flex items-start gap-2 border-b border-warning/20 bg-warning-soft/50 px-3 py-2"
        >
          <Icon name="warning" size={13} className="mt-0.5 shrink-0 text-warning" />
          <p className="type-caption flex-1 text-content-muted">
            {USAGE.used} of {USAGE.limit} AI requests used today. Edits still apply; new plans may
            queue.
          </p>
          <button
            type="button"
            onClick={() => setShowLimit(false)}
            aria-label="Dismiss limit warning"
            className="shrink-0 text-content-subtle transition-colors hover:text-content"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------ thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-3 py-3">
        {showContext && (
          <div
            data-ui="ai-context-banner"
            className="mb-3 flex items-center gap-2 rounded-lg border border-glass/12 bg-glass/8 px-2 py-1.5"
          >
            <Icon name="scene" size={13} className="shrink-0 text-content-subtle" />
            <p className="type-caption min-w-0 flex-1 truncate text-content-muted">
              {scene.selected ? `${scene.selected.name} selected` : "Nothing selected"} ·{" "}
              {scene.objects.length} {scene.objects.length === 1 ? "object" : "objects"} in{" "}
              {projectName} · Terra Library on
            </p>
            <button
              type="button"
              onClick={() => setShowContext(false)}
              aria-label="Dismiss context banner"
              className="shrink-0 text-content-subtle transition-colors hover:text-content"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        )}

        {empty ? (
          <EmptyState
            hasObjects={scene.objects.length > 0}
            hasSelection={scene.selected !== null}
            onPick={send}
          />
        ) : (
          <div className="space-y-3">
            {turns.map((turn) => (
              <TurnRow
                key={turn.id}
                turn={turn}
                store={store}
                onNode={focusNode}
                onUndo={() => undo(turn.id)}
                onDecide={decide}
                onRetry={send}
                onPlaceAsset={onPlaceAsset}
                onOpenGenerate3D={onOpenGenerate3D}
              />
            ))}
          </div>
        )}
      </div>

    </DockPanel>
  );
}

/* ------------------------------------------------------------------- turns */

function TurnRow({
  turn,
  store,
  onNode,
  onUndo,
  onDecide,
  onRetry,
  onPlaceAsset,
  onOpenGenerate3D,
}: {
  turn: Turn;
  store: AssetStore;
  onNode: (id: string) => void;
  onUndo: () => void;
  onDecide: (d: "allow" | "deny") => void;
  onRetry: (prompt: string) => void;
  onPlaceAsset: (asset: Asset) => void;
  onOpenGenerate3D: () => void;
}) {
  if (turn.role === "thinking") return <Thinking />;

  if (turn.role === "run") return <RunView run={turn} onNode={onNode} onUndo={onUndo} />;

  if (turn.role === "add-flow")
    return (
      <AddObjectFlow
        query={turn.query}
        store={store}
        onPlace={onPlaceAsset}
        onOpenGenerate3D={onOpenGenerate3D}
      />
    );

  if (turn.role === "card")
    return turn.card.kind === "task" ? (
      <TaskCardView card={turn.card} onUndo={onUndo} onNode={onNode} />
    ) : (
      <PermissionCardView card={turn.card} onDecide={onDecide} />
    );

  if (turn.role === "user")
    return (
      <div className="flex justify-end">
        <div
          data-ui="ai-user-message"
          /* The user's own turns carry a soft brand (orange) wash so they read
             as "mine" against the agent's bubble-less prose — tinted, not loud. */
          className="max-w-[85%] rounded-2xl rounded-br-md border border-brand/25 bg-brand/15 px-3 py-2 [&_p]:text-content"
        >
          {turn.parts.map((part, i) => (
            <MessagePart key={i} part={part} refs={[]} onNode={onNode} />
          ))}
        </div>
      </div>
    );

  // Agent: no bubble — except a failure, which gets a red-tinted card so it
  // can't be mistaken for an answer.
  const body = (
    <>
      {turn.parts.map((part, i) => (
        <MessagePart key={i} part={part} refs={turn.refs ?? []} onNode={onNode} />
      ))}
    </>
  );

  return (
    <div data-ui="ai-agent-message">
      {turn.tone === "error" ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-2.5 py-2">
          <p className="type-label-strong mb-1 flex items-center gap-1.5 text-danger">
            <Icon name="error" size={13} />
            Couldn&apos;t finish
          </p>
          {body}
          {turn.retry && (
            <button
              type="button"
              data-ui="ai-retry"
              onClick={() => onRetry(turn.retry!)}
              className="type-label-strong mt-2 inline-flex items-center gap-1.5 rounded-md bg-glass/15 px-2 py-1 text-content transition-colors hover:bg-glass/25"
            >
              <Icon name="retry" size={13} />
              Try again
            </button>
          )}
        </div>
      ) : (
        body
      )}

      {turn.suggestions && turn.suggestions.length > 0 && (
        <div data-ui="ai-suggestions" className="mt-2 flex flex-wrap gap-1.5">
          {turn.suggestions.map((s) => (
            <PromptChip key={s} label={s} onClick={() => onRetry(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A prompt you can click to send. ONE shape for it, whether it's a follow-up the
 * agent offered or an opener in the empty state — both are the same act, and
 * giving the openers their own card treatment is what made the panel read as a
 * page of FAQs instead of a conversation.
 */
function PromptChip({
  label,
  icon,
  title,
  onClick,
}: {
  label: string;
  icon?: IconName;
  /** the longer explanation, on hover — it doesn't earn a permanent line */
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-ui="ai-prompt-chip"
      title={title}
      onClick={onClick}
      className="type-label flex items-center gap-1.5 rounded-full border border-glass/15 bg-glass/8 px-2.5 py-1 text-content-muted transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
    >
      {icon && <Icon name={icon} size={13} className="shrink-0" />}
      {label}
    </button>
  );
}

/* -------------------------------------------------------------- empty state */

/**
 * The opening state — a short list of prompts you can click, and nothing else.
 *
 * It used to be a centred hero (badge, heading, paragraph) over six full-width
 * cards, each a bold title above an explanatory line. That is the shape of a
 * help centre, and it read as one: nothing about it looked like the start of a
 * conversation, and it pushed the composer most of a panel-height down.
 *
 * What's left is what earns its place:
 *
 *   · The openers are prompt chips — the identical control the agent already
 *     offers as follow-up suggestions. One idiom for "a prompt you can click",
 *     wherever it appears.
 *   · The blurbs are on hover. They were the FAQ tell: a subtitle under every
 *     title turns a list of prompts into a list of articles, and they cost six
 *     lines to say what the prompt itself already says.
 *   · No greeting. A line of prose explaining what the agent can do is the same
 *     claim the chips make by existing, and the composer's own placeholder
 *     already invites the question.
 */
function EmptyState({
  hasObjects,
  hasSelection,
  onPick,
}: {
  hasObjects: boolean;
  hasSelection: boolean;
  onPick: (prompt: string) => void;
}) {
  // Only offer what the scene can actually answer — an empty project offering
  // "Audit my scene" is a prompt whose only possible reply is "there's nothing
  // here".
  const offered = STARTERS.filter((s) =>
    s.needs === "selection" ? hasSelection : s.needs === "objects" ? hasObjects : true
  );

  return (
    <div data-ui="ai-empty">
      <p className="type-eyebrow text-content-subtle">Try</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {offered.map((s) => (
          <PromptChip
            key={s.title}
            label={s.title}
            icon={s.icon}
            title={s.blurb}
            onClick={() => onPick(s.prompt)}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- attachments */

/** What the chip is called, for the remove button's label. */
function chipLabel(item: Attachment): string {
  switch (item.kind) {
    case "node":
      return item.node.name;
    case "space":
    case "mention":
      return item.label;
    default:
      return item.name;
  }
}

function AttachmentChip({ item, onRemove }: { item: Attachment; onRemove: () => void }) {
  const inner =
    item.kind === "node" ? (
      <>
        <Icon name={typeIcon[item.node.type]} size={12} className="text-content-subtle" />
        <span className="type-label truncate">{item.node.name}</span>
      </>
    ) : item.kind === "space" ? (
      <>
        <Icon name="space" size={12} className="text-accent" />
        <span className="type-label truncate">{item.label}</span>
      </>
    ) : item.kind === "mention" ? (
      <>
        <Icon name="library" size={12} className="text-brand" />
        <span className="type-label truncate">@{item.label}</span>
      </>
    ) : (
      <>
        <span className="h-5 w-5 shrink-0 overflow-hidden rounded">
          <AssetThumb type="image" seed={item.seed} />
        </span>
        <span className="type-label truncate">{item.name}</span>
      </>
    );

  return (
    <span
      data-ui="ai-attachment-chip"
      className="flex max-w-[150px] items-center gap-1.5 rounded-full border border-glass/15 bg-glass/10 py-1 pl-1.5 pr-1 text-content"
    >
      {inner}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${chipLabel(item)}`}
        className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-content-subtle transition-colors hover:bg-glass/25 hover:text-content"
      >
        <Icon name="close" size={11} />
      </button>
    </span>
  );
}

/** The shared popover behind the attach and mention buttons. */
function PickerMenu({
  items,
  onClose,
}: {
  items: { icon: IconName; label: string; disabled?: boolean; onPick: () => void }[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden />
      <GlassPanel
        thickness="overlay"
        ui="ai-picker"
        className="absolute bottom-full left-0 z-20 mb-1 w-56 !rounded-xl p-1"
      >
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            disabled={it.disabled}
            onClick={it.onPick}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-glass/15 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Icon name={it.icon} size={14} className="shrink-0 text-content-subtle" />
            <span className="type-label truncate text-content">{it.label}</span>
          </button>
        ))}
      </GlassPanel>
    </>
  );
}
