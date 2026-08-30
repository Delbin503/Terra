import { useState, useSyncExternalStore } from "react";
import { TooltipProvider } from "@/components/ui";
import { HomePage } from "@/features/home/HomePage";
import type { Destination } from "@/features/home/Sidebar";
import { EditorView } from "@/features/editor/EditorView";
import { useWorkOrderRuns } from "@/features/editor/work-order-runs";
import { SettingsView } from "@/features/settings/SettingsView";
import { isSettingsPage } from "@/features/settings/settings-data";

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

  /**
   * THE WORK ORDER RUNS LIVE HERE, above the router.
   *
   * They used to be state inside EditorView, which meant the Downloads button
   * on the home rail had nothing to show: #editor and the home page are
   * separate top-level views and one unmounts when the other mounts, so a
   * second `useWorkOrderRuns` there would have been a second, seeded-but-empty
   * history that never saw a real dispatch.
   *
   * A run outlives the mode that created it — that is the whole reason the
   * store exists (see work-order-runs.ts) — so it has to outlive the view too.
   * One store, one list, whichever screen asks.
   */
  const runs = useWorkOrderRuns("Traffic Scene");

  let view = <HomePage at={landing} runs={runs} />;
  if (hash === "#editor") view = <EditorView runs={runs} />;
  if (hash.startsWith("#settings")) {
    /* `#settings/<page>` opens Settings ON that page. It exists because half
       the links into Settings are about one specific thing — the Pricing page's
       "Upgrade Plan" wants the subscription checkout, the credit panel's Top Up
       wants Terra Balance — and landing on My Profile with a note to go looking
       is not a link, it is a suggestion. */
    const asked = hash.slice("#settings/".length);
    view = (
      <SettingsView
        start={isSettingsPage(asked) ? asked : undefined}
        onExit={(to = "home") => {
          setLanding(to);
          window.location.hash = "";
        }}
      />
    );
  }

  return <TooltipProvider>{view}</TooltipProvider>;
}
