import { GlassIconButton } from "@/components/glass";
import type { IconName } from "@/components/icons";
import { RailFlyout } from "./RailFlyout";

export type RailTool = "scene" | "assets" | "ai";
export type FlyoutAction = "chat" | "asa" | "mat";

const TOOLS: { id: RailTool; icon: IconName; label: string }[] = [
  { id: "scene", icon: "scene", label: "Scene objects" },
  { id: "assets", icon: "assets", label: "Assets" },
  { id: "ai", icon: "ai", label: "AI Tools" },
];

/** Left rail — floating circular glass tools. The AI tool reveals a flyout of
 *  AI Chat / ASA / MAT options; other tools open their panels directly. */
export function EditorLeftRail({
  active,
  onSelect,
  onFlyoutAction,
  onCloseFlyout,
}: {
  active: RailTool | null;
  onSelect: (t: RailTool) => void;
  onFlyoutAction: (a: FlyoutAction) => void;
  onCloseFlyout: () => void;
}) {
  return (
    <div data-ui="editor-left-rail" className="pointer-events-auto relative flex flex-col gap-3">
      {TOOLS.map((t) => (
        <GlassIconButton
          key={t.id}
          ui={`rail-${t.id}`}
          size="lg"
          icon={t.icon}
          label={t.label}
          active={active === t.id}
          onClick={() => onSelect(t.id)}
        />
      ))}

      {active === "ai" && (
        <RailFlyout
          onClose={onCloseFlyout}
          items={[
            { icon: "ai-chat", label: "AI Chat", accent: true, onClick: () => onFlyoutAction("chat") },
            { icon: "asa", label: "ASA", onClick: () => onFlyoutAction("asa") },
            { icon: "mat", label: "MAT", onClick: () => onFlyoutAction("mat") },
          ]}
        />
      )}
    </div>
  );
}
