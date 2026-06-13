import { ipcMain, net } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import {
  VaultError,
  vaultExists,
  readVault,
  addIdentityToVault,
  removeIdentityFromVault,
  determineInitialState,
  getCurrentPassword,
  setCurrentPassword,
  clearPassword,
} from "./vault.js";
import {
  ZITI_PROXY_ADDRESS,
  ZITI_IDENTITIES_URL,
  ZITI_IDENTITY_URL,
  ZITI_ENROLL_URL,
  makeApiRequest,
  extractNameFromJwt,
} from "./api.js";
import { getLogFilePath, writeLog } from "./proxy.js";

function registerAllHandlers(mainWindow) {
  // --- handle-enrollment ---
  ipcMain.handle("handle-enrollment",async (event, { jwtContent, fileName, password }) => {
      try {
        writeLog("IDENTITY", `Memulai enrollment identitas (file: ${fileName || "N/A"})`);

        if (!jwtContent?.includes(".")) throw new Error("JWT tidak valid.");
        if (!password || password.length < 8)
          throw new Error("Password minimal 8 karakter.");

        // Enroll identity via API
        writeLog("IDENTITY", "Mengirim JWT ke proxy untuk enrollment...");
        const identityData = await makeApiRequest("POST", ZITI_ENROLL_URL, {
          jwt: jwtContent,
        });

        if (!identityData || typeof identityData.id !== "object") {
          throw new Error("Respons /enroll tidak valid.");
        }
        writeLog("IDENTITY", "Enrollment berhasil dari proxy, memproses data identitas...");

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
        setCurrentPassword(password);
        mainWindow?.webContents.send("vault-updated");

        writeLog("IDENTITY", `Identitas '${safeName}' berhasil di-enroll dan disimpan ke vault`);

        return {
          success: true,
          message: `Identitas '${safeName}' berhasil didaftarkan dan disimpan di vault`,
          identity: identityForVault,
        };
      } catch (e) {
        console.error("Pendaftaran Gagal:", e);
        writeLog("ERROR", `Enrollment gagal: ${e.message}`);
        return { success: false, message: e.message || "Gagal enroll." };
      }
    }
  );

  // --- handle-identity-upload ---
  ipcMain.handle("handle-identity-upload", async (event, { identityFile, fileName, password }) => {
      try {
        writeLog("IDENTITY", `Memulai upload identitas (file: ${fileName || "N/A"})`);

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

          console.log(`[DEBUG] fileName: "${fileName}" base: "${base}"`);
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
        setCurrentPassword(password);
        mainWindow?.webContents.send("vault-updated");

        writeLog("IDENTITY", `Identitas '${safeName}' berhasil di-upload dan disimpan ke vault`);

        return {
          success: true,
          message: `Identitas '${safeName}' berhasil diimpor dan disimpan di vault`,
          identity: identityForVault,
        };
      } catch (e) {
        console.error("Gagal impor identitas:", e);
        writeLog("ERROR", `Upload identitas gagal: ${e.message}`);
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
      writeLog("VAULT", "Mencoba membuka vault...");
      const vault = await readVault(password);
      setCurrentPassword(password);
      mainWindow?.webContents.send("vault-updated");
      const count = (vault.identities || []).length;
      writeLog("VAULT", `Vault berhasil dibuka (${count} identitas ditemukan)`);
      return {
        success: true,
        identities: vault.identities || [],
      };
    } catch (e) {
      const errorCode = e instanceof VaultError ? e.code : undefined;
      writeLog("ERROR", `Gagal membuka vault: [${errorCode || "UNKNOWN"}] ${e.message}`);
      return {
        success: false,
        message: e.message,
        errorCode,
      };
    }
  });

  ipcMain.handle("vault:get-identities", async () => {
    const currentPassword = getCurrentPassword();
    if (!currentPassword) {
      return { success: false, message: "Vault terkunci." };
    }
    try {
      const vault = await readVault(currentPassword);
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
      const identities = (response?.services_collections || []).map(
        (coll) => ({
          identity_name: coll.identity_name || "N/A",
          identity_id: coll.identity_id || "N/A",
          services: [...new Set(coll.services || [])],
        })
      );
      return { identities };
    } catch (error) {
      console.error("Gagal ambil data identitas:", error);
      return { identities: [] };
    }
  });

  ipcMain.handle("delete-identity", async (event, identityId) => {
    if (!identityId) throw new Error("identity_id diperlukan");
    try {
      writeLog("IDENTITY", `Menghapus identitas dari proxy: ${identityId}`);
      await makeApiRequest(
        "DELETE",
        `${ZITI_IDENTITY_URL}?id=${encodeURIComponent(identityId)}`
      );
      writeLog("IDENTITY", `Identitas '${identityId}' berhasil dihapus dari proxy`);
      return { success: true };
    } catch (error) {
      console.error("Gagal hapus identitas:", error);
      writeLog("ERROR", `Gagal menghapus identitas '${identityId}': ${error.message}`);
      throw error;
    }
  });

  ipcMain.handle(
    "vault:remove-identity",
    async (event, idString, password) => {
      if (!idString) {
        return { success: false, message: "idString tidak boleh kosong." };
      }
      if (!password || password.length < 8) {
        return { success: false, message: "Password minimal 8 karakter." };
      }
      try {
        writeLog("IDENTITY", `Menghapus identitas dari vault: ${idString}`);
        const result = await removeIdentityFromVault(idString, password);
        mainWindow?.webContents.send("vault-updated");
        writeLog("IDENTITY", `Identitas '${idString}' berhasil dihapus dari vault (vault: ${result.remainingCount})`);
        return { success: true, result };
      } catch (e) {
        console.error("Gagal hapus identitas:", e);
        writeLog("ERROR", `Gagal menghapus identitas '${idString}' dari vault: ${e.message}`);
        return {
          success: false,
          message: e.message || "Gagal menghapus identitas.",
        };
      }
    }
  );

  ipcMain.handle("check-session", async () => {
    return await determineInitialState();
  });

  // --- IPC: Cek apakah ada identitas aktif di proxy (untuk renderer reload) ---
  ipcMain.handle("proxy:get-active-identities", async () => {
    try {
      const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
      const identities = (response?.services_collections || []).map(
        (coll) => ({
          identity_name: coll.identity_name || "N/A",
          identity_id: coll.identity_id || "N/A",
          services: [...new Set(coll.services || [])],
        })
      );
      return { success: true, identities };
    } catch (error) {
      // Jika proxy mati/error, anggap tidak ada identitas aktif
      console.warn("Gagal cek identitas aktif di proxy:", error.message);
      return { success: true, identities: [] }; // tetap success, tapi kosong
    }
  });

  ipcMain.handle("logout", async () => {
    writeLog("SESSION", "Memulai proses logout...");

    // Reset proxy dan session
    if (mainWindow) {
      try {
        await mainWindow.webContents.session.setProxy({
          proxyRules: "direct://",
        });
        await mainWindow.webContents.session.clearStorageData({
          storages: ['cookies', 'cachestorage', 'serviceworkers', 'shadercache'],
        });
        writeLog("SESSION", "Proxy session di-reset ke direct");
      } catch (error) {
        console.error("Gagal reset proxy/session:", error);
        writeLog("ERROR", `Gagal reset proxy/session: ${error.message}`);
      }
    }

    // Hapus identitas dari proxy
    try {
      const response = await makeApiRequest("GET", ZITI_IDENTITIES_URL);
      if (response?.services_collections?.length > 0) {
        writeLog("SESSION", `Menghapus ${response.services_collections.length} identitas dari proxy...`);
        for (const coll of response.services_collections) {
          const id = coll.identity_id?.trim();
          if (id) {
            await makeApiRequest(
              "DELETE",
              `${ZITI_IDENTITY_URL}?id=${encodeURIComponent(id)}`
            );
            writeLog("IDENTITY", `Identitas '${coll.identity_name || id}' dihapus dari proxy (logout)`);
          }
        }
      }
    } catch (error) {
      console.warn("Gagal bersihkan identitas dari proxy:", error.message);
      writeLog("WARNING", `Gagal bersihkan identitas dari proxy: ${error.message}`);
    }

    // Reset password vault untuk sesi ini
    clearPassword();
    mainWindow?.webContents.send("vault-locked");
    writeLog("SESSION", "Logout berhasil — vault dikunci, semua identitas dihapus");
    console.log("Logout berhasil.");
    return { success: true };
  });

  // --- IPC: Ambil konten log ---
  ipcMain.handle("proxy:get-log-content", async () => {
    const logPath = getLogFilePath();
    const fsSync = require("fs");
    if (!logPath || !fsSync.existsSync(logPath)) {
      return "[LOG BELUM TERSEDIA]";
    }
    return await fs.readFile(logPath, "utf8");
  });

  // --- IPC: Deteksi protokol service (main process, pakai session yang aktif) ---
  ipcMain.handle("detect-service-protocol", async (event, serviceName) => {
    if (!mainWindow?.webContents?.session) {
      console.warn("[detect] No active session — fallback to https");
      return "https";
    }

    const session = mainWindow.webContents.session;
    const timeout = 2000; // 2s cukup untuk internal Ziti network

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

    // 🚀 Probe HTTPS dan HTTP secara PARALLEL (bukan sequential)
    const [httpsWorks, httpWorks] = await Promise.all([
      tryProtocol("https"),
      tryProtocol("http"),
    ]);

    // Prioritaskan HTTPS jika keduanya berhasil
    if (httpsWorks) return "https";
    if (httpWorks) return "http";

    // 🛡️ Fallback akhir: HTTPS
    return "https";
  });

  // --- IPC: Login identitas ke proxy ---
  ipcMain.handle("vault:login-selected", async (event, identityIdList) => {
    if (!Array.isArray(identityIdList) || identityIdList.length === 0) {
      return { success: false, message: "Pilih minimal satu identitas." };
    }

    const currentPassword = getCurrentPassword();
    if (!currentPassword) {
      return { success: false, message: "Vault terkunci." };
    }

    writeLog("SESSION", `Memulai login ${identityIdList.length} identitas: [${identityIdList.join(", ")}]`);

    try {
      const vault = await readVault(currentPassword);

      // Validasi semua ID ada di vault
      const identitiesToLogin = identityIdList.map((idString) => {
        const id = vault.identities.find((i) => i.idString === idString);
        if (!id) throw new Error(`Identitas tidak ditemukan: ${idString}`);
        return id;
      });

      // Set proxy sekali saja (bukan per identitas)
      await event.sender.session.setProxy({
        proxyRules: ZITI_PROXY_ADDRESS,
      });
      writeLog("SESSION", `Proxy di-set ke ${ZITI_PROXY_ADDRESS}`);

      // 🔁 Kirim semua identitas ke `/identity` (proxy biasanya replace active identity, jadi loop sequensial)
      for (const identity of identitiesToLogin) {
        writeLog("IDENTITY", `Mengirim identitas '${identity.name || identity.idString}' ke proxy...`);
        await makeApiRequest(
          "POST",
          ZITI_IDENTITY_URL,
          identity,
          "application/json"
        );
        writeLog("IDENTITY", `Identitas '${identity.name || identity.idString}' berhasil di-load ke proxy`);
      }

      writeLog("SESSION", `Login selesai — ${identitiesToLogin.length} identitas aktif`);

      return {
        success: true,
        message: `Berhasil login ${identitiesToLogin.length} identitas.`,
        identities: identitiesToLogin.map((id) => ({
          idString: id.idString,
          name: id.name,
        })),
      };
    } catch (e) {
      writeLog("ERROR", `Login gagal: ${e.message}`);
      return {
        success: false,
        message: e.message || "Gagal memproses login.",
      };
    }
  });
}

export { registerAllHandlers };
