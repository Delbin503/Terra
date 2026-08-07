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
        master: {
          DEFAULT: "hsl(var(--master) / <alpha-value>)",
          "on-glass": "hsl(var(--master-on-glass) / <alpha-value>)",
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
        "modal-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease",
        "overlay-in": "overlay-in 0.18s ease",
        "modal-in": "modal-in 0.2s cubic-bezier(0.16,1,0.3,1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
