import { app, BrowserWindow, ipcMain, safeStorage, dialog } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import started from "electron-squirrel-startup";
import http from "node:http";
import { URL } from "url";

if (started) {
  app.quit();
}

// --- KONSTANTA ZITI & PROXY ---
const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = "8080";
const API_PORT = "8081";

const ZITI_PROXY_ADDRESS = `http=${PROXY_HOST}:${PROXY_PORT}`;
const ZITI_API_BASE_URL = `http://${PROXY_HOST}:${API_PORT}`;
const ZITI_IDENTITIES_URL = `${ZITI_API_BASE_URL}/identities`;
const ZITI_IDENTITY_URL = `${ZITI_API_BASE_URL}/identity`;
const ZITI_ENROLL_URL = `${ZITI_API_BASE_URL}/enroll`;

// --- STATE GLOBAL ---
let mainWindow;

function makeApiRequest(
  method,
  url,
  data = null,
  contentType = "application/json"
) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    let postData = data;

    if (
      contentType === "application/json" &&
      data &&
      typeof data === "object"
    ) {
      postData = JSON.stringify(data);
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        "Content-Type": contentType,
        ...(postData && { "Content-Length": Buffer.byteLength(postData) }),
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (responseData.trim() === "") {
            resolve({ success: true });
            return;
          }
          try {
            resolve(JSON.parse(responseData));
          } catch {
            reject(
              new Error(
                `Gagal mem-parsing respons JSON dari API. Respons mentah: ${responseData}`
              )
            );
          }
        } else {
          reject(
            new Error(
              `Kesalahan API: Status ${res.statusCode} - ${responseData}`
            )
          );
        }
      });
    });

    req.on("error", (e) =>
      reject(new Error(`Permintaan ke API Ziti gagal: ${e.message}`))
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Permintaan ke API Ziti melewati batas waktu."));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

function extractNameFromJwt(jwtString) {
  try {
    const parts = jwtString.split(".");
    if (parts.length !== 3) return null;

    const payloadBase64 = parts[1];
    const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf8");
    const payload = JSON.parse(payloadJson);

    const candidate = payload.sub || payload.name || payload.iss;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    }
  } catch (e) {
    console.warn("Gagal mengekstrak nama dari JWT:", e.message);
  }
  return null;
}

// --- FUNGSI: Periksa sesi (bisa dipanggil dari mana saja) ---
async function checkSession() {
  try {
    const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
    const identities = response?.services_collections || [];

    if (identities.length > 0) {
      if (mainWindow) {
        await mainWindow.webContents.session.setProxy({
          proxyRules: ZITI_PROXY_ADDRESS,
        });
      }
      return { type: "session-restored", payload: { identities } };
    } else {
      return { type: "show-auth" };
    }
  } catch (error) {
    if (error.message.includes("ECONNREFUSED")) {
      return { type: "proxy-not-running" };
    } else {
      return { type: "show-auth" };
    }
  }
}

// --- IPC HANDLERS ---

ipcMain.handle("handle-enrollment", async (event, jwtContent) => {
  try {
    if (
      !jwtContent ||
      typeof jwtContent !== "string" ||
      !jwtContent.includes(".")
    ) {
      throw new Error(
        "JWT tidak valid. Format harus berupa string dengan tiga bagian."
      );
    }

    if (!safeStorage.isEncryptionAvailable()) {
      if (process.platform === "linux") {
        throw new Error(
          "Fitur enkripsi identitas tidak didukung di sistem Linux."
        );
      } else {
        throw new Error(
          "SafeStorage tidak tersedia untuk enkripsi pada sistem ini."
        );
      }
    }

    const newIdentityData = await makeApiRequest("POST", ZITI_ENROLL_URL, {
      jwt: jwtContent,
    });
    if (!newIdentityData || typeof newIdentityData.id !== "object") {
      throw new Error("Respons dari /enroll tidak valid.");
    }

    const identityJsonString = JSON.stringify(newIdentityData);
    const encryptedBuffer = safeStorage.encryptString(identityJsonString);
    const encryptedBase64 = encryptedBuffer.toString("base64");

    const fallbackName = `ziti-identity-${Date.now()}`;
    const jwtExtractedName = extractNameFromJwt(jwtContent);
    const fileName = `${jwtExtractedName || fallbackName}`;

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: "Simpan Identity Terenkripsi",
      defaultPath: fileName,
      filters: [{ name: "Encrypted Identity", extensions: ["json.enc"] }],
    });

    if (!saveResult.canceled) {
      await fs.writeFile(saveResult.filePath, encryptedBase64, "base64");
      console.log(`Identity disimpan ke: ${saveResult.filePath}`);
    }

    return {
      success: true,
      message: `File identitas berhasil disimpan sebagai "${fileName}.json.enc". Gunakan file ini untuk login.`,
    };
  } catch (e) {
    console.error("Pendaftaran Gagal:", e);
    let userFriendlyMessage = e.message;
    if (e.message?.includes("Status 400")) {
      userFriendlyMessage =
        "Proxy menolak data (Error 400). Pastikan file JWT valid.";
    } else if (e.message?.includes("ECONNREFUSED")) {
      userFriendlyMessage = `Koneksi ke proxy ditolak. Pastikan ziti-http-proxy berjalan di port ${API_PORT}.`;
    }
    return { success: false, message: userFriendlyMessage };
  }
});


