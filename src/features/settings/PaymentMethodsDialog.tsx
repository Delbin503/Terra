import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui";
import { cardLabel, useSettings, type SavedCard } from "./settings-store";

/**
 * THE CARDS ON FILE — see them, correct them, add one, take one away.
 *
 * "View Details" used to walk you to the Billing page, which lists invoices:
 * the answer to "what have I been charged" standing in for "what am I charged
 * ON". This is the second question, and it is a short one — a list, a primary,
 * and three verbs — so it is a sheet over the page you asked from rather than
 * a screen you have to navigate back out of.
 *
 * WHAT IS NOT HERE IS THE CARD NUMBER. The add form takes one, reads a brand
 * and four digits off it, and drops it on the floor in the same function — see
 * `addCard` in the store. Nothing in this app's state, and so nothing in this
 * dialog, can show a full PAN, because there is never one to show. Editing is
 * therefore the holder and the expiry only: to change a number you add the new
 * card and remove the old one, which is what actually happens at the processor
 * anyway.
 */
export function PaymentMethodsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { cards, addCard, updateCard, removeCard, setPrimaryCard } = useSettings();
  /** which card's row is in edit mode — one at a time */
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** the card a removal is waiting on */
  const [pending, setPending] = useState<SavedCard | null>(null);

  // A sheet reopened should not still be holding the last visit's open form.
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setAdding(false);
    }
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[32rem]" data-ui="payment-methods">
          <DialogTitle>Payment Details</DialogTitle>
          <DialogDescription>
            The cards this organization is charged on. Top-ups and plan changes
            go to the primary.
          </DialogDescription>

          <div className="mt-4 flex flex-col gap-2">
            {cards.map((c) =>
              editing === c.id ? (
                <CardForm
                  key={c.id}
                  card={c}
                  onCancel={() => setEditing(null)}
                  onSave={(v) => {
                    updateCard(c.id, { holder: v.holder, expires: v.expires });
                    setEditing(null);
                  }}
                />
              ) : (
                <CardRow
                  key={c.id}
                  card={c}
                  onPrimary={() => setPrimaryCard(c.id)}
                  onEdit={() => {
                    setAdding(false);
                    setEditing(c.id);
                  }}
                  onRemove={() => setPending(c)}
                />
              )
            )}

            {!cards.length && !adding && (
              <p className="field-well type-body rounded-xl px-3.5 py-6 text-center text-content-subtle">
                No card on file. Add one to top up credits or change plan.
              </p>
            )}

            {adding && (
              <CardForm
                onCancel={() => setAdding(false)}
                onSave={(v) => {
                  addCard(v);
                  setAdding(false);
                }}
              />
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={adding}
              data-ui="payment-add-card"
              onClick={() => {
                setEditing(null);
                setAdding(true);
              }}
            >
              <Icon name="create" size={15} />
              Add card
            </Button>
            <Button variant="brand" size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Removing the card an org is billed on is not undoable from in here —
          the token is gone and the number has to be typed again — so it asks. */}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Remove ${pending ? cardLabel(pending) : ""}?`}
        body={
          pending?.primary && cards.length > 1
            ? "It is the primary card, so the next one on file takes over. You can change which after."
            : cards.length === 1
              ? "It is the only card on file. Top-ups and plan changes stay blocked until another is added."
              : "It stops being available for top-ups and plan changes."
        }
        confirmLabel="Remove card"
        onConfirm={() => {
          if (pending) removeCard(pending.id);
          setPending(null);
        }}
      />
    </>
  );
}

/** One card, at rest. */
function CardRow({
  card,
  onPrimary,
  onEdit,
  onRemove,
}: {
  card: SavedCard;
  onPrimary: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      data-ui={`payment-card-${card.id}`}
      className="field-well flex items-center gap-3 rounded-xl px-3 py-2.5"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-glass/15 text-content-muted">
        <Icon name="payment" size={17} />
      </span>

      <div className="min-w-0 flex-1">
        <span className="type-body-strong flex items-center gap-2 text-content">
          <span className="truncate">{cardLabel(card)}</span>
          {card.primary && (
            <span className="type-badge-sm shrink-0 rounded bg-brand-soft px-1.5 py-px text-brand">
              Primary
            </span>
          )}
        </span>
        <span className="type-body-dense block truncate text-content-subtle">
          {card.holder} · Expires {card.expires}
        </span>
      </div>

      {/* Making a card primary is the common act, so it is one click on the row
          rather than a menu. It disappears on the card that already is one. */}
      {!card.primary && (
        <button
          type="button"
          onClick={onPrimary}
          className="type-button-xs shrink-0 rounded-md px-2 py-1 text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
        >
          Make primary
        </button>
      )}
      <button
        type="button"
        aria-label={`Edit ${cardLabel(card)}`}
        onClick={onEdit}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-glass/15 hover:text-content"
      >
        <Icon name="edit" size={15} />
      </button>
      <button
        type="button"
        aria-label={`Remove ${cardLabel(card)}`}
        onClick={onRemove}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-danger/15 hover:text-danger"
      >
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

/** Space every four digits, the way the digits are printed on the card. */
const group = (v: string) =>
  v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();

/** Keep the slash in MM/YY as it is typed, so nobody has to reach for it. */
const asExpiry = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/**
 * Add a card, or correct one.
 *
 * EDITING SHOWS NO NUMBER FIELD, because there is no number to put in it — the
 * row above it says which card this is, and the two things a person actually
 * needs to fix after the fact (a renamed holder, a reissued expiry date) are
 * the two things here.
 */
function CardForm({
  card,
  onCancel,
  onSave,
}: {
  card?: SavedCard;
  onCancel: () => void;
  onSave: (v: { number: string; expires: string; holder: string }) => void;
}) {
  const [holder, setHolder] = useState(card?.holder ?? "");
  const [number, setNumber] = useState("");
  const [expires, setExpires] = useState(card?.expires ?? "");

  const digits = number.replace(/\D/g, "");
  const ok =
    holder.trim() !== "" &&
    /^\d{2}\/\d{2}$/.test(expires) &&
    (card ? true : digits.length >= 12);

  return (
    <form
      data-ui="payment-card-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave({ number, expires, holder });
      }}
      className="rounded-xl border border-glass/15 bg-glass/5 p-3"
    >
      <p className="type-body-strong text-content">
        {card ? `Edit ${cardLabel(card)}` : "Add a card"}
      </p>

      <label className="mt-2.5 block">
        <span className="type-caption text-content-subtle">Name on card</span>
        <input
          autoFocus
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          className="field-well type-body mt-1 h-10 w-full rounded-lg px-3 text-content outline-none"
        />
      </label>

      {!card && (
        <label className="mt-2.5 block">
          <span className="type-caption text-content-subtle">Card number</span>
          <input
            inputMode="numeric"
            autoComplete="cc-number"
            value={number}
            onChange={(e) => setNumber(group(e.target.value))}
            placeholder="•••• •••• •••• ••••"
            className="field-well type-body mt-1 h-10 w-full rounded-lg px-3 text-content outline-none placeholder:text-content-subtle"
          />
          <span className="type-caption mt-1 block text-content-subtle">
            Only the brand and last four are kept.
          </span>
        </label>
      )}

      <label className="mt-2.5 block">
        <span className="type-caption text-content-subtle">Expires</span>
        <input
          inputMode="numeric"
          autoComplete="cc-exp"
          value={expires}
          onChange={(e) => setExpires(asExpiry(e.target.value))}
          placeholder="MM/YY"
          className={cn(
            "field-well type-body mt-1 h-10 w-full rounded-lg px-3 text-content outline-none placeholder:text-content-subtle"
          )}
        />
      </label>

      <div className="mt-3 flex justify-end gap-2.5">
        <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="brand" size="sm" type="submit" disabled={!ok}>
          {card ? "Save" : "Add card"}
        </Button>
      </div>
    </form>
  );
}
