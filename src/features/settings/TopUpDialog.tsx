import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui";
import { useSettings } from "./settings-store";
import {
  CREDIT_PACKS,
  CUSTOM_MAX,
  CUSTOM_MIN,
  priceOf,
  usd,
  type CreditPack,
} from "./credits-data";

/**
 * THE PURCHASE, ON ITS OWN.
 *
 * It lived inside Terra Balance, which made buying credits something only that
 * page could offer — so the two buttons the rest of the app puts next to a
 * balance ("Add Credits" on the home rail, "Top Up" in the credit popover) had
 * nothing to open and sent you to the page instead. Pressing Top Up and landing
 * on a screen with another Top Up on it is not a link either.
 *
 * Buying is not a place, it is a decision you have already made, so it is a
 * dialog and it lives where any surface can mount it. The account state it
 * writes — the balance, the ledger, the receipt — is above the router now (see
 * App.tsx), which is what makes that possible.
 */

/**
 * BUYING — four packs and a custom amount, behind the Top Up button.
 *
 * It was a panel filling half the page whether or not anyone was buying, which
 * made a page about a balance mostly a shop. It is the same control, moved to
 * where the intent is: you press Top Up because you have decided to, and the
 * amounts are the first thing you see when you have.
 *
 * NO CARD FIELDS HERE. The number a card issues is not something this app
 * stores or even sees: the card is added once through Payment Details, the
 * processor keeps it, and what comes back is a brand and four digits. So this
 * picks an AMOUNT and confirms which card it lands on — and with no card on
 * file it says so and points at the page that fixes it, rather than growing a
 * second, worse way to enter one.
 */
export function TopUpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { card, buyCredits } = useSettings();
  const [picked, setPicked] = useState<string>(CREDIT_PACKS[1].id);
  const [custom, setCustom] = useState("");

  const customCredits = parseInt(custom.replace(/\D/g, ""), 10);
  const customValid =
    Number.isFinite(customCredits) && customCredits >= CUSTOM_MIN && customCredits <= CUSTOM_MAX;
  const usingCustom = picked === "custom";

  const pack = CREDIT_PACKS.find((p) => p.id === picked);
  const credits = usingCustom ? (customValid ? customCredits : 0) : (pack?.credits ?? 0) + (pack?.bonus ?? 0);
  const price = usingCustom ? priceOf(customValid ? customCredits : 0) : (pack?.usd ?? 0);
  const canBuy = !!card && credits > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[34rem] max-w-[calc(100vw-2rem)]" data-ui="top-up">
        <DialogTitle>Top Up Credits</DialogTitle>
        <DialogDescription>
          Credits never expire and don&rsquo;t reset monthly.
        </DialogDescription>

        <div className="mt-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {CREDIT_PACKS.map((p) => (
            <PackTile key={p.id} pack={p} on={picked === p.id} onPick={() => setPicked(p.id)} />
          ))}
        </div>

        {/* Custom is a fifth choice in the same set, not a separate mode — it
            selects like a pack and shows its price the same way. */}
        <button
          type="button"
          aria-pressed={usingCustom}
          data-ui="credit-pack-custom"
          onClick={() => setPicked("custom")}
          className={cn(
            "mt-2.5 flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
            usingCustom
              ? "border-brand bg-brand/10"
              : "border-glass/12 bg-glass/5 hover:border-glass/30"
          )}
        >
          <span className="type-body-strong shrink-0 text-content">Custom</span>
          <input
            aria-label="Custom credit amount"
            data-ui="credit-custom-amount"
            inputMode="numeric"
            value={custom}
            placeholder={`${CUSTOM_MIN.toLocaleString()}–${CUSTOM_MAX.toLocaleString()}`}
            onFocus={() => setPicked("custom")}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
            className="field-well type-numeric min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-content outline-none placeholder:text-content-subtle focus:border-brand/60"
          />
          <span className="type-body shrink-0 text-content-subtle">credits</span>
          <span className="type-body-strong ml-auto shrink-0 tabular-nums text-content">
            {usingCustom && customValid ? usd(priceOf(customCredits)) : "—"}
          </span>
        </button>

        {usingCustom && custom !== "" && !customValid && (
          <p className="type-caption mt-2 text-warning">
            Enter between {CUSTOM_MIN.toLocaleString()} and {CUSTOM_MAX.toLocaleString()} credits.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-glass/10 pt-5">
          <div className="min-w-0">
            <p className="type-body text-content-muted">You'll receive</p>
            <p className="font-display text-lg font-semibold tabular-nums text-content">
              {credits.toLocaleString()} credits
              <span className="type-body ml-2 font-normal text-content-subtle">
                for {usd(price)}
              </span>
            </p>
          </div>
          {card ? (
            <Button
              variant="brand"
              size="md"
              className="ml-auto"
              data-ui="credit-buy"
              disabled={!canBuy}
              onClick={() => {
                buyCredits({
                  credits,
                  usd: price,
                  label: usingCustom
                    ? `${credits.toLocaleString()} credits`
                    : `${labelOf(picked)} pack`,
                });
                onOpenChange(false);
              }}
            >
              <Icon name="payment" size={16} />
              Pay {usd(price)}
            </Button>
          ) : (
            <Button
              variant="brand"
              size="md"
              className="ml-auto"
              onClick={() => {
                onOpenChange(false);
                /* The hash rather than `go`, because this dialog is opened from
                   the home rail and the editor as well as from Settings, and
                   `go` only moves the settings page — from outside it would
                   quietly point a shell that isn't mounted at Payment Details
                   and leave you where you stood. */
                window.location.hash = "#settings/payment";
              }}
            >
              Add a payment method
            </Button>
          )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const labelOf = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * ONE PACK, IN TWO LINES.
 *
 * It used to be five: a name, the credit figure, the word "credits", a bonus
 * line, and a price — a tile tall enough that four of them filled the sheet and
 * pushed the thing you press off the bottom. The name and the price share the
 * first line because they are the choice ("Studio, ninety dollars"), and the
 * amount is the second.
 *
 * THE BONUS IS FOLDED INTO THE FIGURE rather than dropped. "5,000 + 500 free"
 * was two facts on two lines; 5,500 is the one number that answers what you get,
 * and it is the number the receipt and the balance will show anyway.
 */
function PackTile({ pack, on, onPick }: { pack: CreditPack; on: boolean; onPick: () => void }) {
  const total = pack.credits + pack.bonus;
  return (
    <button
      type="button"
      aria-pressed={on}
      data-ui={`credit-pack-${pack.id}`}
      onClick={onPick}
      className={cn(
        "rounded-xl border px-3.5 py-3 text-left transition-colors",
        on ? "border-brand bg-brand/10" : "border-glass/12 bg-glass/5 hover:border-glass/30"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="type-body-strong min-w-0 truncate text-content">
          {labelOf(pack.id)}
        </span>
        {pack.popular && (
          <span className="type-caption-strong shrink-0 rounded bg-brand-soft px-1.5 py-px text-brand">
            Popular
          </span>
        )}
        <span className="type-body-strong ml-auto shrink-0 tabular-nums text-content">
          {usd(pack.usd)}
        </span>
      </div>
      <p className="type-body mt-0.5 tabular-nums text-content-muted">
        {total.toLocaleString()} credits
      </p>
    </button>
  );
}
