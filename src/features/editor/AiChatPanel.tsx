import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/glass";
import { Icon } from "@/components/icons";
import { AssetThumb } from "./AssetThumb";
import { COLOR_WORDS } from "./scene-palette";
import type { AssetType } from "./assets-data";
import type { SceneApi } from "./useScene";

interface Opt {
  name: string;
  type: AssetType;
  seed: number;
}
interface Msg {
  id: string;
  role: "user" | "assistant";
  text?: string;
  options?: Opt[];
  generating?: boolean;
}

/** Colour words the assistant understands — sourced from the scene palette so
 *  every word it can resolve is a colour the Color tab can also produce. */
const COLORS = COLOR_WORDS;

const SUGGESTIONS = ["Add a chair", "Generate a wooden crate", "Make it metallic", "Warmer lighting"];

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function extractNoun(t: string): string {
  const m = t.match(/\b(?:add|place|insert|put)\s+(?:a |an |the |some )?([a-z][a-z-]*)/);
  const n = (m ? m[1] : t.split(/\s+/).pop() || "object").replace(/s$/, "");
  return title(n);
}

function extractDesc(t: string): string {
  const m = t.match(/\b(?:generate|create|make)\s+(?:a |an |the )?(.+)/);
  return m ? m[1].trim() : "";
}

/**
 * AiChatPanel — left-docked conversational assistant. Simulated NL intents that
 * act on the shared scene store: add assets (with pickable options), generate a
 * new object, tweak the selected object's look/material, and change lighting.
 */
