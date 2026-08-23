/**
 * APP BACKDROP — what the platform's glass has to refract.
 * ------------------------------------------------------------------
 * Glass is a material that reports on what is BEHIND it. In the editor that is
 * a lit 3D scene, so the panels there read as glass without anyone arranging
 * it. The platform pages have no such thing — they sit on one flat `--canvas`
 * grey — and `backdrop-filter` over a flat fill produces, mathematically, the
 * same flat fill. Every panel would have gained a blur that changes nothing and
 * a shadow that reads as a rectangle.
 *
 * So the glass gets something to be glass ABOUT: a few wide, low-opacity colour
 * fields drawn from the brand ramp. They're far too diffuse to read as a
 * pattern — at any one spot on the page it's still "dark grey" — but they vary
 * across the surface, which is the whole requirement. A panel moved from one
 * side of the window to the other picks up a different tint through it.
 *
 * `fixed` and pointer-transparent: it never scrolls with content (parallax
 * would turn a texture into an effect) and never intercepts a click.
 */
export function AppBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      {/* Warm brand light from the top-left, where the rail and the greeting
          are — the page's centre of gravity. */}
      <div
        className="absolute -left-[10%] -top-[20%] h-[70vh] w-[60vw] rounded-full opacity-[0.30] blur-[120px]"
        style={{ background: "radial-gradient(circle, hsl(var(--brand)) 0%, transparent 70%)" }}
      />
      {/* A cooler counterweight low and right, so the field has a direction
          rather than one glow in a corner. */}
      <div
        className="absolute -bottom-[25%] -right-[5%] h-[65vh] w-[55vw] rounded-full opacity-[0.26] blur-[130px]"
        style={{ background: "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)" }}
      />
      {/* A dim middle band. Without it the centre of a wide window is flat
          again, which is exactly where the content panels sit. */}
      <div
        className="absolute left-1/3 top-1/4 h-[50vh] w-[45vw] rounded-full opacity-[0.18] blur-[140px]"
        style={{ background: "radial-gradient(circle, hsl(var(--brand-hover)) 0%, transparent 70%)" }}
      />
    </div>
  );
}
