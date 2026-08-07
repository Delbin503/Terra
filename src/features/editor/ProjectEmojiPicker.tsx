import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, PanelEyebrow, PanelBody, PanelSection } from "./ui";

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
 * grouped palette. Built from the same Panel primitives as the docked panels,
 * so its header/body/section layers match theirs exactly — and on the `overlay`
 * glass tier, because it covers the left rail rather than just the 3D scene.
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
          "grid h-9 w-9 place-items-center rounded-lg border-2 border-brand type-glyph transition-colors hover:bg-glass/15",
          open && "bg-glass/15"
        )}
      >
        <span aria-hidden>{value}</span>
      </button>

      {open && (
        <Panel
          ui="emoji-picker"
          thickness="overlay"
          className="absolute left-0 top-[calc(100%+10px)] z-50 max-h-[320px] w-[248px] !rounded-2xl"
        >
          <PanelHeader className="px-3 py-2.5">
            <PanelEyebrow>Project emoji</PanelEyebrow>
            <button
              type="button"
              data-ui="emoji-picker-reset"
              onClick={() => {
                onChange(emojiForProject(projectName));
                setOpen(false);
              }}
              className="type-caption text-content-muted transition-colors hover:text-content"
            >
              Reset
            </button>
          </PanelHeader>

          <PanelBody className="p-2">
            {EMOJI_GROUPS.map((g) => (
              <PanelSection key={g.label} title={g.label} className="mb-3 last:mb-0">
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
                        "grid h-9 place-items-center rounded-lg type-glyph transition-colors hover:bg-glass/15",
                        e === value && "bg-brand/25 ring-1 ring-brand/60"
                      )}
                    >
                      <span aria-hidden>{e}</span>
                    </button>
                  ))}
                </div>
              </PanelSection>
            ))}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
