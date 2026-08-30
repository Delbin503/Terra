import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { HomeTopBar } from "./HomeTopBar";
import { WorldThumb } from "./WorldThumb";
import {
  COMMUNITY_TABS,
  communityBanners,
  communityWorlds,
  type CommunityBanner,
  type CommunityTab,
  type CommunityWorld,
} from "./data";

/**
 * COMMUNITY — worlds other people published.
 *
 * Three bands, in the order you'd read them: what's newly promoted, how to
 * narrow it, and then the shelf itself. The banners and the tabs are the same
 * collections, which is what lets "Explore Now" go somewhere real without a
 * screen of its own — it selects the collection below.
 *
 * The card differs from a project card in exactly the two ways the thing itself
 * differs: it names an author instead of a last-edited time, and it carries a
 * like, because this is someone else's work and the only thing you can do to it
 * from here is appreciate it.
 */
export function CommunityView({
  onHome,
  onChat,
  onPricing,
  onOpenWorld,
  liked,
  onToggleLike,
}: {
  onHome: () => void;
  /** opens Terra AI from this page's top bar */
  onChat: () => void;
  /** the plans page, from this page's top bar */
  onPricing: () => void;
  onOpenWorld: (world: CommunityWorld) => void;
  /**
   * Likes are held by the shell, not here.
   *
   * They used to be this view's own state, which was right while the grid was
   * the only thing that showed them. The Remix sheet shows the same count and
   * offers the same heart, and two components each keeping their own copy is
   * two numbers for one fact — press the heart in the sheet and the card behind
   * it would still read the old figure.
   */
  liked: string[];
  onToggleLike: (id: string) => void;
}) {
  const [tab, setTab] = useState<CommunityTab>("featured");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return communityWorlds.filter(
      (w) =>
        (tab === "featured" ? w.featured : w.category === tab) &&
        (w.title.toLowerCase().includes(q) || w.author.toLowerCase().includes(q))
    );
  }, [tab, query]);

  return (
    <>
      <HomeTopBar
        onChat={onChat}
        onPricing={onPricing}
        breadcrumb={
          <nav aria-label="Breadcrumb" className="type-body flex items-center gap-2">
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
            <span className="text-content-muted">Community</span>
          </nav>
        }
      />

      <section className="mt-6 pb-8">
        <h1 className="font-display text-lg font-semibold tracking-tight">
          Community
        </h1>

        <BannerRail
          banners={communityBanners}
          onExplore={(banner) => setTab(banner.tab)}
        />

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap gap-2">
            {COMMUNITY_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "type-button-xs rounded-full border px-3.5 py-1.5 transition-colors",
                  tab === t.id
                    ? "border-glass/20 bg-glass/20 text-content"
                    : "border-glass/10 text-content-muted hover:bg-glass/15 hover:text-content"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label className="field-well flex h-9 w-full min-w-[11rem] flex-1 items-center gap-2 rounded-lg px-3 sm:w-[300px] sm:flex-none">
            <Icon name="search" size={16} className="shrink-0 text-content-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search project"
              aria-label="Search community projects"
              className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
            />
            <Icon
              name="filter"
              size={16}
              aria-hidden
              className="shrink-0 text-content-subtle"
            />
          </label>
        </div>

        {/* Same reasoning as the banners: the columns step up earlier than the
            design's window sizes, because the rail has already taken its width
            out of the row. */}
        <div className="mt-5">
          {shown.length ? (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((world) => (
                <WorldCard
                  key={world.id}
                  world={world}
                  liked={liked.includes(world.id)}
                  onLike={() => onToggleLike(world.id)}
                  onOpen={() => onOpenWorld(world)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-glass/15 py-14 text-center">
              <Icon name="community" size={20} className="text-content-subtle" />
              <p className="type-body text-content-muted">
                Nothing here matches “{query}”.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/** How long a banner holds the front of the rail before it moves along. */
const SLIDE_MS = 5000;

/** Treat "within 8px of the end" as the end — sub-pixel scroll never lands exact. */
const EDGE = 8;

/**
 * THE PROMOTED COLLECTIONS, AS A RAIL.
 *
 * They were a four-column grid, which meant the shelf could only ever hold
 * exactly as many collections as the widest window had columns — a fifth one
 * either wrapped into a lonely second row or wasn't shown at all. A rail holds
 * any number of them in the same band, and moves on by itself so the ones past
 * the fold are seen without asking anyone to go looking.
 *
 * It moves on ITS OWN and it moves when you move it. Both, because an auto-only
 * carousel takes the page's pace out of the reader's hands, and a manual-only
 * one hides everything after the fourth card behind a gesture nobody performs.
 * So: a timer, arrows, dots, drag, and the native scroll a trackpad or a touch
 * screen already does.
 *
 * The timer yields to the person. It stops while the pointer is over the rail,
 * while anything inside it holds focus, and while a drag is in progress —
 * sliding the card out from under a cursor that is reaching for "Explore Now"
 * is the failure mode every auto-carousel is remembered for. It never starts at
 * all under `prefers-reduced-motion`, or when everything already fits.
 */
function BannerRail({
  banners,
  onExplore,
}: {
  banners: CommunityBanner[];
  onExplore: (banner: CommunityBanner) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  /** the same number, readable from the resize callback without re-subscribing */
  const indexRef = useRef(0);
  /** the timer's off-switch: hover, focus, or a drag in progress */
  const [held, setHeld] = useState(false);
  /** nothing to slide when every banner already fits */
  const [scrollable, setScrollable] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** where a drag started — null whenever no button is down on the rail */
  const drag = useRef<{ x: number; left: number } | null>(null);
  /**
   * Whether that drag actually travelled.
   *
   * It outlives `drag` on purpose: `pointerup` fires before `click`, so a flag
   * cleared with the drag would always read false by the time the click on
   * "Explore Now" arrives — which is exactly the click that has to be swallowed.
   */
  const moved = useRef(false);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /* Whether the rail overflows is a question about the LAYOUT, not the data:
     six banners fit on a wide screen and don't on a narrow one, and the answer
     changes as the chat drawer opens beside it. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      setScrollable(el.scrollWidth - el.clientWidth > EDGE);
      /* A resize changes how wide a card is, which leaves the rail parked
         between two of them — four-up cut to two-up is half a banner on each
         edge. Put the one that was at the front back at the front. */
      const card = el.children[indexRef.current] as HTMLElement | undefined;
      if (card) el.scrollLeft = card.offsetLeft;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [banners.length]);

  const slideTo = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      const card = el.children[i] as HTMLElement | undefined;
      if (!card) return;
      el.scrollTo({ left: card.offsetLeft, behavior: reduced ? "auto" : "smooth" });
    },
    [reduced]
  );

  useEffect(() => {
    if (held || dragging || !scrollable || reduced) return;
    const t = window.setInterval(() => {
      const el = trackRef.current;
      if (!el) return;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - EDGE;
      slideTo(atEnd ? 0 : index + 1);
    }, SLIDE_MS);
    return () => window.clearInterval(t);
  }, [held, dragging, scrollable, reduced, index, slideTo]);

  /** The banner closest to the front, wherever the rail happens to be sitting. */
  const nearest = () => {
    const el = trackRef.current;
    if (!el) return 0;
    let at = 0;
    let best = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const d = Math.abs((child as HTMLElement).offsetLeft - el.scrollLeft);
      if (d < best) {
        best = d;
        at = i;
      }
    });
    return at;
  };

  /* Which banner is at the front, whoever moved it — the timer, an arrow, a
     drag, or a two-finger swipe the browser handled on its own. */
  const onScroll = () => {
    const at = nearest();
    indexRef.current = at;
    setIndex(at);
  };

  /* Let go and the rail settles on a card. The snap is ours rather than CSS's:
     `scroll-snap-type: mandatory` re-snaps every `scrollLeft` the drag assigns,
     so the two cannot both be in play — the browser wins each frame and the
     card never moves under the hand. */
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    slideTo(nearest());
  };

  const step = (by: number) => {
    const el = trackRef.current;
    if (!el) return;
    const last = banners.length - 1;
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - EDGE;
    if (by > 0) slideTo(atEnd ? 0 : Math.min(index + 1, last));
    else slideTo(index === 0 ? last : index - 1);
  };

  return (
    <div
      className="relative mt-4"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        /* Drag with the mouse, because the rail looks draggable and a mouse has
           no swipe. Trackpads and touch screens are already handled by the
           browser's own horizontal scrolling — this only adds the gesture the
           pointer is missing. */
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !scrollable) return;
          const el = trackRef.current;
          if (!el) return;
          drag.current = { x: e.clientX, left: el.scrollLeft };
          moved.current = false;
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const el = trackRef.current;
          const d = drag.current;
          if (!el || !d) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 4) moved.current = true;
          el.scrollLeft = d.left - dx;
        }}
        /* Let go and the rail settles on a card. The snap is ours rather than
           CSS's: `scroll-snap-type: mandatory` re-snaps every `scrollLeft` the
           drag assigns, so the two cannot both be in play — the browser wins
           each frame and the card never moves. */
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        /* A drag that ends on a button is a drag, not a press. Swallowing the
           click here is what stops "Explore Now" firing when you let go. */
        onClickCapture={(e) => {
          if (!moved.current) return;
          moved.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        className={cn(
          "relative flex gap-5 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          dragging ? "cursor-grabbing select-none" : scrollable && "cursor-grab"
        )}
      >
        {banners.map((banner) => (
          <div
            key={banner.id}
            className="w-[86%] shrink-0 sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)] xl:w-[calc((100%-3.75rem)/4)]"
          >
            <FeatureCard
              eyebrow={banner.eyebrow}
              headline={banner.headline}
              seed={banner.seed}
              onExplore={() => onExplore(banner)}
              /* Fixed height rather than an aspect ratio — the pill, two lines
                 of headline and the button need the same room whatever the
                 column is worth. */
              className="h-[180px]"
            />
          </div>
        ))}
      </div>

      {scrollable && (
        <>
          <RailArrow side="left" onClick={() => step(-1)} />
          <RailArrow side="right" onClick={() => step(1)} />

          <div className="mt-3 flex justify-center gap-1.5">
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                type="button"
                aria-label={`Show ${banner.headline}`}
                aria-current={i === index}
                onClick={() => slideTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index
                    ? "w-5 bg-brand"
                    : "w-1.5 bg-glass/30 hover:bg-glass/50"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The two nudges, sunk into the rail's edge so they don't cover a headline. */
function RailArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous collections" : "More collections"}
      onClick={onClick}
      className={cn(
        /* Always drawn, never only-on-hover: a hover-revealed arrow is
           invisible on a touch screen, and this rail is the one band on the
           page whose content continues past the edge. */
        "absolute top-[90px] z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-glass/15 bg-black/55 text-white opacity-80 backdrop-blur-sm transition-opacity hover:bg-black/75 hover:opacity-100",
        side === "left" ? "-left-3" : "-right-3"
      )}
    >
      <Icon name={side === "left" ? "chevron-left" : "chevron-right"} size={17} />
    </button>
  );
}

/**
 * A HEADLINE OVER A RENDER, WITH A WAY IN — shared by the Community banners and
 * the home page's What's New shelf.
 *
 * The two were separate before and only one of them worked. The home cards were
 * a render with a title on it inside a `<button>` that had no handler at all:
 * they looked pressable, said nothing about what pressing them would do, and
 * did nothing when pressed. The banner had already solved the same problem — an
 * eyebrow that says what KIND of thing this is, the headline, and a button that
 * names the action — so there is one component now rather than two that drift.
 *
 * `onExplore` is required. That is the point: this shape promises an action, so
 * a caller with nowhere to send you has no business using it.
 */
export function FeatureCard({
  eyebrow,
  headline,
  seed,
  onExplore,
  className,
}: {
  eyebrow: string;
  headline: string;
  seed: number;
  onExplore: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-glass/10",
        className
      )}
    >
      <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]">
        <WorldThumb seed={seed} />
      </div>
      {/* Two layers, two jobs: the wash keeps the headline legible anywhere on
          the render, the scrim anchors the button to the bottom edge. */}
      <span aria-hidden className="absolute inset-0 bg-black/35" />
      <span aria-hidden className="absolute inset-0 scrim-strong" />

      <div className="absolute inset-0 flex flex-col p-3.5">
        <span className="type-caption-strong flex w-fit items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 text-white backdrop-blur-sm">
          <Icon name="news" size={13} />
          {eyebrow}
        </span>
        <p className="mt-auto line-clamp-2 font-display text-base font-semibold leading-snug text-white">
          {headline}
        </p>
        <Button variant="brand" size="sm" onClick={onExplore} className="mt-2.5 w-fit">
          Explore Now
        </Button>
      </div>
    </div>
  );
}

