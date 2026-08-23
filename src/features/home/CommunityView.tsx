import { useMemo, useState } from "react";
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
  onOpenWorld,
}: {
  onHome: () => void;
  /** opens Terra AI from this page's top bar */
  onChat: () => void;
  onOpenWorld: (world: CommunityWorld) => void;
}) {
  const [tab, setTab] = useState<CommunityTab>("featured");
  const [query, setQuery] = useState("");
  /** likes are the one thing you can change here, so they live in the view */
  const [liked, setLiked] = useState<string[]>([]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return communityWorlds.filter(
      (w) =>
        (tab === "featured" ? w.featured : w.category === tab) &&
        (w.title.toLowerCase().includes(q) || w.author.toLowerCase().includes(q))
    );
  }, [tab, query]);

  const toggleLike = (id: string) =>
    setLiked((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    );

  return (
    <>
      <HomeTopBar
        onChat={onChat}
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

        {/* Four across from `lg` rather than `xl`: the app rail already takes
            its slice, so waiting for a 1280px WINDOW left these stacked two-up
            on a screen with room for all four. Their height is fixed instead of
            an aspect ratio — the pill, two lines of headline and the button need
            the same room whatever the column is worth. */}
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {communityBanners.map((banner) => (
            <Banner
              key={banner.id}
              banner={banner}
              onExplore={() => setTab(banner.tab)}
            />
          ))}
        </div>

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

          <label className="flex h-9 w-full min-w-[11rem] flex-1 items-center gap-2 glass-thin !rounded-lg px-3 sm:w-[300px] sm:flex-none">
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
                  onLike={() => toggleLike(world.id)}
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

/** A promoted collection. The render is the background; everything sits on it. */
function Banner({
  banner,
  onExplore,
}: {
  banner: CommunityBanner;
  onExplore: () => void;
}) {
  return (
    <div className="group relative h-[180px] overflow-hidden rounded-xl border border-glass/10">
      <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]">
        <WorldThumb seed={banner.seed} />
      </div>
      {/* Two layers, two jobs: the wash keeps the headline legible anywhere on
          the render, the scrim anchors the button to the bottom edge. */}
      <span aria-hidden className="absolute inset-0 bg-black/35" />
      <span aria-hidden className="absolute inset-0 scrim-strong" />

      <div className="absolute inset-0 flex flex-col p-3.5">
        <span className="type-caption-strong flex w-fit items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 text-white backdrop-blur-sm">
          <Icon name="news" size={13} />
          {banner.eyebrow}
        </span>
        <p className="mt-auto font-display text-base font-semibold leading-snug text-white">
          {banner.headline}
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
          <span className="type-caption mt-0.5 block text-content-subtle">
            By {world.author}
          </span>
        </span>

        {/* Above the open target, so liking doesn't open the world. */}
        <button
          type="button"
          aria-label={liked ? `Unlike ${world.title}` : `Like ${world.title}`}
          aria-pressed={liked}
          onClick={onLike}
          className={cn(
            "type-numeric relative z-10 -mr-1 -mt-0.5 flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors",
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
