import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { setIcon } from "obsidian";
import { detectIn } from "../detect/detect";
import { HoverIcon, KalendaeSettings } from "../settings";
import { t } from "../i18n/i18n";
import { hotDate } from "./hover-state";

/**
 * What the editor draws over a recognised date: a mark on the text and an icon
 * beside it, both carrying the same id so hovering either one lights both.
 *
 * Marks and a zero-width widget, never a widget that occupies space. The icon
 * is absolutely positioned inside an anchor of no width, so the note reads
 * exactly as it did before the plugin was installed until a pointer arrives.
 *
 * A date with a Tasks emoji in front of it is drawn the other way round: no
 * icon at all, and the mark widened to take the emoji in, so one outline covers
 * the pair and the glyph already in the note is the button. Nothing is added to
 * that line whatsoever — which is the least-interference goal reached rather
 * than approximated.
 */

/** What a click on the icon asks for. */
export interface DateTarget {
  from: number;
  to: number;
  text: string;
  pattern: string;
}

class IconWidget extends WidgetType {
  constructor(
    private readonly target: DateTarget,
    private readonly placement: HoverIcon,
    private readonly hot: boolean,
    private readonly onActivate: (target: DateTarget, view: EditorView) => void,
  ) {
    super();
  }

  eq(other: IconWidget): boolean {
    return (
      other.target.from === this.target.from &&
      other.target.to === this.target.to &&
      other.target.text === this.target.text &&
      other.placement === this.placement &&
      other.hot === this.hot
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const anchor = createSpan({
      cls: [
        "kalendae-icon-anchor",
        `kalendae-icon-${this.placement}`,
        ...(this.hot ? ["kalendae-hot"] : []),
      ].join(" "),
      attr: { "data-kalendae": String(this.target.from) },
    });

    const icon = anchor.createSpan({ cls: "kalendae-icon" });
    setIcon(icon, "calendar");
    // The command's own name, rather than a string of its own: both say the
    // same thing, and one of them is already translated.
    icon.setAttribute("aria-label", t("commands.pickDate"));

    // mousedown, not click: the editor places the caret on mousedown, so by the
    // time a click arrives the caret has already jumped into the date.
    icon.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onActivate(this.target, view);
    });

    return anchor;
  }

  /** False, or CodeMirror swallows the events before the icon sees them. */
  ignoreEvent(): boolean {
    return false;
  }
}

export function dateDecorations(
  getSettings: () => KalendaeSettings,
  onActivate: (target: DateTarget, view: EditorView) => void,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, getSettings(), onActivate);
      }

      update(update: ViewUpdate): void {
        const hotMoved = update.state.field(hotDate) !== update.startState.field(hotDate);
        if (update.docChanged || update.viewportChanged || hotMoved) {
          this.decorations = build(update.view, getSettings(), onActivate);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

function build(
  view: EditorView,
  settings: KalendaeSettings,
  onActivate: (target: DateTarget, view: EditorView) => void,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const hot = view.state.field(hotDate);
  // Marks are drawn either way: double-click needs them to hit-test against,
  // and the outline hangs off them. Only the icon answers to its own setting.
  const iconWanted = settings.hoverIcon !== "off";
  let claimed = -1;

  for (const range of view.visibleRanges) {
    for (const detection of detectIn(view.state, settings, range.from, range.to)) {
      // Visible ranges each widen to whole lines, so two of them can cover the
      // same line and offer the same date twice.
      if (!detection.accepted || detection.from < claimed) continue;
      claimed = detection.to;

      const id = String(detection.from);
      // A Tasks emoji takes the icon's place for its own date rather than
      // standing beside it: two buttons on one date, one of them drawn over the
      // emoji that is the other, is not something to offer.
      const marker = settings.taskEmoji ? detection.markerFrom : undefined;
      const withIcon = iconWanted && marker === undefined;

      const classes = ["kalendae-date"];
      // The place class is what reaches the outline out to take the icon in, so
      // it belongs to a date that has one. A marked date is snug on both sides.
      if (withIcon) classes.push(`kalendae-place-${settings.hoverIcon}`);
      if (settings.showHoverFrame) classes.push("kalendae-framed");
      if (detection.from === hot) classes.push("kalendae-hot");

      // Which end the icon hangs off. CSS can place it beside its own anchor
      // but knows nothing of the date's width, so an icon that belongs before
      // the date needs an anchor that sits before the date.
      const atStart = settings.hoverIcon === "left";
      const icon = () =>
        Decoration.widget({
          side: atStart ? -1 : 1,
          widget: new IconWidget(
            {
              from: detection.from,
              to: detection.to,
              text: detection.text,
              pattern: detection.pattern,
            },
            settings.hoverIcon,
            detection.from === hot,
            onActivate,
          ),
        });

      if (withIcon && atStart) builder.add(detection.from, detection.from, icon());

      builder.add(
        marker ?? detection.from,
        detection.to,
        Decoration.mark({ class: classes.join(" "), attributes: { "data-kalendae": id } }),
      );

      // A box of its own for the emoji, so the pointer and the chip stop where
      // the date begins: a pointer cursor over the date would promise a click
      // that only moves the caret. It reaches all the way to the date rather
      // than stopping after the glyph, though, so the space between them belongs
      // to the target — a gap belonging to neither half is what made the hover
      // affordance flicker.
      //
      // The mark above already covers this range, which the builder cannot take
      // in order and puts in a layer of its own. Which of the two CodeMirror
      // then nests inside the other is its business: the class below is what
      // lights this one, rather than a descendant selector off the other.
      if (marker !== undefined) {
        const lit = detection.from === hot ? " kalendae-hot" : "";
        builder.add(marker, detection.from, Decoration.mark({ class: `kalendae-marker${lit}` }));
      }

      if (withIcon && !atStart) builder.add(detection.to, detection.to, icon());
    }
  }

  return builder.finish();
}
