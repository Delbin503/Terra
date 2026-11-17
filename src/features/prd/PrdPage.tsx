import { Fragment, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PRDS, PRD_UPDATED, type Prd, type PrdBlock } from "./prd-data";

/**
 * Inline markup in the PRD strings: `code`, **bold** and [text](https://link).
 * Anything else is plain text, so a stray asterisk cannot break a sentence.
 */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-content">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded-md border border-glass/15 bg-surface-raised px-1.5 py-px font-mono text-[0.86em] [overflow-wrap:anywhere]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          return (
            <a
              key={i}
              href={link[2]}
              {...(/^[#/]/.test(link[2]) ? null : { target: "_blank", rel: "noreferrer" })}
              className="text-brand underline underline-offset-4 hover:text-brand-hover"
            >
              {link[1]}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function Block({ block }: { block: PrdBlock }) {
  switch (block.kind) {
    case "h":
      return <h2 className="type-title mt-6 text-content first:mt-0">{block.text}</h2>;
    case "p":
      return (
        <p className="type-body-lg max-w-[72ch] text-content-muted">
          <Rich text={block.text} />
        </p>
      );
    case "ul":
      return (
        <ul className="type-body-lg flex max-w-[72ch] list-disc flex-col gap-1.5 pl-5 text-content-muted marker:text-brand">
          {block.items.map((item) => (
            <li key={item}>
              <Rich text={item} />
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="type-body-lg flex max-w-[76ch] list-decimal flex-col gap-2.5 pl-5 text-content-muted marker:font-semibold marker:text-brand">
          {block.items.map((item) => (
            <li key={item.lead ?? item.text} className="pl-1">
              {item.lead && <strong className="font-semibold text-content">{item.lead} </strong>}
              <Rich text={item.text} />
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-glass/15 bg-surface">
          <table className="type-body w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="bg-surface-raised">
                {block.head.map((h) => (
                  <th key={h} className="type-eyebrow px-4 py-2.5 text-content-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]} className="border-t border-glass/10 align-top">
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-4 py-3",
                        i === 0 ? "min-w-[9rem] font-medium text-content" : "text-content-muted"
                      )}
                    >
                      <Rich text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "note":
      return (
        <div className="type-body max-w-[76ch] rounded-lg border border-glass/15 border-l-2 border-l-brand bg-surface-raised px-4 py-3.5 text-content-muted">
          <Rich text={block.text} />
        </div>
      );
    case "flow":
      return (
        <ol className="flex flex-wrap items-stretch gap-2" aria-label="Flow">
          {block.steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="type-body rounded-lg border border-glass/15 bg-surface px-3 py-2 text-content">
                {s}
              </span>
              {i < block.steps.length - 1 && (
                <span aria-hidden className="text-brand">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      );
  }
}

export function StatusChip({ prd }: { prd: Prd }) {
  return (
    <span
      className={cn(
        "type-label-strong inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5",
        prd.built ? "bg-brand/15 text-brand" : "border border-glass/20 text-content-muted"
      )}
    >
      {prd.status}
    </span>
  );
}

/**
 * ONE PRD, as a page.
 *
 * Reached from a card on the front page (`#prd/<id>`). The way back is the
 * link at the top; the other two PRDs sit at the bottom so a reader can move
 * between them without going back first.
 */
export function PrdPage({ prd }: { prd: Prd }) {
  // Landing halfway down because the last page was long would read as nothing
  // having happened.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [prd.id]);
  const others = PRDS.filter((p) => p.id !== prd.id);

  return (
    <main className="min-h-screen bg-canvas text-content">
      <div className="mx-auto flex max-w-[960px] flex-col gap-10 px-6 pb-24 pt-8">
        <div className="flex items-center justify-between gap-4">
          <a href="#" className="type-label-strong text-brand hover:text-brand-hover">
            ← Terra PRD
          </a>
          <span className="type-caption text-content-subtle">Updated {PRD_UPDATED}</span>
        </div>

        <header className="flex flex-col gap-3">
          <div className="type-eyebrow text-brand">{prd.area}</div>
          <h1 className="type-display text-[clamp(2rem,5vw,3rem)] leading-[1.05]">{prd.name}</h1>
          <p className="type-heading text-content-muted">{prd.headline}</p>
          <div className="type-body flex flex-wrap items-center gap-x-3 gap-y-2 text-content-subtle">
            <StatusChip prd={prd} />
            <span>
              <Rich text={prd.source} />
            </span>
          </div>
        </header>

        <div className="flex flex-col gap-4">
          {prd.intro.map((t) => (
            <p key={t} className="type-body-lg max-w-[72ch] text-content-muted">
              <Rich text={t} />
            </p>
          ))}
          {prd.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>

        <nav aria-label="Other PRDs" className="flex flex-col gap-3 border-t border-glass/15 pt-8">
          <div className="type-eyebrow text-content-subtle">Other PRDs</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {others.map((p) => (
              <a
                key={p.id}
                href={`#prd/${p.id}`}
                className="flex flex-col gap-1 rounded-xl border border-glass/15 bg-surface p-4 transition-colors hover:border-brand/60"
              >
                <span className="type-subheading">{p.name}</span>
                <span className="type-body text-content-muted">{p.summary}</span>
              </a>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}
