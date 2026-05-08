const colorPickersContainer = document.getElementById("colorPickersContainer");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const statusMessage = document.getElementById("statusMessage");

let variablesState = {};
let visualSettingsState = {};

const pickrInstances = [];

/* ---------------- COLOR HELPERS ---------------- */

function isColorVariable(value = "") {
  return (
    value.includes(",") ||
    value.startsWith("#") ||
    value.startsWith("rgb") ||
    value.startsWith("rgba") ||
    value === "transparent"
  );
}

function cssRgbToPickrValue(value) {
  if (!value) return "#ffffff";

  value = value.trim();

  if (value.startsWith("#")) return value;

  if (
    value.startsWith("rgba") ||
    value.startsWith("rgb")
  ) {
    return value;
  }

  if (value.includes(",")) {
    const parts = value
      .split(",")
      .map((v) => Number(v.trim()));

    const r = parts[0] || 0;
    const g = parts[1] || 0;
    const b = parts[2] || 0;

    return `rgb(${r}, ${g}, ${b})`;
  }

  return "#ffffff";
}

function rgbaToCssVariable(color) {
  const rgba = color.toRGBA();

  const r = Math.round(rgba[0]);
  const g = Math.round(rgba[1]);
  const b = Math.round(rgba[2]);
  const a = Number(rgba[3].toFixed(2));

  return {
    rgbOnly: `${r},${g},${b}`,
    rgbaValue: `rgba(${r},${g},${b},${a})`
  };
}

function destroyPickers() {
  while (pickrInstances.length) {
    try {
      pickrInstances.pop().destroyAndRemove();
    } catch {}
  }
}

/* ---------------- COLOR PICKERS ---------------- */

function buildColorPickers(vars) {
  destroyPickers();

  colorPickersContainer.innerHTML = "";

  Object.entries(vars).forEach(([varName, value]) => {
    if (!isColorVariable(value)) return;

    const wrapper = document.createElement("div");
    wrapper.className = "color-picker-container";

    const label = document.createElement("label");
    label.textContent = varName;

    const pickerEl = document.createElement("div");
    pickerEl.id = `picker-${varName.replace(
      /[^a-z0-9]/gi,
      ""
    )}`;

    wrapper.appendChild(label);
    wrapper.appendChild(pickerEl);

    colorPickersContainer.appendChild(wrapper);

    const pickr = Pickr.create({
      el: `#${pickerEl.id}`,
      theme: "classic",
      default: cssRgbToPickrValue(value),
      components: {
        preview: true,
        opacity: true,
        hue: true,
        interaction: {
          input: true,
          save: true
        }
      }
    });

    pickr.on("save", (color) => {
      const converted = rgbaToCssVariable(color);

      if (
        varName === "--glow-white" ||
        varName === "--glow-blue" ||
        varName === "--glow-purple" ||
        varName === "--glow-cyan"
      ) {
        variablesState[varName] = converted.rgbOnly;
      } else {
        variablesState[varName] = converted.rgbaValue;
      }

      pickr.hide();
    });

    pickrInstances.push(pickr);
  });
}

async function loadVariables() {
  const result = await window.electron.invoke(
    "get-css-variables"
  );

  if (!result?.success) return;

  variablesState = result.variables || {};

  buildColorPickers(variablesState);
}

/* ---------------- VISUAL SETTINGS HELPERS ---------------- */

function getInputNumber(id, fallback = 0) {
  const el = document.getElementById(id);

  if (!el) return fallback;

  const value = Number(el.value);

  return Number.isFinite(value) ? value : fallback;
}

function setInputValue(id, value) {
  const el = document.getElementById(id);

  if (!el) return;

  el.value = value;
}

function setCheckboxValue(id, value) {
  const el = document.getElementById(id);

  if (!el) return;

  el.checked = Boolean(value);
}

/* ---------------- VISUAL SETTINGS ---------------- */

async function loadVisualSettings() {
  const result = await window.electron.invoke(
    "get-visual-settings"
  );

  if (!result?.success) return;

  visualSettingsState = result.settings || {};

  setInputValue(
    "cloneInterval",
    visualSettingsState.cloneInterval
  );

  setInputValue(
    "maxClones",
    visualSettingsState.maxClones
  );

  setInputValue(
    "motionThreshold",
    visualSettingsState.motionThreshold
  );

  setInputValue(
    "snapshotMotionLimit",
    visualSettingsState.snapshotMotionLimit
  );

  setInputValue(
    "maxSnapshots",
    visualSettingsState.maxSnapshots
  );

  setInputValue(
    "leapCloneBoost",
    visualSettingsState.leapCloneBoost
  );

  setInputValue(
    "leapDriftBoost",
    visualSettingsState.leapDriftBoost
  );

  setCheckboxValue(
    "leapColorBoost",
    visualSettingsState.leapColorBoost
  );
}

function collectVisualSettings() {
  return {
    cloneInterval: getInputNumber("cloneInterval", 60),
    maxClones: getInputNumber("maxClones", 1),
    motionThreshold: getInputNumber("motionThreshold", 35),

    snapshotMotionLimit: getInputNumber(
      "snapshotMotionLimit",
      25
    ),

    maxSnapshots: getInputNumber("maxSnapshots", 5),

    leapCloneBoost: getInputNumber(
      "leapCloneBoost",
      1
    ),

    leapDriftBoost: getInputNumber(
      "leapDriftBoost",
      1
    ),

    leapColorBoost:
      document.getElementById("leapColorBoost")?.checked ||
      false
  };
}

/* ---------------- SAVE SETTINGS ---------------- */

saveSettingsBtn.addEventListener("click", async () => {
  const cssResult = await window.electron.invoke(
    "update-css-variables",
    variablesState
  );

  visualSettingsState = collectVisualSettings();

  const visualResult = await window.electron.invoke(
    "update-visual-settings",
    visualSettingsState
  );

  if (cssResult?.success && visualResult?.success) {
    statusMessage.textContent =
      "Settings saved successfully.";
  } else {
    statusMessage.textContent =
      "Failed to save settings.";
  }

  setTimeout(() => {
    statusMessage.textContent = "";
  }, 2500);
});

/* ---------------- INIT ---------------- */

(async function init() {
  await loadVariables();
  await loadVisualSettings();
})();