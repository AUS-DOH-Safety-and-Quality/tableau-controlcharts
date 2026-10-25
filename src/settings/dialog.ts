import { frontendChart } from "powerbi-visuals-core/frontends";
import type { SettingDefinition } from "powerbi-visuals-core/settings";
import { at } from "powerbi-visuals-core/util";
import { control, element, type Control, type Setting } from "./controls";
import type { StoredSettings } from "./store";

/** One setting's row, carrying its current value */
type Row = {
  readonly card: string;
  readonly name: string;
  readonly definition: SettingDefinition;
  readonly element: HTMLElement;
  readonly control: Control;
  readonly searchText: string;
  value: Setting;
};

/** One card's tab button, its hit count and its panel */
type Tab = {
  readonly card: string;
  readonly button: HTMLButtonElement;
  readonly count: HTMLElement;
  readonly panel: HTMLElement;
};

export type SettingsDialogHandlers = {
  /** Called with the non-default settings after each change */
  onChange(settings: StoredSettings): void;
  onOk(settings: StoredSettings): void;
  onCancel(): void;
};

/** A stored value counts only with the setting's type; anything else (e.g. from an older model) shows the default */
function storedSetting(value: unknown, fallback: Setting): Setting {
  if ((typeof value === "string" || typeof value === "number" || typeof value === "boolean") && (fallback === undefined || typeof value === typeof fallback)) {
    return value;
  }
  return fallback;
}

/** Group headings hide when every setting under them is hidden */
function hideEmptyHeadings(panel: HTMLElement): void {
  const children = panel.children;
  let heading: HTMLElement | undefined;
  let any = false;
  for (let j = 0; j <= children.length; j++) {
    const child = children[j] as HTMLElement | undefined;
    if (child === undefined || child.tagName === "H2") {
      if (heading !== undefined) {
        heading.hidden = !any;
      }
      heading = child;
      any = false;
    } else {
      any ||= child.hidden === false;
    }
  }
}

export function renderSettingsDialog(chartType: string, root: HTMLElement, stored: StoredSettings, handlers: SettingsDialogHandlers): void {
  const model = frontendChart(chartType).settingsModel;
  const rows: Row[] = [];
  const tabs: Tab[] = [];
  const tabList = element("nav", "settings-tabs");
  tabList.setAttribute("role", "tablist");
  const search = element("input");
  search.type = "search";
  search.placeholder = "Search settings…";
  search.setAttribute("aria-label", "Search settings");
  const status = element("span", "status");

  function nonDefaults(): StoredSettings {
    const result: Record<string, Record<string, Setting>> = {};
    for (let i = 0; i < rows.length; i++) {
      const row = at(rows, i);
      if (row.value !== row.definition.default) {
        (result[row.card] ??= {})[row.name] = row.value;
      }
    }
    return result;
  }

  function refresh(): StoredSettings {
    let changed = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = at(rows, i);
      const isChanged = row.value !== row.definition.default;
      row.element.classList.toggle("changed", isChanged);
      row.control.set(row.value);
      if (isChanged) {
        changed++;
      }
    }
    status.textContent = changed === 0 ? "All settings at defaults" : `${changed} setting${changed === 1 ? "" : "s"} changed`;
    return nonDefaults();
  }

  function changed(): void {
    handlers.onChange(refresh());
  }

  function select(card: string): void {
    for (let i = 0; i < tabs.length; i++) {
      const tab = at(tabs, i);
      const selected = tab.card === card;
      tab.button.setAttribute("aria-selected", String(selected));
      tab.button.tabIndex = selected ? 0 : -1;
      tab.panel.hidden = !selected;
    }
  }

  const cards = Object.entries(model);
  for (let c = 0; c < cards.length; c++) {
    const [card, cardModel] = at(cards, c);
    const button = element("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    const count = element("span", "count");
    button.append(cardModel.displayName.replace(/ Settings$/, ""), count);
    button.addEventListener("click", () => {
      select(card);
    });
    tabList.append(button);
    const panel = element("section", "settings-panel");
    panel.setAttribute("role", "tabpanel");
    const groups = Object.entries(cardModel.settingsGroups);
    for (let g = 0; g < groups.length; g++) {
      const [group, definitions] = at(groups, g);
      if (group !== "all") {
        panel.append(element("h2", undefined, group));
      }
      const settings = Object.entries(definitions);
      for (let n = 0; n < settings.length; n++) {
        const [name, definition] = at(settings, n);
        const rowElement = element("div", "setting");
        const label = element("label", undefined, definition.displayName);
        const info = element("span", "info", "i");
        info.title = definition.description;
        label.append(info);
        const row: Row = {
          card,
          name,
          definition,
          element: rowElement,
          control: control(definition, value => {
            row.value = value;
            changed();
          }),
          searchText: `${definition.displayName} ${group} ${name}`.toLowerCase(),
          value: storedSetting(stored[card]?.[name], definition.default)
        };
        const reset = element("button", "reset", "↺");
        reset.type = "button";
        reset.title = "Reset to default";
        reset.addEventListener("click", () => {
          row.value = definition.default;
          changed();
        });
        rowElement.append(label, row.control.element, reset);
        panel.append(rowElement);
        rows.push(row);
      }
    }
    tabs.push({ card, button, count, panel });
  }

  tabList.addEventListener("keydown", event => {
    const visible: Tab[] = [];
    let current = 0;
    for (let i = 0; i < tabs.length; i++) {
      const tab = at(tabs, i);
      if (tab.button.hidden === false) {
        if (tab.button.getAttribute("aria-selected") === "true") {
          current = visible.length;
        }
        visible.push(tab);
      }
    }
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -current, End: visible.length - 1 - current };
    const step = steps[event.key];
    if (step !== undefined && visible.length > 0) {
      event.preventDefault();
      const next = at(visible, (current + step + visible.length) % visible.length);
      select(next.card);
      next.button.focus();
    }
  });

  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    const counts: Record<string, number> = {};
    for (let i = 0; i < rows.length; i++) {
      const row = at(rows, i);
      const hit = query === "" || row.searchText.includes(query);
      row.element.hidden = !hit;
      counts[row.card] = (counts[row.card] ?? 0) + (hit ? 1 : 0);
    }
    let first: string | undefined;
    for (let i = 0; i < tabs.length; i++) {
      const tab = at(tabs, i);
      const count = counts[tab.card] ?? 0;
      tab.button.hidden = count === 0;
      tab.count.textContent = query === "" ? "" : String(count);
      if (first === undefined && count > 0) {
        first = tab.card;
      }
      hideEmptyHeadings(tab.panel);
    }
    if (first !== undefined) {
      select(first);
    }
  });

  const header = element("header", "settings-header");
  header.append(element("h1", undefined, document.title), search);
  const main = element("div", "settings-main");
  main.append(tabList);
  for (let i = 0; i < tabs.length; i++) {
    main.append(at(tabs, i).panel);
  }
  const footer = element("footer", "settings-footer");
  const resetAll = element("button", undefined, "Reset all");
  resetAll.type = "button";
  resetAll.addEventListener("click", () => {
    for (let i = 0; i < rows.length; i++) {
      const row = at(rows, i);
      row.value = row.definition.default;
    }
    changed();
  });
  const cancel = element("button", undefined, "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => {
    handlers.onCancel();
  });
  const ok = element("button", "primary", "OK");
  ok.type = "button";
  ok.addEventListener("click", () => {
    handlers.onOk(nonDefaults());
  });
  footer.append(status, resetAll, cancel, ok);
  root.classList.add("settings");
  root.append(header, main, footer);
  select(at(tabs, 0).card);
  refresh();
}
