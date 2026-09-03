import { useState, useSyncExternalStore } from "react";
import { TooltipProvider } from "@/components/ui";
import { HomePage } from "@/features/home/HomePage";
import type { Destination } from "@/features/home/Sidebar";
import { EditorView } from "@/features/editor/EditorView";
import { useWorkOrderRuns } from "@/features/editor/work-order-runs";
import { SettingsView } from "@/features/settings/SettingsView";
import { SettingsProvider } from "@/features/settings/settings-store";
import { SettingsToast } from "@/features/settings/settings-toast";
import { isSettingsPage } from "@/features/settings/settings-data";
import { isPlanId } from "@/features/settings/subscription-data";

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

  /* `#editor/<name>` opens the editor on a NAMED project. The name is chosen in
     the create flow (see NameProjectDialog) and there is nowhere else to put it:
     the editor is a separate top-level view, so it does not share state with the
     home shell that asked the question. Same trick `#settings/<page>` uses.

     Bare `#editor` still means "the seeded scene", which is what a reload of an
     already-open editor and the sample project both rely on. */
  const inEditor = hash.startsWith("#editor");
  const editorName = inEditor
    ? decodeURIComponent(hash.slice("#editor".length).replace(/^\//, ""))
    : "";

  /* `#settings/<page>` opens Settings ON that page. It exists because half the
     links into Settings are about one specific thing — the Pricing page's
     "Upgrade Plan" wants the subscription checkout, the credit panel's Top Up
     wants Terra Balance — and landing on My Profile with a note to go looking
     is not a link, it is a suggestion.

     `#settings/plans/<planId>` goes one step further and names the plan being
     bought, so the Pricing page's Upgrade Plan lands IN the checkout for that
     plan rather than on a second picker asking the same question. */
  const inSettings = hash.startsWith("#settings");
  const [asked = "", plan = ""] = inSettings
    ? hash.slice("#settings/".length).split("/")
    : [];

  const exit = (to: Destination = "home") => {
    setLanding(to);
    window.location.hash = "";
  };

  let view = <HomePage at={landing} runs={runs} />;
  if (inEditor) {
    view = <EditorView runs={runs} {...(editorName ? { projectName: editorName } : null)} />;
  }
  if (inSettings) view = <SettingsView onExit={exit} />;

  /**
   * THE ACCOUNT STORE WRAPS ALL THREE VIEWS, not just Settings.
   *
   * It used to be mounted by SettingsView, which made the account something
   * only the account screens could read — so the balance in the home rail, the
   * one in the top bar and the one the editor prices a run against were three
   * frozen constants that a top-up could not move, and the Top Up button on the
   * credit popover could only send you somewhere else to press another one.
   *
   * The balance, the cards and the invoices are properties of the org, not of a
   * screen. Hoisted here they are read by every surface that shows a credit
   * figure and written by whichever one takes the money — which is what lets
   * "Add Credits" and "Top Up" open the actual purchase where they stand.
   *
   * The toast comes with it, for the same reason: a purchase made from the home
   * rail has to be able to confirm itself without Settings being on screen.
   */
  return (
    <TooltipProvider>
      <SettingsProvider
        start={isSettingsPage(asked) ? asked : undefined}
        startPlan={isPlanId(plan) ? plan : undefined}
        onExit={exit}
      >
        {view}
        <SettingsToast />
      </SettingsProvider>
    </TooltipProvider>
  );
}
