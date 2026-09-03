import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Select } from "@/components/ui";
import type { BillingAddress, SavedCard } from "./settings-store";

/**
 * THE CARD, AS A SET OF PARTS — because three screens draw the same one.
 *
 * The checkout's payment step, the Saved Payment Methods sheet and the add/edit
 * form are all asking for one object: a card and the address it authorises
 * against. They were three hand-rolled field sets with three different label
 * casings, three ideas of which fields are required, and one of them silently
 * dropping the billing address on the floor. A person who types an address in
 * checkout and then opens Payment Details should find it there.
 *
 * WHAT IS NOT HERE, STILL, IS THE NUMBER. `CardDraft` carries one only while a
 * form is open; `addCard` reads a brand and four digits off it and throws it
 * away in the same function. Nothing that reaches `SavedCard` has ever held a
 * PAN, which is why every read-back below is built from `last4`.
 */

/* -------------------------------------------------------------- the shape */

export interface CardDraft extends BillingAddress {
  holder: string;
  /** live only while a form is open — never stored. See `addCard`. */
  number: string;
  expiry: string;
  cvv: string;
  /** the "Save as default payment method" box */
  makeDefault: boolean;
}

export const EMPTY_DRAFT: CardDraft = {
  holder: "",
  number: "",
  expiry: "",
  cvv: "",
  address: "",
  apt: "",
  country: "",
  city: "",
  postal: "",
  makeDefault: false,
};

/** Open the editor on a card that already exists. There is no number to load. */
export const draftFrom = (card: SavedCard): CardDraft => ({
  ...card.billing,
  holder: card.holder,
  number: "",
  expiry: card.expires,
  cvv: "",
  makeDefault: !!card.primary,
});

export const billingFrom = (d: CardDraft): BillingAddress => ({
  address: d.address.trim(),
  apt: d.apt.trim(),
  country: d.country,
  city: d.city,
  postal: d.postal.trim(),
});

/**
 * Is the form good enough to submit?
 *
 * `needsNumber` is false when editing: the row above the form already says
 * which card this is, and there is no number on file to re-confirm against.
 */
export function draftComplete(d: CardDraft, needsNumber = true) {
  return (
    d.holder.trim() !== "" &&
    /^\d{2}\/\d{2}$/.test(d.expiry) &&
    (!needsNumber || (d.number.replace(/\D/g, "").length >= 12 && d.cvv.trim().length >= 3)) &&
    d.address.trim() !== "" &&
    d.country !== "" &&
    d.city !== "" &&
    d.postal.trim() !== ""
  );
}

/* ---------------------------------------------------------- reading it back */

/** Space every four digits, the way they are printed on the card. */
export const groupDigits = (v: string) =>
  v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();

/** Keep the slash in MM/YY as it is typed, so nobody has to reach for it. */
export const asExpiry = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/** What a stored card looks like written out: `**** **** **** 3432`. */
export const maskedPan = (last4: string) => `**** **** **** ${last4}`;

/** The row heading — "Saved Visa card". */
export const savedCardName = (card: SavedCard) => `Saved ${card.brand} card`;

/**
 * Is MM/YY behind us?
 *
 * A card that has run out is still on file and still listed — the org has to be
 * able to see WHY its charges are failing — so this only changes how the expiry
 * reads, never whether the row is there.
 */
export function isExpired(expires: string) {
  const m = /^(\d{2})\/(\d{2})$/.exec(expires.trim());
  if (!m) return false;
  const now = new Date();
  const year = 2000 + Number(m[2]);
  const month = Number(m[1]);
  if (month < 1 || month > 12) return false;
  // A card is good through the last day of its printed month.
  return year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
}

/* ------------------------------------------------------------- the marks */

/**
 * The scheme's own mark.
 *
 * These are the exported brand assets, not glyphs redrawn from a screenshot:
 * Visa and Mastercard are trademarks, and an approximation of one is worse than
 * none because it is still recognisably the wrong logo. Visa's file already
 * carries its white tile; the other two are bare marks, so the tile is drawn
 * here. Anything we don't have a file for — Amex, Discover, the `Card` fallback
 * `brandOf` returns — gets the product's own card glyph rather than a blank.
 */
const BRAND_ASSET: Record<string, string> = {
  visa: "/payment/visa.svg",
  mastercard: "/payment/mastercard.svg",
  jcb: "/payment/jcb.svg",
};

/** The marks that arrive already tiled, and so must not be tiled again. */
const SELF_TILED = new Set(["visa"]);

