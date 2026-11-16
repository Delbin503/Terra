import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";

/**
 * THE CUSTOM COLOUR PICKER, drawn in the panel's own glass.
 *
 * It replaced `<input type="color">`, whose picker is the browser's: a white,
 * square-cornered popover in system type, laid over a dark glass panel it has
 * nothing in common with — and impossible to restyle, because it isn't part of
 * the page. This one is: a saturation / brightness field, a hue rail, the
 * value written as Hex, RGB, HSL or HSB, and the eyedropper where the browser
 * has one.
 *
 * Works in HSV because that is what the field IS (x = saturation, y = value).
 * The hue is kept in local state rather than re-derived from the hex every
 * render: a grey has no hue, and re-deriving would snap the rail back to red
 * the moment you drag the field into the left edge.
 */

type Hsv = { h: number; s: number; v: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");

function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex(f(5) * 255, f(3) * 255, f(1) * 255);
}

/** HSV ↔ HSL, both with s / v / l in 0..1 and h in degrees. */
function hsvToHsl({ h, s, v }: Hsv) {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return { h, s: sl, l };
}
function hslToHsv(h: number, s: number, l: number): Hsv {
  const v = l + s * Math.min(l, 1 - l);
  return { h, s: v === 0 ? 0 : 2 * (1 - l / v), v };
}

/**
 * HOW THE NUMBERS ARE WRITTEN. The field and the rail are the same in every
 * mode; only the inputs under them change. Kept at module level so the mode
 * you prefer survives the panel closing and reopening.
 */
export type ColorMode = "hex" | "rgb" | "hsl" | "hsb";
const MODES: { id: ColorMode; label: string }[] = [
  { id: "hex", label: "Hex" },
  { id: "rgb", label: "RGB" },
  { id: "hsl", label: "HSL" },
  { id: "hsb", label: "HSB" },
];
let lastMode: ColorMode = "hex";

/** One numeric channel: typed freely, applied while valid, tidied on blur. */
function ChannelInput({
  label,
  value,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);
  const apply = (text: string) => {
    const n = Number(text);
    if (text.trim() !== "" && Number.isFinite(n)) onCommit(Math.min(max, Math.max(0, n)));
  };
  return (
    <label className="field-well flex h-8 min-w-0 flex-1 items-center gap-1 rounded-lg border px-2 transition-colors focus-within:border-brand/50">
      <span className="type-caption shrink-0 text-content-subtle">{label}</span>
      <input
        data-ui={`color-picker-${label.toLowerCase()}`}
        aria-label={label}
        inputMode="numeric"
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setDraft(e.target.value);
          apply(e.target.value);
        }}
        onBlur={() => {
          setEditing(false);
          setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const step = (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
            const next = Math.min(max, Math.max(0, value + step));
            setDraft(String(next));
            onCommit(next);
          }
        }}
        className="type-code-sm w-full min-w-0 bg-transparent text-right tabular-nums text-content outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </label>
  );
}

