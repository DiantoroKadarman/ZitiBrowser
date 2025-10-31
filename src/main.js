import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import started from "electron-squirrel-startup";
import http from "node:http";
import { URL } from "url";
import { spawn } from "child_process";
import crypto from "node:crypto";

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

// Konstanta enkripsi
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bit
const IV_LENGTH = 12; // 96 bit untuk GCM
const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const DIGEST = "sha256";

// --- STATE GLOBAL ---
let mainWindow;
let proxyProcess = null;

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
}

function encryptStringWithPassword(plaintext, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: salt + iv + authTag + encrypted
  return Buffer.concat([salt, iv, authTag, encrypted]).toString("base64");
}

// Dekripsi string dengan password
function decryptStringWithPassword(encryptedBase64, password) {
  const buffer = Buffer.from(encryptedBase64, "base64");
  if (buffer.length < SALT_LENGTH + IV_LENGTH + 16) {
    throw new Error("File terenkripsi rusak atau tidak valid.");
  }

  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = buffer.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + 16
  );
  const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + 16);

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted;
  try {
    decrypted =
      decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
  } catch (e) {
    throw new Error("Password salah atau file rusak.");
  }

  return decrypted;
}

function getProjectRoot() {
  let dir = __dirname;
  const fs = require("fs");

  for (let i = 0; i < 5; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("Tidak bisa menemukan root proyek");
}

function getProxyPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", "zitihttproxy.exe");
  } else {
    return path.join(getProjectRoot(), "assets", "zitihttproxy.exe");
  }
}

// --- FUNGSI: Jalankan proxy.exe ---
function startProxy() {
  if (process.platform !== "win32") {
    console.log("Proxy.exe hanya berjalan di Windows.");
    return;
  }
  const proxyPath = getProxyPath();
  // Opsional: cek apakah file benar-benar ada
  const fsSync = require("fs");
  if (!fsSync.existsSync(proxyPath)) {
    console.error("File proxy tidak ditemukan di:", proxyPath);
    return;
  }
  try {
    proxyProcess = spawn(proxyPath, [], {
      detached: false,
      stdio: "inherit", // lihat log di terminal (inherit), disable log (ignore) 
    });

    proxyProcess.on("error", (err) => {
      console.error("Gagal menjalankan proxy.exe:", err.message);
    });

    proxyProcess.on("exit", (code, signal) => {
      console.log(`Proxy.exe berhenti (kode: ${code}, sinyal: ${signal})`);
      proxyProcess = null;
    });

    console.log("Proxy.exe berhasil dijalankan.");
  } catch (err) {
    console.error("Error saat memulai proxy:", err);
  }
}

// --- FUNGSI: Hentikan proxy.exe ---
function stopProxy() {
  if (proxyProcess) {
    console.log("Menghentikan proxy.exe...");
    proxyProcess.kill();
    proxyProcess = null;
  }
}

// --- HENTIKAN PROXY SAAT KELUAR ---
app.on("before-quit", stopProxy);
app.on("quit", stopProxy);

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

// --- IPCMAIN HANDLERS ---
ipcMain.handle("handle-enrollment", async (event, { jwtContent, password }) => {
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

    if (!password || typeof password !== "string" || password.length < 8) {
      throw new Error("Password minimal 8 karakter.");
    }

    // Enroll ke Ziti
    const newIdentityData = await makeApiRequest("POST", ZITI_ENROLL_URL, {
      jwt: jwtContent,
    });

    if (!newIdentityData || typeof newIdentityData.id !== "object") {
      throw new Error("Respons dari /enroll tidak valid.");
    }

    const identityJsonString = JSON.stringify(newIdentityData);
    const encryptedBase64 = encryptStringWithPassword(
      identityJsonString,
      password
    );

    const fallbackName = `ziti-identity-${Date.now()}`;
    const jwtExtractedName = extractNameFromJwt(jwtContent);
    const fileName = `${jwtExtractedName || fallbackName}`;

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: "Simpan Identity Terenkripsi",
      defaultPath: fileName,
      filters: [{ name: "Encrypted Identity", extensions: ["json.enc"] }],
    });

    if (!saveResult.canceled) {
      let filePath = saveResult.filePath;

      // Hapus semua kemunculan .json.enc di akhir, lalu tambahkan satu
      filePath = filePath.replace(/(\.json\.enc)+$/i, "") + ".json.enc";

      await fs.writeFile(filePath, encryptedBase64, "base64");
      console.log(`Identity disimpan ke: ${filePath}`);
    }

    return {
      success: true,
      message: `File identitas berhasil disimpan sebagai "${fileName}".json.enc`,
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

ipcMain.handle(
  "handle-identity-upload",
  async (event, base64Data, password) => {
    if (!base64Data || typeof base64Data !== "string") {
      return { success: false, message: "Data file tidak valid." };
    }
    if (!password || typeof password !== "string") {
      return { success: false, message: "Password diperlukan." };
    }

    try {
      // Dekripsi dari base64
      const decryptedJsonString = decryptStringWithPassword(
        base64Data,
        password
      );

      if (!decryptedJsonString) {
        throw new Error("File terdekripsi kosong.");
      }

      // Set proxy & upload ke Ziti
      await mainWindow.webContents.session.setProxy({
        proxyRules: ZITI_PROXY_ADDRESS,
      });

      await makeApiRequest(
        "POST",
        ZITI_IDENTITY_URL,
        decryptedJsonString,
        "application/json"
      );

      return { success: true };
    } catch (e) {
      console.error("Gagal memproses identitas dari base64:", e);
      return {
        success: false,
        message: e.message || "Gagal memproses file identitas.",
      };
    }
  }
);

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

// Jalankan proxy lalu buat window
app.whenReady().then(() => {
  startProxy(); // <-- ditambahkan
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
