import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { DrawerHeader, FactField, ReceiptLine, SideDrawer } from "./settings-parts";
import { useSettings } from "./settings-store";
import { money } from "./subscription-data";
import {
  INVOICE_STATUS,
  INVOICE_TYPE,
  invoiceDate,
  invoiceTotal,
  isRenewal,
  totalLabel,
  type Invoice,
  type InvoiceStatus,
} from "./invoice-data";

/**
 * ONE INVOICE, IN FULL — the sheet behind every row of the history.
 *
 * ONE COMPONENT FOR SEVEN SHEETS. A paid renewal, an annual one, a failed one,
 * an upcoming one, a credit top-up and the two data purchases are the same
 * object read at different moments: the same header, the same five facts, a body
 * of headed lines, and a total. What actually differs is three things — whether
 * the date is when it was TAKEN or when it FALLS DUE, whether there is a total
 * or only a projection of one, and what you can do about it — so those are the
 * three places this branches and nowhere else. Seven drawers would have been
 * seven paddings and seven chances for the subtotal to sit at a different
 * indent.
 *
 * A DRAWER, NOT A DIALOG: you arrive here from a row in a table you are working
 * down, and the next thing you want is usually the row under it. See SideDrawer.
 */

/** How each state reads: the chip, and the tint the header glyph takes. */
const STATUS_TONE: Record<InvoiceStatus, "success" | "danger" | "neutral"> = {
  paid: "success",
  failed: "danger",
  upcoming: "neutral",
};