/** Pointer-drag over an element, reporting the pointer as 0..1 fractions. */
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const report = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onMove(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
  };
  return {
    ref,
    onPointerDown: (e: ReactPointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      report(e);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) report(e);
    },
  };
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => {
    const rgb = hexToRgb(value);
    return rgb ? rgbToHsv(...rgb) : { h: 30, s: 0.07, v: 0.6 };
  });
  const [draft, setDraft] = useState(value.toUpperCase());
  const [mode, setModeState] = useState<ColorMode>(lastMode);
  const setMode = (m: ColorMode) => {
    lastMode = m;
    setModeState(m);
  };
  const last = useRef(value.toLowerCase());

  // Follow edits made elsewhere (a swatch, undo) without fighting our own.
  useEffect(() => {
    if (value.toLowerCase() === last.current) return;
    last.current = value.toLowerCase();
    const rgb = hexToRgb(value);
    if (rgb) setHsv((prev) => {
      const next = rgbToHsv(...rgb);
      return next.s === 0 || next.v === 0 ? { ...next, h: prev.h } : next;
    });
    setDraft(value.toUpperCase());
  }, [value]);

  const commit = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    last.current = hex;
    setDraft(hex.toUpperCase());
    onChange(hex);
  };

  const field = useDrag((x, y) => commit({ ...hsv, s: x, v: 1 - y }));
  const rail = useDrag((x) => commit({ ...hsv, h: x * 360 }));

  const commitDraft = () => {
    const rgb = hexToRgb(draft);
    if (!rgb) return setDraft(hsvToHex(hsv).toUpperCase());
    const next = rgbToHsv(...rgb);
    commit(next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next);
  };

  const Dropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  const pickFromScreen = async () => {
    if (!Dropper) return;
    try {
      const { sRGBHex } = await new Dropper().open();
      const rgb = hexToRgb(sRGBHex);
      if (rgb) commit(rgbToHsv(...rgb));
    } catch {
      /* dismissed with Escape — nothing to do */
    }
  };

  const hex = hsvToHex(hsv);
  const rgb = hexToRgb(hex)!;
  const hsl = hsvToHsl(hsv);

  return (
    <div data-ui="color-picker" className="flex flex-col gap-3">
      {/* saturation → right, brightness → up */}
      <div
        {...field}
        data-ui="color-picker-field"
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuetext={hex.toUpperCase()}
        className="relative h-32 w-full cursor-crosshair touch-none overflow-hidden rounded-xl ring-1 ring-inset ring-glass/15"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
        }}
      >
        <span
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
        />
      </div>

      {/* hue */}
      <div
        {...rail}
        data-ui="color-picker-hue"
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        className="relative h-3 w-full cursor-pointer touch-none rounded-full ring-1 ring-inset ring-glass/15"
        style={{
          background:
            "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.4)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }}
        />
      </div>

      {/* how the value is written: Hex, RGB, HSL or HSB */}
      <div
        role="group"
        aria-label="Colour format"
        data-ui="color-picker-mode"
        className="flex items-center gap-0.5 rounded-lg border border-glass/10 bg-black/20 p-0.5"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            data-ui={`color-mode-${m.id}`}
            onClick={() => setMode(m.id)}
            className={cn(
              "type-caption-strong h-6 flex-1 rounded-md transition-colors",
              mode === m.id ? "bg-glass/15 text-content" : "text-content-subtle hover:text-content"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* the value, in that format — plus the eyedropper */}
      <div className="flex items-center gap-1.5">
        <span
          className="h-6 w-6 shrink-0 rounded-full ring-1 ring-glass/25"
          style={{ background: hex }}
          aria-hidden
        />
        {mode === "hex" && (
          <div className="field-well flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 transition-colors focus-within:border-brand/50">
            <span className="type-caption shrink-0 text-content-subtle">#</span>
            <input
              data-ui="color-picker-hex"
              aria-label="Hex colour"
              value={draft.replace(/^#/, "")}
              spellCheck={false}
              onChange={(e) => setDraft("#" + e.target.value.replace(/^#/, "").toUpperCase())}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setDraft(hex.toUpperCase());
              }}
              className="type-code-sm min-w-0 flex-1 bg-transparent tabular-nums text-content outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        )}
        {mode === "rgb" &&
          (["R", "G", "B"] as const).map((ch, i) => (
            <ChannelInput
              key={ch}
              label={ch}
              value={rgb[i]}
              max={255}
              onCommit={(v) => {
                const next = [...rgb] as [number, number, number];
                next[i] = v;
                const h = rgbToHsv(...next);
                commit(h.s === 0 || h.v === 0 ? { ...h, h: hsv.h } : h);
              }}
            />
          ))}
        {mode === "hsl" &&
          (["H", "S", "L"] as const).map((ch, i) => (
            <ChannelInput
              key={ch}
              label={ch}
              value={[Math.round(hsl.h), Math.round(hsl.s * 100), Math.round(hsl.l * 100)][i]}
              max={i === 0 ? 360 : 100}
              onCommit={(v) => {
                const n = { h: hsl.h, s: hsl.s, l: hsl.l };
                if (i === 0) n.h = v % 360;
                else if (i === 1) n.s = v / 100;
                else n.l = v / 100;
                commit(hslToHsv(n.h, n.s, n.l));
              }}
            />
          ))}
        {mode === "hsb" &&
          (["H", "S", "B"] as const).map((ch, i) => (
            <ChannelInput
              key={ch}
              label={ch}
              value={[Math.round(hsv.h), Math.round(hsv.s * 100), Math.round(hsv.v * 100)][i]}
              max={i === 0 ? 360 : 100}
              onCommit={(v) =>
                commit(i === 0 ? { ...hsv, h: v % 360 } : i === 1 ? { ...hsv, s: v / 100 } : { ...hsv, v: v / 100 })
              }
            />
          ))}
        {Dropper && (
          <button
            type="button"
            data-ui="color-picker-eyedropper"
            aria-label="Pick a colour from the screen"
            title="Pick a colour from the screen"
            onClick={pickFromScreen}
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-glass/14 text-content-muted transition-colors",
              "hover:border-brand/50 hover:bg-brand/12 hover:text-brand"
            )}
          >
            <Icon name="eyedropper" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
