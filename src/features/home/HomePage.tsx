import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { WorldThumb } from "./WorldThumb";
import { Sidebar, type Destination } from "./Sidebar";
import { AppBackdrop } from "./AppBackdrop";
import { HomeTopBar } from "./HomeTopBar";
import { ChatLauncher } from "./ChatLauncher";
import { CreateWorldModal } from "./CreateWorldModal";
import { ProjectCard } from "./ProjectCard";
import { ProjectsView } from "./ProjectsView";
import { CommunityView, WorldCard } from "./CommunityView";
import { TrashView } from "./TrashView";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { AiChatDrawer } from "./AiChatDrawer";
import { WorkspaceProvider, useWorkspace } from "./workspace";
import type { Shelf } from "./shelves";
import { whatsNew, communityWorlds, type FeedItem } from "./data";

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
export function HomePage({ at = "home" }: { at?: Destination }) {
  return (
    <WorkspaceProvider>
      <Shell at={at} />
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
function Shell({ at: landing }: { at: Destination }) {
  const { unread, markNotificationsRead } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  /** the two panels that arrive from the edges */
  const [notifications, setNotifications] = useState(false);
  const [chat, setChat] = useState(false);
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
            on the page and it's what sets the measure. */}
        <div className="mx-auto max-w-[1600px] px-8 pb-20 pt-6">
          {at === "home" && (
            <HomeFeed
              narrow={chat}
              onCreate={() => setModalOpen(true)}
              onSeeProjects={() => setAt("projects")}
              onChat={() => setChat(true)}
            />
          )}
          {at === "projects" && (
            <ProjectsView
              shelf={shelf}
              onShelf={setShelf}
              onHome={() => setAt("home")}
              onChat={() => setChat(true)}
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
              onOpenWorld={() => {
                window.location.hash = "#editor";
              }}
            />
          )}
          {at === "trash" && (
            <TrashView
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
    </div>
  );
}

function HomeFeed({
  narrow,
  onCreate,
  onSeeProjects,
  onChat,
}: {
  /** the chat drawer has taken a column — every grid loses one */
  narrow: boolean;
  onCreate: () => void;
  onSeeProjects: () => void;
  onChat: () => void;
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
      <HomeTopBar onChat={onChat} />

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
          : whatsNew.map((item) => <FeedCard key={item.id} item={item} />)}
      </div>
    </>
  );
}

/** A world or release note. The title sits ON the render, over a scrim. */
function FeedCard({ item }: { item: FeedItem }) {
  return (
    <button
      type="button"
      className="group relative aspect-video overflow-hidden rounded-xl border border-glass/10 text-left"
    >
      <div className="h-full w-full transition-transform duration-200 group-hover:scale-[1.03]">
        <WorldThumb seed={item.seed} />
      </div>
      <span aria-hidden className="absolute inset-0 scrim-strong" />
      <span className="type-body-strong absolute inset-x-3 bottom-2.5 line-clamp-2 text-white">
        {item.title}
      </span>
    </button>
  );
}
