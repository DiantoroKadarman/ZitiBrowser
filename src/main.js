import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import http from "node:http"; // Menggunakan modul HTTP Node.js untuk GET request

if (started) {
  app.quit();
}

// --- ZITI KONFIGURASI ---
// 1. Konfigurasi Proxy Main Window (Port 8080)
const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = "8080";
// Aturan proxy diarahkan ke port 8080 (Ziti Proxy Server)
// Menggunakan http saja sesuai contoh, tapi disarankan HTTPS juga.
const ZITI_PROXY_ADDRESS = `http=${PROXY_HOST}:${PROXY_PORT}`;

// 2. Konfigurasi Ziti Identity API (Port 8081)
const ZITI_API_URL = "http://127.0.0.1:8081/identities";
// --------------------------

// --- PENTING: IPC HANDLER DIDAFTARKAN DI SINI ---
// Handler untuk merespon permintaan data services dari Renderer (index.html)
ipcMain.handle("get-ziti-identity-data", async () => {
  return new Promise((resolve, reject) => {
    // Main Process yang membuat request ke API 8081 (menggunakan Node.js HTTP, yang mengabaikan setting proxy Chromium)
    const request = http.get(ZITI_API_URL, (res) => {
      let data = "";

      if (res.statusCode !== 200) {
        return reject(
          `Gagal terhubung ke API Ziti (Port 8081). Status: ${res.statusCode}`
        );
      }

      res.on("data", (chunk) => (data += chunk));

      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          // Mengambil identity pertama
          if (
            json.services_collections &&
            json.services_collections.length > 0
          ) {
            resolve(json.services_collections[0]);
          } else {
            reject("Respon API tidak memiliki data services yang diharapkan.");
          }
        } catch (e) {
          reject(`Gagal memparsing JSON: ${e.message}`);
        }
      });
    });

    request.on("error", (err) => {
      reject(
        `Gagal terhubung ke Ziti API di ${ZITI_API_URL}: ${err.message}. Pastikan Ziti API Server berjalan.`
      );
    });

    request.end();
  });
});
// ------------------------------------------------------------------

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
    },
  });

  // --- PROXY SETUP UNTUK SELURUH MAIN WINDOW SESSION (Port 8080) ---
  mainWindow.webContents.session
    .setProxy({ proxyRules: ZITI_PROXY_ADDRESS })
    .then(() => {
      console.log(`✅ Main Window Proxy set to: ${ZITI_PROXY_ADDRESS}`);
    })
    .catch((error) => {
      console.error(`❌ Failed to set proxy: ${error}`);
    });

  // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }

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
