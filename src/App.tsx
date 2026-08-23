import { useState, useSyncExternalStore } from "react";
import { TooltipProvider } from "@/components/ui";
import { HomePage } from "@/features/home/HomePage";
import type { Destination } from "@/features/home/Sidebar";
import { EditorView } from "@/features/editor/EditorView";
import { SettingsView } from "@/features/settings/SettingsView";

/** Minimal hash router — #editor is the 3D editor, #settings the account shell;
 *  everything else is the home page. The design system reference is a static
 *  page at /_sb-preview.html. */
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
  /** Where leaving Settings lands. The settings breadcrumb offers Home AND
   *  Projects, and dropping you on Home either way would make the second link
   *  a lie — so the exit carries its destination back to the app shell. */
  const [landing, setLanding] = useState<Destination>("home");

  let view = <HomePage at={landing} />;
  if (hash === "#editor") view = <EditorView />;
  if (hash === "#settings") {
    view = (
      <SettingsView
        onExit={(to = "home") => {
          setLanding(to);
          window.location.hash = "";
        }}
      />
    );
  }

  return <TooltipProvider>{view}</TooltipProvider>;
}
