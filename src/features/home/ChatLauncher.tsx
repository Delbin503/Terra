import { Icon } from "@/components/icons";

/** The centered chat bar — the primary entry point into world creation. */
export function ChatLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-haspopup="dialog"
      className="group mx-auto flex h-16 w-full max-w-2xl items-center gap-3 rounded-2xl border border-line/12 bg-surface-raised px-5 text-left transition-colors hover:border-brand hover:bg-surface-overlay"
    >
      <Icon name="generate" size={20} className="text-content-subtle group-hover:text-brand" />
      <span className="flex-1 text-lg text-content-subtle">
        Ask Terra or describe a world to generate…
      </span>
      <kbd className="rounded-md border border-line/12 px-2 py-1 text-xs text-content-subtle">
        ⌘K
      </kbd>
    </button>
  );
}
