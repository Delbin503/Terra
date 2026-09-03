import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui";
import { Icon } from "@/components/icons";

/** What a project is called when nobody has said otherwise. */
export const UNTITLED_PROJECT = "Untitled Project";

/** Long enough for a real title, short enough to fit the editor's top bar
 *  without eliding — past this the name stops being a name. */
const MAX = 60;

/**
 * NameProjectDialog — the one question between "create" and the editor.
 * ---------------------------------------------------------------------
 * Every project used to arrive called "Traffic Scene", because that is the
 * editor's default and nothing ever passed it anything else. A workspace of
 * identically-named projects is a workspace you navigate by thumbnail and luck,
 * and the rename lives three clicks deep in a context menu — so the name is
 * asked for at the one moment the person already knows the answer.
 *
 * IT IS ASKED AFTER, NOT BEFORE. The composer above it is about what the world
 * IS — a sentence, four photographs, a model version, a credit cost. Putting a
 * name field in there adds a required-looking input to a form whose whole point
 * is that you can type one thing and go.
 *
 * THE FIELD IS NEVER EMPTY. It opens prefilled — from the prompt where there
 * was one, "Untitled Project" where there wasn't — and Enter takes it. Someone
 * who does not care about the name presses one key; someone who does gets a
 * selected field to type over. A dialog that blocked on an empty required input
 * would be a toll gate on the way to the thing they asked for.
 */
export function NameProjectDialog({
  open,
  /** what to start the field with — the prompt's first few words, usually */
  suggestion,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  suggestion?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");

  // Re-seeded on every open: the suggestion is derived from a prompt that may
  // have changed since the last time this was up.
  useEffect(() => {
    if (open) setDraft(suggestion?.trim() || UNTITLED_PROJECT);
  }, [open, suggestion]);

  const name = draft.trim();
  // Falls back rather than blocking — see the note above.
  const submit = () => onConfirm(name || UNTITLED_PROJECT);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md" data-ui="name-project-dialog">
        <div className="pr-8">
          <DialogTitle>Name your project</DialogTitle>
          <DialogDescription>
            You can rename it later from the project menu, or from the title in the editor.
          </DialogDescription>
        </div>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="field-well flex h-11 items-center gap-2.5 rounded-lg px-3">
            <Icon name="file" size={16} className="shrink-0 text-content-subtle" />
            <input
              autoFocus
              // Selected, not just focused: the field arrives with a suggestion
              // in it, and the fastest way to replace one is to start typing.
              onFocus={(e) => e.currentTarget.select()}
              value={draft}
              maxLength={MAX}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={UNTITLED_PROJECT}
              aria-label="Project name"
              data-ui="name-project-input"
              className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
            />
          </label>

          <div className="mt-5 flex justify-end gap-2.5">
            <Button variant="secondary" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="brand" type="submit" data-ui="name-project-confirm">
              Create Project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A name out of a prompt.
 *
 * The first few words, trimmed of the padding people open with ("a", "create a
 * ...") and cut at a word boundary rather than mid-syllable. It is a suggestion
 * in a field the user is looking at, so being roughly right is the whole job —
 * anything cleverer would be a title generator nobody asked for.
 */
export function nameFromPrompt(prompt: string): string {
  const cleaned = prompt
    .trim()
    .replace(/^(please\s+)?(create|generate|make|build)\s+(me\s+)?(a|an|the)?\s*/i, "")
    .replace(/\s+/g, " ");
  if (!cleaned) return UNTITLED_PROJECT;

  const words = cleaned.split(" ").slice(0, 5).join(" ");
  const capped = words.length > 40 ? words.slice(0, 40).replace(/\s\S*$/, "") : words;
  // Cutting at five words routinely lands on a joining word — "foggy harbour at
  // dawn with" — which reads as a sentence someone was interrupted mid-way
  // through rather than as a name. Drop them until it ends on something.
  const trimmed = capped.replace(/\s+(a|an|the|and|with|at|in|on|of|to|for|from|by)$/i, "");
  // Sentence case, because a prompt is typed lowercase far more often than a
  // project is named lowercase.
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