export function InvoiceDrawer({
  invoice,
  onClose,
}: {
  invoice: Invoice | null;
  onClose: () => void;
}) {
  const { go, notify } = useSettings();
  if (!invoice) return null;

  const tone = STATUS_TONE[invoice.status];
  /* A purchase is dated by the day the money moved; a renewal by the day it is
     owed — which for a paid one is the same day, and for an upcoming one is the
     only date it has. */
  const dateLabel = invoice.status === "paid" && !isRenewal(invoice.kind) ? "Paid Date" : "Due Date";

  return (
    <SideDrawer label={`${INVOICE_TYPE[invoice.kind]} — ${invoiceDate(invoice.at)}`} onClose={onClose}
      footer={<InvoiceActions invoice={invoice} onClose={onClose} go={go} notify={notify} />}
    >
      <DrawerHeader
        icon="file"
        tone={tone === "neutral" ? "brand" : tone}
        title={INVOICE_TYPE[invoice.kind]}
        subtitle={`Invoice Date: ${invoiceDate(invoice.at)}`}
        badge={<StatusChip status={invoice.status} />}
        onClose={onClose}
      />

      <div className="flex flex-col gap-6 p-6">
        <section>
          <h3 className="type-body-lg-strong text-content">Invoice Details</h3>
          {/* Two columns, because these are five short facts and a single
              column of them turns a header into a page. */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            <FactField
              label="Invoice No"
              /* An upcoming invoice has no document yet, and inventing a
                 reference for one nobody has been sent is worse than a dash. */
              value={invoice.number ?? "—"}
            />
            <FactField label={dateLabel} value={invoiceDate(invoice.at)} />
            <FactField
              label="Status"
              value={
                <span className={cn(tone === "danger" && "text-danger")}>
                  {INVOICE_STATUS[invoice.status]}
                </span>
              }
            />
            <FactField label="Name" value={invoice.account} />
            <FactField
              label="Payment Method"
              value={invoice.method ?? "No card on file"}
            />
          </div>
        </section>

        <section className="border-t border-glass/10 pt-6">
          <h3 className="type-body-lg-strong text-content">{invoice.bodyTitle}</h3>

          {/* The body, group by group. A group's heading is optional because the
              first one is already titled by the section above it — "Renewing
              Seats / Renewing Seats" is the shape a per-kind drawer produces. */}
          {invoice.body.map((group, i) => (
            <div key={group.heading ?? i} className="mt-4 flex flex-col gap-4">
              {group.heading && (
                <p className="type-body-lg-strong text-content">{group.heading}</p>
              )}
              {group.rows.map((row) => (
                <ReceiptLine
                  key={row.label}
                  label={row.label}
                  note={row.note}
                  value={row.value}
                  muted={row.muted}
                  rule
                />
              ))}
            </div>
          ))}

          <InvoiceTotals invoice={invoice} />
        </section>
      </div>
    </SideDrawer>
  );
}

/**
 * THE FOOT OF THE SHEET.
 *
 * An upcoming invoice shows a PROJECTION and nothing else: the tax is taken at
 * the moment of the charge, so quoting a total for a charge that hasn't happened
 * would be stating a figure the charge might not match.
 */
function InvoiceTotals({ invoice }: { invoice: Invoice }) {
  if (invoice.status === "upcoming") {
    return (
      <div className="mt-4 border-t border-glass/10 pt-4">
        <ReceiptLine label="Projected subtotal" value={money(invoice.subtotal)} strong />
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-glass/10 pt-4">
      <ReceiptLine label="Subtotal" value={money(invoice.subtotal)} />
      <ReceiptLine
        label="Tax"
        note={`${(invoice.taxRate * 100).toFixed(1)}%`}
        value={money(invoice.tax)}
      />
      <ReceiptLine
        label={totalLabel(invoice.kind)}
        value={money(invoiceTotal(invoice))}
        strong
      />
    </div>
  );
}

/**
 * WHAT YOU CAN DO ABOUT IT, which is the one thing the status really decides.
 *
 * Paid: take the document. Failed: the two ways out of a declined charge —
 * try the same card again, or go and fix the card. Upcoming: nothing, and
 * saying so with an empty footer is better than a disabled Download that
 * implies a document exists.
 */
function InvoiceActions({
  invoice,
  onClose,
  go,
  notify,
}: {
  invoice: Invoice;
  onClose: () => void;
  go: (p: "payment") => void;
  notify: (title: string, body?: string) => void;
}) {
  if (invoice.status === "upcoming") return null;

  if (invoice.status === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <p className="type-body text-danger">
          Your invoice could not be processed. Please update your payment method or try
          again.
        </p>
        <Button
          variant="outline"
          size="lg"
          data-ui="invoice-retry"
          className="w-full !border-danger !text-danger hover:!brightness-110"
          onClick={() => {
            onClose();
            notify(
              "Payment retried",
              `We're charging ${invoice.method ?? "your card"} ${money(invoiceTotal(invoice))} again — the invoice updates once the bank answers.`
            );
          }}
        >
          Retry Payment
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          data-ui="invoice-fix-card"
          onClick={() => {
            onClose();
            go("payment");
          }}
        >
          Update Payment Method
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full"
      data-ui="invoice-download"
      onClick={() =>
        notify(
          "Invoice downloading",
          `${INVOICE_TYPE[invoice.kind]} ${invoice.number} · ${money(invoiceTotal(invoice))}`
        )
      }
    >
      <Icon name="file" size={17} />
      Download Invoice
    </Button>
  );
}

/**
 * The state, as a bordered pill.
 *
 * OUTLINED rather than filled, unlike the `Chip` the roster uses: these sit
 * beside a title and inside table cells at the same time, and a filled chip in a
 * cell reads as a button you can press. The border carries the colour and the
 * cell stays a cell.
 */
export function StatusChip({ status }: { status: InvoiceStatus }) {
  const tones: Record<InvoiceStatus, string> = {
    paid: "border-success/60 text-success",
    failed: "border-danger/60 text-danger",
    /* Nothing has happened yet, so it takes no colour — a state that is merely
       ahead of you should not compete with one that needs attention. */
    upcoming: "border-line/25 text-content-muted",
  };
  return (
    <span
      className={cn(
        "type-caption-strong inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5",
        tones[status]
      )}
    >
      {INVOICE_STATUS[status]}
    </span>
  );
}
