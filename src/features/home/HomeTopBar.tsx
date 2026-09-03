import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, IconButton } from "@/components/ui";
import { CreditsPanel } from "@/features/editor/CreditsMenu";
import { useDismissable } from "@/features/editor/use-dismissable";
import { useSettings } from "@/features/settings/settings-store";
import { user } from "./data";
import { useWorkspace } from "./workspace";

/**
 * HomeTopBar — Pricing, the credit balance, feedback, account.
 *
 * It sits in the main column rather than spanning the sidebar, so the greeting
 * below it stays centred on the content and not on the window. Everything here
 * is account-level and read-only at a glance; the things you *spend* credits on
 * are further down the page.
 *
 * `breadcrumb` fills the empty left half. The home page has nothing to put
 * there — it IS the top of the tree — so the slot stays optional rather than
 * every page having to pass a trail.
 *
 * `minimal` drops everything between the breadcrumb and the avatar. Pricing is
 * the one page that asks for it, and for the reason the flag exists at all: its
 * whole subject is the balance and the plans, so a link to itself and a chip of
 * the number it is explaining would both be noise on top of the answer.
 */
export function HomeTopBar({
  breadcrumb,
  onChat,
  onPricing,
  minimal,
}: {
  breadcrumb?: ReactNode;
  /** opens Terra AI — the bubble is the assistant, not a feedback form */
  onChat?: () => void;
  /** the plans page. Every screen with this bar can reach it */
  onPricing?: () => void;
  /** breadcrumb and account only — see above */
  minimal?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {breadcrumb}
      <div className="flex-1" />
      {!minimal && (
        <>
          <button
            type="button"
            onClick={onPricing}
            className="type-button-sm rounded-lg px-2 py-1.5 text-brand transition-colors hover:text-brand-hover"
          >
            Pricing
          </button>

          <CreditsChip />

          <IconButton
            icon="feedback"
            label="Ask Terra AI"
            variant="solid"
            onClick={onChat}
            className="h-10 w-10"
          />
        </>
      )}

      {/* The avatar is the way into Settings — the account lives behind your own
          face, not behind a gear in a list of tools. */}
      <button
        type="button"
        aria-label={`Account and settings: ${user.name}`}
        title={`${user.name} · Settings`}
        onClick={() => {
          window.location.hash = "#settings";
        }}
      >
        <Avatar name={user.name} size={40} />
      </button>
    </div>
  );
}

/**
 * The balance, and what you can do about it.
 *
 * It was a read-only chip: the one number in the chrome that everything in the
 * product spends, with no way in. The editor has had the answer since the bolt
 * button was built — the Credits popover — so the chip opens THAT panel rather
 * than a second one shaped like it. Same panel, same identity line, same Top Up.
 */
function CreditsChip() {
  /* The org the rail is showing, not a constant: the balance belongs to
     whichever organization you switched into, so the panel has to name that
     one — otherwise switching orgs leaves a stale identity on the money. */
  const { org } = useWorkspace();
  const { creditBalance } = useSettings();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), wrap);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label={`Credits: ${creditBalance.toLocaleString()}`}
        aria-expanded={open}
        data-ui="web-credits"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "glass-chrome flex h-10 items-center gap-2 !rounded-lg px-3 transition-colors hover:bg-glass/20",
          open && "bg-glass/20"
        )}
      >
        <Icon name="credits" size={16} className="text-brand" />
        <span className="type-body-strong tabular-nums">{creditBalance.toLocaleString()}</span>
      </button>

      {open && (
        <CreditsPanel
          workspace={org.name}
          onClose={() => setOpen(false)}
          /* Hung from the RIGHT edge: this chip sits in the right-hand cluster,
             and a panel opening leftward from it would run off the window. */
          className="absolute right-0 top-[calc(100%+10px)] z-50 origin-top-right animate-menu-in"
        />
      )}
    </div>
  );
}
