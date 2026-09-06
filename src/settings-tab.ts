import { PluginSettingTab, SettingDefinitionItem } from "obsidian";
import { KalendaeSettings, DEFAULT_SETTINGS, TRIGGER_MODES } from "./settings";
import { t } from "./i18n/i18n";

/**
 * minAppVersion is 1.13.0, so this implements getSettingDefinitions() only.
 * Obsidian never calls display() for a tab that returns definitions, and there
 * is no older version to fall back for — which is the whole reason the floor
 * is 1.13.
 *
 * Declaring `control` rather than rendering by hand means the inherited
 * getControlValue/setControlValue read and persist `plugin.settings[key]`, so
 * there is no save wiring here to forget. Typing the definitions by
 * `keyof KalendaeSettings` makes a mistyped key a compile error.
 */
export class KalendaeSettingTab extends PluginSettingTab {
  getSettingDefinitions(): SettingDefinitionItem<keyof KalendaeSettings>[] {
    return [
      {
        name: t("settings.trigger.name"),
        desc: t("settings.trigger.description"),
        control: {
          type: "dropdown",
          key: "trigger",
          defaultValue: DEFAULT_SETTINGS.trigger,
          options: Object.fromEntries(
            TRIGGER_MODES.map((mode) => [mode, t(`settings.trigger.options.${mode}`)]),
          ),
        },
      },
    ];
  }
}
