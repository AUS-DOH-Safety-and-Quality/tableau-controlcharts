import { describe, expect, it, vi } from "vitest";
import { renderSettingsDialog } from "../src/settings/dialog";
import type { StoredSettings } from "../src/settings/store";
import { must } from "./fakes";

describe("Settings dialog", () => {
  function render(stored: StoredSettings = {}) {
    document.title = "Test settings";
    const root = document.body.appendChild(document.createElement("div"));
    const handlers = { onChange: vi.fn((_settings: StoredSettings) => {}), onOk: vi.fn((_settings: StoredSettings) => {}), onCancel: vi.fn() };
    renderSettingsDialog("test", root, stored, handlers);
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[role=tab]"));
    const panels = Array.from(root.querySelectorAll<HTMLElement>("[role=tabpanel]"));
    const rows = Array.from(root.querySelectorAll<HTMLElement>(".setting"));
    const status = must(root.querySelector(".status"));
    const button = (text: string) => must(Array.from(root.querySelectorAll("button")).find(b => b.textContent === text));
    return { root, handlers, tabs, panels, rows, status, button };
  }

  it("renders a tab per card, a heading per named group and a control per setting, starting from the stored values", () => {
    const { root, tabs, panels, rows, status } = render({ lines: { colour_main: "#FF0000" } });
    expect(must(root.querySelector("h1")).textContent).toBe("Test settings");
    expect(tabs.map(t => t.textContent)).toEqual(["Canvas", "Line"]);
    expect(tabs.map(t => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(panels.map(p => p.hidden)).toEqual([false, true]);
    expect(Array.from(panels[1].querySelectorAll("h2")).map(h => h.textContent)).toEqual(["Main", "Target"]);
    expect(rows.map(r => must(r.querySelector("label")).textContent)).toEqual(["Show Errorsi", "Paddingi", "Main Colouri", "Target Typei"]);
    expect(must(rows[0].querySelector<HTMLInputElement>("input[type=checkbox]")).checked).toBe(true);
    const padding = must(rows[1].querySelector<HTMLInputElement>("input[type=number]"));
    expect([padding.value, padding.min, padding.step]).toEqual(["10", "0", "1"]);
    expect(must(rows[2].querySelector<HTMLInputElement>("input[type=text]")).value).toBe("#FF0000");
    expect(Array.from(must(rows[3].querySelector("select")).options).map(o => [o.value, o.textContent])).toEqual([["solid", "Solid"], ["dashed", "Dashed"]]);
    expect(rows.map(r => r.classList.contains("changed"))).toEqual([false, false, true, false]);
    expect(status.textContent).toBe("1 setting changed");
    expect(must(rows[2].querySelector<HTMLElement>(".info")).title).toBe("Colours.");
  });

  it("reports only non-default values on change, resets them, and hands the result to OK", () => {
    const { handlers, rows, button, status } = render();
    const toggle = must(rows[0].querySelector<HTMLInputElement>("input[type=checkbox]"));
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    expect(handlers.onChange).toHaveBeenLastCalledWith({ canvas: { show_errors: false } });
    const padding = must(rows[1].querySelector<HTMLInputElement>("input[type=number]"));
    padding.value = "4";
    padding.dispatchEvent(new Event("change"));
    expect(handlers.onChange).toHaveBeenLastCalledWith({ canvas: { show_errors: false, padding: 4 } });
    expect(status.textContent).toBe("2 settings changed");

    must(rows[1].querySelector<HTMLButtonElement>(".reset")).click();
    expect(handlers.onChange).toHaveBeenLastCalledWith({ canvas: { show_errors: false } });
    expect(padding.value).toBe("10");
    button("OK").click();
    expect(handlers.onOk).toHaveBeenCalledWith({ canvas: { show_errors: false } });
    button("Reset all").click();
    expect(handlers.onChange).toHaveBeenLastCalledWith({});
    expect(toggle.checked).toBe(true);
    button("Cancel").click();
    expect(handlers.onCancel).toHaveBeenCalled();
  });

  it("filters settings and cards by search, showing the first card with hits", () => {
    const { root, tabs, panels, rows } = render();
    const search = must(root.querySelector<HTMLInputElement>("input[type=search]"));
    search.value = "colour";
    search.dispatchEvent(new Event("input"));
    expect(rows.map(r => r.hidden)).toEqual([true, true, false, true]);
    expect(tabs.map(t => t.hidden)).toEqual([true, false]);
    expect(must(tabs[1].querySelector(".count")).textContent).toBe("1");
    expect(panels.map(p => p.hidden)).toEqual([true, false]);
    expect(Array.from(panels[1].querySelectorAll("h2")).map(h => h.hidden)).toEqual([false, true]);
    search.value = "";
    search.dispatchEvent(new Event("input"));
    expect(rows.map(r => r.hidden)).toEqual([false, false, false, false]);
    expect(tabs.map(t => t.hidden)).toEqual([false, false]);
  });
});
