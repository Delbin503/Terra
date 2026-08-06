import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/glass";

/** Picker palette, grouped so the list stays scannable rather than a wall of glyphs. */
const EMOJI_GROUPS: { label: string; emoji: string[] }[] = [
  { label: "Places", emoji: ["🏜️", "🏔️", "🌋", "🏝️", "🏙️", "🌆", "🛣️", "🌉", "🏗️", "🏭"] },
  { label: "Nature", emoji: ["🌲", "🌵", "🪨", "🌊", "🔥", "❄️", "☀️", "🌙", "⭐", "🍂"] },
  { label: "Objects", emoji: ["🚗", "🚚", "✈️", "🚀", "🛸", "🤖", "📦", "🧱", "⚙️", "🔧"] },
  { label: "Abstract", emoji: ["🎨", "✨", "💡", "🎯", "🧭", "🗺️", "📐", "🔷", "🟠", "⬛"] },
];

/** Keyword → emoji, used to seed the mark from the project name. First match wins,
 *  so more specific words are listed before generic ones. */
const NAME_HINTS: [RegExp, string][] = [
  [/desert|dune|sand/i, "🏜️"],
  [/mountain|alp|peak|cliff/i, "🏔️"],
  [/volcano|lava/i, "🌋"],
  [/island|coast|beach|shore/i, "🏝️"],
  [/traffic|road|street|highway/i, "🛣️"],
  [/city|urban|downtown|district/i, "🏙️"],
  [/bridge/i, "🌉"],
  [/factory|plant|industrial/i, "🏭"],
  [/construct|build|site/i, "🏗️"],
  [/forest|tree|wood|pine/i, "🌲"],
  [/ocean|sea|water|harbor|harbour/i, "🌊"],
  [/snow|frost|ice|winter/i, "❄️"],
  [/night|dark|moon/i, "🌙"],
  [/sun|day|dawn|dusk/i, "☀️"],
  [/car|vehicle|auto/i, "🚗"],
  [/truck|freight|cargo/i, "🚚"],
  [/space|rocket|orbit/i, "🚀"],
  [/robot|mech|android/i, "🤖"],
  [/neon|glow/i, "✨"],
  [/valley|field|meadow|plain/i, "🍂"],
];

/** Emoji a project starts with, derived from its name. */
export function emojiForProject(projectName: string): string {
  for (const [re, emoji] of NAME_HINTS) if (re.test(projectName)) return emoji;
  return "🗺️";
}

/**
 * ProjectEmojiPicker — the top-bar project mark. Click to swap the emoji from a
 * grouped palette. The popover reuses GlassPanel so it reads as the same
 * material as every other floating surface over the 3D scene.
 */
export function ProjectEmojiPicker({
  value,
  onChange,
  projectName,
}: {
  value: string;
  onChange: (emoji: string) => void;
  projectName: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Dismiss on outside click / Escape, like the app's other popovers.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        data-ui="editor-brand-mark"
        aria-label={`Project emoji: ${value}. Click to change`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-lg border-2 border-brand text-lg leading-none transition-colors hover:bg-glass/15",
          open && "bg-glass/15"
        )}
      >
        <span aria-hidden>{value}</span>
      </button>

      {open && (
        <GlassPanel
          ui="emoji-picker"
          thickness="regular"
          className="absolute left-0 top-[calc(100%+10px)] z-50 w-[248px] !rounded-2xl p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wide text-content-subtle">
              Project emoji
            </span>
            <button
              type="button"
              data-ui="emoji-reset"
              onClick={() => {
                onChange(emojiForProject(projectName));
                setOpen(false);
              }}
              className="text-2xs text-content-muted transition-colors hover:text-content"
            >
              Reset
            </button>
          </div>

          <div className="max-h-[260px] overflow-y-auto pr-0.5">
            {EMOJI_GROUPS.map((g) => (
              <div key={g.label} className="mb-2 last:mb-0">
                <span className="mb-1 block text-2xs font-medium text-content-subtle">{g.label}</span>
                <div className="grid grid-cols-5 gap-1">
                  {g.emoji.map((e) => (
                    <button
                      key={e}
                      type="button"
                      data-ui={`emoji-${e}`}
                      aria-label={e}
                      aria-pressed={e === value}
                      onClick={() => {
                        onChange(e);
                        setOpen(false);
                      }}
                      className={cn(
                        "grid h-9 place-items-center rounded-lg text-lg leading-none transition-colors hover:bg-glass/15",
                        e === value && "bg-brand/25 ring-1 ring-brand/60"
                      )}
                    >
                      <span aria-hidden>{e}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
