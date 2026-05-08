const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
let settingsWindow;

const cssPath = path.join(__dirname, "public", "css", "basic.css");
const settingsPath = path.join(
  __dirname,
  "public",
  "json",
  "visual-settings.json"
);

const DEFAULT_VISUAL_SETTINGS = {
  leapCloneBoost: 1,
  leapMaxClones: 1,
  leapDriftBoost: 1,
  leapColorBoost: false,

  cloneInterval: 60,
  maxClones: 1,
  motionThreshold: 35,

  snapshotMotionLimit: 25,
  maxSnapshots: 5
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(
    path.join(__dirname, "public", "templates", "index.html")
  );
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 850,
    title: "Visual Settings",
    autoHideMenuBar: true,
    backgroundColor: "#111111",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow.loadFile(
    path.join(__dirname, "public", "templates", "settings.html")
  );

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function extractRootVariables(css) {
  const rootMatch = css.match(/:root\s*{([\s\S]*?)}/);
  if (!rootMatch) return {};

  const vars = {};
  const regex = /(--[\w-]+)\s*:\s*([^;]+);/g;

  let match;

  while ((match = regex.exec(rootMatch[1])) !== null) {
    vars[match[1]] = match[2].trim();
  }

  return vars;
}

function readCssVariables() {
  if (!fs.existsSync(cssPath)) return {};

  const css = fs.readFileSync(cssPath, "utf8");
  return extractRootVariables(css);
}

function updateCssVariables(updatedVars) {
  if (!fs.existsSync(cssPath)) return false;

  let css = fs.readFileSync(cssPath, "utf8");

  for (const [name, value] of Object.entries(updatedVars || {})) {
    const regex = new RegExp(`(${name}\\s*:\\s*)([^;]+)(;)`, "i");

    if (regex.test(css)) {
      css = css.replace(regex, `$1${value}$3`);
    }
  }

  fs.writeFileSync(cssPath, css, "utf8");

  return true;
}

function reloadMainStyles() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("reload-css");
  }
}

function readVisualSettings() {
  try {
    if (!fs.existsSync(settingsPath)) {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify(DEFAULT_VISUAL_SETTINGS, null, 2),
        "utf8"
      );
    }

    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

    return {
      ...DEFAULT_VISUAL_SETTINGS,
      ...data
    };
  } catch {
    return DEFAULT_VISUAL_SETTINGS;
  }
}

function writeVisualSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  const finalSettings = {
    ...DEFAULT_VISUAL_SETTINGS,
    ...settings
  };

  fs.writeFileSync(
    settingsPath,
    JSON.stringify(finalSettings, null, 2),
    "utf8"
  );

  return finalSettings;
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register("F2", () => {
    createSettingsWindow();
  });

  ipcMain.handle("open-settings", () => {
    createSettingsWindow();
    return { success: true };
  });

  ipcMain.handle("get-css-variables", () => {
    return {
      success: true,
      variables: readCssVariables()
    };
  });

  ipcMain.handle("update-css-variables", (event, variables) => {
    const ok = updateCssVariables(variables);

    reloadMainStyles();

    return {
      success: ok
    };
  });

  ipcMain.handle("get-visual-settings", () => {
  return {
    success: true,
    settings: readVisualSettings()
  };
});

ipcMain.handle("update-visual-settings", (event, settings) => {
  const savedSettings = writeVisualSettings(settings);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("visual-settings-updated", savedSettings);
  }

  return {
    success: true,
    settings: savedSettings
  };
});

});

app.on("window-all-closed", () => {
  globalShortcut.unregisterAll();

  if (process.platform !== "darwin") {
    app.quit();
  }
});