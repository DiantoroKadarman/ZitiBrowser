import { app, BrowserWindow } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";

if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
    },
  });

  const PROXY_HOST = "127.0.0.1";
  const PROXY_PORT = "8080";
  const proxyRules = `http=${PROXY_HOST}:${PROXY_PORT};https=${PROXY_HOST}:${PROXY_PORT}`;
  mainWindow.webContents.session
    .setProxy({ proxyRules: proxyRules })
    .then(() => {
      console.log(`Proxy set to ${proxyRules}`);
    })
    .catch((error) => {
      console.error(`Failed to set proxy: ${error}`);
    });
  mainWindow.loadFile(path.join(__dirname, "identity_list.html"));


  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

