/**
 * CREDITS — the one currency, and what it has been spent on.
 * ------------------------------------------------------------------
 * Terra used to meter two things at once: a monthly Img/video QUOTA that came
 * with the plan and reset, and a credit balance you topped up. Two meters for
 * one question ("can I afford this run?") meant every screen that wanted to
 * answer it had to answer twice, and a run could be refused for the reason the
 * other number said was fine.
 *
 * So credits are it. A dataset run is priced in credits (see `creditsFor` in
 * the editor's work-order module), credits are bought outright, and the plan
 * decides what the org can DO rather than how much of it. Nothing here resets
 * on the first of the month.
 */

/** What a credit costs, in USD. Packs discount off this. */
export const CREDIT_UNIT_USD = 0.02;

export interface CreditPack {
  id: string;
  credits: number;
  usd: number;
  /** credits given on top of what was paid for — 0 on the smallest pack */
  bonus: number;
  popular?: boolean;
}

/**
 * The shelf. Priced so the bigger packs are visibly better value — the bonus is
 * stated as its own figure rather than hidden in a per-credit rate nobody
 * divides out.
 */
export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", credits: 1_000, usd: 20, bonus: 0 },
  { id: "studio", credits: 5_000, usd: 90, bonus: 500, popular: true },
  { id: "team", credits: 15_000, usd: 250, bonus: 2_500 },
  { id: "scale", credits: 50_000, usd: 750, bonus: 10_000 },
];

/** What an arbitrary number of credits costs — the custom field's price. */
export const priceOf = (credits: number) =>
  Math.round(Math.max(0, credits) * CREDIT_UNIT_USD * 100) / 100;

export const CUSTOM_MIN = 500;
export const CUSTOM_MAX = 200_000;

export const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

/* ------------------------------------------------------------- the ledger */

export type CreditEntryKind = "purchase" | "spend";

export interface CreditEntry {
  id: string;
  /** ms since epoch — the column formats it, the sort compares it */
  at: number;
  kind: CreditEntryKind;
  /** what it was: a pack name, or the project a run was dispatched from */
  detail: string;
  /** signed: a purchase adds, a run subtracts */
  credits: number;
  /** what was charged to the card, purchases only */
  usd?: number;
  /** the card it went to, purchases only — brand and last four, never a PAN */
  method?: string;
}

const DAY = 86_400_000;

/**
 * Seeded history, dated backwards from now rather than from a fixed day so it
 * never reads as stale. A prototype that opens on an empty ledger can't show
 * what a row looks like until someone has spent money.
 */
export function seedLedger(now: number): CreditEntry[] {
  return [
    { id: "TX-1041", at: now - 2 * DAY, kind: "spend", detail: "Traffic Scene · 144 frames", credits: -32 },
    { id: "TX-1040", at: now - 3 * DAY, kind: "spend", detail: "Sand Dune Project · 1,200 frames", credits: -157 },
    { id: "TX-1039", at: now - 6 * DAY, kind: "purchase", detail: "Studio pack", credits: 5_500, usd: 90, method: "Visa ···· 4242" },
    { id: "TX-1038", at: now - 11 * DAY, kind: "spend", detail: "Alpine Ridge · 320 frames", credits: -47 },
    { id: "TX-1037", at: now - 19 * DAY, kind: "spend", detail: "Harbor Yard · 1,200 frames", credits: -157 },
    { id: "TX-1036", at: now - 27 * DAY, kind: "purchase", detail: "Starter pack", credits: 1_000, usd: 20, method: "Visa ···· 4242" },
    /* A few months of top-ups behind the recent activity. Credit History lists
       purchases only — spends are the Usage History tab's subject — and two
       rows cannot show what a year of buying credits looks like. */
    { id: "TX-1035", at: now - 34 * DAY, kind: "purchase", detail: "Starter pack", credits: 1_000, usd: 20, method: "Visa ···· 4242" },
    { id: "TX-1029", at: now - 62 * DAY, kind: "purchase", detail: "Studio pack", credits: 5_500, usd: 90, method: "Visa ···· 4242" },
    { id: "TX-1021", at: now - 93 * DAY, kind: "purchase", detail: "Starter pack", credits: 1_000, usd: 20, method: "Visa ···· 4242" },
    { id: "TX-1014", at: now - 124 * DAY, kind: "purchase", detail: "Team pack", credits: 17_500, usd: 250, method: "Visa ···· 4242" },
    { id: "TX-1008", at: now - 155 * DAY, kind: "purchase", detail: "Starter pack", credits: 1_000, usd: 20, method: "Visa ···· 4242" },
  ];
}

