import { app, BrowserWindow } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { setupLogFile, startProxy, stopProxy, setMainWindow } from "./proxy.js";
import { registerAllHandlers } from "./ipc-handlers.js";
import { setupSSLHandler } from "./ssl.js";

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1000,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
    },
  });

  // Set mainWindow reference untuk proxy log updates
  setMainWindow(mainWindow);

  // --- ISSUE 2 FIX: Intercept Ctrl+R / F5 agar tidak me-reload BrowserWindow ---
  // Alih-alih reload seluruh window (default Electron), kirim IPC ke renderer
  // agar hanya webview yang aktif yang di-reload.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    // Ctrl+R atau Ctrl+Shift+R (reload / hard reload)
    const isCtrlR =
      input.type === "keyDown" &&
      input.key.toLowerCase() === "r" &&
      input.control &&
      !input.alt &&
      !input.meta;

    // F5 (reload)
    const isF5 =
      input.type === "keyDown" &&
      input.key === "F5" &&
      !input.control &&
      !input.alt &&
      !input.meta;

    if (isCtrlR || isF5) {
      event.preventDefault(); // Blokir default reload BrowserWindow
      mainWindow.webContents.send("reload-active-webview");
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
};

if (started) {
  app.quit();
}

app.on("web-contents-created", (event, contents) => {
  if (contents.getType() === "webview") {
    contents.setWindowOpenHandler((details) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("app:window-open-intercepted", details.url);
      }
      return { action: "deny" };
    });
  }
});

app.whenReady().then(() => {
  setupLogFile();
  startProxy();
  createWindow();
  registerAllHandlers(mainWindow);
  setupSSLHandler(app);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopProxy);
app.on("quit", stopProxy);
