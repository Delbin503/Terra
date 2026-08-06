import { useSyncExternalStore } from "react";
import { TooltipProvider } from "@/components/ui";
import { HomePage } from "@/features/home/HomePage";
import { GlassPreview } from "@/features/editor/GlassPreview";
import { EditorView } from "@/features/editor/EditorView";

/** Minimal hash router — visit #glass to preview the glass token layer. */
function useHash() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb);
      return () => window.removeEventListener("hashchange", cb);
    },
    () => window.location.hash
  );
}

export default function App() {
  const hash = useHash();

  let view = <HomePage />;
  if (hash === "#editor") view = <EditorView />;
  else if (hash === "#glass") view = <GlassPreview />;

  return <TooltipProvider>{view}</TooltipProvider>;
}