ipcMain.handle("handle-identity-upload", async (event, input) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "SafeStorage tidak tersedia untuk dekripsi pada sistem ini."
      );
    }

    // Normalisasi input jadi array Base64
    let base64Array;
    if (typeof input === "string") {
      // Satu file
      base64Array = [input];
    } else if (Array.isArray(input)) {
      // Banyak file
      if (input.length === 0) throw new Error("Tidak ada file yang diunggah.");
      base64Array = input;
    } else {
      throw new Error(
        "Input harus berupa string (1 file) atau array (banyak file)."
      );
    }

    // Aktifkan proxy sekali saja
    await mainWindow.webContents.session.setProxy({
      proxyRules: ZITI_PROXY_ADDRESS,
    });

    // Proses semua file
    for (const base64 of base64Array) {
      if (typeof base64 !== "string") {
        throw new Error("Setiap file harus berupa string Base64.");
      }

      const encryptedBuffer = Buffer.from(base64, "base64");
      let decryptedJsonString;
      try {
        decryptedJsonString = safeStorage.decryptString(encryptedBuffer);
      } catch (decErr) {
        throw new Error(
          "File tidak dapat didekripsi. Pastikan file berasal dari aplikasi ini."
        );
      }

      if (!decryptedJsonString) {
        throw new Error("Hasil dekripsi kosong. File mungkin rusak.");
      }

      await makeApiRequest(
        "POST",
        ZITI_IDENTITY_URL,
        decryptedJsonString,
        "application/json"
      );
    }

    // Ambil daftar identitas terbaru
    const activeSession = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
    const identities = activeSession?.services_collections || [];

    return {
      success: true,
      identities,
    };
  } catch (e) {
    console.error("Gagal memuat identitas:", e);
    return {
      success: false,
      message: `Gagal memuat identitas: ${e.message}`,
    };
  }
});

ipcMain.handle("logout", async () => {
  if (mainWindow) {
    try {
      await mainWindow.webContents.session.setProxy({
        proxyRules: "direct://",
      });
      await mainWindow.webContents.session.clearStorageData();
    } catch (error) {
      console.error("Gagal reset proxy/session:", error);
    }
  }

  try {
    const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
    if (response?.services_collections?.length > 0) {
      for (const coll of response.services_collections) {
        const id = coll.identity_id?.trim();
        if (id) {
          await makeApiRequest(
            "DELETE",
            `${ZITI_IDENTITY_URL}?id=${encodeURIComponent(id)}`
          );
        }
      }
    }
  } catch (error) {
    console.warn("Gagal membersihkan identitas saat logout:", error.message);
  }

  console.log("Logout berhasil.");
  return true;
});

ipcMain.handle("get-ziti-identity-data", async () => {
  try {
    const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
    const identities = (response?.services_collections || []).map((coll) => ({
      identity_name: coll.identity_name || "N/A",
      identity_id: coll.identity_id || "N/A",
      services: [...new Set(coll.services || [])],
    }));
    return { identities };
  } catch (error) {
    console.error("Gagal mengambil data identitas:", error);
    return { identities: [] };
  }
});

ipcMain.handle("delete-identity", async (event, identityId) => {
  if (!identityId) throw new Error("identity_id diperlukan");
  try {
    await makeApiRequest(
      "DELETE",
      `${ZITI_IDENTITY_URL}?id=${encodeURIComponent(identityId)}`
    );
    return { success: true };
  } catch (error) {
    console.error("Gagal menghapus identitas:", error);
    throw error;
  }
});

// --- IPC: Periksa sesi saat diminta oleh renderer (misal setelah reload) ---
ipcMain.handle("check-session", async () => {
  return await checkSession();
});

// --- APP LIFECYCLE ---
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Cek sesi setelah halaman selesai dimuat (termasuk saat reload)
  mainWindow.webContents.once("did-finish-load", async () => {
    const result = await checkSession();
    mainWindow.webContents.send(result.type, result.payload);
  });

  mainWindow.webContents.openDevTools();
};

app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
