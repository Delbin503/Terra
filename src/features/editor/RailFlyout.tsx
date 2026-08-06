import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

export interface FlyoutItem {
  icon: IconName;
  label: string;
  accent?: boolean;
  onClick: () => void;
}

/** Positions (px) fanning out from the AI rail button (bottom-right anchor). */
const POS = [
  { x: 30, y: -72 }, // up-right
  { x: 66, y: -6 }, //  right
  { x: 30, y: 60 }, //  down-right
];

/**
 * RailFlyout — click the AI rail button to reveal MAT / ASA / AI Chat as
 * circular glass options that pop out with a staggered spring. Icons only;
 * the name shows on hover.
 */
export function RailFlyout({ items, onClose }: { items: FlyoutItem[]; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden />
      <div className="absolute bottom-0 left-full z-30 ml-1">
        {items.map((it, i) => (
          <FlyoutButton key={it.label} item={it} pos={POS[i] ?? POS[0]} shown={shown} delay={i * 55} />
        ))}
      </div>
    </>
  );
}

function FlyoutButton({
  item,
  pos,
  shown,
  delay,
}: {
  item: FlyoutItem;
  pos: { x: number; y: number };
  shown: boolean;
  delay: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={item.label}
      data-ui={`flyout-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={item.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        transform: shown ? `translate(${pos.x}px, ${pos.y}px) scale(1)` : "translate(0px,0px) scale(0.3)",
        opacity: shown ? 1 : 0,
        transitionDelay: `${delay}ms`,
      }}
      className="glass glass-chrome glass-interactive absolute grid h-12 w-12 place-items-center rounded-full text-content transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
    >
      <Icon name={item.icon} size={20} className={cn(item.accent && "text-brand")} strokeWidth={1.9} />
      {hover && (
        <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-surface-overlay px-2 py-1 text-xs font-medium text-content shadow-pop">
          {item.label}
        </span>
      )}
    </button>
  );
}
