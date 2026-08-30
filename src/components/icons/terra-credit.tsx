import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/**
 * THE CREDIT MARK — Terra's own mark, ringed.
 *
 * Credits were a lightning bolt: a generic "energy/power" glyph that every
 * other product uses for something else (a fast action, a boost, a battery),
 * and which said nothing about whose currency this is. A credit is Terra's
 * unit, so it is drawn with Terra's mark — the same lockup the rail shows
 * collapsed — inside a ring that makes it read as a token rather than as the
 * app's logo dropped into a sentence.
 *
 * It lives in the registry as `credits`, so the top bar's chip, the rail's
 * balance row, the Work Orders cost column, the credits popover and the
 * balance card all changed together and none of them had to be found.
 *
 * WHY THE PATHS ARE INLINE and not the SVG file in `public/`: an `<img>` cannot
 * take `currentColor`. This glyph appears in brand orange on glass, in white on
 * a gradient tile, and muted in a table — one file with a baked-in gradient
 * could only ever be the first of those.
 */
export const TerraCredit = forwardRef<SVGSVGElement, LucideProps>(
  (
    { size, color = "currentColor", strokeWidth = 2, absoluteStrokeWidth: _abs, ...rest },
    ref
  ) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      {...rest}
    >
      <circle cx="12" cy="12" r="10.1" stroke={color} strokeWidth={strokeWidth} />
      {/* The mark itself, from `logo-collapse.svg` — a 41×25 drawing scaled to
          12px wide and centred, so the ring keeps its own breathing room at
          every size the icon is set at. */}
      <g transform="translate(6 8.34) scale(0.2927)" fill={color} stroke="none">
        <path d="M39.5153 0H23.3838C22.4042 0.405531 21.4672 0.885765 20.5728 1.43003C17.9534 3.02014 15.7174 5.16519 14.0137 7.69442C12.4378 10.0316 11.3198 12.7102 10.7874 15.5916L11.7031 16.9149L16.3137 23.5848L17.2294 24.9082C17.1442 24.2145 17.0909 23.5208 17.0909 22.8058C17.0909 22.6884 17.0909 22.571 17.0909 22.4429C17.24 15.741 21.414 10.0422 27.2916 7.68375H35.1497L35.8205 6.71261L40.2394 0.320156L40.463 0H39.5153Z" />
        <path d="M15.6205 0.843078C15.9612 0.554937 16.3019 0.277469 16.664 0H16.2061H10.6373H6.10352e-05L5.32399 7.69442L8.10308 11.7177L8.23085 11.8991C8.30539 11.6537 8.39057 11.4189 8.47575 11.1735C8.91232 9.96753 9.43406 8.8043 10.041 7.69442C11.4784 5.07981 13.3738 2.76402 15.6205 0.843078Z" />
      </g>
    </svg>
  )
);
TerraCredit.displayName = "TerraCredit";
