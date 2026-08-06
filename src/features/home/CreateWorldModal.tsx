import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Badge,
  Button,
} from "@/components/ui";

type InputMode = "2d" | "3d";

const modes: {
  id: InputMode;
  icon: IconName;
  title: string;
  desc: string;
  beta?: boolean;
}[] = [
  {
    id: "2d",
    icon: "input-2d",
    title: "2D input",
    desc: "Add image(s), a video, or a panorama to generate a world.",
  },
  {
    id: "3d",
    icon: "input-3d",
    title: "3D input",
    desc: "Build a scene with 3D models and primitives to generate a world.",
    beta: true,
  },
];

export function CreateWorldModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [mode, setMode] = useState<InputMode>("2d");
  const is3d = mode === "3d";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle>Start a new world</DialogTitle>
        <DialogDescription className="mt-1">
          Choose how you want to describe the world, then let Terra generate it.
        </DialogDescription>

        {/* Mode choice */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                mode === m.id
                  ? "border-brand bg-brand-soft/40"
                  : "border-line/10 bg-surface-raised hover:bg-surface-overlay"
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon name={m.icon} size={20} className="text-content" />
                <span className="font-display text-md font-semibold">{m.title}</span>
                {m.beta && (
                  <Badge variant="outline" size="sm" className="ml-auto">
                    Beta
                  </Badge>
                )}
              </div>
              <p className="text-sm leading-snug text-content-muted">{m.desc}</p>
            </button>
          ))}
        </div>

        {/* Prompt */}
        <div className="mt-4 rounded-xl border border-line/12 bg-surface-raised p-3.5">
          <textarea
            placeholder={is3d ? "Describe your 3D scene…" : "Imagine a world…"}
            rows={3}
            className="w-full resize-none bg-transparent text-md text-content outline-none placeholder:text-content-subtle"
          />
          <div className="mt-2.5 flex items-center gap-2.5">
            <button className="flex items-center gap-1.5 rounded-lg border border-line/12 px-2.5 py-1.5 text-sm text-content-muted transition-colors hover:text-content">
              <Icon name="tune" size={15} />
              Terra 1.1
              <Icon name="chevron-down" size={15} />
            </button>
            <Button variant="accent" className="ml-auto">
              <Icon name="brush" size={16} />
              Create
            </Button>
          </div>
        </div>

        {/* File hint — only meaningful for 2D input */}
        {!is3d && (
          <div className="mt-3.5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line/14 p-4 text-center">
            <div className="flex gap-4 text-content-muted">
              <Icon name="input-2d" size={20} />
              <Icon name="video" size={20} />
              <Icon name="panorama" size={20} />
            </div>
            <p className="text-sm text-content-subtle">
              For best results, add image(s), a video, or a panorama.{" "}
              <a href="#" className="text-content-muted underline">
                View our file guidelines
              </a>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
