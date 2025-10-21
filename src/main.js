import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import http from "node:http";
import fs from "node:fs";
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

// --- KEAMANAN DAN KONSTANTA FILE ---
const ENCRYPTED_IDENTITY_FILENAME = "encrypted_ziti_identity.dat";

// --- STATE GLOBAL ---
let mainWindow;
let __currentDecryptedIdentity = null;
let isZitiNetworkRunning = false;

// --- UTILITY ---
function getIdentityFilePath() {
  return path.join(app.getPath("userData"), ENCRYPTED_IDENTITY_FILENAME);
}

function saveEncryptedIdentity(rawData) {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("SafeStorage tidak tersedia.");
  const encryptedBuffer = safeStorage.encryptString(rawData);
  fs.writeFileSync(getIdentityFilePath(), encryptedBuffer);
}

function loadDecryptedIdentity() {
  const filePath = getIdentityFilePath();
  if (!fs.existsSync(filePath)) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    console.error("SafeStorage tidak tersedia.");
    return null;
  }
  try {
    const encryptedBuffer = fs.readFileSync(filePath);
    return safeStorage.decryptString(encryptedBuffer);
  } catch (e) {
    console.error("Gagal mendekripsi identity:", e);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {}
    return null;
  }
}

// --- FUNGSI UTILITAS API REQUEST (DIPERBAIKI) ---
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
      // PERBAIKAN: Menggabungkan pathname dan search untuk menyertakan parameter query
      path: urlObj.pathname + urlObj.search,
      method: method,
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
          } catch (e) {
            reject(
              new Error(
                `Gagal mem-parsing respons JSON dari API. Respons mentah: ${responseData}`
              )
            );
          }
        } else {
          reject(
            new Error(`API Error: Status ${res.statusCode} - ${responseData}`)
          );
        }
      });
    });

    req.on("error", (e) =>
      reject(new Error(`Request ke API Ziti gagal: ${e.message}`))
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request ke API Ziti timeout.`));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}


// --- IPC HANDLERS ---

ipcMain.handle("check-identity-status", () => {
  return loadDecryptedIdentity() ? "IDENTITY_SAVED" : "NEEDS_ENROLLMENT";
});

ipcMain.handle("handle-enrollment", async (event, jwtContent) => {
  try {
    // Langkah 1: Kirim JWT untuk mendapatkan identity JSON
    const newIdentityData = await makeApiRequest(
      "POST",
      ZITI_ENROLL_URL,
      { jwt: jwtContent }, // Sesuai asumsi, mengirim JWT dalam objek JSON
      "application/json"
    );

    if (!newIdentityData || !newIdentityData.id) {
      throw new Error("Respons dari /enroll tidak valid atau tidak berisi id.");
    }
    const identityJsonString = JSON.stringify(newIdentityData); // Langkah 2: Kirim identity JSON mentah untuk mengaktifkannya di proxy

    await makeApiRequest(
      "POST",
      ZITI_IDENTITY_URL,
      identityJsonString, // Mengirim string JSON mentah
      "application/json" // Menggunakan application/json karena ini adalah konten JSON
    );
    saveEncryptedIdentity(identityJsonString);
    __currentDecryptedIdentity = newIdentityData;
    isZitiNetworkRunning = true;

    if (mainWindow) {
      await mainWindow.webContents.session.setProxy({
        proxyRules: ZITI_PROXY_ADDRESS,
      });
    }

    console.log(
      `Jaringan Ziti Aktif dengan identity baru: ${newIdentityData.id}` //id soalnya butuh json mentah
    );

    return {
      success: true,
      identityName: newIdentityData.identity_name || "N/A",
    };
  } catch (e) {
    console.error("Enrollment Gagal:", e);
    let userFriendlyMessage = e.message;
    if (e.message?.includes("Status 400")) {
      userFriendlyMessage = `Proxy menolak data (Error 400). Pastikan file JWT valid.`;
    } else if (e.message?.includes("ECONNREFUSED")) {
      userFriendlyMessage = `Koneksi ke proxy ditolak. Pastikan ziti-http-proxy berjalan di port ${API_PORT}.`;
    }
    return { success: false, message: userFriendlyMessage };
  }
});

ipcMain.handle("reactivate-saved-identity", async () => {
  try {
    const decryptedJsonString = loadDecryptedIdentity();
    if (!decryptedJsonString) throw new Error("Tidak ada Identity tersimpan."); // Mengirim konten JSON yang disimpan untuk mengaktifkan kembali identity
    await makeApiRequest(
      "POST",
      ZITI_IDENTITY_URL,
      decryptedJsonString,
      "application/json" // Mengirim sebagai application/json
    );
    const identityData = JSON.parse(decryptedJsonString);
    __currentDecryptedIdentity = identityData;
    isZitiNetworkRunning = true;
    if (mainWindow)
      await mainWindow.webContents.session.setProxy({
        proxyRules: ZITI_PROXY_ADDRESS,
      });

    console.log(
      `Jaringan Ziti Berhasil Diaktifkan Kembali untuk: ${identityData.identity_name}`
    );
    return {
      success: true,
      identityName: identityData.identity_name || "N/A",
    };
  } catch (e) {
    console.error("Aktivasi Gagal:", e);
    try {
      fs.unlinkSync(getIdentityFilePath());
    } catch (err) {}
    return {
      success: false,
      message: `${e.message}. Identity korup mungkin telah dihapus. Harap enroll ulang.`,
    };
  }
});

ipcMain.handle("logout", async () => {
  // Reset proxy browser terlebih dahulu.
  if (mainWindow) {
    try {
      await mainWindow.webContents.session.setProxy({
        proxyRules: "direct://",
      });
      console.log("Proxy browser telah direset ke 'direct'.");
    } catch (error) {
      console.error("Gagal mereset proxy browser:", error);
    }
  }

  try {
    // 1. Ambil data identity saat ini, menggunakan logika yang sama dengan 'get-ziti-identity-data'
    const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL);

    // Validasi bahwa respons memiliki `services_collections` dan tidak kosong.
    if (
      response &&
      Array.isArray(response.services_collections) &&
      response.services_collections.length > 0
    ) {
      // Ambil data pertama dari array.
      const data = response.services_collections[0];
      const deletedID = data.identity_id;

      if (deletedID) {
        // PERBAIKAN: Menambahkan .trim() dan log untuk debugging
        const urlToDelete = `${ZITI_IDENTITY_URL}?id=${deletedID.trim()}`;
        console.log(`Mencoba mengirim permintaan DELETE ke URL: ${urlToDelete}`);
        
        // 2. Kirim permintaan DELETE ke API proxy menggunakan ID yang diekstrak.
        try {
          await makeApiRequest(
            "DELETE",
            urlToDelete
          );
          console.log(
            `Berhasil mengirim perintah hapus ke proxy untuk identity ${deletedID}.`
          );
        } catch (error) {
          console.error(
            `Gagal menghapus identity (${deletedID}) dari proxy saat logout:`,
            error.message
          );
          // Lanjutkan proses logout meskipun penghapusan dari proxy gagal.
        }
      } else {
         console.warn("Ditemukan active collection, namun tidak ada identity_id untuk dihapus.");
      }
    } else {
      console.warn(
        "Tidak dapat menemukan ID identity saat ini untuk dihapus dari proxy. Respons API tidak valid atau kosong."
      );
    }
  } catch (error) {
    console.error(
      "Gagal mengambil data identity untuk dihapus:",
      error.message
    );
  }

  // 3. Hapus file identity yang tersimpan secara lokal.
  try {
    const filePath = getIdentityFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("File identity lokal telah berhasil dihapus.");
    }
  } catch (err) {
    console.error("Gagal menghapus file identity lokal:", err);
  }

  // 4. Reset variabel state global.
  __currentDecryptedIdentity = null;
  isZitiNetworkRunning = false;
  console.log(
    "Logout berhasil. Sesi browser telah direset dan file lokal telah dihapus."
  );

  return true;
});


ipcMain.handle("get-ziti-identity-data", async () => {
  if (!isZitiNetworkRunning || !__currentDecryptedIdentity) {
    throw new Error("Jaringan Ziti tidak aktif.");
  }
  try {
    const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL); // Validasi bahwa respons memiliki `services_collections` dan tidak kosong.

    if (
      !response ||
      !Array.isArray(response.services_collections) ||
      response.services_collections.length === 0
    ) {
      throw new Error(
        "Respons API tidak memiliki data services yang diharapkan."
      );
    } // AMBIL DATA PERTAMA dari array, sesuai dengan logika lama yang berhasil.
    const activeCollection = response.services_collections[0];

    return {
      identity_name: activeCollection.identity_name,
      identity_id: activeCollection.identity_id,
      services: [...new Set(activeCollection.services || [])],
    };
  } catch (error) {
    console.error("Gagal mengambil data services dari API:", error); // Fallback jika terjadi error, kembalikan data dari state lokal.
    return {
      identity_name: __currentDecryptedIdentity.identity_name || "N/A",
      identity_id: __currentDecryptedIdentity.identity_id,
      services: [],
      error: "Gagal mengambil daftar layanan dari proxy.",
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