export function CardBrandMark({
  brand,
  className,
}: {
  brand: string;
  className?: string;
}) {
  const key = brand.trim().toLowerCase();
  const src = BRAND_ASSET[key];

  if (!src) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid h-6 w-[34px] shrink-0 place-items-center rounded border border-line/12 bg-surface-raised text-content-muted",
          className
        )}
      >
        <Icon name="payment" size={15} />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid h-6 w-[34px] shrink-0 place-items-center overflow-hidden rounded",
        !SELF_TILED.has(key) && "border border-[#f5f5f5] bg-white",
        className
      )}
    >
      {/* Both axes are set. A bare `<img>` here renders at its intrinsic size,
          which for the JCB mark is nearly 20px tall inside a 24px tile. */}
      <img
        src={src}
        alt=""
        className={cn(
          "block",
          SELF_TILED.has(key) ? "h-full w-full" : "h-[14px] w-auto max-w-[22px]"
        )}
      />
    </span>
  );
}

/* ------------------------------------------------------------- the fields */

export const COUNTRIES = [
  "Singapore",
  "United States",
  "United Kingdom",
  "Australia",
  "Japan",
  "Thailand",
  "Myanmar",
];

/**
 * Cities, per country.
 *
 * The design draws City as a picker rather than a free field, which only works
 * if the list actually follows the country above it — a Country of Japan over a
 * City of "San Francisco" is worse than a text box. The lists are short on
 * purpose: this is a prototype standing in for an address service, and a short
 * honest list reads as one, where a long partial one reads as a bug.
 */
const CITIES: Record<string, string[]> = {
  Singapore: ["Singapore"],
  "United States": ["San Francisco", "New York", "Seattle", "Austin", "Los Angeles"],
  "United Kingdom": ["London", "Manchester", "Edinburgh", "Bristol"],
  Australia: ["Sydney", "Melbourne", "Brisbane", "Perth"],
  Japan: ["Tokyo", "Osaka", "Kyoto", "Fukuoka"],
  Thailand: ["Bangkok", "Chiang Mai", "Phuket"],
  Myanmar: ["Yangon", "Mandalay", "Naypyidaw"],
};

export const citiesIn = (country: string) => CITIES[country] ?? [];

/** One labelled input, with room on the right for a mark or a glyph. */
export function CardField({
  label,
  required,
  value,
  onChange,
  placeholder,
  inputMode,
  autoComplete,
  adornment,
  className,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  autoComplete?: string;
  /** the brand mark or calendar glyph the design hangs inside the well */
  adornment?: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="type-body-strong block text-content-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <span className="field-well mt-1 flex h-10 items-center gap-2.5 rounded-lg border px-3">
        <input
          value={value}
          inputMode={inputMode}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="type-body min-w-0 flex-1 bg-transparent text-content outline-none placeholder:text-content-subtle"
        />
        {adornment && <span className="flex shrink-0 items-center">{adornment}</span>}
      </span>
    </label>
  );
}

/** One labelled picker, at the field height above. */
function CardSelect({
  label,
  required,
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="type-body-strong block text-content-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <Select
        aria-label={label}
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: placeholder },
          ...options.map((o) => ({ value: o, label: o })),
        ]}
        className="mt-1 h-10 w-full"
      />
    </label>
  );
}

/**
 * A checkbox, the square kind.
 *
 * Not `Switch`: a switch is a setting that takes effect the moment you throw
 * it, and this one is a property of the form it sits in — nothing happens until
 * the form is submitted. Drawing it as a switch would promise otherwise.
 */
export function CheckField({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded transition-colors",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-brand/60",
          checked ? "bg-brand text-brand-foreground" : "bg-glass/25"
        )}
      >
        {checked && <Icon name="check" size={12} strokeWidth={3} />}
      </span>
      <span className="type-body text-content-muted">{label}</span>
    </label>
  );
}

/**
 * Card Information + Billing Information — the whole form, once.
 *
 * `wide` is the checkout's arrangement, where the column is the page rather
 * than a modal: the number gets its own line and the three short fields share
 * the next one. In a dialog the same fields pair up two to a row. Same fields,
 * same order, same validation — only the wrapping differs, which is the only
 * thing that should when the container is a different width.
 */
