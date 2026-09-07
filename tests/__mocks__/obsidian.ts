export function getLanguage(): string { return "en"; }

export class Notice {
  constructor(public message: string) {}
}

export class TFile {
  constructor(
    public path: string,
    public extension: string = "md",
    public basename: string = path
  ) {}
}

export class Plugin {}

export class ItemView {
  contentEl = document.createElement("div");
}

export class Menu {
  items: Array<{ title: string; cb: () => void }> = [];
  addItem(cb: (item: any) => void) {
    const item = {
      title: "",
      setTitle(t: string) { this.title = t; return this; },
      setIcon() { return this; },
      onClick(cb: () => void) { return this; },
    };
    cb(item);
    return this;
  }
  addSeparator() { return this; }
  showAtMouseEvent() {}
}

export class App {}
export class WorkspaceLeaf {}

export class PluginSettingTab {
  constructor(public app: App, public plugin: Plugin) {}
}

export class Setting {
  constructor(public containerEl: HTMLElement) {}
  setName(n: string) { return this; }
  setDesc(d: string) { return this; }
  setHeading() { return this; }
  addText(cb: (t: any) => void) {
    cb({
      setValue() { return this; },
      onChange() { return this; },
      setPlaceholder() { return this; },
      inputEl: document.createElement("input"),
    });
    return this;
  }
  addTextArea(cb: (t: any) => void) {
    cb({
      setValue() { return this; },
      onChange() { return this; },
      setPlaceholder() { return this; },
      inputEl: Object.assign(document.createElement("textarea"), { rows: 4 }),
    });
    return this;
  }
  addToggle(cb: (t: any) => void) {
    cb({ setValue() { return this; }, onChange() { return this; } });
    return this;
  }
  addDropdown(cb: (t: any) => void) {
    cb({
      addOption() { return this; },
      setValue() { return this; },
      onChange() { return this; },
    });
    return this;
  }
  addButton(cb: (t: any) => void) {
    cb({
      setButtonText() { return this; },
      setWarning() { return this; },
      onClick() { return this; },
    });
    return this;
  }
}

// The real moment, not a stub. Obsidian re-exports moment at runtime, and the
// scanner leans on its strict parser as the final say on whether a candidate
// is a real calendar date — mocking that away would mock away the thing under
// test. Pinned to the same version the obsidian package pulls in.
export { default as moment } from "moment";
