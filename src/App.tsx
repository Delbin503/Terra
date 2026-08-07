import { useSyncExternalStore } from "react";
import { TooltipProvider } from "@/components/ui";
import { HomePage } from "@/features/home/HomePage";
import { EditorView } from "@/features/editor/EditorView";

/** Minimal hash router — #editor is the 3D editor; everything else is the home page.
 *  The design system reference is a static page at /_sb-preview.html. */
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

  return <TooltipProvider>{view}</TooltipProvider>;
}
