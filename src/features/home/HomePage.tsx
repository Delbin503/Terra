import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Sidebar, type Destination } from "./Sidebar";
import { AppBackdrop } from "./AppBackdrop";
import { HomeTopBar } from "./HomeTopBar";
import { ChatLauncher } from "./ChatLauncher";
import { CreateWorldModal } from "./CreateWorldModal";
import { ProjectCard } from "./ProjectCard";
import { ProjectsView } from "./ProjectsView";
import { CommunityView, FeatureCard, WorldCard } from "./CommunityView";
import { RemixDialog } from "./RemixDialog";
import { TrashView } from "./TrashView";
import { PricingView } from "./PricingView";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { AiChatDrawer } from "./AiChatDrawer";
import { WorkspaceProvider, useWorkspace } from "./workspace";
import type { Shelf } from "./shelves";
import type { CommunityWorld } from "./data";
import { WorkOrdersDialog } from "@/features/editor/WorkOrdersDialog";
import type { WorkOrderRunStore } from "@/features/editor/work-order-runs";
import { whatsNew, communityWorlds } from "./data";

/** Title Case, because it reads as a greeting card rather than a status line. */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

type Tab = "new" | "community";

const TABS: { id: Tab; label: string }[] = [
  { id: "new", label: "What's New" },
  { id: "community", label: "Community" },
];

/** How many covers the home shelf shows. The rest live on the Projects page. */
const SHELF = 5;

/**
 * The signed-in app. Everything below the provider shares one workspace, which
 * is what lets Trash show what Projects threw away and the notification list
 * show that it happened.
 */
export function HomePage({
  at = "home",
  runs,
}: {
  at?: Destination;
  /** the shared Work Order history — see the comment in App.tsx */
  runs: WorkOrderRunStore;
}) {
  return (
    <WorkspaceProvider>
      <Shell at={at} runs={runs} />
    </WorkspaceProvider>
  );
}

/**
 * The shell: the app rail, whichever destination it points at, and the two
 * panels that can cover any of them.
 *
 * Each destination renders its own top bar rather than sharing one from here,
 * because the bar's left half is the page's own business — the home page has no
 * breadcrumb to put there and the others do.
 */
function Shell({ at: landing, runs }: { at: Destination; runs: WorkOrderRunStore }) {
  const { unread, markNotificationsRead } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  /** the two panels that arrive from the edges */
  const [notifications, setNotifications] = useState(false);
  const [chat, setChat] = useState(false);
  /** the Work Orders table, opened by the rail's Downloads button */
  const [orders, setOrders] = useState(false);
  /** a community world being considered — the Remix sheet is about this one */
  const [remix, setRemix] = useState<CommunityWorld | null>(null);
  /** community likes — here rather than in the grid, so the sheet shares them */
  const [likedWorlds, setLikedWorlds] = useState<string[]>([]);
  const toggleWorldLike = (id: string) =>
    setLikedWorlds((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    );
  // Seeded rather than fixed: coming back from Settings can land on Projects.
  const [at, setAt] = useState<Destination>(landing);
  // Which Projects shelf is open lives here because the rail lists the shelves
  // and the page renders them.
  const [shelf, setShelf] = useState<Shelf>("all");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModalOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      <AppBackdrop />

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onCreate={() => setModalOpen(true)}
        at={at}
        onNavigate={setAt}
        shelf={shelf}
        onShelf={(next) => {
          setShelf(next);
          setAt("projects");
        }}
        /* Downloads is where an archive comes from, and an archive is what a
           finished Work Order leaves behind — so the button opens the run list
           rather than a file save with nothing to save. Same table the editor
           shows, same store behind it. */
        downloads={runs.active}
        onDownloads={() => setOrders(true)}
        unread={unread}
        onNotifications={() => {
          setNotifications(true);
          // Opening the list is reading it; the dot has done its job.
          markNotificationsRead();
        }}
      />

      {/* The chat drawer is docked rather than floating, so the content column
          gives up its width instead of being covered by it. */}
      <main
        className={cn(
          "h-screen flex-1 overflow-y-auto transition-[padding] duration-200",
          chat && "pr-[24rem]"
        )}
      >
        {/* Wide, not centred-narrow: the five-up Projects row is the widest thing
            on the page and it's what sets the measure.

            The tail of runway at the bottom is for the shelves, which are lists
            that run out — it keeps the last row off the window's edge. Pricing
            is the one destination sized to FIT the window, so 80px of nothing
            under it is 80px it would have to scroll to reach. */}
        <div
          className={cn(
            "mx-auto max-w-[1600px] px-8 pt-6",
            at === "pricing" ? "pb-2" : "pb-20"
          )}
        >
          {at === "home" && (
            <HomeFeed
              narrow={chat}
              onCreate={() => setModalOpen(true)}
              onSeeProjects={() => setAt("projects")}
              onSeeCommunity={() => setAt("community")}
              onChat={() => setChat(true)}
              onPricing={() => setAt("pricing")}
            />
          )}
          {at === "projects" && (
            <ProjectsView
              shelf={shelf}
              onShelf={setShelf}
              onHome={() => setAt("home")}
              onChat={() => setChat(true)}
              onPricing={() => setAt("pricing")}
              onCreateProject={() => setModalOpen(true)}
              onOpenProject={() => {
                window.location.hash = "#editor";
              }}
            />
          )}
          {at === "community" && (
            <CommunityView
              onHome={() => setAt("home")}
              onChat={() => setChat(true)}
              onPricing={() => setAt("pricing")}
              /* A community world is somebody ELSE'S work. Opening it straight
                 into the editor implied you were about to edit theirs; the
                 sheet says what you would actually be doing — taking it as a
                 starting point — and makes that a decision rather than a
                 surprise. */
              onOpenWorld={setRemix}
              liked={likedWorlds}
              onToggleLike={toggleWorldLike}
            />
          )}
          {at === "trash" && (
            <TrashView
              onHome={() => setAt("home")}
              onChat={() => setChat(true)}
              onPricing={() => setAt("pricing")}
            />
          )}
          {at === "pricing" && (
            <PricingView
              onHome={() => setAt("home")}
              onChat={() => setChat(true)}
            />
          )}
        </div>
      </main>

      <CreateWorldModal open={modalOpen} onOpenChange={setModalOpen} />

      <NotificationsDrawer
        open={notifications}
        railCollapsed={collapsed}
        onClose={() => setNotifications(false)}
      />
      <AiChatDrawer
        open={chat}
        onClose={() => setChat(false)}
        onCreateWorld={() => setModalOpen(true)}
      />

      {orders && <WorkOrdersDialog store={runs} onClose={() => setOrders(false)} />}

      <RemixDialog
        world={remix}
        liked={remix ? likedWorlds.includes(remix.id) : false}
        onToggleLike={toggleWorldLike}
        onClose={() => setRemix(null)}
        onRemix={() => {
          setRemix(null);
          window.location.hash = "#editor";
        }}
      />
    </div>
  );
}

