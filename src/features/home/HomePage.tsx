import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Button, Card } from "@/components/ui";
import { Sidebar } from "./Sidebar";
import { ChatLauncher } from "./ChatLauncher";
import { CreateWorldModal } from "./CreateWorldModal";
import { ProjectCard } from "./ProjectCard";
import { projects, communityWorlds } from "./data";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const [collapsed, setCollapsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

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
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onCreate={() => setModalOpen(true)}
      />

      <main className="h-screen flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-10 pb-20 pt-16">
          {/* Greeting + chat launcher */}
          <h1 className="mb-7 text-center text-3xl font-semibold">
            {greeting()}, start creating!
          </h1>
          <div className="mb-16">
            <ChatLauncher onOpen={() => setModalOpen(true)} />
          </div>

          {/* Projects */}
          <SectionHeader title="Projects" trailing={<SortControl />} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>

          <div className="my-14 flex justify-center">
            <Button variant="secondary" onClick={() => {}}>
              View all projects
              <Icon name="arrow-right" size={16} />
            </Button>
          </div>

          {/* Discover: What's new + Community */}
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <DiscoverCard
              icon="generate"
              tone="brand"
              title="What's new"
              desc="Latest models, features, and platform updates"
            />
            <DiscoverCard
              icon="community"
              tone="accent"
              title="Community"
              desc="Explore worlds and datasets built by creators"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {communityWorlds.map((w) => (
              <button
                key={w.id}
                className="relative aspect-[16/11] overflow-hidden rounded-xl border border-line/10 text-left after:absolute after:inset-0 after:scrim-soft"
                style={{ background: w.gradient }}
              >
                <span className="absolute bottom-2.5 left-3 z-10 text-sm font-medium text-white">
                  {w.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>

      <CreateWorldModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}

function SectionHeader({
  title,
  trailing,
}: {
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center">
      <button className="flex items-center gap-1.5 font-display text-lg font-semibold">
        {title}
        <Icon name="chevron-right" size={16} className="text-content-muted" />
      </button>
      <div className="flex-1" />
      {trailing}
    </div>
  );
}

function SortControl() {
  return (
    <button className="flex items-center gap-1.5 text-sm text-content-muted hover:text-content">
      Sort: Recent
      <Icon name="chevron-down" size={15} />
    </button>
  );
}

function DiscoverCard({
  icon,
  tone,
  title,
  desc,
}: {
  icon: IconName;
  tone: "brand" | "accent";
  title: string;
  desc: string;
}) {
  return (
    <Card interactive className="flex items-center gap-3.5 p-4">
      <div
        className={
          tone === "brand"
            ? "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"
            : "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
        }
      >
        <Icon name={icon} size={22} />
      </div>
      <div>
        <h3 className="font-display text-md font-semibold">{title}</h3>
        <p className="text-sm text-content-muted">{desc}</p>
      </div>
      <Icon name="arrow-right" size={18} className="ml-auto text-content-subtle" />
    </Card>
  );
}
