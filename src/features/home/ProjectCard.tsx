import { cn } from "@/lib/utils";
import { Card } from "@/components/ui";
import type { Project } from "./data";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Card interactive className="overflow-hidden">
      <div
        className="relative aspect-[16/11] after:absolute after:inset-0 after:scrim-soft"
        style={{ background: project.gradient }}
      />
      <div className="flex items-center gap-2.5 p-2.5">
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-md font-display text-xs font-bold",
            project.kind === "HSD"
              ? "bg-accent-soft text-accent"
              : "bg-brand-soft text-brand"
          )}
        >
          {project.kind[0]}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{project.name}</span>
          <span className="block text-2xs text-content-subtle">{project.editedLabel}</span>
        </span>
      </div>
    </Card>
  );
}
