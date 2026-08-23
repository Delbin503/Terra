import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * The two dialogs every Settings control ends up needing: change one value, or
 * confirm one irreversible thing.
 *
 * They're here rather than per-page because eleven screens asking the same two
 * questions in eleven layouts is how a settings area stops feeling like one
 * product. The distinction that matters is between them: an EDIT is a form you
 * can abandon, a CONFIRM is a decision you have to type your way out of if it
 * destroys something.
 */

/** Change one field. Enter commits, Escape abandons — the field IS the form. */
export function EditFieldDialog({
  open,
  onOpenChange,
  title,
  label,
  initial,
  type = "text",
  hint,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  label: string;
  initial: string;
  type?: "text" | "email" | "password";
  hint?: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);

  // Reopening on a value that has since changed must show the CURRENT one, not
  // whatever was in the box the last time this dialog was mounted.
  useEffect(() => {
    if (open) setValue(type === "password" ? "" : initial);
  }, [open, initial, type]);

  const commit = () => {
    const next = value.trim();
    if (!next) return;
    onSave(next);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[26rem]">
        <DialogTitle>{title}</DialogTitle>
        {hint && <DialogDescription>{hint}</DialogDescription>}

        <label className="mt-4 block">
          <span className="type-caption text-content-subtle">{label}</span>
          <input
            autoFocus
            type={type}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            className="field-well type-body mt-1.5 h-10 w-full rounded-lg border px-3 text-content outline-none transition-colors focus:border-brand"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" size="sm" disabled={!value.trim()} onClick={commit}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
];

export function ChangePasswordDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: () => void;
}) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState<Record<"next" | "confirm", boolean>>({
    next: false,
    confirm: false,
  });

  useEffect(() => {
    if (open) {
      setNext("");
      setConfirm("");
      setShown({ next: false, confirm: false });
    }
  }, [open]);

  const passes = RULES.every((r) => r.test(next));
  const matches = next.length > 0 && next === confirm;

  const field = (
    id: "next" | "confirm",
    label: string,
    value: string,
    set: (v: string) => void
  ) => (
    <label className="mt-3 block">
      <span className="type-body-strong block text-content">{label}</span>
      <span className="field-well mt-1.5 flex h-10 items-center gap-2 rounded-lg border px-3 transition-colors focus-within:border-brand">
        <input
          type={shown[id] ? "text" : "password"}
          value={value}
          onChange={(e) => set(e.target.value)}
          className="type-body min-w-0 flex-1 bg-transparent text-content outline-none"
        />
        <button
          type="button"
          aria-label={shown[id] ? `Hide ${label}` : `Show ${label}`}
          onClick={() => setShown((p) => ({ ...p, [id]: !p[id] }))}
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-content-subtle transition-colors hover:text-content"
        >
          <Icon name={shown[id] ? "hidden" : "visible"} size={15} />
        </button>
      </span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[28rem]">
        <DialogTitle>Change Password</DialogTitle>
        <DialogDescription>
          Enter your new password below. Make sure it&apos;s at least 8 characters and includes
          uppercase, lowercase, and numbers.
        </DialogDescription>

        {field("next", "New Password", next, setNext)}
        {field("confirm", "Confirm New Password", confirm, setConfirm)}

        <div className="mt-4">
          <p className="type-body-strong text-content">Password must contain:</p>
          <ul className="mt-1 space-y-0.5">
            {RULES.map((r) => {
              const ok = r.test(next);
              return (
                <li
                  key={r.label}
                  className={
                    "type-body-dense flex items-center gap-1.5 " +
                    (ok ? "text-success" : "text-content-subtle")
                  }
                >
                  <Icon name={ok ? "select-check" : "chevron-right"} size={13} className="shrink-0" />
                  {r.label}
                </li>
              );
            })}
          </ul>
          {confirm.length > 0 && !matches && (
            <p className="type-body-dense mt-2 text-danger">Passwords don&apos;t match.</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={!passes || !matches}
            onClick={() => {
              onSave();
              onOpenChange(false);
            }}
          >
            Save Password
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirm something you can't take back.
 *
 * `confirmWord` arms the destructive path: when it's set, the action stays
 * disabled until the word is typed. That's reserved for things that end an
 * account or a subscription — asking someone to type DELETE to sign out of
 * other devices would just train them to type it without reading.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  confirmWord,
  tone = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmWord?: string;
  tone?: "danger" | "brand";
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const armed = !confirmWord || typed.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[28rem]">
        <div className="flex items-start gap-3">
          <span
            className={
              "grid h-9 w-9 shrink-0 place-items-center rounded-lg " +
              (tone === "danger" ? "bg-danger/15 text-danger" : "bg-brand-soft text-brand")
            }
          >
            <Icon name={tone === "danger" ? "warning" : "info"} size={18} />
          </span>
          <div className="min-w-0">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{body}</DialogDescription>
          </div>
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
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "brand"}
            size="sm"
            disabled={!armed}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A hidden file input plus the imperative handle to open it.
 *
 * Photo pickers are the one place a settings page needs a DOM escape hatch —
 * there's no way to open the OS chooser from state alone.
 */
export function useImagePicker(onPick: (objectUrl: string, file: File) => void) {
  const ref = useRef<HTMLInputElement>(null);

  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onPick(URL.createObjectURL(file), file);
        // Reset, or picking the same file twice fires nothing the second time.
        e.target.value = "";
      }}
    />
  );

  return { input, open: () => ref.current?.click() };
}
