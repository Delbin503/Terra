import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel, GlassGhostButton } from "@/components/glass";
import { DockPanel } from "./panel-dock";
import { Icon, type IconName } from "@/components/icons";
import { AssetThumb } from "./AssetThumb";
import { typeIcon } from "./assets-data";
import { MessagePart, PermissionCardView, RunView, SabMark, TaskCardView, Thinking } from "./ai-agent-parts";
import { useSettings } from "@/features/settings/settings-store";
import { AddObjectFlow } from "./ai-agent-add-flow";
import {
  addTarget,
  captureFollowUp,
  nodeRef,
  planFor,
  type AgentContext,
  type NodeRef,
  type Op,
  type Part,
  type Script,
  type Turn,
} from "./ai-agent-script";
import { materialOf } from "./scene-types";
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

/** One conversation. The live one's turns are mirrored here as they change,
 *  so switching away and back finds the thread where it was left. */
interface Chat {
  id: string;
  turns: Turn[];
  /** A name someone gave it. Absent, the chat is named by its first question. */
  name?: string;
}

let chatCounter = 0;
const newChat = (): Chat => ({ id: `chat-${(chatCounter += 1)}`, turns: [] });

/** A chat is named by the first thing that was asked in it — unless renamed. */
function chatTitle(c: Chat): string {
  if (c.name) return c.name;
  const first = c.turns.find((t) => t.role === "user");
  const text = first?.parts.find((p) => p.kind === "md");
  return text && text.kind === "md" && text.text.trim() ? text.text.trim() : "New chat";
}

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

/** What SAB is doing to the scene right now, shown by the editor as a loader. */
export type SabSceneActivity = { label: string; detail?: string };
/** How long each change holds on the loader before the next one starts. */
const CHANGE_MS = 500;

