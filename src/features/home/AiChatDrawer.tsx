import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { credits } from "./data";
import { useWorkspace } from "./workspace";

/**
 * TERRA AI, on the home page — the same assistant as the editor's, in the shape
 * a page can hold it: a right-hand drawer rather than a dock panel.
 *
 * It deliberately mirrors AiAgentPanel's anatomy — model name, a context chip
 * saying what it can see, TRY chips while the transcript is empty, and a well
 * for the composer with the same send/newline contract — because it IS that
 * assistant. Only the context differs: out here there is no scene, so what it
 * knows about is the workspace.
 *
 * The replies are scripted. This is the shell and the conversation shape, not
 * the model: `reply()` is the single seam where a real one would land.
 */

const TRY = [
  "Start a new world",
  "Find a project",
  "What have I made lately?",
  "Explain my credits",
  "Plan a capture run",
];

interface Turn {
  id: string;
  role: "user" | "agent" | "thinking";
  text?: string;
}

let seq = 0;
const nextId = () => `t-${(seq += 1)}`;

export function AiChatDrawer({
  open,
  onClose,
  onCreateWorld,
}: {
  open: boolean;
  onClose: () => void;
  /** the assistant can hand you off to the composer, which is the real action */
  onCreateWorld: () => void;
}) {
  const { projects, folders } = useWorkspace();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [showContext, setShowContext] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /** The seam. Everything above it is real UI; this is the part a model replaces. */
  function reply(asked: string): string {
    const q = asked.toLowerCase();
    if (q.includes("credit")) {
      return `You have ${credits.balance.toLocaleString()} credits left. Credits pay for every dataset run and don't reset monthly — a world costs 129, and Settings → Terra Balance shows what you've generated so far.`;
    }
    if (q.includes("lately") || q.includes("recent") || q.includes("made")) {
      const recent = projects.slice(0, 3).map((p) => p.name);
      return `Your last three are ${recent.join(", ")}. You've got ${projects.length} projects across ${folders.length} folders.`;
    }
    if (q.includes("find") || q.includes("where")) {
      return "Tell me a name and I'll take you to it — or open Projects and I'll narrow the shelf as you type.";
    }
    if (q.includes("world") || q.includes("start") || q.includes("new")) {
      return "OPEN_COMPOSER";
    }
    if (q.includes("capture") || q.includes("run")) {
      return "Capture runs are planned in the editor: open a project, then TerraGen sets cameras, weather and shot count. I can walk the axes with you once you're in there.";
    }
    return `I can start a world, find something you've made, or explain what your credits are going on. You currently have ${projects.length} projects open to me.`;
  }

  function send(text: string) {
    const asked = text.trim();
    if (!asked) return;
    setInput("");
    const answer = reply(asked);
    setTurns((prev) => [
      ...prev,
      { id: nextId(), role: "user", text: asked },
      { id: nextId(), role: "thinking" },
    ]);

    window.setTimeout(() => {
      setTurns((prev) => {
        const withoutThinking = prev.filter((t) => t.role !== "thinking");
        if (answer === "OPEN_COMPOSER") {
          onCreateWorld();
          return [
            ...withoutThinking,
            {
              id: nextId(),
              role: "agent",
              text: "Opening the composer — describe the world, or drop in up to four reference photos.",
            },
          ];
        }
        return [...withoutThinking, { id: nextId(), role: "agent", text: answer }];
      });
    }, 650);
  }

  if (!open) return null;

  return (
    <>
      <aside
        aria-label="Terra AI"
        data-ui="glass-ai-chat"
        /* Docked, not overlaid. The scrim and the z-50 made this a modal: the
           page behind it was dimmed and unclickable, so you could not read a
           project card while asking about it — which is most of what you'd ask.
           It now takes a column of its own and the content reflows beside it. */
        className="glass glass-thick fixed right-0 top-0 z-30 flex h-screen w-[24rem] max-w-[calc(100vw-4rem)] animate-panel-in flex-col !rounded-none"
      >
        <header className="flex shrink-0 items-center gap-1 border-b border-glass/10 px-3 py-2.5">
          <button
            type="button"
            className="-mx-1.5 flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-glass/15"
          >
            <span className="type-panel-title truncate text-content">Terra AI</span>
            <Icon name="chevron-down" size={14} className="shrink-0 text-content-subtle" />
          </button>
          <button
            type="button"
            aria-label="Close Terra AI"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
          >
            <Icon name="close" size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {/* What it can see. Dismissable, because once you know, it's furniture. */}
          {showContext && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-glass/10 bg-glass/5 px-2.5 py-1.5">
              <Icon name="world" size={15} className="shrink-0 text-content-subtle" />
              <span className="type-body-dense min-w-0 flex-1 truncate text-content-muted">
                No project open · {projects.length} projects · Terra Library on
              </span>
              <button
                type="button"
                aria-label="Hide context"
                onClick={() => setShowContext(false)}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-content-subtle transition-colors hover:text-content"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          )}

          {turns.length === 0 ? (
            <>
              <p className="type-eyebrow mb-2 text-content-subtle">TRY</p>
              <div className="flex flex-wrap gap-1.5">
                {TRY.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => send(t)}
                    className="type-body-dense flex items-center gap-1.5 rounded-full border border-glass/15 px-2.5 py-1.5 text-content-muted transition-colors hover:border-brand/50 hover:text-content"
                  >
                    <Icon name="generate" size={13} />
                    {t}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2.5">
              {turns.map((turn) =>
                turn.role === "thinking" ? (
                  <span key={turn.id} className="flex gap-1 px-1 py-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-thinking-dot rounded-full bg-content-subtle"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    ))}
                  </span>
                ) : (
                  <p
                    key={turn.id}
                    className={cn(
                      "type-body max-w-[92%] rounded-xl px-3 py-2",
                      turn.role === "user"
                        ? "self-end bg-brand text-brand-foreground"
                        : "self-start border border-glass/10 bg-glass/5 text-content"
                    )}
                  >
                    {turn.text}
                  </p>
                )
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-glass/10 p-2.5">
          <div className="field-well rounded-xl border transition-colors focus-within:border-brand/50">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask AI anything…"
              aria-label="Ask Terra AI"
              className="type-body max-h-28 w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-content outline-none placeholder:text-content-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <div className="flex items-center px-1.5 pb-1.5">
              <button
                type="button"
                aria-label="Attach an image or a file"
                className="grid h-8 w-8 place-items-center rounded-full text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
              >
                <Icon name="attach" size={17} />
              </button>
              <button
                type="button"
                aria-label="Send"
                disabled={!input.trim()}
                onClick={() => send(input)}
                className="ml-auto grid h-8 w-8 place-items-center rounded-full text-content-muted transition-colors hover:bg-glass/15 hover:text-content disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Icon name="send" size={17} />
              </button>
            </div>
          </div>
          <p className="type-caption mt-1.5 text-center text-content-subtle">
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </aside>
    </>
  );
}