function HomeFeed({
  narrow,
  onCreate,
  onSeeProjects,
  onSeeCommunity,
  onChat,
  onPricing,
}: {
  /** the chat drawer has taken a column — every grid loses one */
  narrow: boolean;
  onCreate: () => void;
  onSeeProjects: () => void;
  /** where a What's New card's "Explore Now" leads */
  onSeeCommunity: () => void;
  onChat: () => void;
  onPricing: () => void;
}) {
  const { projects } = useWorkspace();
  const [tab, setTab] = useState<Tab>("new");
  /** likes are local to this session — the same rule the Community page uses */
  const [liked, setLiked] = useState<ReadonlySet<string>>(new Set());

  // One column comes off each grid when the drawer is docked. Letting them keep
  // their column count in a narrower space would shrink every cover instead,
  // and a shelf of covers is only useful while you can still read them.
  const shelfCols = narrow ? "lg:grid-cols-4" : "lg:grid-cols-5";
  const gridCols = narrow ? "lg:grid-cols-3" : "lg:grid-cols-4";

  return (
    <>
      <HomeTopBar onChat={onChat} onPricing={onPricing} />

      <h1 className="mb-6 mt-5 text-center font-display text-2xl font-extrabold tracking-tight">
        {greeting()}, Start Creating!
      </h1>
      <div className="mb-10">
        <ChatLauncher onOpen={onCreate} />
      </div>

      {/* Projects — inside a panel, so the row of covers reads as one shelf
          you can scroll past rather than five loose tiles on the page. */}
      <section className="glass mb-8 !rounded-2xl p-5">
        <div className="mb-4 flex items-center">
          <h2 className="font-display text-base font-bold">Projects</h2>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onSeeProjects}
            className="type-button-xs flex items-center gap-1.5 rounded-lg border border-glass/15 bg-glass/10 px-2.5 py-1.5 text-content transition-colors hover:border-brand hover:text-brand"
          >
            Projects
            <Icon name="chevron-right" size={14} />
          </button>
        </div>

        <div className={cn("grid grid-cols-2 gap-5 sm:grid-cols-3", shelfCols)}>
          {projects.slice(0, SHELF).map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => {
                window.location.hash = "#editor";
              }}
            />
          ))}
        </div>
      </section>

      {/* Discover */}
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "type-button-xs rounded-full border px-3.5 py-1.5 transition-colors",
              tab === t.id
                ? "border-glass/20 bg-glass/20 text-content"
                : "border-glass/10 text-content-muted hover:bg-glass/10 hover:text-content"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={cn("grid grid-cols-2 gap-5 md:grid-cols-3", gridCols)}>
        {tab === "community"
          ? communityWorlds.map((w) => (
              <WorldCard
                key={w.id}
                world={w}
                liked={liked.has(w.id)}
                onLike={() =>
                  setLiked((prev) => {
                    const next = new Set(prev);
                    if (next.has(w.id)) next.delete(w.id);
                    else next.add(w.id);
                    return next;
                  })
                }
                onOpen={() => {
                  window.location.hash = "#editor";
                }}
              />
            ))
          : whatsNew.map((item) => (
              /* The Community banners' card, not a lookalike — see
                 `FeatureCard`. These used to be a title on a render inside a
                 button with no handler: pressable-looking and inert. */
              <FeatureCard
                key={item.id}
                eyebrow="What's New"
                headline={item.title}
                seed={item.seed}
                /* A FIXED HEIGHT, LIKE THE BANNERS — not `aspect-video`.
                   The ratio left ~145px at three or four columns, and a badge,
                   a two-line headline and a button do not fit in that: the
                   second line of "Terra 2.4 — faster capture runs" was cut off
                   by the button. Adding `min-h` to the ratio was worse — an
                   aspect-ratio box with a min-height grows its WIDTH to match
                   (180 × 16/9 = 320px), which pushed the grid past its
                   container. Height is the constraint here, so height is what
                   is set. */
                className="h-[180px]"
                onExplore={onSeeCommunity}
              />
            ))}
      </div>
    </>
  );
}


