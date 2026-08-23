import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui";
import { HomeTopBar } from "./HomeTopBar";
import { WorldThumb } from "./WorldThumb";
import { useWorkspace } from "./workspace";

/**
 * TRASH — what Projects threw away, and the two ways out of it.
 *
 * A list rather than a grid of covers: nothing here is work you're browsing, it
 * is work you're deciding about, and a decision wants the name, the kind and the
 * two buttons on one line. The cover stays as a small plate so you can tell two
 * similarly-named things apart.
 *
 * Deleting for good is the only destructive act in this app that isn't undoable,
 * so it asks — inline, on the row, rather than in a dialog that covers the thing
 * being deleted.
 */
export function TrashView({
  onHome,
  onChat,
}: {
  onHome: () => void;
  /** opens Terra AI from this page's top bar */
  onChat: () => void;
}) {
  const { trash, restore, deleteForever, emptyTrash } = useWorkspace();

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
            <span className="text-content-muted">Trash</span>
          </nav>
        }
      />

      <section className="mt-6 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-semibold tracking-tight">Trash</h1>
            <p className="type-body mt-0.5 text-content-subtle">
              {trash.length
                ? `${trash.length} ${trash.length === 1 ? "item" : "items"} · restore anything until you delete it for good`
                : "Nothing here."}
            </p>
          </div>
          {trash.length > 0 && (
            <Confirm
              label="Empty Trash"
              icon="trash"
              question={`Delete all ${trash.length}?`}
              onConfirm={emptyTrash}
            />
          )}
        </div>

        <div className="mt-5">
          {trash.length ? (
            <ul className="flex flex-col gap-1.5">
              {trash.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3.5 glass-thin !rounded-xl p-2.5"
                >
                  <span className="relative h-[46px] w-[68px] shrink-0 overflow-hidden rounded-lg border border-glass/10">
                    {entry.project ? (
                      <WorldThumb seed={entry.project.seed} />
                    ) : entry.folder?.seeds.length ? (
                      <WorldThumb seed={entry.folder.seeds[0]} />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-glass/20 text-content-subtle">
                        <Icon name="folder" size={17} />
                      </span>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="type-body-strong block truncate text-content">
                      {entry.name}
                    </span>
                    <span className="type-caption mt-0.5 flex items-center gap-1.5 text-content-subtle">
                      <Icon
                        name={entry.kind === "project" ? "file" : "folder"}
                        size={12}
                      />
                      {entry.kind === "project" ? "Project" : "Folder"}
                      <span aria-hidden>·</span>
                      Deleted {entry.at}
                    </span>
                  </span>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => restore(entry.id)}
                  >
                    <Icon name="retry" size={15} />
                    Restore
                  </Button>
                  <Confirm
                    label="Delete forever"
                    question="Sure?"
                    onConfirm={() => deleteForever(entry.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-glass/15 py-16 text-center">
              <Icon name="trash" size={20} className="text-content-subtle" />
              <p className="type-body text-content-muted">
                Trash is empty. Anything you remove from Projects lands here first.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * Two taps for the irreversible one. The second tap is the only red thing on the
 * row, so the dangerous state is visible rather than remembered, and it disarms
 * itself after a few seconds — an armed button left lying around is a trap.
 */
function Confirm({
  label,
  icon,
  question,
  onConfirm,
}: {
  label: string;
  icon?: IconName;
  question: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        onClick={() => setArmed(true)}
      >
        {icon && <Icon name={icon} size={15} />}
        {label}
      </Button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="type-caption text-content-muted">{question}</span>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Keep
      </Button>
      <Button variant="danger" size="sm" onClick={onConfirm}>
        {label}
      </Button>
    </span>
  );
}
