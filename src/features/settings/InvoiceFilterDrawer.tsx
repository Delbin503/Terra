import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { CheckField } from "./card-parts";
import { DrawerHeader, SideDrawer } from "./settings-parts";
import {
  NO_FILTER,
  STATUS_FILTERS,
  TYPE_FILTERS,
  filterCount,
  type InvoiceFilter,
  type InvoiceStatus,
  type TypeFilter,
} from "./invoice-data";

/**
 * THE FILTER, AS A DRAFT.
 *
 * It edits a COPY and only hands it back when Apply is pressed. The alternative
 * — writing straight through to the table — sounds more responsive and is worse:
 * the table is behind the drawer, so every tick redraws a list you cannot see,
 * and ticking four boxes on the way to the one you wanted would empty it three
 * times on the journey. Reset clears the draft rather than the table, for the
 * same reason: you can change your mind and close without having changed
 * anything.
 *
 * "ALL" IS NOT A VALUE. It is the state where nothing in that group is ticked,
 * so it clears the group rather than joining it — an `all` checkbox stored
 * alongside the others is a flag that can disagree with them.
 */
export function InvoiceFilterDrawer({
  filter,
  onApply,
  onClose,
}: {
  filter: InvoiceFilter;
  onApply: (next: InvoiceFilter) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<InvoiceFilter>(filter);

  /* Reopening the drawer shows what is actually applied, not what you were
     part-way through choosing when you dismissed it last time. */
  useEffect(() => setDraft(filter), [filter]);

  const toggleStatus = (id: InvoiceStatus) =>
    setDraft((d) => ({
      ...d,
      statuses: d.statuses.includes(id)
        ? d.statuses.filter((s) => s !== id)
        : [...d.statuses, id],
    }));

  const toggleType = (id: TypeFilter) =>
    setDraft((d) => ({
      ...d,
      types: d.types.includes(id) ? d.types.filter((t) => t !== id) : [...d.types, id],
    }));

  return (
    <SideDrawer
      label="Filter invoices"
      width="26rem"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="lg"
            data-ui="invoice-filter-reset"
            onClick={() => setDraft(NO_FILTER)}
          >
            Reset
          </Button>
          <Button
            variant="brand"
            size="lg"
            data-ui="invoice-filter-apply"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply Filter
          </Button>
        </div>
      }
    >
      <DrawerHeader
        icon="filter"
        title="Filter"
        subtitle={`Filter selected: ${filterCount(draft)}`}
        onClose={onClose}
      />

      <div className="flex flex-col gap-6 p-6">
        <Group title="Status">
          <CheckField
            checked={draft.statuses.length === 0}
            onChange={() => setDraft((d) => ({ ...d, statuses: [] }))}
            label="All"
          />
          {STATUS_FILTERS.map((s) => (
            <CheckField
              key={s.id}
              checked={draft.statuses.includes(s.id)}
              onChange={() => toggleStatus(s.id)}
              label={s.label}
            />
          ))}
        </Group>

        <Group title="Invoice Type">
          <CheckField
            checked={draft.types.length === 0}
            onChange={() => setDraft((d) => ({ ...d, types: [] }))}
            label="All"
          />
          {TYPE_FILTERS.map((t) => (
            <CheckField
              key={t.id}
              checked={draft.types.includes(t.id)}
              onChange={() => toggleType(t.id)}
              label={t.label}
            />
          ))}
        </Group>
      </div>
    </SideDrawer>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="type-body-strong text-content">{title}</legend>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}
