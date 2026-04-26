import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

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
  },
};

// Konstanta enkripsi
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bit
const IV_LENGTH = 12; // 96 bit untuk GCM
const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const DIGEST = "sha256";

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
      throw new Error(
        `Identitas dengan nama "${identity.idString}" sudah ada.`
      );
    }

    vault.identities.push(identity);
    await writeVault(vault, password);
    console.log(
      `[VAULT] Added identity: "${identity.idString}", total: ${vault.identities.length}`
    );
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

  vault.identities = identities.filter((id) => id.idString !== idToRemove);

  if (vault.identities.length === initialLength) {
    throw new Error(
      `Identitas dengan idString "${idToRemove}" tidak ditemukan di vault.`
    );
  }

  // Simpan kembali vault tanpa identitas yang dihapus
  await writeVault(vault, password);
  return {
    removedIdString: idToRemove,
    remainingCount: vault.identities.length,
  };
}

// --- Password state accessors ---
function getCurrentPassword() {
  return currentVaultPassword;
}

function setCurrentPassword(password) {
  currentVaultPassword = password;
}

function clearPassword() {
  currentVaultPassword = null;
}

export {
  vaultExists,
  readVault,
  writeVault,
  addIdentityToVault,
  removeIdentityFromVault,
  determineInitialState,
  getCurrentPassword,
  setCurrentPassword,
  clearPassword,
};
