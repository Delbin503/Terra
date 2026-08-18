import { Fragment, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Meter } from "@/components/ui";
import { AssetThumb } from "./AssetThumb";
import { typeIcon, type AssetType } from "./assets-data";
import type { NodeRef, Part, PermissionCard, RunStep, RunTurn, TaskCard } from "./ai-agent-script";

/**
 * AI AGENT — the render vocabulary.
 *
 * Everything the agent can put in the thread, drawn in the editor's own glass
 * language: node deep-links, bundled node groups, image previews, collapsible
 * technical output, file references, work cards and permission prompts.
 *
 * These are deliberately dumb. They take a part and a callback; they never know
 * what the agent is doing or which turn they belong to.
 */

/* --------------------------------------------------------------- markdown */

/** Inline spans: **bold**, *italic*, `code`, [text](url), [[Object Name]]. */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;

function inline(text: string, refs: NodeRef[], onNode: (id: string) => void): ReactNode {
  return text.split(INLINE).map((tok, i) => {
    if (!tok) return null;
    const key = `${i}-${tok.slice(0, 8)}`;

    if (tok.startsWith("**") && tok.endsWith("**"))
      return (
        <strong key={key} className="font-semibold text-content">
          {tok.slice(2, -2)}
        </strong>
      );

    if (tok.startsWith("`") && tok.endsWith("`"))
      return (
        <code key={key} className="type-code-sm rounded bg-glass/15 px-1 py-px text-content">
          {tok.slice(1, -1)}
        </code>
      );

    if (tok.startsWith("[[") && tok.endsWith("]]")) {
      const name = tok.slice(2, -2);
      const node = refs.find((r) => r.name === name);
      // An unresolved reference degrades to its own text rather than vanishing —
      // a renamed object shouldn't punch a hole in a sentence.
      return node ? (
        <NodeLink key={key} node={node} onClick={() => onNode(node.id)} />
      ) : (
        <Fragment key={key}>{name}</Fragment>
      );
    }

    if (tok.startsWith("[")) {
      const m = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m)
        return (
          <a
            key={key}
            href={m[2]}
            target="_blank"
            rel="noreferrer"
            className="text-brand underline-offset-2 hover:underline"
          >
            {m[1]}
          </a>
        );
    }

    if (tok.startsWith("*") && tok.endsWith("*"))
      return (
        <em key={key} className="italic">
          {tok.slice(1, -1)}
        </em>
      );

    return <Fragment key={key}>{tok}</Fragment>;
  });
}

const BULLET = /^[-*]\s+/;
const ORDERED = /^\d+\.\s+/;

/** Block-level markdown: paragraphs plus bullet and numbered lists. */
export function Markdown({
  text,
  refs = [],
  onNode,
}: {
  text: string;
  refs?: NodeRef[];
  onNode: (id: string) => void;
}) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`l${blocks.length}`}
        className={cn(
          "my-1.5 space-y-1 pl-4",
          list.ordered ? "list-decimal" : "list-[disc]",
          "marker:text-content-subtle"
        )}
      >
        {list.items.map((item, i) => (
          <li key={i}>{inline(item, refs, onNode)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) {
      flush();
      return;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(line.replace(ordered ? ORDERED : BULLET, ""));
      return;
    }
    flush();
    blocks.push(
      <p key={`p${blocks.length}`} className="[&:not(:first-child)]:mt-2">
        {inline(line, refs, onNode)}
      </p>
    );
  });
  flush();

  return <div className="type-body text-content-muted [&_strong]:text-content">{blocks}</div>;
}

/* ------------------------------------------------------------- node links */

/** A deep-link to one object. Inline-flex so it can sit mid-sentence. */
export function NodeLink({ node, onClick }: { node: NodeRef; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ui="ai-node-link"
      onClick={onClick}
      title={`Select ${node.name} in the viewport`}
      className="inline-flex translate-y-px items-baseline gap-1 rounded-md bg-glass/12 px-1 py-px align-baseline text-content transition-colors hover:bg-brand-soft hover:text-brand"
    >
      <Icon name={typeIcon[node.type]} size={12} className="translate-y-0.5" />
      <span className="type-label-strong">{node.name}</span>
    </button>
  );
}

/** Standalone chip — a row of these is how the agent hands back a match set. */
export function NodeChip({ node, onClick }: { node: NodeRef; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ui="ai-node-chip"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-glass/15 bg-glass/10 px-2 py-1 text-content-muted transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
    >
      <Icon name={typeIcon[node.type]} size={13} />
      <span className="type-label">{node.name}</span>
    </button>
  );
}

/** Many nodes behind one chip. Expands rather than links, because "which three?"
 *  is the first question a bundle raises. */
