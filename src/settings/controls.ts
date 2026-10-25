import type { SettingDefinition } from "powerbi-visuals-core/settings";

export type Setting = SettingDefinition["default"];
export type Control = { readonly element: HTMLElement; set(value: Setting): void };

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className !== undefined) {
    result.className = className;
  }
  if (text !== undefined) {
    result.textContent = text;
  }
  return result;
}

function toggleControl(onChange: (value: Setting) => void): Control {
  const wrap = element("label", "switch");
  const input = element("input");
  input.type = "checkbox";
  wrap.append(input, element("i"));
  input.addEventListener("change", () => {
    onChange(input.checked);
  });
  return { element: wrap, set: value => { input.checked = value === true; } };
}

function colourControl(onChange: (value: Setting) => void): Control {
  const wrap = element("div", "colour");
  const input = element("input");
  input.type = "color";
  const hex = element("span");
  wrap.append(input, hex);
  input.addEventListener("input", () => {
    onChange(input.value.toUpperCase());
  });
  return {
    element: wrap,
    set: value => {
      input.value = String(value);
      hex.textContent = String(value);
    }
  };
}

function selectControl(definition: SettingDefinition, onChange: (value: Setting) => void): Control {
  const select = element("select");
  const items = definition.items;
  const values = definition.valid ?? [];
  const count = items?.length ?? values.length;
  for (let i = 0; i < count; i++) {
    const option = element("option");
    option.value = items?.[i].value ?? values[i];
    option.textContent = items?.[i].displayName ?? values[i].replace(/'/g, "");
    if (definition.type === "FontPicker") {
      option.style.fontFamily = option.value;
    }
    select.append(option);
  }
  select.addEventListener("change", () => {
    onChange(select.value);
  });
  return { element: select, set: value => { select.value = String(value); } };
}

function inputControl(definition: SettingDefinition, onChange: (value: Setting) => void): Control {
  const input = element("input");
  if (definition.type === "NumUpDown") {
    input.type = "number";
    const min = definition.options?.minValue?.value;
    const max = definition.options?.maxValue?.value;
    if (min !== undefined) {
      input.min = String(min);
    }
    if (max !== undefined) {
      input.max = String(max);
    }
    input.step = definition.integer ? "1" : "any";
  } else {
    input.type = "text";
  }
  input.addEventListener("change", () => {
    if (input.type === "text") {
      onChange(input.value);
    } else {
      onChange(input.value === "" ? undefined : Number(input.value));
    }
  });
  return { element: input, set: value => { input.value = value === undefined ? "" : String(value); } };
}

export function control(definition: SettingDefinition, onChange: (value: Setting) => void): Control {
  switch (definition.type) {
    case "ToggleSwitch":
      return toggleControl(onChange);
    case "ColorPicker":
      return colourControl(onChange);
    case "Dropdown":
    case "FontPicker":
      return selectControl(definition, onChange);
    default:
      return inputControl(definition, onChange);
  }
}
