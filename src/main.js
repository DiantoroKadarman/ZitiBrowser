import { app, BrowserWindow, ipcMain, net } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import started from "electron-squirrel-startup";
import http from "node:http";
import { URL } from "url";
import { spawn } from "child_process";
import crypto from "node:crypto";

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = "8080";
const API_PORT = "8081";
const ZITI_PROXY_ADDRESS = `${PROXY_HOST}:${PROXY_PORT}`;
const ZITI_API_BASE_URL = `http://${PROXY_HOST}:${API_PORT}`;
const ZITI_IDENTITIES_URL = `${ZITI_API_BASE_URL}/identities`;
const ZITI_IDENTITY_URL = `${ZITI_API_BASE_URL}/identity`;
const ZITI_ENROLL_URL = `${ZITI_API_BASE_URL}/enroll`;

// --- KONSTANTA VAULT ---
const VAULT_FILENAME = "ziti-vault.enc";
let currentVaultPassword = null; // Password vault untuk sesi ini
const vaultLock = {
  locked: false,
  queue: [],
  async acquire() {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  },
  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }
};


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
let logStream = null;
let logFilePath = "";

// --- FUNGSI: Turunkan kunci dari password dan salt ---
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

  return Buffer.concat([salt, iv, authTag, encrypted]).toString("base64");
}

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

// --- FUNGSI: Dapatkan path ke zitihttproxy.exe ---
function getProxyPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", "zitihttproxy.exe");
  } else {
    return path.join(getProjectRoot(), "assets", "zitihttproxy.exe");
  }
}

