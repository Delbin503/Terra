import * as React from "react";

/**
 * PlaceholderImage — the one stand-in photo for empty image slots.
 *
 * Drop a file at `public/placeholder.jpg` and every placeholder across the
 * editor fills in at once. Until that file exists — or if it ever fails to
 * load — each caller falls back to the artwork it drew before, so a missing
 * file degrades to the old look instead of a broken-image icon.
 */
export const PLACEHOLDER_SRC = "/placeholder.jpg";

export function PlaceholderImage({
  className,
  fallback = null,
}: {
  className?: string;
  /** what to render instead when the photo isn't available */
  fallback?: React.ReactNode;
}) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={PLACEHOLDER_SRC}
      alt=""
      aria-hidden
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
