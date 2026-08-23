import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Avatar, IconButton } from "@/components/ui";
import { credits, user } from "./data";

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
 */
export function HomeTopBar({
  breadcrumb,
  onChat,
}: {
  breadcrumb?: ReactNode;
  /** opens Terra AI — the bubble is the assistant, not a feedback form */
  onChat?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {breadcrumb}
      <div className="flex-1" />
      <button
        type="button"
        className="type-button-sm rounded-lg px-2 py-1.5 text-brand transition-colors hover:text-brand-hover"
      >
        Pricing
      </button>

      <div className="glass-chrome flex h-10 items-center gap-2 !rounded-lg px-3">
        <Icon name="credits" size={16} className="text-brand" />
        <span className="type-body-strong tabular-nums">{credits.balance}</span>
      </div>

      <IconButton
        icon="feedback"
        label="Ask Terra AI"
        variant="solid"
        onClick={onChat}
        className="h-10 w-10"
      />

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
