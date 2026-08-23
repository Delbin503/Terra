import { Icon } from "@/components/icons";

/**
 * The centred command bar — the primary entry point into world creation.
 *
 * Sized to a comfortable reading measure rather than to the page: at full width
 * it read as a form field, and this is a prompt. The `+` rather than a sparkle
 * because it opens a compose dialog, not a one-shot generation.
 */
export function ChatLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-haspopup="dialog"
      className="glass glass-interactive group mx-auto flex h-[52px] w-full max-w-[36rem] items-center gap-2.5 !rounded-xl px-4 text-left transition-colors hover:border-brand"
    >
      <Icon
        name="create"
        size={18}
        className="shrink-0 text-content-subtle group-hover:text-brand"
      />
      <span className="type-body-lg flex-1 truncate text-content-subtle">
        Ask Terra to describe a world to generate…
      </span>
      <kbd className="type-label shrink-0 font-sans text-content-subtle">⌘ K</kbd>
    </button>
  );
}
