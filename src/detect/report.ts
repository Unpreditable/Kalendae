import { EditorState } from "@codemirror/state";
import { Detection, detectDates } from "./detect";
import { KalendaeSettings } from "../settings";

/**
 * Turns a detection pass into something a human can check against what they
 * expected.
 *
 * Rejections are rows too, each with its reason. That is the whole point: a
 * date-shaped string the plugin ignored and a version number it wrongly
 * offered are the same question asked from opposite sides, and neither is
 * answerable from a list that only shows the hits.
 */

export interface ReportRow {
  line: number;
  col: number;
  text: string;
  format: string;
  scope: string;
  verdict: "accepted" | "rejected";
  reason: string;
  /** Obsidian's own syntax-tree node names — see ContextInfo.nodes. */
  nodes: string;
}

export interface Report {
  rows: ReportRow[];
  accepted: number;
  rejected: number;
  /** See DetectionResult.contextComplete — false means the scope column may lie. */
  contextComplete: boolean;
}

export function buildReport(state: EditorState, settings: KalendaeSettings): Report {
  const { detections, contextComplete } = detectDates(state, settings);
  const accepted = detections.filter((detection) => detection.accepted).length;

  return {
    rows: detections.map((detection) => toRow(state, detection)),
    accepted,
    // Every detection is one or the other, so the second count is arithmetic
    // rather than a second walk of the list.
    rejected: detections.length - accepted,
    contextComplete,
  };
}

function toRow(state: EditorState, detection: Detection): ReportRow {
  const line = state.doc.lineAt(detection.from);

  return {
    line: line.number,
    col: detection.from - line.from + 1,
    text: detection.text,
    format: detection.pattern,
    scope: detection.context.scope,
    verdict: detection.accepted ? "accepted" : "rejected",
    reason: detection.reason ?? "",
    nodes: detection.context.nodes.join(" › "),
  };
}
