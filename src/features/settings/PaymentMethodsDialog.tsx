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
import {
  CardBrandMark,
  CardFields,
  draftComplete,
  draftFrom,
  billingFrom,
  isExpired,
  maskedPan,
  savedCardName,
  EMPTY_DRAFT,
  type CardDraft,
} from "./card-parts";
import { cardLabel, useSettings, type SavedCard } from "./settings-store";

/**
 * SAVED PAYMENT METHODS — the cards on file, and which one gets charged.
 *
 * The sheet answers two questions that used to be tangled together. "What is on
 * file" is the list. "Which one pays" is a CHOICE you make and then commit —
 * you select a row and press Use as Default Card, rather than a "Make primary"
 * link on each row that fires the moment it is clicked. Changing the card an
 * organization is billed on is not a thing to do by mis-clicking a list, and
 * the two-step also gives the row a selected state to sit in, which is what
 * makes the list feel like a chooser rather than a table of links.
 *
 * The default row is the one carrying the badge and the brand outline; a row
 * you have selected takes the outline too, so there is exactly one rule to read:
 * an outlined row is the card that will be charged once you press the button.
 *
 * WHAT IS NOT HERE IS THE CARD NUMBER. The add form takes one, reads a brand
 * and four digits off it, and drops it on the floor in the same function — see
 * `addCard` in the store. Nothing in this app's state, and so nothing in this
 * dialog, can show a full PAN, because there is never one to show. Editing is
 * therefore everything EXCEPT the number: the holder, the expiry, and the
 * billing address the card authorises against.
 */
export function PaymentMethodsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { cards, addCard, updateCard, removeCard, setPrimaryCard } = useSettings();
  /** the form, when one is open — a card id to edit, or "new" to add */
  const [form, setForm] = useState<string | null>(null);
  /** the row the chooser is pointing at, which is not yet the default */
  const [picked, setPicked] = useState<string | null>(null);
  /** the card a removal is waiting on */
  const [pending, setPending] = useState<SavedCard | null>(null);

  const primary = cards.find((c) => c.primary) ?? null;
  /* Selecting the card that already pays is not a change, so the button stays
     down — pressing it would raise a confirmation for nothing happening. */
  const canApply = !!picked && picked !== primary?.id && cards.some((c) => c.id === picked);

  // A sheet reopened should not still be holding the last visit's open form or
  // an abandoned selection.
  useEffect(() => {
    if (!open) {
      setForm(null);
      setPicked(null);
    }
  }, [open]);

  const editing = form && form !== "new" ? cards.find((c) => c.id === form) : undefined;

  return (
    <>
      <Dialog open={open && !form} onOpenChange={onOpenChange}>
        <DialogContent className="w-[47.75rem] max-w-[calc(100vw-2rem)]" data-ui="payment-methods">
          <DialogTitle className="type-title">Saved Payment Methods</DialogTitle>

          <div className="mt-6 flex flex-col gap-4">
            {cards.map((c) => (
              <CardRow
                key={c.id}
                card={c}
                selected={picked ? picked === c.id : !!c.primary}
                onSelect={() => setPicked(c.id)}
                onEdit={() => setForm(c.id)}
                onRemove={() => setPending(c)}
              />
            ))}

            {!cards.length && (
              <p className="field-well type-body rounded-xl px-3.5 py-8 text-center text-content-subtle">
                No card on file. Add one to top up credits or change plan.
              </p>
            )}

            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              data-ui="payment-add-card"
              onClick={() => setForm("new")}
            >
              <Icon name="create" size={15} />
              Add New Card
            </Button>
          </div>

          <div className="mt-6 flex items-center justify-end gap-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="brand"
              disabled={!canApply}
              data-ui="payment-set-default"
              onClick={() => {
                if (picked) setPrimaryCard(picked);
                setPicked(null);
              }}
            >
              Use as Default Card
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* The form is a SECOND sheet rather than a panel inside the first: it is
          the same 828px-wide form the checkout uses, and folding it into a row
          of the list made the list stop being readable exactly when you needed
          to check which card you were editing. Closing it comes back to the
          list, which is what "Go back" means. */}
      <CardFormDialog
        open={!!form}
        card={editing}
        soleCard={cards.length === 0}
        onClose={() => setForm(null)}
        onSubmit={(d) => {
          if (editing) {
            updateCard(editing.id, {
              holder: d.holder.trim(),
              expires: d.expiry,
              billing: billingFrom(d),
              /* Unticking the box on the card that already pays would leave the
                 org with nothing to charge, so only a promotion is honoured. */
              primary: d.makeDefault || undefined,
            });
          } else {
            addCard({
              number: d.number,
              expires: d.expiry,
              holder: d.holder,
              billing: billingFrom(d),
              primary: d.makeDefault,
            });
          }
          setForm(null);
        }}
      />

      {/* Removing the card an org is billed on is not undoable from in here —
          the token is gone and the number has to be typed again — so it asks. */}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Remove ${pending ? cardLabel(pending) : ""}?`}
        body={
          cards.length === 1
            ? "It is the only card on file. Top-ups and plan changes stay blocked until another is added."
            : "It stops being available for top-ups and plan changes."
        }
        confirmLabel="Remove card"
        onConfirm={() => {
          if (pending) {
            removeCard(pending.id);
            setPicked((p) => (p === pending.id ? null : p));
          }
          setPending(null);
        }}
      />
    </>
  );
}

/** One card, at rest — and the row you press to choose it. */
function CardRow({
  card,
  selected,
  onSelect,
  onEdit,
  onRemove,
}: {
  card: SavedCard;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const expired = isExpired(card.expires);

  return (
    /* The row is the control. Edit and Remove sit inside it as their own
       buttons, so they stop the click rather than selecting the row on the way
       past — see `stop` below. */
    <div
      role="radio"
      tabIndex={0}
      aria-checked={selected}
      data-ui={`payment-card-${card.id}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border bg-glass/8 px-5 py-6 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
        selected ? "border-brand" : "border-transparent hover:border-line/15"
      )}
    >
      <CardBrandMark brand={card.brand} className="mt-1" />

      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-3">
          <span className="type-subheading truncate text-content">{savedCardName(card)}</span>
          {card.primary && (
            <span className="type-caption-strong shrink-0 rounded-md bg-glass/25 px-2.5 py-0.5 text-content">
              Default Payment
            </span>
          )}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-3">
          <span className="type-body-lg text-content-muted">{maskedPan(card.last4)}</span>
          <span aria-hidden className="h-4 w-px bg-line/20" />
          {/* The expiry is the one fact on this row that can go wrong on its
              own, so it is the only one that changes colour when it does. */}
          <span className={cn("type-body", expired ? "text-danger" : "text-content-muted")}>
            Expires On {card.expires}
          </span>
        </span>
      </div>

      <span className="flex shrink-0 items-center gap-4 pt-0.5">
        <RowAction onClick={onEdit} label={`Edit ${savedCardName(card)}`}>
          Edit
        </RowAction>
        {/* The card that pays cannot be removed out from under the charges. It
            stays visible and disabled rather than vanishing, so the rule is
            legible: promote another card first, then this one can go. */}
        <RowAction
          onClick={onRemove}
          label={`Remove ${savedCardName(card)}`}
          disabled={card.primary}
          tone="danger"
        >
          Remove
        </RowAction>
      </span>
    </div>
  );
}

