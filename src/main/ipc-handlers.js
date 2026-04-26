import { ipcMain, net } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import {
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
import { getLogFilePath } from "./proxy.js";

function registerAllHandlers(mainWindow) {
  // --- handle-enrollment ---
  ipcMain.handle(
    "handle-enrollment",
    async (event, { jwtContent, fileName, password }) => {
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
        setCurrentPassword(password);
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

  // --- handle-identity-upload ---
  ipcMain.handle(
    "handle-identity-upload",
    async (event, { identityFile, fileName, password }) => {
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
        setCurrentPassword(password);
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
      setCurrentPassword(password);
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
        const result = await removeIdentityFromVault(idString, password);
        mainWindow?.webContents.send("vault-updated");
        return { success: true, result };
      } catch (e) {
        console.error("Gagal hapus identitas:", e);
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
    clearPassword();
    mainWindow?.webContents.send("vault-locked");
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

    const currentPassword = getCurrentPassword();
    if (!currentPassword) {
      return { success: false, message: "Vault terkunci." };
    }

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
}

export { registerAllHandlers };