export function CardFields({
  draft,
  onDraft,
  wide,
  /** editing a card on file — there is no number to ask for, or re-confirm */
  editing,
  /** hidden while editing the card that is already the default */
  defaultLocked,
}: {
  draft: CardDraft;
  onDraft: (patch: Partial<CardDraft>) => void;
  wide?: boolean;
  editing?: boolean;
  defaultLocked?: boolean;
}) {
  const number = (
    <CardField
      label="Card Number"
      required
      value={draft.number}
      inputMode="numeric"
      autoComplete="cc-number"
      placeholder="Enter card number"
      onChange={(v) => onDraft({ number: groupDigits(v) })}
      adornment={<CardBrandMark brand={brandGuess(draft.number)} />}
    />
  );
  const holder = (
    <CardField
      label="Card Holder Name"
      required
      value={draft.holder}
      autoComplete="cc-name"
      placeholder="Enter card holder name"
      onChange={(v) => onDraft({ holder: v })}
    />
  );
  const expiry = (
    <CardField
      label="Expiry Date"
      required
      value={draft.expiry}
      inputMode="numeric"
      autoComplete="cc-exp"
      placeholder="MM/YY"
      onChange={(v) => onDraft({ expiry: asExpiry(v) })}
      adornment={<Icon name="calendar" size={16} className="text-content-subtle" />}
    />
  );
  const cvv = (
    <CardField
      label="Security Code/ CVV"
      required
      value={draft.cvv}
      inputMode="numeric"
      autoComplete="cc-csc"
      placeholder="Enter Security code"
      onChange={(v) => onDraft({ cvv: v.replace(/\D/g, "").slice(0, 4) })}
    />
  );

  return (
    <>
      <p className="type-subheading text-content-muted">Card Information</p>

      <div className="mt-4 flex flex-col gap-4">
        {editing ? (
          /* NOTHING TO TYPE A NUMBER INTO, because there is nothing to type it
             against — the card on file is a token. Changing the number means
             adding the new card and removing the old one, which is what
             happens at the processor anyway. */
          <div className={cn("grid gap-4", wide ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            {holder}
            {expiry}
          </div>
        ) : wide ? (
          <>
            {/* The number is the field people mistype, so on a full-width
                column it gets the whole line rather than half of one. */}
            <div className="max-w-[41rem]">{number}</div>
            <div className="grid gap-4 sm:grid-cols-3">
              {holder}
              {expiry}
              {cvv}
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {holder}
              {number}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {expiry}
              {cvv}
            </div>
          </>
        )}

        {!defaultLocked && (
          <CheckField
            checked={draft.makeDefault}
            onChange={(v) => onDraft({ makeDefault: v })}
            label="Save as default payment method"
          />
        )}
      </div>

      <p className="type-subheading mt-6 border-t border-glass/10 pt-6 text-content-muted">
        Billing Information
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <CardField
            label="Billing Address"
            required
            value={draft.address}
            autoComplete="billing street-address"
            placeholder="Enter address"
            onChange={(v) => onDraft({ address: v })}
          />
          <CardField
            label="Apt, Unit, Suite, etc"
            value={draft.apt}
            placeholder="Enter"
            onChange={(v) => onDraft({ apt: v })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <CardSelect
            label="Country"
            required
            value={draft.country}
            placeholder="Select country"
            options={COUNTRIES}
            /* The city list hangs off the country, so changing the country
               clears a city that is no longer in it rather than leaving a pair
               that never existed. */
            onChange={(v) =>
              onDraft({
                country: v,
                city: citiesIn(v).includes(draft.city) ? draft.city : "",
              })
            }
          />
          <CardSelect
            label="City"
            required
            value={draft.city}
            placeholder={draft.country ? "Select city" : "Select country first"}
            options={citiesIn(draft.country)}
            onChange={(v) => onDraft({ city: v })}
          />
          <CardField
            label="Postal Code"
            required
            value={draft.postal}
            autoComplete="billing postal-code"
            placeholder="Enter postal code"
            onChange={(v) => onDraft({ postal: v })}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Which mark to draw beside a number as it is being typed.
 *
 * Deliberately the same first-digit rules the store uses to brand a saved card
 * (`brandOf`), so the logo in the field and the logo on the row that appears
 * after you submit are never two different schemes.
 */
function brandGuess(number: string) {
  const d = number.replace(/\D/g, "");
  if (/^4/.test(d)) return "Visa";
  if (/^5[1-5]/.test(d)) return "Mastercard";
  if (/^35/.test(d)) return "JCB";
  if (/^3[47]/.test(d)) return "Amex";
  if (/^6/.test(d)) return "Discover";
  return "Card";
}