// --- FUNGSI: Dapatkan root proyek (hanya untuk development) ---
function getProjectRoot() {
  let dir = __dirname;
  const fsSync = require("fs");

  for (let i = 0; i < 5; i++) {
    const pkg = path.join(dir, "package.json");
    if (fsSync.existsSync(pkg)) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("Tidak bisa menemukan root proyek");
}

// --- FUNGSI: Siapkan file log di userData ---
function setupLogFile() {
  const userDataPath = app.getPath("userData");
  logFilePath = path.join(userDataPath, "PROXY-LOG.log");

  const fsSync = require("fs");
  if (!fsSync.existsSync(userDataPath)) {
    fsSync.mkdirSync(userDataPath, { recursive: true });
  }

  logStream = fsSync.createWriteStream(logFilePath, { flags: "w" });
  logStream.write(`[INFO] Log dimulai pada ${new Date().toISOString()}\n`);
}

// --- FUNGSI: Jalankan proxy.exe ---
function startProxy() {
  if (process.platform !== "win32") {
    const msg = "Proxy.exe hanya berjalan di Windows.";
    console.log(msg);
    logStream?.write(`[ERROR] ${msg}\n`);
    mainWindow?.webContents.send("proxy-log-update", msg);
    return;
  }

  const proxyPath = getProxyPath();
  const fsSync = require("fs");
  if (!fsSync.existsSync(proxyPath)) {
    const msg = `File proxy tidak ditemukan di: ${proxyPath}`;
    console.error(msg);
    logStream?.write(`[ERROR] ${msg}\n`);
    mainWindow?.webContents.send("proxy-log-update", msg);
    return;
  }

  try {
    proxyProcess = spawn(proxyPath, [], {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    proxyProcess.stdout.on("data", (data) => {
      const text = data.toString();
      logStream?.write(text);
      mainWindow?.webContents.send("proxy-log-update", text);
    });

    proxyProcess.stderr.on("data", (data) => {
      const text = "[STDERR] " + data.toString();
      logStream?.write(text);
      mainWindow?.webContents.send("proxy-log-update", text);
    });

    proxyProcess.on("error", (err) => {
      const msg = `Gagal menjalankan proxy.exe: ${err.message}`;
      console.error(msg);
      logStream?.write(`[ERROR] ${msg}\n`);
      mainWindow?.webContents.send("proxy-log-update", msg);
    });

    proxyProcess.on("exit", (code, signal) => {
      const msg = `Proxy.exe berhenti (kode: ${code}, sinyal: ${signal})`;
      console.log(msg);
      logStream?.write(`[EXIT] ${msg}\n`);
      mainWindow?.webContents.send("proxy-log-update", msg);
      proxyProcess = null;
    });

    const msg = "Proxy.exe berhasil dijalankan.";
    console.log(msg);
    logStream?.write(`[INFO] ${msg}\n`);
    mainWindow?.webContents.send("proxy-log-update", msg);
  } catch (err) {
    const msg = `Error saat memulai proxy: ${err.message}`;
    console.error(msg);
    logStream?.write(`[EXCEPTION] ${msg}\n`);
    mainWindow?.webContents.send("proxy-log-update", msg);
  }
}

// --- FUNGSI: Hentikan proxy.exe ---
function stopProxy() {
  if (proxyProcess) {
    const msg = "Menghentikan proxy.exe...";
    console.log(msg);
    logStream?.write(`[INFO] ${msg}\n`);
    proxyProcess.kill();
    proxyProcess = null;
  }
  if (logStream) {
    logStream.end();
  }
}

// --- FUNGSI UTILITAS API ---
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
            reject(new Error(`Gagal parsing JSON. Respons: ${responseData}`));
          }
        } else {
          reject(new Error(`API error ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on("error", (e) => reject(new Error(`API gagal: ${e.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("API timeout."));
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
    console.warn("Gagal ekstrak nama dari JWT:", e.message);
  }
  return null;
}

// --- FUNGSI MANAJEMEN VAULT ---
function getVaultPath() {
  return path.join(app.getPath("userData"), VAULT_FILENAME);
}

async function vaultExists() {
  try {
    await fs.access(getVaultPath());
    return true;
  } catch {
    return false;
  }
}

async function readVault(password) {
  const vaultPath = getVaultPath();
  try {
    const encryptedData = await fs.readFile(vaultPath, "utf8");
    const decryptedJson = decryptStringWithPassword(encryptedData, password);
    return JSON.parse(decryptedJson);
  } catch (e) {
    if (e.message === "Password salah atau file rusak.") {
      throw new Error("Password vault salah.");
    }
    throw new Error(`Gagal baca vault: ${e.message}`);
  }
}

async function writeVault(data, password) {
  const vaultPath = getVaultPath();
  const jsonString = JSON.stringify(data);
  const encryptedData = encryptStringWithPassword(jsonString, password);
  await fs.writeFile(vaultPath, encryptedData);
}

async function determineInitialState() {
  const hasVault = await vaultExists();

  if (!hasVault) {
    return { type: "no-vault" }; // → tampilkan enroll/upload
  }

  if (!currentVaultPassword) {
    return { type: "need-vault-password" }; // → minta password
  }

  try {
    const vault = await readVault(currentVaultPassword);
    const identities = vault.identities || [];
    return identities.length === 0
      ? { type: "empty-vault" }
      : { type: "show-identity-list", payload: { identities } };
  } catch (e) {
    currentVaultPassword = null; // reset jika error
    return { type: "need-vault-password", error: "Password salah." };
  }
}

async function addIdentityToVault(identity, password) {
  await vaultLock.acquire(); // 🔒 tunggu giliran
  try {
    let vault = { identities: [] };
    if (await vaultExists()) {
      try {
        vault = await readVault(password);
      } catch (e) {
        if (!e.message.includes("ENOENT")) throw e;
      }
    }

    if (!identity.idString) {
      const fallbackName = identity.name || `ziti-${Date.now()}`;
      identity.idString = String(fallbackName)
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    }

    if (!identity.idString) {
      throw new Error("Identitas harus memiliki idString yang valid.");
    }

    identity.addedAt = new Date().toISOString();
    vault.identities = vault.identities || [];

    const existing = vault.identities.find(
      (id) => id.idString === identity.idString
    );
    if (existing) {
      throw new Error(`Identitas dengan nama "${identity.idString}" sudah ada.`);
    }

    vault.identities.push(identity);
    await writeVault(vault, password);
    console.log(`[VAULT] Added identity: "${identity.idString}", total: ${vault.identities.length}`);
    return identity;

  } finally {
    vaultLock.release();
  }
}

async function removeIdentityFromVault(idString, password) {
  if (!idString) {
    throw new Error("idString harus disediakan untuk menghapus identitas.");
  }

  if (!(await vaultExists())) {
    throw new Error("Vault tidak ditemukan.");
  }

  let vault;
  try {
    vault = await readVault(password);
  } catch (e) {
    throw new Error(`Gagal membaca vault: ${e.message}`);
  }

  const identities = vault.identities || [];
  const initialLength = identities.length;

  // Pastikan idString adalah string (sesuai penyimpanan di vault)
  const idToRemove = String(idString).trim();

  vault.identities = identities.filter(id => id.idString !== idToRemove);

  if (vault.identities.length === initialLength) {
    throw new Error(`Identitas dengan idString "${idToRemove}" tidak ditemukan di vault.`);
  }

  // Simpan kembali vault tanpa identitas yang dihapus
  await writeVault(vault, password);
  return { removedIdString: idToRemove, remainingCount: vault.identities.length };
}

// --- IPC HANDLERS ---
ipcMain.handle("handle-enrollment", async (event, { jwtContent, fileName, password }) => {
    try {
      if (!jwtContent?.includes(".")) throw new Error("JWT tidak valid.");
      if (!password || password.length < 8)
        throw new Error("Password minimal 8 karakter.");

      // Enroll identity via API

      const identityData = await makeApiRequest("POST", ZITI_ENROLL_URL, {
        jwt: jwtContent,
      });

      if (!identityData || typeof identityData.id !== "object") {
        throw new Error("Respons /enroll tidak valid.");
      }

      let safeName = null;

      if (fileName) {
        const base = path.basename(fileName).replace(/\.[^/.]+$/, ""); // hapus ekstensi
        if (base && base.trim()) {
          safeName = base
            .trim()
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
            .replace(/\s+/g, "-");
        }
      }

      if (!safeName) {
        safeName = extractNameFromJwt(jwtContent);
      }

      if (!safeName) {
        safeName = `ziti-${Date.now()}`;
      }

      const identityForVault = {
        ...identityData,
        name: safeName,
        idString: safeName,
        addedAt: new Date().toISOString(),
        fileName: fileName,
      };

      await addIdentityToVault(identityForVault, password);
      currentVaultPassword = password;
      mainWindow?.webContents.send("vault-updated");

      return {
        success: true,
        message: `Identitas '${safeName}' berhasil didaftarkan dan disimpan di vault`,
        identity: identityForVault,
      };
    } catch (e) {
      console.error("Pendaftaran Gagal:", e);
      return { success: false, message: e.message || "Gagal enroll." };
    }
  }
);

ipcMain.handle( "handle-identity-upload", async (event, { identityFile, fileName, password }) => {
    try {
      if (!identityFile) throw new Error("File identitas diperlukan.");
      if (!password || password.length < 8)
        throw new Error("Password minimal 8 karakter.");

      let identityData;
      try {
        identityData = JSON.parse(identityFile);
      } catch (e) {
        throw new Error("Format file identitas tidak valid (harus JSON).");
      }

      if (!identityData?.id || typeof identityData.id !== "object") {
        throw new Error(
          "File identitas tidak valid: properti 'id' tidak ditemukan atau bukan objek."
        );
      }

      let safeName = "imported-" + Date.now(); // fallback

      if (fileName) {
        let base = path.basename(fileName);
        const exts = /\.(json|jwt|token|txt)$/i;
        while (exts.test(base)) {
          base = base.replace(exts, "");
        }

        console.log(`[DEBUG] fileName: "${fileName}" → base: "${base}"`);
        if (base && base.trim()) {
          safeName = base
            .trim()
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
            .replace(/\s+/g, "-");
        }
        console.log(`[DEBUG] safeName after sanitization: "${safeName}"`);
      }

      const identityForVault = {
        ...identityData,
        name: identityData.name || safeName,
        idString: safeName,
        addedAt: new Date().toISOString(),
        fileName: fileName, // opsional: simpan nama asli file
      };

      await addIdentityToVault(identityForVault, password);
      currentVaultPassword = password;
      mainWindow?.webContents.send("vault-updated");

      return {
        success: true,
        message: `Identitas '${safeName}' berhasil diimpor dan disimpan di vault`,
        identity: identityForVault,
      };
    } catch (e) {
      console.error("Gagal impor identitas:", e);
      return {
        success: false,
        message: e.message || "Gagal memproses file identitas.",
      };
    }
  }
);

// --- IPC HANDLERS UNTUK VAULT ---
ipcMain.handle("vault:check-exists", async () => {
  return await vaultExists();
});

ipcMain.handle("vault:unlock", async (event, password) => {
  try {
    const vault = await readVault(password);
    currentVaultPassword = password;
    mainWindow?.webContents.send("vault-updated");
    return {
      success: true,
      identities: vault.identities || [],
    };
  } catch (e) {
    return {
      success: false,
      message: e.message,
    };
  }
});

ipcMain.handle("vault:get-identities", async () => {
  if (!currentVaultPassword) {
    return { success: false, message: "Vault terkunci." };
  }
  try {
    const vault = await readVault(currentVaultPassword);
    return {
      success: true,
      identities: vault.identities || [],
    };
  } catch (e) {
    return {
      success: false,
      message: e.message,
    };
  }
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
    console.error("Gagal ambil data identitas:", error);
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
    console.error("Gagal hapus identitas:", error);
    throw error;
  }
});

ipcMain.handle("vault:remove-identity", async (event, idString, password) => {
  if (!idString) {
    return { success: false, message: "idString tidak boleh kosong." };
  }
  if (!password || password.length < 8) {
    return { success: false, message: "Password minimal 8 karakter." };
  }
  try {
    const result = await removeIdentityFromVault(idString, password);
    mainWindow?.webContents.send("vault-updated");
    return { success: true, result };
  } catch (e) {
    console.error("Gagal hapus identitas:", e);
    return { success: false, message: e.message || "Gagal menghapus identitas." };
  }
});


ipcMain.handle("check-session", async () => {
  return await determineInitialState();
});

// --- IPC: Cek apakah ada identitas aktif di proxy (untuk renderer reload) ---
ipcMain.handle("proxy:get-active-identities", async () => {
  try {
    const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
    const identities = (response?.services_collections || []).map((coll) => ({
      identity_name: coll.identity_name || "N/A",
      identity_id: coll.identity_id || "N/A",
      services: [...new Set(coll.services || [])],
    }));
    return { success: true, identities };
  } catch (error) {
    // Jika proxy mati/error, anggap tidak ada identitas aktif
    console.warn("Gagal cek identitas aktif di proxy:", error.message);
    return { success: true, identities: [] }; // tetap success, tapi kosong
  }
});

ipcMain.handle("logout", async () => {
  // Reset proxy dan session
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

  // Hapus identitas dari proxy
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
    console.warn("Gagal bersihkan identitas dari proxy:", error.message);
  }

  // Reset password vault untuk sesi ini
  currentVaultPassword = null;
  mainWindow?.webContents.send("vault-locked");
  console.log("Logout berhasil.");
  return { success: true };
});