export function AiAgentPanel({
  scene,
  store,
  projectName,
  onClose,
  onPlaceAsset,
  onOpenGenerate3D,
  initialPrompt = "",
  areaId = null,
  onSceneActivity,
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
  /**
   * The space SAB works in while it is open — the box drawn in the scene with
   * its sides named. A FOCUSED space still wins: picking a room in the
   * viewport is the more specific thing to have said.
   */
  areaId?: string | null;
  /** Raised while SAB is adding to the scene; null once it is done. */
  onSceneActivity?: (activity: SabSceneActivity | null) => void;
}) {
  const { account } = useSettings();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(initialPrompt);
  const [attached, setAttached] = useState<Attachment[]>([]);
  /**
   * THE CHATS. Every conversation SAB has had in this project, newest first,
   * one of them live. Kept as a list rather than one thread because the
   * questions are separate jobs — the kitchen and the loading bay — and
   * starting the second shouldn't wipe the first.
   */
  const [chats, setChats] = useState<Chat[]>(() => [newChat()]);
  const [chatId, setChatId] = useState(() => chats[0].id);
  const [chatsOpen, setChatsOpen] = useState(false);
  /** The header title being renamed, and what is typed into it so far. */
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  // Set by Escape, so the blur that follows the field unmounting can't save
  // what Escape just threw away.
  const titleCancelled = useRef(false);
  const [menu, setMenu] = useState<null | "attach">(null);
  // Start clean: the usage/limit banner is noise the moment the chatbot opens,
  // so it stays hidden until something actually needs to raise it.
  const [showLimit, setShowLimit] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<number[]>([]);
  const activityRef = useRef(onSceneActivity);
  activityRef.current = onSceneActivity;

  /**
   * ADDING TO THE SCENE TAKES A BEAT, AND THE EDITOR SAYS SO.
   *
   * Counts "Change 1 of N" up to N on the editor's loader, then does the work.
   * One change per object, the way the live SAB counts its scene commands.
   * The steps ride on `timers`, so leaving the chat or closing the panel
   * cancels them — and both of those clear the loader too.
   */
  const withAdding = (total: number, work: () => void) => {
    const n = Math.max(1, total);
    setBusy(true);
    for (let i = 0; i < n; i++) {
      timers.current.push(
        window.setTimeout(() => {
          activityRef.current?.({ label: "Adding objects…", detail: `Change ${i + 1} of ${n}` });
        }, i * CHANGE_MS)
      );
    }
    timers.current.push(
      window.setTimeout(() => {
        work();
        activityRef.current?.(null);
        setBusy(false);
      }, n * CHANGE_MS)
    );
  };
  const placeAsset = (asset: Asset) => withAdding(1, () => onPlaceAsset(asset));
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
  // SAB'S AREA FIRST, ALWAYS. It is the box drawn in the scene while the chat
  // is open, and what SAB builds is meant to land in it — so a space focused in
  // the viewport no longer redirects the agent; it only stands in when there
  // is no area at all (a panel opened without one).
  const armedVolumeId = areaId ?? scene.selectedVolumeId ?? null;
  const armedVolume = scene.volumes.find((v) => v.id === armedVolumeId) ?? null;
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
      // NO SPACE CHIP. The area is not optional context you can detach — it is
      // where SAB builds, and the box in the scene already shows it — so a chip
      // with a remove button offered a choice that isn't one.
      void volume;
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
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      activityRef.current?.(null);
    };
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

  // Mirror the live thread into its chat, so the list's titles and a later
  // switch back both see what is on screen now.
  useEffect(() => {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, turns } : c)));
  }, [turns, chatId]);

  /**
   * Leave the live chat. Anything still scheduled belongs to it — a scripted
   * reply landing in the chat you switched to would be the agent answering a
   * question that was never asked there — so pending steps are dropped.
   */
  const leaveChat = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    activityRef.current?.(null);
    setBusy(false);
  };
  const openChat = (id: string) => {
    if (id === chatId) return setChatsOpen(false);
    leaveChat();
    setTurns(chats.find((c) => c.id === id)?.turns ?? []);
    setChatId(id);
    setChatsOpen(false);
  };
  const startChat = () => {
    // An empty chat is already a new chat — another would be a second blank row.
    if (turns.length === 0) return setChatsOpen(false);
    leaveChat();
    const c = newChat();
    setChats((prev) => [c, ...prev]);
    setTurns([]);
    setChatId(c.id);
    setChatsOpen(false);
    inputRef.current?.focus();
  };
  /** An empty name hands the chat back its automatic title. */
  const renameChat = (id: string, name: string) =>
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, name: name.trim() || undefined } : c)));
  const currentChat = chats.find((c) => c.id === chatId);
  const currentTitle = currentChat ? chatTitle({ ...currentChat, turns }) : "New chat";
  const deleteChat = (id: string) => {
    const rest = chats.filter((c) => c.id !== id);
    if (id !== chatId) return setChats(rest);
    leaveChat();
    const next = rest[0] ?? newChat();
    setChats(rest.length ? rest : [next]);
    setTurns(next.turns);
    setChatId(next.id);
  };

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
    // Slot 0 is what "darker" is measured against. The sentence is about the
    // object, so the edit paints every slot — and the undo restores every slot
    // to the one set of values they were painted from, which is what painting
    // them all in the first place implies.
    const from = materialOf(sel, 0);
    const before = { color: from.color, metalness: from.metalness, roughness: from.roughness };
    const patch: Partial<typeof before> = {};
    if (/\bdark(er)?\b/i.test(text)) patch.color = darken(from.color);
    if (/\b(matte|rough)\b/i.test(text)) Object.assign(patch, { metalness: 0.05, roughness: 1 });
    else Object.assign(patch, { metalness: 0.9, roughness: 0.2 });
    scene.paintMaterial(sel.id, patch);
    return () => scene.paintMaterial(sel.id, before);
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
    const volume = armedVolume;
    if (!volume) return false;
    const requests = parseSpawn(text);
    if (requests.length === 0) return false;

    const matches = matchSpawn(requests, store.assets);
    const total = matches.reduce((sum, m) => sum + m.count, 0);
    withAdding(total, () => build(matches, volume));
    return true;
  };

  const build = (matches: ReturnType<typeof matchSpawn>, volume: NonNullable<typeof armedVolume>) => {
    // The scene as it is NOW, after the loader — not as it was at send.
    const scene = sceneRef.current;
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
      { op: "drop-thinking" },
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
    // The armed space is NOT echoed into the bubble. It rides along on every
    // message while SAB is open, so tagging each one with the area's name
    // repeated a fact the box in the scene and the chip above the composer
    // already show — the bubble is what you asked, and nothing else.

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
    if (armedVolume) {
      applyOps([{ op: "add", turn: { role: "thinking" } }]);
      // A spawn keeps "thinking" up behind the loader and drops it itself.
      if (spawnIntoSpace(text)) return;
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
  const spacePrompt = armedVolume ? SPACE_PROMPT : null;

  /* The composer is pinned under the transcript, so the dock shell takes it
     as a footer rather than as the last child of a scrolling body. */
  const footer = (
      <div className="shrink-0 px-2.5 pb-2 pt-1.5">
        {/* GEMINI'S COMPOSER: one tall rounded box that holds everything —
            what's attached, the text, + on the left and send on the right —
            with no rule above it, so it reads as the conversation's next line
            rather than a form under it. */}
        <div className="rounded-[26px] border border-glass/14 bg-glass/8 transition-colors focus-within:border-glass/30">
        {attached.length > 0 && (
          <div data-ui="ai-attachments" className="flex flex-wrap gap-1.5 px-3 pt-2.5">
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
            placeholder={spacePrompt ?? "Ask SAB"}
            className="type-body max-h-28 w-full resize-none bg-transparent px-4 pb-1 pt-3 text-content outline-none placeholder:text-content-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div className="flex items-center gap-0.5 px-2 pb-2">
            <div className="relative">
              <GlassGhostButton
                ui="ai-attach"
                size="sm"
                icon="create"
                label="Add objects, images or files"
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
              className="grid h-9 w-9 place-items-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand-hover disabled:bg-transparent disabled:text-content-subtle"
            >
              <Icon name={busy ? "spinner" : "send-up"} size={17} strokeWidth={2.2} className={cn(busy && "animate-spin")} />
            </button>
          </div>
        </div>

        <p className="type-caption mt-1.5 text-center text-content-subtle">
          Switching chats cancels pending actions.
        </p>
      </div>
  );

  return (
    <DockPanel
      ui="ai-agent"
      title="AI"
      /* Taller than the other dock panels: Gemini's composer is a generous
         box, and at 400 px it left the conversation a strip two lines high.
         The dock still clamps this to the room below the panel's top. */
      defaultHeight={600}
      /* No percentage: a reply has no measurable progress, and a bar that
         invents one would be the only dishonest thing in the dock. The shell
         runs the indeterminate track instead. */
      job={busy ? { title: "SAB is working", hint: "Reading the scene and drafting a reply" } : null}
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
      <div className="flex w-full items-center gap-1.5">
        {/* THE CHAT'S NAME, and the place to change it. With several chats the
            panel title is the only thing saying which one you are in, so it
            names the chat rather than the tool — and a click renames it, the
            same rename the chat list offers. */}
        {titleDraft !== null ? (
          <input
            autoFocus
            data-ui="ai-chat-title-input"
            aria-label="Chat name"
            value={titleDraft}
            maxLength={80}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (!titleCancelled.current) renameChat(chatId, titleDraft);
              titleCancelled.current = false;
              setTitleDraft(null);
            }}
            onKeyDown={(e) => {
              // Escape cancels the rename here, not the whole panel.
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                titleCancelled.current = true;
                setTitleDraft(null);
              }
            }}
            className="type-panel-title -mx-1.5 min-w-0 flex-1 rounded-md border border-brand/50 bg-glass/10 px-1.5 py-0.5 text-content outline-none"
          />
        ) : (
          <button
            type="button"
            data-ui="ai-chat-title"
            title="Rename chat"
            onClick={() => setTitleDraft(currentTitle)}
            className="type-panel-title -mx-1.5 min-w-0 flex-1 truncate rounded-md px-1.5 py-0.5 text-left text-content transition-colors hover:bg-glass/15"
          >
            {currentTitle}
          </button>
        )}
        <GlassGhostButton
          ui="ai-chats"
          size="sm"
          icon="feedback"
          label={chatsOpen ? "Hide chats" : "Show chats"}
          aria-pressed={chatsOpen}
          onClick={() => setChatsOpen((v) => !v)}
          className={chatsOpen ? "!bg-glass/20 !text-content" : undefined}
        />
        <span
          data-ui="ai-status"
          className="type-caption-strong shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-brand-on-glass"
        >
          online
        </span>
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

      {/* ------------------------------------------------------------- chats */}
      {chatsOpen && (
        <ChatList
          chats={chats}
          activeId={chatId}
          onOpen={openChat}
          onNew={startChat}
          onDelete={deleteChat}
          onRename={renameChat}
          onClose={() => setChatsOpen(false)}
        />
      )}

      {/* ------------------------------------------------------------ thread */}
      <div
        ref={threadRef}
        /* A column at least as tall as the body, so an empty chat can centre
           its greeting in the space. */
        className={cn("flex min-h-full flex-1 flex-col overflow-y-auto px-3 py-3", chatsOpen && "hidden")}
      >
        {empty ? (
          <EmptyState name={account.firstName || "there"} />
        ) : (
          <div className="space-y-3">
            {turns.map((turn, i) => (
              <TurnRow
                key={turn.id}
                turn={turn}
                isLast={i === turns.length - 1}
                prompt={promptBefore(turns, i)}
                store={store}
                onNode={focusNode}
                onUndo={() => undo(turn.id)}
                onDecide={decide}
                onRetry={send}
                onPlaceAsset={placeAsset}
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

/** The user's words that an agent turn is answering — what Retry resends. */
function promptBefore(turns: Turn[], i: number): string | undefined {
  for (let j = i - 1; j >= 0; j--) {
    const t = turns[j];
    if (t.role === "user") {
      const md = t.parts.find((p) => p.kind === "md");
      return md && md.kind === "md" ? md.text : undefined;
    }
  }
  return undefined;
}

function TurnRow({
  turn,
  isLast = false,
  prompt,
  store,
  onNode,
  onUndo,
  onDecide,
  onRetry,
  onPlaceAsset,
  onOpenGenerate3D,
}: {
  turn: Turn;
  /** the newest turn — its reply actions stay visible, older ones show on hover */
  isLast?: boolean;
  /** what the user asked that this turn answers */
  prompt?: string;
  store: AssetStore;
  onNode: (id: string) => void;
  onUndo: () => void;
  onDecide: (d: "allow" | "deny") => void;
  onRetry: (prompt: string) => void;
  onPlaceAsset: (asset: Asset) => void;
  onOpenGenerate3D: () => void;
}) {
  // A thinking row means "the next thing is on its way". Once something has
  // arrived after it, it is a stale promise — and some scripts never drop it.
  if (turn.role === "thinking") return isLast ? <Thinking /> : null;

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
          /* Gemini's shape: a soft grey bubble, square-ish at the top-right
             corner it hangs from. Grey, not orange — the colour in this thread
             belongs to SAB's mark, and the question is just the question. */
          className="max-w-[85%] rounded-[20px] rounded-tr-md bg-glass/15 px-4 py-2.5 [&_p]:text-content"
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
    <div data-ui="ai-agent-message" className="group/msg flex gap-3">
      <SabMark size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1">
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

      {turn.tone !== "error" && (
        <ReplyActions
          text={turn.parts.flatMap((p) => (p.kind === "md" ? [p.text] : [])).join("\n\n")}
          visible={isLast}
          onRetry={prompt ? () => onRetry(prompt) : undefined}
        />
      )}
      </div>
    </div>
  );
}

/**
 * Under a reply: copy it, say whether it was any good, or ask again.
 *
 * The newest reply keeps its row; older ones show theirs on hover, as Gemini's
 * do — a column of identical icon rows down the whole transcript is noise.
 * The thumbs are a prototype's: they light and they stay lit, and go nowhere.
 */
function ReplyActions({
  text,
  visible,
  onRetry,
}: {
  text: string;
  visible: boolean;
  onRetry?: () => void;
}) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [copied, setCopied] = useState(false);
  const btn =
    "grid h-7 w-7 place-items-center rounded-full text-content-subtle transition-colors hover:bg-glass/15 hover:text-content";
  return (
    <div
      data-ui="ai-reply-actions"
      className={cn(
        "-ml-1.5 mt-1.5 flex items-center gap-0.5 transition-opacity",
        visible ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover/msg:opacity-100"
      )}
    >
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy reply"}
        title={copied ? "Copied" : "Copy"}
        className={btn}
        onClick={() => {
          void navigator.clipboard?.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={14} />
      </button>
      <button
        type="button"
        aria-label="Good reply"
        aria-pressed={vote === "up"}
        title="Good reply"
        className={cn(btn, vote === "up" && "text-brand-on-glass")}
        onClick={() => setVote((v) => (v === "up" ? null : "up"))}
      >
        <Icon name="like" size={14} />
      </button>
      <button
        type="button"
        aria-label="Bad reply"
        aria-pressed={vote === "down"}
        title="Bad reply"
        className={cn(btn, vote === "down" && "text-brand-on-glass")}
        onClick={() => setVote((v) => (v === "down" ? null : "down"))}
      >
        <Icon name="dislike" size={14} />
      </button>
      {onRetry && (
        <button type="button" aria-label="Ask again" title="Ask again" className={btn} onClick={onRetry}>
          <Icon name="retry" size={14} />
        </button>
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
 * The empty chat: a greeting, centred, and nothing else.
 */
function EmptyState({ name }: { name: string }) {
  /* Just the greeting, in the middle of the empty thread — no starter chips:
     the composer below is the one place to begin, and a menu of canned asks
     above it made the first screen read as a form. Plain ink, no gradient. */
  return (
    <div data-ui="ai-empty" className="flex flex-1 flex-col items-center justify-center pb-6 text-center">
      {/* SAB's own mark, the one beside every reply — so the greeting and
          the answers that follow it are visibly the same speaker. */}
      <SabMark size={28} className="mb-3" />
      <p className="text-[19px] font-semibold leading-tight tracking-[-0.015em] text-content">Hello, {name}</p>
      <p className="mt-1 text-[15px] font-medium leading-snug text-content-subtle">What should we build?</p>
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
      {/* A SOLID BACKING, not glass alone. This menu opens inside the dock
          panel, which is already glass — and a backdrop blur nested in
          another blurs nothing, so the menu came out see-through, with the
          composer's text reading straight through its items. The fill is the
          panel's own dark at near-full strength, with a shadow to lift it. */}
      <GlassPanel
        thickness="overlay"
        ui="ai-picker"
        className="absolute bottom-full left-0 z-20 mb-2 w-56 !rounded-xl !bg-[hsl(28_8%_10%/0.97)] p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]"
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

/* ------------------------------------------------------------------- chats */

/**
 * The chat list, in place of the thread while it is open.
 *
 * In the panel rather than a popover: it is as tall as the list is, and a
 * popover over a docked panel is a second panel fighting the first for the
 * same column. The thread is one click away on the same button.
 */
function ChatList({
  chats,
  activeId,
  onOpen,
  onNew,
  onDelete,
  onRename,
  onClose,
}: {
  chats: Chat[];
  activeId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onClose: () => void;
}) {
  /** The row being renamed, and what is typed into it so far. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const startRename = (c: Chat) => {
    setDraft(chatTitle(c));
    setEditing(c.id);
  };
  // A blur after Escape must not save what Escape just threw away.
  const commit = (id: string) => {
    if (editing !== id) return;
    onRename(id, draft);
    setEditing(null);
  };

  return (
    <div data-ui="ai-chat-list" className="flex h-full flex-col px-3 py-2.5">
      <div className="flex max-h-full flex-col rounded-xl border border-glass/12 bg-glass/5">
        <div className="flex shrink-0 items-center gap-1 border-b border-glass/10 py-1 pl-3 pr-1.5">
          <span className="type-label-strong flex-1 text-content">Chats</span>
          <GlassGhostButton ui="ai-chat-new" size="sm" icon="create" label="New chat" onClick={onNew} />
          <GlassGhostButton ui="ai-chat-list-close" size="sm" icon="close" label="Close chats" onClick={onClose} />
        </div>
        {/* The card is never taller than the space the composer leaves, and only
            the rows scroll inside it — so its header and footer stay on screen
            however many chats there are, in a panel that opens 400 px tall. */}
        <div className="min-h-0 space-y-0.5 overflow-y-auto p-1.5">
          {chats.map((c) => {
            const on = c.id === activeId;
            return (
              <div key={c.id} className="group flex items-center gap-1">
                {editing === c.id ? (
                  <input
                    autoFocus
                    data-ui={`ai-chat-${c.id}-name`}
                    aria-label="Chat name"
                    value={draft}
                    maxLength={80}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commit(c.id)}
                    onKeyDown={(e) => {
                      // Escape here cancels the rename, not the whole panel.
                      e.stopPropagation();
                      if (e.key === "Enter") commit(c.id);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="type-body min-w-0 flex-1 rounded-lg border border-brand/50 bg-glass/10 px-2.5 py-[7px] text-content outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    data-ui={`ai-chat-${c.id}`}
                    aria-current={on}
                    onClick={() => onOpen(c.id)}
                    onDoubleClick={() => startRename(c)}
                    title="Double-click to rename"
                    className={cn(
                      "type-body min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left transition-colors",
                      on
                        ? "bg-brand/15 text-content ring-1 ring-inset ring-brand/45"
                        : "text-content-muted hover:bg-glass/10 hover:text-content"
                    )}
                  >
                    {chatTitle(c)}
                  </button>
                )}
                <button
                  type="button"
                  data-ui={`ai-chat-${c.id}-rename`}
                  aria-label={`Rename chat: ${chatTitle(c)}`}
                  title="Rename"
                  onClick={() => startRename(c)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-subtle transition-colors hover:bg-glass/15 hover:text-content"
                >
                  <Icon name="edit" size={13} />
                </button>
                <button
                  type="button"
                  data-ui={`ai-chat-${c.id}-delete`}
                  aria-label={`Delete chat: ${chatTitle(c)}`}
                  title="Delete"
                  onClick={() => onDelete(c.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-subtle transition-colors hover:bg-glass/15 hover:text-content"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
