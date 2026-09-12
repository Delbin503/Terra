import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, Button } from "@/components/ui";
import { HomeTopBar } from "./HomeTopBar";
import { WorldThumb } from "./WorldThumb";
import { whatsNew, type NewsItem } from "./data";

/**
 * A RELEASE NOTE, AS A PAGE.
 *
 * What's New cards promised something behind them and went to the Community
 * grid instead. This is what they actually meant: the note itself.
 *
 * The order is the order it is read — the render first at the width of the
 * column, then what kind of release it is, then the headline, then the note.
 * The two actions sit BESIDE the headline rather than under the picture,
 * because they answer the title ("share this", "go try it") and not the image.
 *
 * THE BODY IS NARROWER THAN THE PAGE. Prose set to the full 1600px measure is
 * unreadable — the eye loses the line on the way back — so the text column caps
 * at about 70 characters while the hero and the rail keep the page's width.
 *
 * The rail at the bottom is the rest of the list, minus this one: the page you
 * are on has no business offering itself.
 */
export function WhatsNewPage({
  item,
  onHome,
  onOpen,
  onChat,
  onPricing,
}: {
  item: NewsItem;
  /** back to the home feed */
  onHome: () => void;
  /** another note from the rail — this page swaps rather than stacking */
  onOpen: (item: NewsItem) => void;
  onChat: () => void;
  onPricing: () => void;
}) {
  /* Confirmed in the button and reset when the page changes notes — a tick that
     outlived the link it referred to would be a claim about the wrong page. */
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [item.id]);

  /* A note opened from the rail is a new page. Landing halfway down it, where
     the rail happened to be, would read as nothing having happened. */
  useEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, [item.id]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/#whats-new/${item.id}`
      );
      setCopied(true);
    } catch {
      /* A blocked clipboard is said, not swallowed — same rule as the Remix
         sheet and the Projects shelf. */
      setCopied(false);
    }
  };

  const others = whatsNew.filter((n) => n.id !== item.id).slice(0, 4);

  return (
    <>
      <HomeTopBar
        onChat={onChat}
        onPricing={onPricing}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="type-body flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onHome}
              className="text-content-subtle transition-colors hover:text-content"
            >
              Home
            </button>
            <span aria-hidden className="text-content-subtle">
              /
            </span>
            <span className="text-content-subtle">What&apos;s New</span>
            <span aria-hidden className="text-content-subtle">
              /
            </span>
            <span className="min-w-0 truncate text-content-muted">{item.title}</span>
          </nav>
        }
      />

      <article className="mt-6 pb-8">
        {/* THE HERO. A render at 16:9, in the page's own glass frame, with the
            release tag on it — the same chip the cards carry, so the thing you
            clicked and the thing you landed on are recognisably one object. */}
        <div className="relative overflow-hidden rounded-2xl border border-glass/10">
          <div className="aspect-[16/7]">
            <WorldThumb seed={item.seed} />
          </div>
          <span aria-hidden className="absolute inset-0 bg-black/20" />
          <span className="type-caption-strong absolute left-4 top-4 flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 text-white backdrop-blur-sm">
            <Icon name="news" size={13} />
            What&apos;s New
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="type-caption-strong uppercase tracking-[0.14em] text-brand">
              {item.tag}
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight">
              {item.title}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={share}
              data-ui="news-share"
              className={cn(copied && "border-success/50 text-success")}
            >
              <Icon name={copied ? "check" : "link"} size={15} />
              {copied ? "Link copied" : "Share"}
            </Button>
            {/* The note describes something you can go and use, so the page
                offers the door rather than ending in a full stop. */}
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                window.location.hash = "#editor";
              }}
            >
              <Icon name="preview" size={15} />
              Try it in the Editor
            </Button>
          </div>
        </div>

        <div className="mt-5 max-w-[46rem]">
          <p className="type-body-lg text-content">{item.summary}</p>
          {item.body.map((paragraph, i) => (
            <p key={i} className="type-body mt-4 leading-relaxed text-content-muted">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="mt-7 flex items-center gap-2.5 border-t border-glass/10 pt-5">
          <Avatar name={item.author} size={32} />
          <p className="type-body text-content-muted">
            <span className="text-content">{item.author}</span>
            <span aria-hidden className="mx-1.5 text-content-subtle">
              ·
            </span>
            {item.at}
          </p>
        </div>

        {others.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-base font-bold">
              More from What&apos;s New
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-5 lg:grid-cols-4">
              {others.map((other) => (
                <button
                  key={other.id}
                  type="button"
                  onClick={() => onOpen(other)}
                  className="group text-left"
                >
                  <div className="relative overflow-hidden rounded-xl border border-glass/10">
                    <div className="aspect-video transition-transform duration-300 group-hover:scale-[1.04]">
                      <WorldThumb seed={other.seed} />
                    </div>
                    <span className="type-caption-strong absolute bottom-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-white backdrop-blur-sm">
                      {other.tag}
                    </span>
                  </div>
                  <p className="type-caption mt-2 text-content-subtle">{other.at}</p>
                  <p className="type-body-strong mt-0.5 line-clamp-2 text-content transition-colors group-hover:text-brand">
                    {other.title}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}
      </article>
    </>
  );
}