function RowAction({
  children,
  label,
  onClick,
  disabled,
  tone = "brand",
}: {
  children: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "brand" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "type-button rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50",
        tone === "danger"
          ? "text-danger hover:text-danger/80"
          : "text-brand hover:text-brand-hover"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Add a card, or correct one.
 *
 * ONE FORM, TWO VERBS. The fields, their order and their validation are the
 * same object either way (see `CardFields`); what changes is the title, whether
 * a number is asked for, and what the primary button says. Splitting it into an
 * add form and an edit form is how the two drift into disagreeing about which
 * fields are required.
 */
function CardFormDialog({
  open,
  card,
  soleCard,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** the card being corrected, or undefined when adding */
  card?: SavedCard;
  /** there is nothing on file yet, so this one pays whatever the box says */
  soleCard: boolean;
  onClose: () => void;
  onSubmit: (draft: CardDraft) => void;
}) {
  const [draft, setDraft] = useState<CardDraft>(EMPTY_DRAFT);

  /* Opening always starts from what is CURRENTLY stored, never from whatever
     was abandoned in the boxes last time the sheet was open. */
  useEffect(() => {
    if (open) setDraft(card ? draftFrom(card) : { ...EMPTY_DRAFT, makeDefault: soleCard });
  }, [open, card, soleCard]);

  const ok = draftComplete(draft, !card);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="w-[54.75rem] max-w-[calc(100vw-2rem)]"
        data-ui="payment-card-form"
      >
        <DialogTitle className="type-title">
          {card ? "Edit Payment Details" : "Payment Details"}
        </DialogTitle>
        <DialogDescription className="type-body-lg mt-4 max-w-[50rem]">
          Manage the card used for your subscription. This card will be charged for
          all future billing cycles, Credits top-ups, and plan upgrades.
        </DialogDescription>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) onSubmit(draft);
          }}
        >
          <CardFields
            draft={draft}
            onDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            editing={!!card}
            /* The card that already pays has nothing to promote itself to, and
               the box cannot be used to demote it — see the submit handler. */
            defaultLocked={!!card?.primary || soleCard}
          />

          <div className="mt-6 flex items-center justify-end gap-4">
            <Button variant="outline" type="button" onClick={onClose}>
              Go back
            </Button>
            <Button variant="brand" type="submit" disabled={!ok}>
              {card ? "Save Changes" : "Add Payment Method"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
