import { DateFormatEntry, checkFormat, renderExample } from "./formats";
import { scanText } from "./scan";

/**
 * Which formats in the list never get a turn.
 *
 * The list is ordered and the first format to match a range claims it, so a
 * format can sit in the settings doing nothing at all — an exact duplicate of
 * one above it, or one whose dates are wholly contained in what an earlier
 * format already reads. Nothing warns the user, and the fix is invisible:
 * move it up.
 *
 * Pure, and in `detect/` rather than `settings/`, because it is a rule about
 * formats rather than about a settings page. It answers the question by
 * writing a date in the format and asking the real scanner who wins, so the
 * priority rule is never implemented twice.
 */

/**
 * A format an earlier one beats to its dates, and what to do about it.
 *
 * The three cases need three different answers, and two of them are answers
 * the other two would get wrong:
 *
 * - `move`   — the format is never reached, and putting it above the one that
 *              beats it leaves that one still working. The order is simply
 *              wrong.
 * - `remove` — the format is never reached, and putting it above would only
 *              move the problem onto the other one. The two read the same
 *              dates; keeping both achieves nothing.
 * - `shared` — the two split the dates between them, and which of them wins
 *              the ones both can read is what the list order is for. Nothing
 *              is broken and there is nothing to do.
 *
 * `MM/DD/YYYY` with `DD/MM/YYYY` is the case that forces the distinction:
 * whichever sits second still claims every date above the 12th, and moving it
 * up merely hands the problem to the other. Telling the user to act there
 * would be telling them to break something.
 */
export interface Shadow {
  kind: "move" | "remove" | "shared";
  by: string;
}

/**
 * The dates every format is tried against.
 *
 * Fixed, and deliberately not today: `D` and `DD` write the same text on the
 * 17th and different text on the 7th, so a check that used the current date
 * would give a different answer depending on when it ran.
 *
 * Chosen by crossing the axes the token vocabulary actually varies on rather
 * than by sampling: a month is one digit or two, a day is one digit or two,
 * and an ordinal ends in st, nd, rd or th — with the teens taking th where
 * their last digit says otherwise. Everything else writes a fixed width or a
 * name that always matches its own spelling. Six dates cover all of it.
 */
export const SHADOW_DATES: readonly Date[] = [
  new Date(2026, 2, 1), //  1-digit month, 1-digit day, 1st
  new Date(2026, 4, 8), //  1-digit month, 1-digit day, 8th
  new Date(2026, 1, 22), // 1-digit month, 2-digit day, 22nd
  new Date(2026, 10, 3), // 2-digit month, 1-digit day, 3rd
  new Date(2026, 11, 13), // 2-digit month, 2-digit day, 13th — the teen exception
  new Date(2026, 9, 25), //  2-digit month, 2-digit day, 25th
];

/** Keyed by `DateFormatEntry.id`; a format with no entry is doing its job. */
export function shadowedFormats(formats: DateFormatEntry[]): Map<string, Shadow> {
  const shadows = new Map<string, Shadow>();

  for (const entry of formats) {
    const shadow = shadowOf(entry, formats);
    if (shadow) shadows.set(entry.id, shadow);
  }

  return shadows;
}

function shadowOf(entry: DateFormatEntry, formats: DateFormatEntry[]): Shadow | null {
  const beaten = beatenBy(entry, formats);
  if (!beaten) return null;

  const by = beaten.winner.pattern;
  // Still claiming some of its own dates, so the list order is dividing them
  // rather than smothering one. That division is the feature.
  if (beaten.wins > 0) return { kind: "shared", by };

  // Would moving it up help, or merely change who is smothered? Ask by moving
  // it and looking, which is the same trick the whole check is built on.
  const lifted = moveAbove(formats, entry, beaten.winner);
  const rival = beatenBy(beaten.winner, lifted);

  return { kind: rival && rival.wins === 0 ? "remove" : "move", by };
}

interface Beaten {
  /** How many of its own dates the format still claims. */
  wins: number;
  winner: DateFormatEntry;
}

/** Whether an earlier format takes this one's dates, and which one does. */
function beatenBy(entry: DateFormatEntry, formats: DateFormatEntry[]): Beaten | null {
  // An unusable pattern matches nothing anywhere, which is a different problem
  // with its own answer on the row. Saying it is shadowed as well would be
  // true and useless.
  if (checkFormat(entry.pattern)) return null;

  let wins = 0;
  let winner: DateFormatEntry | null = null;

  for (const on of SHADOW_DATES) {
    const text = renderExample(entry.pattern, on);
    const found = scanText(text, formats);
    const mine = found.find((candidate) => candidate.formatId === entry.id);

    if (!mine) continue;
    if (mine.accepted) {
      wins += 1;
      continue;
    }
    // Only losing a contested range counts. A rejection for any other reason
    // is the format's own business and nothing to do with the list order.
    if (mine.reason !== "overlap") continue;

    const taken = found.find(
      (candidate) => candidate.accepted && candidate.from < mine.to && mine.from < candidate.to,
    );
    // The first culprit found is the one named. Where several formats shadow
    // different dates, naming one of them is what makes the advice actionable;
    // listing them all would not.
    if (taken && winner === null) {
      winner = formats.find((format) => format.id === taken.formatId) ?? null;
    }
  }

  return winner ? { wins, winner } : null;
}

/** The list with `entry` lifted to sit directly above `over`. */
function moveAbove(
  formats: DateFormatEntry[],
  entry: DateFormatEntry,
  over: DateFormatEntry,
): DateFormatEntry[] {
  const rest = formats.filter((format) => format.id !== entry.id);
  const at = rest.findIndex((format) => format.id === over.id);
  return [...rest.slice(0, at), entry, ...rest.slice(at)];
}