// --- IPC: Ambil konten log ---
ipcMain.handle("proxy:get-log-content", async () => {
  const fsSync = require("fs");
  if (!logFilePath || !fsSync.existsSync(logFilePath)) {
    return "[LOG BELUM TERSEDIA]";
  }
  return await fs.readFile(logFilePath, "utf8");
});

// --- IPC: Deteksi protokol service (main process, pakai session yang aktif) ---
ipcMain.handle("detect-service-protocol", async (event, serviceName) => {
  if (!mainWindow?.webContents?.session) {
    console.warn("[detect] No active session — fallback to https");
    return "https";
  }

  const session = mainWindow.webContents.session;
  const timeout = 5000;

  // Helper: coba satu protokol
  const tryProtocol = (protocol) => {
    return new Promise((resolve) => {
      const url = `${protocol}://${serviceName}`;
      const req = net.request({
        session,
        method: "HEAD",
        url,
      });

      const timer = setTimeout(() => {
        req.abort();
        resolve(false);
      }, timeout);

      req.on("response", () => {
        clearTimeout(timer);
        req.abort();
        resolve(true);
      });

      req.on("error", (err) => {
        clearTimeout(timer);
        // Jika error SSL (self-signed), tetap anggap sukses!
        if (/CERT|SSL|PROTO/i.test(err.code || err.message)) {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      req.end();
    });
  };

  // 🔍 Coba HTTPS dulu
  const httpsWorks = await tryProtocol("https");
  if (httpsWorks) return "https";

  // 🔁 Fallback ke HTTP
  const httpWorks = await tryProtocol("http");
  if (httpWorks) return "http";

  // 🛡️ Fallback akhir: HTTPS (karena kebanyakan internal service pakai HTTPS + self-signed)
  return "https";
});

// --- IPC: Login identitas ke proxy ---
ipcMain.handle("vault:login-selected", async (event, identityIdList) => {
  if (!Array.isArray(identityIdList) || identityIdList.length === 0) {
    return { success: false, message: "Pilih minimal satu identitas." };
  }

  if (!currentVaultPassword) {
    return { success: false, message: "Vault terkunci." };
  }

  try {
    const vault = await readVault(currentVaultPassword);

    // Validasi semua ID ada di vault
    const identitiesToLogin = identityIdList.map((idString) => {
      const id = vault.identities.find((i) => i.idString === idString);
      if (!id) throw new Error(`Identitas tidak ditemukan: ${idString}`);
      return id;
    });

    // Set proxy sekali saja (bukan per identitas)
    await event.sender.session.setProxy({ proxyRules: ZITI_PROXY_ADDRESS });

    // 🔁 Kirim semua identitas ke `/identity` (proxy biasanya replace active identity, jadi loop sequensial)
    for (const identity of identitiesToLogin) {
      await makeApiRequest(
        "POST",
        ZITI_IDENTITY_URL,
        identity,
        "application/json"
      );
    }

    return {
      success: true,
      message: `Berhasil login ${identitiesToLogin.length} identitas.`,
      identities: identitiesToLogin.map((id) => ({
        idString: id.idString,
        name: id.name,
      })),
    };
  } catch (e) {
    return {
      success: false,
      message: e.message || "Gagal memproses login.",
    };
  }
});

// --- APP LIFECYCLE ---
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
  // mainWindow.setAlwaysOnTop(true);
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
  setupLogFile();
  startProxy();
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

if (started) {
  app.quit();
}

app.on("before-quit", stopProxy);
app.on("quit", stopProxy);

app.on(
  "certificate-error",
  (event, webContents, url, error, certificate, callback) => {
    console.log(`Mengizinkan sertifikat tidak aman untuk: ${url}`);
    event.preventDefault(); // Jangan blokir
    callback(true); // Percayai sertifikat ini
  }
);
