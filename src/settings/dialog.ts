import { frontendChart } from "powerbi-visuals-core/frontends";
import type { SettingDefinition } from "powerbi-visuals-core/settings";
import { control, element, type Control, type Setting } from "./controls";
import type { StoredSettings } from "./store";

type Row = {
  readonly card: string;
  readonly name: string;
  readonly definition: SettingDefinition;
  readonly element: HTMLElement;
  readonly control: Control;
  readonly searchText: string;
};

export type SettingsDialogHandlers = {
  /** Called with the non-default settings after each change */
  onChange(settings: StoredSettings): void;
  onOk(settings: StoredSettings): void;
  onCancel(): void;
};

export function renderSettingsDialog(chartType: string, root: HTMLElement, stored: StoredSettings, handlers: SettingsDialogHandlers): void {
  const model = frontendChart(chartType).settingsModel;
  const values: Record<string, Record<string, Setting>> = {};
  const rows: Row[] = [];
  const tabs = element("nav", "settings-tabs");
  tabs.setAttribute("role", "tablist");
  const panels: HTMLElement[] = [];
  const search = element("input");
  search.type = "search";
  search.placeholder = "Search settings…";
  search.setAttribute("aria-label", "Search settings");
  const status = element("span", "status");

  function nonDefaults(): StoredSettings {
    const result: Record<string, Record<string, Setting>> = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const value = values[row.card][row.name];
      if (value !== row.definition.default) {
        (result[row.card] ??= {})[row.name] = value;
      }
    }
    return result;
  }

  function refresh(): StoredSettings {
    let changed = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const value = values[row.card][row.name];
      const isChanged = value !== row.definition.default;
      row.element.classList.toggle("changed", isChanged);
      row.control.set(value);
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
    for (let i = 0; i < tabs.children.length; i++) {
      const tab = tabs.children[i] as HTMLButtonElement;
      const selected = tab.dataset.card === card;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
    }
  }

  const cards = Object.keys(model);
  for (let c = 0; c < cards.length; c++) {
    const card = cards[c];
    values[card] = {};
    const tab = element("button");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.dataset.card = card;
    tab.append(model[card].displayName.replace(/ Settings$/, ""), element("span", "count"));
    tab.addEventListener("click", () => {
      select(card);
    });
    tabs.append(tab);
    const panel = element("section", "settings-panel");
    panel.setAttribute("role", "tabpanel");
    const groups = model[card].settingsGroups;
    const groupNames = Object.keys(groups);
    for (let g = 0; g < groupNames.length; g++) {
      const group = groupNames[g];
      if (group !== "all") {
        panel.append(element("h2", undefined, group));
      }
      const names = Object.keys(groups[group]);
      for (let n = 0; n < names.length; n++) {
        const name = names[n];
        const definition = groups[group][name];
        values[card][name] = (stored[card]?.[name] ?? definition.default) as Setting;
        const row = element("div", "setting");
        const label = element("label", undefined, definition.displayName);
        const info = element("span", "info", "i");
        info.title = definition.description;
        label.append(info);
        const rowControl = control(definition, value => {
          values[card][name] = value;
          changed();
        });
        const reset = element("button", "reset", "↺");
        reset.type = "button";
        reset.title = "Reset to default";
        reset.addEventListener("click", () => {
          values[card][name] = definition.default;
          changed();
        });
        row.append(label, rowControl.element, reset);
        panel.append(row);
        rows.push({ card, name, definition, element: row, control: rowControl, searchText: `${definition.displayName} ${group} ${name}`.toLowerCase() });
      }
    }
    panels.push(panel);
  }

  tabs.addEventListener("keydown", event => {
    const visible: HTMLButtonElement[] = [];
    let current = 0;
    for (let i = 0; i < tabs.children.length; i++) {
      const tab = tabs.children[i] as HTMLButtonElement;
      if (tab.hidden === false) {
        if (tab.getAttribute("aria-selected") === "true") {
          current = visible.length;
        }
        visible.push(tab);
      }
    }
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -current, End: visible.length - 1 - current };
    const step = steps[event.key];
    if (step !== undefined && visible.length > 0) {
      event.preventDefault();
      const next = visible[(current + step + visible.length) % visible.length];
      select(next.dataset.card ?? "");
      next.focus();
    }
  });

  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    const counts: Record<string, number> = {};
    for (let i = 0; i < rows.length; i++) {
      const hit = query === "" || rows[i].searchText.includes(query);
      rows[i].element.hidden = !hit;
      counts[rows[i].card] = (counts[rows[i].card] ?? 0) + (hit ? 1 : 0);
    }
    let first: string | undefined;
    for (let i = 0; i < tabs.children.length; i++) {
      const tab = tabs.children[i] as HTMLButtonElement;
      const count = counts[tab.dataset.card ?? ""];
      tab.hidden = count === 0;
      (tab.lastElementChild as HTMLElement).textContent = query === "" ? "" : String(count);
      if (first === undefined && count > 0) {
        first = tab.dataset.card;
      }
      // Group headings hide with their settings
      const children = panels[i].children;
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
    if (first !== undefined) {
      select(first);
    }
  });

  const header = element("header", "settings-header");
  header.append(element("h1", undefined, document.title), search);
  const main = element("div", "settings-main");
  main.append(tabs, ...panels);
  const footer = element("footer", "settings-footer");
  const resetAll = element("button", undefined, "Reset all");
  resetAll.type = "button";
  resetAll.addEventListener("click", () => {
    for (let i = 0; i < rows.length; i++) {
      values[rows[i].card][rows[i].name] = rows[i].definition.default;
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
  select(cards[0]);
  refresh();
}
