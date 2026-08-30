import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./dialog";
import { Icon, type IconName } from "@/components/icons";

/**
 * CONFIRM — the one shape the whole product stops in.
 *
 * There is exactly one of these because a confirmation is the moment a person
 * is being asked to take responsibility for something, and that moment has to
 * look the same wherever it happens: Settings closing an account, Projects
 * throwing a folder away, the editor leaving a scene. Three layouts for one
 * question is how an app stops reading as one app — the editor used to ask in a
 * dock panel with full-width footer buttons while the web side asked in a glass
 * sheet with a right-aligned pair, and the two looked like separate products
 * asking separate questions.
 *
 * The anatomy, in the order it is read:
 *   title · body · (typed word, if the act is unrecoverable) ·
 *   Cancel · the act, named.
 *
 * `confirmWord` arms the destructive path: the action stays disabled until the
 * word is typed. It is reserved for things nothing can bring back — deleting
 * from Trash, ending an account. Asking for it to sign out of other devices
 * would only train people to type it without reading.
 *
 * `cancelLabel`/`onCancel` exist for the questions whose LEFT button is also an
 * answer ("No, drop it here") rather than a way out. Dismissing — Escape, the
 * scrim, the X — is never that answer: it only closes.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  confirmIcon,
  cancelLabel = "Cancel",
  onCancel,
  confirmWord,
  tone = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** a glyph on the confirm button, when naming the act isn't enough */
  confirmIcon?: IconName;
  cancelLabel?: string;
  /** what the left button DOES, when it is an answer rather than a way out */
  onCancel?: () => void;
  confirmWord?: string;
  /** which colour the confirming button takes — the only place tone shows now */
  tone?: "danger" | "brand";
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const armed = !confirmWord || typed.trim().toUpperCase() === confirmWord.toUpperCase();
  const danger = tone === "danger";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[28rem]" data-ui="confirm-dialog">
        {/* NO GLYPH IN FRONT OF THE TITLE. A warning triangle beside a sentence
            that already says what is about to happen is decoration that the
            title has to be indented around — and the tone is carried where it
            belongs, on the button that does the thing. */}
        <div className="min-w-0 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </div>

        {confirmWord && (
          <label className="mt-4 block">
            <span className="type-caption text-content-subtle">
              Type <b className="text-content">{confirmWord}</b> to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="field-well type-body mt-1.5 h-10 w-full rounded-lg border px-3 text-content outline-none transition-colors focus:border-danger"
            />
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            data-ui="confirm-dialog-cancel"
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "brand"}
            size="sm"
            disabled={!armed}
            data-ui="confirm-dialog-confirm"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmIcon && <Icon name={confirmIcon} size={15} />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
