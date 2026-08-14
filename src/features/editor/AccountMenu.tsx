import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Avatar, Tooltip } from "@/components/ui";
import { Panel, SearchInput } from "./ui";
import { useDismissable } from "./use-dismissable";
import { owner, collaborators } from "./account-data";

/**
 * AccountMenu — the avatar affordance in the top-right cluster. Clicking it
 * opens the people popover: the signed-in user (owner), a search field and the
 * other users on the scene with their live seat + activity status. Same glass
 * `overlay` material as the Credits popover beside it.
 */
export function AccountMenu({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), wrap);

  const others = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? collaborators.filter((u) => u.name.toLowerCase().includes(q)) : collaborators;
  }, [query]);

  return (
    <div ref={wrap} className="relative">
      <Tooltip label={`Account: ${userName}`} side="bottom" tone="glass" hidden={open}>
        <button
          type="button"
          aria-label={`Account: ${userName}`}
          aria-expanded={open}
          data-ui="editor-account"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-glass/15",
            open && "bg-glass/15"
          )}
        >
          <Avatar name={userName} size={30} />
          <Icon name="chevron-down" size={15} className="text-content-muted" />
        </button>
      </Tooltip>

      {open && (
        /* Sized to the project-emoji picker. A people list is a menu hanging
           off a 48px bar, not a page: at 360px with 44px avatars it covered a
           quarter of the viewport to say five names. */
        <Panel
          ui="account"
          thickness="overlay"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[248px] !rounded-2xl"
        >
          {/* Signed-in user */}
          <div data-ui="account-me" className="flex items-center gap-2.5 px-3 pb-2.5 pt-3">
            <Avatar name={userName} size={30} />
            <div className="min-w-0">
              <p className="type-body-dense truncate text-content">
                <span className="type-caption-strong">{userName}</span>{" "}
                <span className="text-content-subtle">(You)</span>
              </p>
              <p className="type-caption text-content-subtle">{owner.role}</p>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 pb-1">
            <SearchInput
              ui="find-someone"
              value={query}
              onValueChange={setQuery}
              placeholder="Find someone..."
            />
          </div>

          {/* Other users */}
          <div
            data-ui="account-others"
            className="max-h-[228px] min-h-0 overflow-y-auto border-t border-glass/10 px-3 pb-2.5 pt-2.5"
          >
            <h3 className="type-eyebrow mb-1 text-content-muted">Other Users</h3>
            <ul className="flex flex-col">
              {others.map((u) => (
                <li
                  key={u.id}
                  data-ui={`account-user-${u.id}`}
                  className="flex items-center gap-2 border-b border-glass/8 py-2 last:border-0"
                >
                  <Avatar name={u.name} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="type-caption-strong truncate text-content">{u.name}</p>
                    <p className="type-caption text-content-subtle">{u.seat}</p>
                  </div>
                  <span
                    className={cn(
                      "type-caption shrink-0",
                      u.status === "editing" ? "text-brand-on-glass" : "text-master-on-glass"
                    )}
                  >
                    {u.status === "editing" ? "Editing…" : "Viewing…"}
                  </span>
                </li>
              ))}
              {others.length === 0 && (
                <li className="type-caption py-5 text-center text-content-subtle">No one found</li>
              )}
            </ul>
          </div>
        </Panel>
      )}
    </div>
  );
}