/* -------------------------------------------------------------- the usage */

/** One day's output. Images are a count; video is measured in seconds. */
/** What one person generated on one day. */
export interface UsageByMember {
  memberId: string;
  name: string;
  images: number;
  videoSeconds: number;
  credits: number;
}

export interface UsageDay {
  /** ms since epoch, midnight */
  at: number;
  images: number;
  videoSeconds: number;
  credits: number;
  /**
   * The same day split by who spent it. A team's credit balance is drained by
   * PEOPLE, and "we used 2,867 credits" doesn't tell an admin which of those
   * people to go and talk to — the aggregate is the question this page used to
   * answer and the least useful one it could.
   */
  byMember: UsageByMember[];
}

/**
 * Who the usage is attributed to, and roughly what share each takes.
 *
 * Weights are fixed rather than even: usage on a real team is lopsided, and an
 * even split would make the per-member view look like a rounding artefact of
 * the total instead of a fact worth reading.
 */
const USAGE_SHARE: { memberId: string; name: string; weight: number }[] = [
  { memberId: "m1", name: "GG TOE", weight: 0.46 },
  { memberId: "m2", name: "Henry William", weight: 0.31 },
  { memberId: "m3", name: "Liam Johnson", weight: 0.14 },
  { memberId: "m4", name: "Emma Brown", weight: 0.09 },
];

/**
 * Split a day across the team so the parts always sum to the whole.
 *
 * The last member takes the remainder rather than its own rounded share —
 * rounding four percentages independently leaves the column off the total by a
 * credit or two, and a breakdown that doesn't add up is the fastest way to make
 * a billing page look wrong.
 */
function splitDay(
  index: number,
  images: number,
  videoSeconds: number,
  credits: number
): UsageByMember[] {
  // A per-day wobble, so one person's share isn't a flat percentage forever.
  const shares = USAGE_SHARE.map((m, i) => {
    const wobble = 0.8 + ((Math.sin(index * 0.9 + i * 2.3) + 1) / 2) * 0.4;
    return { ...m, w: m.weight * wobble };
  });
  const sum = shares.reduce((a, b) => a + b.w, 0);

  let usedI = 0;
  let usedV = 0;
  let usedC = 0;
  return shares.map((m, i) => {
    const last = i === shares.length - 1;
    const f = m.w / sum;
    const mi = last ? images - usedI : Math.round(images * f);
    const mv = last ? videoSeconds - usedV : Math.round(videoSeconds * f);
    const mc = last ? credits - usedC : Math.round(credits * f);
    usedI += mi;
    usedV += mv;
    usedC += mc;
    return {
      memberId: m.memberId,
      name: m.name,
      images: Math.max(0, mi),
      videoSeconds: Math.max(0, mv),
      credits: Math.max(0, mc),
    };
  });
}

export type UsageRange = "7d" | "30d" | "12m";

export const RANGE_LABEL: Record<UsageRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "12m": "Last 12 months",
};

/**
 * A year of daily output, generated from a fixed formula rather than random
 * numbers.
 *
 * DETERMINISTIC ON PURPOSE. `Math.random()` would redraw every chart on every
 * re-render — the bars would twitch under the cursor and two screenshots of the
 * same range would disagree. This is a stand-in for the usage endpoint, and the
 * real one will also return the same series twice.
 */
