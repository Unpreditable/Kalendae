import { Plugin } from "obsidian";
import { KalendaeSettings } from "../settings";

/**
 * What the settings surfaces need of the plugin.
 *
 * Structural rather than an import of KalendaePlugin, so the settings tab and
 * its pages don't form an import cycle with `main.ts`.
 */
export interface KalendaeHost extends Plugin {
  settings: KalendaeSettings;
  saveSettings(): Promise<void>;
}
