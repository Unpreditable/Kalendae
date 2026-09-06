import { Notice, Plugin } from "obsidian";
import { datePickerExtension } from "./editor/DatePickerExtension";
import { DEFAULT_SETTINGS, KalendaeSettings } from "./settings";
import { KalendaeSettingTab } from "./settings-tab";
import { t } from "./i18n/i18n";

export default class KalendaePlugin extends Plugin {
  // The settings tab's inherited setControlValue mutates and persists this
  // object directly, so there is no saveSettings() to call from here.
  settings: KalendaeSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new KalendaeSettingTab(this.app, this));
    this.registerEditorExtension(datePickerExtension);

    this.addCommand({
      id: "pick-date",
      name: t("commands.pickDate"),
      editorCallback: () => {
        new Notice(t("notices.notImplemented"));
      },
    });
  }

  async loadSettings(): Promise<void> {
    // `unknown` rather than the implicit `any` loadData() returns — data.json
    // is whatever a previous version of this plugin wrote, not a trusted shape.
    const stored: unknown = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
  }
}
