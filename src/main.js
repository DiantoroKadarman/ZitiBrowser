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
let __currentDecryptedIdentity = null;
let isZitiNetworkRunning = false;

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

/**
 * Hapus semua identitas aktif dari ziti-http-proxy
 */
async function clearAllActiveIdentities() {
  try {
    const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
    if (response?.services_collections?.length > 0) {
      for (const coll of response.services_collections) {
        const identityId = coll.identity_id?.trim();
        if (identityId) {
          const urlToDelete = `${ZITI_IDENTITY_URL}?id=${encodeURIComponent(identityId)}`;
          await makeApiRequest("DELETE", urlToDelete);
          console.log(`Identitas lama dihapus: ${identityId}`);
        }
      }
    }
  } catch (error) {
    console.warn("Gagal membersihkan identitas aktif:", error.message);
    // Tidak throw error — lanjutkan saja
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
      throw new Error(
        "Respons dari /enroll tidak valid atau tidak memiliki objek ID."
      );
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
      message: `File identitas berhasil disimpan sebagai "${fileName}". Gunakan file ini untuk login.`,
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

/**
 * UPLOAD → AKTIFKAN SESI
 */
ipcMain.handle("handle-identity-upload",async (event, encryptedFileContentBase64) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          "SafeStorage tidak tersedia untuk dekripsi pada sistem ini."
        );
      }

      if (
        !encryptedFileContentBase64 ||
        typeof encryptedFileContentBase64 !== "string"
      ) {
        throw new Error("File tidak valid: konten harus berupa string Base64.");
      }

      //HAPUS SEMUA IDENTITAS AKTIF SEBELUM MENAMBAHKAN YANG BARU
      await clearAllActiveIdentities();
      const encryptedBuffer = Buffer.from(encryptedFileContentBase64, "base64");
      let decryptedJsonString;
      try {
        decryptedJsonString = safeStorage.decryptString(encryptedBuffer);
      } catch (decErr) {
        throw new Error(
          "File tidak dapat didekripsi. Pastikan file berasal dari aplikasi ini dan tidak diubah."
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

      const identityData = JSON.parse(decryptedJsonString);
      __currentDecryptedIdentity = identityData;
      isZitiNetworkRunning = true;

      if (mainWindow) {
        await mainWindow.webContents.session.setProxy({
          proxyRules: ZITI_PROXY_ADDRESS,
        });
      }

      const activeSession = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
      const activeIdentity = activeSession?.services_collections?.[0];
      const identityName = activeIdentity?.identity_name || "N/A";
      const identityId = activeIdentity?.identity_id || "N/A";

      console.log(`Jaringan Ziti aktif untuk: ${identityName}`);

      return {
        success: true,
        identityName,
        identityId,
      };
    } catch (e) {
      console.error("Aktivasi dari file gagal:", e);
      return {
        success: false,
        message: `Gagal memuat identitas. Pastikan file yang diunggah benar dan tidak rusak. Error: ${e.message}`,
      };
    }
  }
);

// --- LOGOUT (TETAP SAMA) ---
ipcMain.handle("logout", async () => {
  if (mainWindow) {
    try {
      await mainWindow.webContents.session.setProxy({
        proxyRules: "direct://",
      });
      await mainWindow.webContents.session.clearStorageData();
      console.log("Proxy dan storage browser telah direset.");
    } catch (error) {
      console.error("Gagal mengatur ulang proxy/browser session:", error);
    }
  }
  await clearAllActiveIdentities();
  __currentDecryptedIdentity = null;
  isZitiNetworkRunning = false;
  console.log("Logout berhasil.");
  return true;
});

// --- GET IDENTITY DATA (HANYA JIKA SESI AKTIF) ---
ipcMain.handle("get-ziti-identity-data", async () => {
  if (!isZitiNetworkRunning || !__currentDecryptedIdentity) {
    throw new Error("Jaringan Ziti tidak aktif.");
  }

  try {
    const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
    const active = response?.services_collections?.[0];
    if (!active) {
      throw new Error("Tidak ada identitas aktif ditemukan di proxy.");
    }

    return {
      identity_name: active.identity_name || "N/A",
      identity_id: active.identity_id || "N/A",
      services: [...new Set(active.services || [])],
    };
  } catch (error) {
    console.error("Gagal mengambil data identitas dari API:", error);
    return {
      identity_name: "N/A",
      identity_id: "N/A",
      services: [],
      error: error.message,
    };
  }
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
  mainWindow.webContents.openDevTools();
};

app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