export function seedUsage(now: number): UsageDay[] {
  const midnight = Math.floor(now / DAY) * DAY;
  return Array.from({ length: 365 }, (_, i) => {
    const at = midnight - (364 - i) * DAY;
    const day = new Date(at).getDay();
    // Weekends are quiet, and output trends up across the year.
    const weekend = day === 0 || day === 6;
    const trend = 0.45 + (i / 364) * 0.9;
    const wobble = 0.75 + ((Math.sin(i * 1.7) + 1) / 2) * 0.5;
    const scale = trend * wobble * (weekend ? 0.25 : 1);
    const images = Math.round(420 * scale);
    const videoSeconds = Math.round(95 * scale);
    const credits = Math.round(images * 0.125 + videoSeconds * 0.4);
    return { at, images, videoSeconds, credits, byMember: splitDay(i, images, videoSeconds, credits) };
  });
}

/** The slice a range asks for, oldest first. */
export function daysIn(all: UsageDay[], range: UsageRange): UsageDay[] {
  if (range === "7d") return all.slice(-7);
  if (range === "30d") return all.slice(-30);
  return all;
}

export interface UsageBucket {
  key: string;
  label: string;
  images: number;
  videoSeconds: number;
  credits: number;
  /** the same split, summed over whatever the bucket covers */
  byMember: UsageByMember[];
}

/** Sum the per-member split across a set of days, biggest spender first. */
export function byMemberTotals(days: UsageDay[]): UsageByMember[] {
  const acc = new Map<string, UsageByMember>();
  days.forEach((d) =>
    d.byMember.forEach((m) => {
      const found = acc.get(m.memberId) ?? {
        memberId: m.memberId,
        name: m.name,
        images: 0,
        videoSeconds: 0,
        credits: 0,
      };
      found.images += m.images;
      found.videoSeconds += m.videoSeconds;
      found.credits += m.credits;
      acc.set(m.memberId, found);
    })
  );
  return [...acc.values()].sort((a, b) => b.credits - a.credits);
}

/**
 * Days for the short ranges, calendar months for the year.
 *
 * A YEAR OF DAILY BARS IS NOT A CHART, it is 365 hairlines — nothing is
 * readable at that density in a panel this wide, and the eye can't find a month
 * boundary in it. Bucketing is what makes the long range answer a different,
 * coarser question rather than the same one badly.
 */
export function bucket(days: UsageDay[], range: UsageRange): UsageBucket[] {
  if (range !== "12m") {
    return days.map((d) => ({
      key: String(d.at),
      label: new Date(d.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      images: d.images,
      videoSeconds: d.videoSeconds,
      credits: d.credits,
      byMember: d.byMember,
    }));
  }
  const months = new Map<string, UsageBucket>();
  days.forEach((d) => {
    const date = new Date(d.at);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const found = months.get(key) ?? {
      key,
      /* WITH THE YEAR. Twelve months back from August ends on August, so a
         bare "Aug" labelled both ends of the axis and the reader had no way to
         tell which one they were looking at. */
      label: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      images: 0,
      videoSeconds: 0,
      credits: 0,
      byMember: [],
    };
    found.images += d.images;
    found.videoSeconds += d.videoSeconds;
    found.credits += d.credits;
    months.set(key, found);
  });
  // Roll the member split up per month from the days that fed it.
  const out = [...months.values()];
  out.forEach((b) => {
    b.byMember = byMemberTotals(
      days.filter((d) => {
        const date = new Date(d.at);
        return `${date.getFullYear()}-${date.getMonth()}` === b.key;
      })
    );
  });
  return out;
}

export const totalsOf = (days: UsageDay[]) =>
  days.reduce(
    (acc, d) => ({
      images: acc.images + d.images,
      videoSeconds: acc.videoSeconds + d.videoSeconds,
      credits: acc.credits + d.credits,
    }),
    { images: 0, videoSeconds: 0, credits: 0 }
  );

/** "2h 14m" / "9m 30s" — video output, in the coarsest unit that stays useful. */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