export function NodeGroupChip({
  label,
  nodes,
  onNode,
}: {
  label: string;
  nodes: NodeRef[];
  onNode: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-ui="ai-node-group" className="my-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-glass/15 bg-glass/10 px-2.5 py-1 text-content transition-colors hover:bg-glass/18"
      >
        <Icon name="nodes" size={13} className="text-brand" />
        <span className="type-label-strong">{label}</span>
        <Icon
          name="chevron-down"
          size={13}
          className={cn("text-content-subtle transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {nodes.map((n) => (
            <NodeChip key={n.id} node={n} onClick={() => onNode(n.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

/** An image the agent made. Capped narrow inline; click to fill the column. */
function ImagePart({ seed, type, caption }: { seed: number; type: AssetType; caption?: string }) {
  const [big, setBig] = useState(false);
  return (
    <figure className={cn("my-2", big ? "w-full" : "w-[200px] max-w-full")}>
      <button
        type="button"
        onClick={() => setBig((v) => !v)}
        aria-label={big ? "Collapse preview" : "Expand preview"}
        className="group relative block w-full overflow-hidden rounded-xl border border-glass/15"
      >
        <div className="aspect-[4/3] w-full">
          <AssetThumb type={type} seed={seed} />
        </div>
        <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/45 text-white/85 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <Icon name={big ? "minimize" : "gizmo-fit"} size={13} />
        </span>
      </button>
      {caption && (
        <figcaption className="type-caption mt-1 text-content-subtle">{caption}</figcaption>
      )}
    </figure>
  );
}

/** Technical output. Collapsed by default — it's evidence, not the answer. */
function CodeBlock({ label, code }: { label: string; code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-ui="ai-code" className="my-2 overflow-hidden rounded-lg border border-glass/12">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 bg-glass/8 px-2 py-1.5 text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
      >
        <Icon name="code" size={13} />
        <span className="type-label flex-1 text-left">{label}</span>
        <Icon
          name="chevron-down"
          size={13}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <pre className="type-code-sm max-h-52 overflow-auto whitespace-pre bg-black/25 px-2.5 py-2 text-content-muted">
          {code}
        </pre>
      )}
    </div>
  );
}

/** A reference to another project file. */
function FileCard({ name, meta, seed }: { name: string; meta: string; seed: number }) {
  return (
    <div
      data-ui="ai-file-card"
      className="my-2 flex items-center gap-2.5 rounded-xl border border-glass/12 bg-glass/8 p-2"
    >
      <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md border border-glass/12">
        <AssetThumb type="environment" seed={seed} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="type-label-strong truncate text-content">{name}</p>
        <p className="type-caption truncate text-content-subtle">{meta}</p>
      </div>
      <button
        type="button"
        className="type-label-strong shrink-0 rounded-md px-2 py-1 text-brand transition-colors hover:bg-brand-soft"
      >
        Open
      </button>
    </div>
  );
}

/** One message part, dispatched by kind. */
export function MessagePart({
  part,
  refs,
  onNode,
}: {
  part: Part;
  refs: NodeRef[];
  onNode: (id: string) => void;
}) {
  switch (part.kind) {
    case "md":
      return <Markdown text={part.text} refs={refs} onNode={onNode} />;
    case "nodes":
      return (
        <div className="my-2 flex flex-wrap gap-1.5">
          {part.nodes.map((n) => (
            <NodeChip key={n.id} node={n} onClick={() => onNode(n.id)} />
          ))}
        </div>
      );
    case "group":
      return <NodeGroupChip label={part.label} nodes={part.nodes} onNode={onNode} />;
    case "image":
      return <ImagePart seed={part.seed} type={part.type} caption={part.caption} />;
    case "code":
      return <CodeBlock label={part.label} code={part.code} />;
    case "file":
      return <FileCard name={part.name} meta={part.meta} seed={part.seed} />;
  }
}

/* -------------------------------------------------------------------- run */

/** The status glyph for one step in a run's checklist. */
function StepGlyph({ status }: { status: RunStep["status"] }) {
  if (status === "running")
    return <Icon name="spinner" size={13} className="shrink-0 animate-spin text-brand" />;
  if (status === "done") return <Icon name="check" size={13} className="shrink-0 text-success" />;
  if (status === "error") return <Icon name="error" size={13} className="shrink-0 text-danger" />;
  // pending — reached but not started: a hollow ring, dimmed
  return <span className="mx-px h-2.5 w-2.5 shrink-0 rounded-full border border-glass/30" />;
}

/** The step checklist — the body of a run while it works, and of a result with
 *  no per-asset changes to show instead. */
function StepList({ steps }: { steps: RunStep[] }) {
  return (
    <ul data-ui="ai-run-steps" className="space-y-1.5">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2">
          <span className="mt-0.5">
            <StepGlyph status={s.status} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "type-label block",
                s.status === "pending" ? "text-content-subtle" : "text-content-muted",
                s.status === "running" && "text-content"
              )}
            >
              {s.label}
            </span>
            {s.detail && s.status !== "pending" && (
              <span className="type-caption block text-content-subtle">{s.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One asset's worth of changes in a result — a deep-link header over its edits. */
function AssetChangeRow({ node, changes, onNode }: { node: NodeRef; changes: string[]; onNode: (id: string) => void }) {
  return (
    <div data-ui="ai-run-asset" className="rounded-lg border border-glass/10 bg-glass/5">
      <button
        type="button"
        onClick={() => onNode(node.id)}
        title={`Select ${node.name} in the viewport`}
        className="group flex w-full items-center gap-1.5 rounded-t-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-soft"
      >
        <Icon name={typeIcon[node.type]} size={13} className="shrink-0 text-content-subtle group-hover:text-brand" />
        <span className="type-label-strong min-w-0 flex-1 truncate text-content group-hover:text-brand">
          {node.name}
        </span>
        <Icon
          name="gizmo-focus"
          size={13}
          className="shrink-0 text-content-subtle opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-brand"
        />
      </button>
      <ul className="space-y-0.5 px-2 pb-1.5 pl-7">
        {changes.map((c, i) => (
          <li key={i} className="type-caption flex gap-1.5 text-content-muted">
            <span className="text-content-subtle">·</span>
            <span className="min-w-0 flex-1">{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A RUN — progress while it works, a result once it's done.
 *
 * The same card carries both faces. While running it defaults open onto a live
 * checklist so you can watch which step the agent is on; the collapsed header
 * still names the current step, so a glance is enough. When it finishes it
 * collapses to a one-line summary, and opening it reveals what changed on every
 * asset it touched — each one a click away in the viewport.
 */
export function RunView({
  run,
  onNode,
  onUndo,
}: {
  run: RunTurn;
  onNode: (id: string) => void;
  onUndo: () => void;
}) {
  // null = follow the default (open while running, closed once done); a boolean
  // means the user took control and it sticks across the running→done flip.
  const [open, setOpen] = useState<boolean | null>(null);
  const running = run.status === "running";
  const errored = run.status === "error";
  const expanded = open ?? running;

  const total = run.steps.length;
  const done = run.steps.filter((s) => s.status === "done").length;
  const current = run.steps.find((s) => s.status === "running");
  const changes = run.changes ?? [];

  return (
    <div
      data-ui="ai-run"
      className={cn(
        "rounded-xl border bg-glass/8 px-2.5 py-2",
        errored ? "border-danger/30 bg-danger/10" : "border-glass/12"
      )}
    >
      <div className="flex items-center gap-2">
        {running ? (
          <Icon name="spinner" size={14} className="shrink-0 animate-spin text-brand" />
        ) : (
          <Icon
            name={errored ? "error" : "check"}
            size={14}
            className={cn("shrink-0", errored ? "text-danger" : "text-success")}
          />
        )}

        <button
          type="button"
          onClick={() => setOpen(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "type-label-strong block truncate",
                run.undone ? "text-content-subtle line-through" : "text-content"
              )}
            >
              {running ? run.title : run.summary ?? run.title}
            </span>
            {/* Collapsed + running: name the live step so a glance tells you where it's at. */}
            {running && !expanded && current && (
              <span className="type-caption block truncate text-content-subtle">{current.label}…</span>
            )}
          </span>

          {running && (
            <span className="type-numeric-sm shrink-0 text-content-subtle">
              {done}/{total}
            </span>
          )}
          <Icon
            name="chevron-right"
            size={13}
            className={cn("shrink-0 text-content-subtle transition-transform", expanded && "rotate-90")}
          />
        </button>

        {run.status === "done" && run.revert && !run.undone && (
          <button
            type="button"
            data-ui="ai-run-undo"
            onClick={onUndo}
            className="type-label-strong shrink-0 rounded-md px-1.5 py-0.5 text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
          >
            Undo
          </button>
        )}
        {run.undone && <span className="type-caption shrink-0 text-content-subtle">Reverted</span>}
      </div>

      {/* An indeterminate track while working — no invented percentage. */}
      {running && (
        <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-glass/12">
          <div className="absolute inset-y-0 w-1/2 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-brand/70 to-transparent" />
        </div>
      )}

      {run.error && <p className="type-caption mt-1.5 text-danger">{run.error}</p>}

      {expanded && (
        <div className="mt-2 border-t border-glass/10 pt-2">
          {/* Done + touched assets → the per-asset breakdown (the result's point).
              Otherwise the step checklist: live while running, receipts when done. */}
          {run.status === "done" && changes.length > 0 ? (
            <div className="space-y-1.5">
              <p className="type-caption text-content-subtle">
                {changes.length === 1
                  ? "1 asset changed"
                  : `${changes.length} assets changed · click one to jump to it`}
              </p>
              {changes.map((c) => (
                <AssetChangeRow key={c.node.id} node={c.node} changes={c.changes} onNode={onNode} />
              ))}
            </div>
          ) : (
            <StepList steps={run.steps} />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

const STATUS_RING: Record<TaskCard["status"], string> = {
  running: "text-content-subtle",
  done: "text-success",
  error: "text-danger",
};

/**
 * A unit of work. Compact by default: one line, one glyph, one status. The
 * affected objects hide behind a disclosure because they're the answer to a
 * question most cards never get asked.
 */
export function TaskCardView({
  card,
  onUndo,
  onNode,
}: {
  card: TaskCard;
  onUndo: () => void;
  onNode: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(card.detail || card.nodes?.length);
  const running = card.status === "running";

  return (
    <div
      data-ui="ai-task-card"
      className={cn(
        "rounded-xl border bg-glass/8 px-2.5 py-2",
        card.status === "error" ? "border-danger/30 bg-danger/10" : "border-glass/12"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          name={card.icon}
          size={14}
          className={cn("shrink-0", card.status === "error" ? "text-danger" : "text-content-subtle")}
        />
        <button
          type="button"
          disabled={!expandable}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-default"
        >
          <span
            className={cn(
              "type-label-strong truncate",
              card.undone ? "text-content-subtle line-through" : "text-content"
            )}
          >
            {card.label}
          </span>
          {expandable && (
            <Icon
              name="chevron-right"
              size={12}
              className={cn(
                "shrink-0 text-content-subtle transition-transform",
                open && "rotate-90"
              )}
            />
          )}
        </button>

        {/* Status, then the one action a finished edit affords. */}
        {running ? (
          <Icon name="spinner" size={14} className="shrink-0 animate-spin text-content-subtle" />
        ) : (
          <Icon
            name={card.status === "error" ? "error" : "check"}
            size={14}
            className={cn("shrink-0", STATUS_RING[card.status])}
          />
        )}

        {card.status === "done" && card.revert && !card.undone && (
          <button
            type="button"
            data-ui="ai-task-undo"
            onClick={onUndo}
            className="type-label-strong shrink-0 rounded-md px-1.5 py-0.5 text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
          >
            Undo
          </button>
        )}
        {card.undone && <span className="type-caption shrink-0 text-content-subtle">Reverted</span>}
      </div>

      {/* A determinate bar only when the job is long enough to have a shape. */}
      {running && card.progress !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <Meter value={card.progress} className="h-1 flex-1 bg-glass/15" />
          <span className="type-numeric-sm shrink-0 text-content-subtle">{card.progress}%</span>
        </div>
      )}

      {card.error && <p className="type-caption mt-1.5 text-danger">{card.error}</p>}

      {open && (
        <div className="mt-2 space-y-2 border-t border-glass/10 pt-2">
          {card.detail && <p className="type-caption text-content-muted">{card.detail}</p>}
          {card.nodes && card.nodes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {card.nodes.map((n) => (
                <NodeChip key={n.id} node={n} onClick={() => onNode(n.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** An action the agent stops in front of. Both answers are equally easy to give. */
export function PermissionCardView({
  card,
  onDecide,
}: {
  card: PermissionCard;
  onDecide: (d: "allow" | "deny") => void;
}) {
  return (
    <div
      data-ui="ai-permission-card"
      className="rounded-xl border border-brand/30 bg-brand-soft/40 px-2.5 py-2"
    >
      <div className="flex items-start gap-2">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="type-label-strong text-content">{card.label}</p>
          <p className="type-caption mt-0.5 text-content-muted">{card.detail}</p>
        </div>
      </div>
      {card.decided ? (
        <p className="type-caption mt-2 flex items-center gap-1 text-content-subtle">
          <Icon name={card.decided === "allow" ? "check" : "close"} size={12} />
          {card.decided === "allow" ? "Allowed" : "Denied"}
        </p>
      ) : (
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            type="button"
            data-ui="ai-permission-deny"
            onClick={() => onDecide("deny")}
            className="type-button-xs rounded-md px-2.5 py-1 text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
          >
            Deny
          </button>
          <button
            type="button"
            data-ui="ai-permission-allow"
            onClick={() => onDecide("allow")}
            className="type-button-xs rounded-md bg-brand px-2.5 py-1 text-brand-foreground transition-colors hover:bg-brand-hover"
          >
            Allow
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- thinking */

/** Working indicator: a shimmer bar for "reading", dots for "still going". */
export function Thinking() {
  return (
    <div data-ui="ai-thinking" className="flex items-center gap-2 py-0.5">
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-glass/12">
        <div className="absolute inset-y-0 w-1/2 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-brand/70 to-transparent" />
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1 w-1 animate-thinking-dot rounded-full bg-content-subtle"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
