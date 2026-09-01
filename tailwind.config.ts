import type { Config } from "tailwindcss";

/**
 * Terra design system — Tailwind maps every utility onto a CSS variable
 * defined in src/styles/tokens.css. Colors use the `hsl(var(--x) / <alpha-value>)`
 * pattern so opacity modifiers (bg-surface/50) keep working.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem" },
    extend: {
      colors: {
        // Core surfaces
        canvas: "hsl(var(--canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          raised: "hsl(var(--surface-raised) / <alpha-value>)",
          overlay: "hsl(var(--surface-overlay) / <alpha-value>)",
          sunken: "hsl(var(--surface-sunken) / <alpha-value>)",
        },
        // Text / foreground
        content: {
          DEFAULT: "hsl(var(--content) / <alpha-value>)",
          muted: "hsl(var(--content-muted) / <alpha-value>)",
          subtle: "hsl(var(--content-subtle) / <alpha-value>)",
          inverse: "hsl(var(--content-inverse) / <alpha-value>)",
        },
        line: {
          DEFAULT: "hsl(var(--line) / <alpha-value>)",
          strong: "hsl(var(--line-strong) / <alpha-value>)",
        },
        // Brand + semantic roles
        brand: {
          DEFAULT: "hsl(var(--brand) / <alpha-value>)",
          hover: "hsl(var(--brand-hover) / <alpha-value>)",
          soft: "hsl(var(--brand-soft) / <alpha-value>)",
          foreground: "hsl(var(--brand-foreground) / <alpha-value>)",
          // label colour for a role-tinted glass ornament — see tokens.css
          "on-glass": "hsl(var(--brand-on-glass) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          hover: "hsl(var(--accent-hover) / <alpha-value>)",
          soft: "hsl(var(--accent-soft) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          soft: "hsl(var(--success-soft) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          soft: "hsl(var(--warning-soft) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "hsl(var(--danger) / <alpha-value>)",
          soft: "hsl(var(--danger-soft) / <alpha-value>)",
          "on-glass": "hsl(var(--danger-on-glass) / <alpha-value>)",
        },
        // The three object roles. Master is the hero, distractor is the clutter
        // a detector must ignore, backdrop is the dressing behind both.
        master: {
          DEFAULT: "hsl(var(--master) / <alpha-value>)",
          "on-glass": "hsl(var(--master-on-glass) / <alpha-value>)",
        },
        distractor: {
          DEFAULT: "hsl(var(--distractor) / <alpha-value>)",
          "on-glass": "hsl(var(--distractor-on-glass) / <alpha-value>)",
        },
        backdrop: {
          DEFAULT: "hsl(var(--backdrop) / <alpha-value>)",
          "on-glass": "hsl(var(--backdrop-on-glass) / <alpha-value>)",
        },
        // Notification categories — an identity palette, not state. See tokens.css.
        notify: {
          project: "hsl(var(--notify-project) / <alpha-value>)",
          organization: "hsl(var(--notify-organization) / <alpha-value>)",
          billing: "hsl(var(--notify-billing) / <alpha-value>)",
          security: "hsl(var(--notify-security) / <alpha-value>)",
          collaboration: "hsl(var(--notify-collaboration) / <alpha-value>)",
          system: "hsl(var(--notify-system) / <alpha-value>)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        // visionOS glass tint — for ad-hoc alpha use (bg-glass/10);
        // prefer the composed .glass* material classes for real ornaments.
        glass: "hsl(var(--glass-tint) / <alpha-value>)",
      },
      fontFamily: {
        display: "var(--font-display)",
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        // token scale — [size, lineHeight]
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        xs: ["0.75rem", { lineHeight: "1.1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.875rem", { lineHeight: "1.5rem" }],
        md: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.6rem" }],
        xl: ["1.25rem", { lineHeight: "1.7rem" }],
        "2xl": ["1.5rem", { lineHeight: "1.9rem" }],
        "3xl": ["2rem", { lineHeight: "2.3rem" }],
        "4xl": ["2.5rem", { lineHeight: "2.8rem" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "var(--radius-3xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        pop: "var(--shadow-pop)",
        // ambient drop shadows for floating glass ornaments
        "glass-sm": "var(--glass-shadow-sm)",
        "glass-md": "var(--glass-shadow-md)",
        "glass-lg": "var(--glass-shadow-lg)",
      },
      spacing: {
        rail: "var(--rail-w)",
        "rail-collapsed": "var(--rail-w-collapsed)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        // A centred modal. The `translate(-50%, -50%)` is NOT decoration — it is
        // the dialog's own centring, repeated inside the keyframes because an
        // animation's `transform` REPLACES the element's for the whole run.
        // Without it the dialog jumped a half-width down and right on open, slid
        // to that wrong spot, then snapped back to centre on the last frame.
        "modal-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) translateY(0) scale(1)" },
        },
        // A docked drawer slides in from its own edge rather than scaling up —
        // it arrives from off-screen, it doesn't grow out of nothing.
        "drawer-in": {
          from: { opacity: "0", transform: "translateX(-16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        // A panel arriving in the right-hand dock. Mirrors drawer-in — it comes
        // from ITS edge, which is the right one now, not the left.
        "panel-in": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        // A sheet docked to the BOTTOM edge — the asset library. Same idea as
        // drawer-in and panel-in: it arrives from the edge it lives on, so the
        // motion says where the thing came from rather than just that it
        // appeared.
        "sheet-in": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // A menu hanging off a button in the top bar. Shorter throw than the
        // docked panels and a touch of scale: it belongs to the control that
        // opened it and drops out of it, rather than sliding in from a screen
        // edge it has nothing to do with. `top` origin is set at the call site,
        // so it grows downward out of its own trigger.
        "menu-in": {
          from: { opacity: "0", transform: "translateY(-6px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Indeterminate work: a highlight travelling across a track.
        shimmer: {
          from: { transform: "translateX(-110%)" },
          to: { transform: "translateX(210%)" },
        },
        // …and the three dots under it, offset per dot by animationDelay.
        "thinking-dot": {
          "0%, 80%, 100%": { opacity: "0.25", transform: "translateY(0)" },
          "40%": { opacity: "1", transform: "translateY(-2px)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease",
        "overlay-in": "overlay-in 0.18s ease",
        "modal-in": "modal-in 0.2s cubic-bezier(0.16,1,0.3,1)",
        "drawer-in": "drawer-in 0.26s cubic-bezier(0.16,1,0.3,1)",
        "panel-in": "panel-in 0.26s cubic-bezier(0.16,1,0.3,1)",
        "sheet-in": "sheet-in 0.26s cubic-bezier(0.16,1,0.3,1)",
        // Quicker than the panels. A menu is a response to the click that is
        // still under the cursor, and 260ms on something that small reads as
        // lag rather than as motion.
        "menu-in": "menu-in 0.16s cubic-bezier(0.16,1,0.3,1)",
        shimmer: "shimmer 1.5s ease-in-out infinite",
        "thinking-dot": "thinking-dot 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