export function AiChatPanel({ scene, onClose }: { scene: SceneApi; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "m0",
      role: "assistant",
      text: "Hi! I can add assets from your library, generate new 3D objects, restyle the selected object, or adjust the lighting. Try “add a chair”.",
    },
  ]);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState(false);
  const idc = useRef(0);
  const threadRef = useRef<HTMLDivElement>(null);
  const newId = () => `m${(idc.current += 1)}`;

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const push = (m: Omit<Msg, "id">) => setMessages((prev) => [...prev, { id: newId(), ...m }]);

  const applyTweak = (t: string) => {
    const sel = scene.selected;
    if (!sel) return null;
    const color = Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
    if (color) {
      scene.paintMaterial(sel.id, { color: COLORS[color] });
      return `Changed ${sel.name} to ${color}.`;
    }
    if (/\b(metal|metallic|shiny|chrome|reflective)\b/.test(t)) {
      scene.paintMaterial(sel.id, { metalness: 0.9, roughness: 0.2 });
      return `Made ${sel.name} more metallic.`;
    }
    if (/\b(matte|rough|dull)\b/.test(t)) {
      scene.paintMaterial(sel.id, { metalness: 0.05, roughness: 1 });
      return `Gave ${sel.name} a matte finish.`;
    }
    if (/\b(big|bigger|large|larger|grow)\b/.test(t)) {
      scene.update(sel.id, { scale: sel.scale.map((v) => Math.min(3, v * 1.3)) as [number, number, number] });
      return `Scaled ${sel.name} up.`;
    }
    if (/\b(small|smaller|shrink)\b/.test(t)) {
      scene.update(sel.id, { scale: sel.scale.map((v) => Math.max(0.2, v * 0.7)) as [number, number, number] });
      return `Scaled ${sel.name} down.`;
    }
    return null;
  };

  const applyLighting = (t: string) => {
    const e = scene.env;
    if (/\b(dark|darker|dim|dimmer|night)\b/.test(t)) {
      scene.setEnv({ brightness: e.brightness - 0.35 });
      return "Dimmed the lighting.";
    }
    if (/\b(warm|warmer|sunset|cozy|golden)\b/.test(t)) {
      scene.setEnv({ warmth: e.warmth + 0.4 });
      return "Warmed up the light.";
    }
    if (/\b(cool|cooler|cold|daylight)\b/.test(t)) {
      scene.setEnv({ warmth: e.warmth - 0.4 });
      return "Cooled down the light.";
    }
    scene.setEnv({ brightness: e.brightness + 0.35 });
    return "Brightened the scene.";
  };

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text && !attached) return;
    const t = text.toLowerCase();
    const hadImage = attached;
    push({ role: "user", text: hadImage ? `${text || "Generate from this image"} 🖼️` : text });
    setInput("");
    setAttached(false);

    if (/\b(add|place|insert|put)\b/.test(t)) {
      const noun = extractNoun(t);
      const options: Opt[] = [1, 2, 3, 4].map((i) => ({ name: `${noun} 0${i}`, type: "mesh", seed: noun.length * 7 + i * 29 }));
      push({ role: "assistant", text: `Here are a few ${noun.toLowerCase()} options — pick one to drop in, or generate a new one.`, options });
      return;
    }
    if (hadImage || /\b(generate|create|make a|make an|new)\b/.test(t)) {
      const desc = extractDesc(t) || (hadImage ? "from your image" : "new asset");
      const gid = newId();
      setMessages((prev) => [...prev, { id: gid, role: "assistant", generating: true, text: `Generating ${desc}…` }]);
      window.setTimeout(() => {
        scene.add(title(desc === "from your image" ? "Generated asset" : desc), "mesh");
        setMessages((prev) => prev.map((m) => (m.id === gid ? { ...m, generating: false, text: `Generated “${desc}” and added it to your scene (saved to Uploads).` } : m)));
      }, 1400);
      return;
    }
    if (/\b(bright|brighter|light|lighter|dark|darker|dim|dimmer|warm|warmer|cool|cooler|sunset|night|daylight)\b/.test(t)) {
      push({ role: "assistant", text: applyLighting(t) });
      return;
    }
    const tweak = applyTweak(t);
    if (tweak) {
      push({ role: "assistant", text: tweak });
      return;
    }
    if (/\b(red|blue|green|metal|matte|bigger|smaller|color|texture|material)\b/.test(t) && !scene.selected) {
      push({ role: "assistant", text: "Select an object in the scene first, then tell me how to restyle it." });
      return;
    }
    push({ role: "assistant", text: "I can add assets, generate new objects, restyle the selected one, or change the lighting. Try “add a chair” or “make it warmer”." });
  };

  const pickOption = (o: Opt) => {
    scene.add(o.name, o.type);
    push({ role: "assistant", text: `Added ${o.name} to the scene — it's selected and framed for you.` });
  };

  return (
    <GlassPanel
      ui="ai-chat-panel"
      thickness="thick"
      className="pointer-events-auto fixed bottom-6 left-[84px] top-24 z-30 flex w-[360px] max-w-[calc(100vw-6rem)] animate-drawer-in flex-col !rounded-3xl"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-glass/10 p-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg border-2 border-brand text-brand">
          <Icon name="ai" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-panel-title text-content">AI Assistant</p>
          <p className="type-caption text-content-subtle">Build & edit the scene by chatting</p>
        </div>
        <button
          type="button"
          aria-label="Close AI chat"
          data-ui="ai-chat-close"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-lg text-content-muted hover:bg-glass/15 hover:text-content"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* Thread */}
      <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "type-body max-w-[85%] rounded-2xl px-3 py-2",
                m.role === "user" ? "bg-brand text-brand-foreground" : "bg-glass/10 text-content"
              )}
            >
              <span className="flex items-center gap-2">
                {m.generating && <Icon name="spinner" size={14} className="animate-spin text-brand" />}
                {m.text}
              </span>
              {m.options && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {m.options.map((o) => (
                    <button
                      key={o.name}
                      type="button"
                      data-ui={`ai-opt-${o.name.toLowerCase().replace(/\s+/g, "-")}`}
                      onClick={() => pickOption(o)}
                      className="group overflow-hidden rounded-xl ring-1 ring-glass/15 transition-transform hover:-translate-y-0.5"
                    >
                      <span className="block aspect-video">
                        <AssetThumb type={o.type} seed={o.seed} />
                      </span>
                      <span className="type-caption-strong block truncate bg-black/40 px-2 py-1 text-left text-white">{o.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="type-body-dense rounded-full border border-glass/12 bg-glass/6 px-3 py-1.5 text-content-muted transition-colors hover:bg-glass/12 hover:text-content"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-glass/10 p-3">
        {attached && (
          <div className="type-body-dense mb-2 inline-flex items-center gap-2 rounded-lg bg-glass/10 px-2 py-1 text-content-muted">
            <Icon name="attach" size={13} className="text-brand" />
            image.png
            <button type="button" aria-label="Remove image" onClick={() => setAttached(false)} className="text-content-subtle hover:text-danger">
              <Icon name="close" size={12} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-2xl border border-glass/12 bg-glass/8 px-2 py-1.5">
          <button
            type="button"
            aria-label="Attach image"
            data-ui="ai-attach"
            onClick={() => setAttached(true)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-muted hover:bg-glass/15 hover:text-content"
          >
            <Icon name="attach" size={17} />
          </button>
          <input
            data-ui="ai-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask to add, generate, or edit…"
            className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
          />
          <button
            type="button"
            aria-label="Send"
            data-ui="ai-send"
            onClick={() => send(input)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground transition-transform hover:scale-105 disabled:opacity-40"
            disabled={!input.trim() && !attached}
          >
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
    </GlassPanel>
  );
}