export function WorldCard({
  world,
  liked,
  onLike,
  onOpen,
}: {
  world: CommunityWorld;
  liked: boolean;
  onLike: () => void;
  onOpen: () => void;
}) {
  // The count in the data is what everyone else gave it; your own like is on top.
  const likes = world.likes + (liked ? 1 : 0);

  return (
    <div className="group relative text-left">
      <div className="overflow-hidden rounded-xl border border-glass/10">
        <div className="aspect-[16/11] transition-transform duration-200 group-hover:scale-[1.03]">
          <WorldThumb seed={world.seed} />
        </div>
      </div>

      <div className="mt-2 flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="type-body-strong block truncate transition-colors group-hover:text-brand">
            {world.title}
          </span>
          <span className="type-caption mt-0.5 block truncate text-content-subtle">
            By {world.author}
          </span>
        </span>

        {/* THE TWO NUMBERS TOGETHER. Adoption used to ride in the byline, on the
            reasoning that it is a fact about the world rather than a control —
            true, but it left the card's only two figures on opposite ends of
            the row, so comparing "loved" against "actually used" meant reading
            across the title. They are the same kind of measure and they are
            read as a pair, so they sit as a pair: people first, because a remix
            is somebody's project and a like is only an opinion.

            The count is a plain span, not a button — nothing happens when you
            press it, and only the heart is lifted above the open target. */}
        <span className="relative z-10 -mt-0.5 flex shrink-0 items-center gap-1">
          <span
            className="type-numeric flex items-center gap-1 px-1 py-0.5 text-content-subtle"
            title={`${world.users.toLocaleString()} people have built on this`}
          >
            <Icon name="person" size={13} />
            {world.users.toLocaleString()}
          </span>

          <button
            type="button"
            aria-label={liked ? `Unlike ${world.title}` : `Like ${world.title}`}
            aria-pressed={liked}
            onClick={onLike}
            className={cn(
              "type-numeric -mr-1 flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors",
              liked
                ? "text-brand"
                : "text-content-subtle hover:bg-glass/15 hover:text-content"
            )}
          >
            <Icon
              name="like"
              size={14}
              className={liked ? "fill-current" : undefined}
            />
            {likes}
          </button>
        </span>
      </div>

      <button
        type="button"
        aria-label={`Open ${world.title}`}
        onClick={onOpen}
        className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
