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
const HMAC_LENGTH = 32; // SHA-256 HMAC = 32 bytes

// Magic header untuk format baru (dengan HMAC)
const VAULT_MAGIC = "ZVLT"; // 4 bytes: Ziti Vault
const VAULT_VERSION = 2; // 1 byte: versi format

// --- Custom Error class untuk vault ---
class VaultError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "VaultError";
    this.code = code; // 'VAULT_TAMPERED' | 'WRONG_PASSWORD' | 'VAULT_CORRUPT'
  }
}

// --- FUNGSI: Turunkan kunci dari password dan salt ---
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
}

// Derive a password verification hash (independent of file content)
// Used to check "is the password correct?" without needing to decrypt
function derivePasswordVerifyHash(password, salt) {
  const verifySalt = Buffer.concat([salt, Buffer.from("ziti-pw-verify")]);
  return crypto.pbkdf2Sync(verifySalt, password, ITERATIONS, HMAC_LENGTH, DIGEST);
}

// Derive an HMAC key for file integrity (different from encryption key)
function deriveIntegrityKey(password, salt) {
  const integritySalt = Buffer.concat([salt, Buffer.from("ziti-integrity")]);
  return crypto.pbkdf2Sync(password, integritySalt, ITERATIONS, KEY_LENGTH, DIGEST);
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

  // Data terenkripsi
  const encryptedPayload = Buffer.concat([salt, iv, authTag, encrypted]);

  // 1. Password verification hash (untuk cek password benar/salah)
  const pwVerifyHash = derivePasswordVerifyHash(password, salt);

  // 2. Integrity HMAC (untuk cek apakah file dimanipulasi)
  const integrityKey = deriveIntegrityKey(password, salt);
  const integrityHmac = crypto
    .createHmac("sha256", integrityKey)
    .update(encryptedPayload)
    .digest();

  // Format: MAGIC(4) + VERSION(1) + PW_VERIFY(32) + INTEGRITY_HMAC(32) + encryptedPayload
  const header = Buffer.alloc(5);
  header.write(VAULT_MAGIC, 0, 4, "ascii");
  header.writeUInt8(VAULT_VERSION, 4);

  return Buffer.concat([header, pwVerifyHash, integrityHmac, encryptedPayload]).toString("base64");
}

function decryptStringWithPassword(encryptedBase64, password) {
  const fullBuffer = Buffer.from(encryptedBase64, "base64");

  // --- Deteksi format: baru (dengan verifikasi) atau lama (tanpa) ---
  const hasNewFormat =
    fullBuffer.length >= 5 &&
    fullBuffer.subarray(0, 4).toString("ascii") === VAULT_MAGIC;

  if (hasNewFormat) {
    return decryptNewFormat(fullBuffer, password);
  } else {
    return decryptLegacyFormat(fullBuffer, password);
  }
}

// --- Format BARU ---
// MAGIC(4) + VERSION(1) + PW_VERIFY(32) + INTEGRITY_HMAC(32) + salt(16) + iv(12) + authTag(16) + encrypted
function decryptNewFormat(fullBuffer, password) {
  const headerSize = 5;
  const minSize = headerSize + HMAC_LENGTH + HMAC_LENGTH + SALT_LENGTH + IV_LENGTH + 16;

  if (fullBuffer.length < minSize) {
    throw new VaultError(
      "File vault rusak atau tidak valid — ukuran file terlalu kecil.",
      "VAULT_CORRUPT"
    );
  }

  let offset = headerSize;

  // Ekstrak password verification hash
  const storedPwHash = fullBuffer.subarray(offset, offset + HMAC_LENGTH);
  offset += HMAC_LENGTH;

  // Ekstrak integrity HMAC
  const storedIntegrityHmac = fullBuffer.subarray(offset, offset + HMAC_LENGTH);
  offset += HMAC_LENGTH;

  // Sisa = encrypted payload (salt + iv + authTag + encrypted)
  const encryptedPayload = fullBuffer.subarray(offset);

  const salt = encryptedPayload.subarray(0, SALT_LENGTH);
  const iv = encryptedPayload.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = encryptedPayload.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + 16
  );
  const encrypted = encryptedPayload.subarray(SALT_LENGTH + IV_LENGTH + 16);

  // --- LANGKAH 1: Verifikasi password ---
  const computedPwHash = derivePasswordVerifyHash(password, salt);
  const isPasswordCorrect = crypto.timingSafeEqual(storedPwHash, computedPwHash);

  if (!isPasswordCorrect) {
    // Password salah — pasti WRONG_PASSWORD
    throw new VaultError(
      "Password vault salah.",
      "WRONG_PASSWORD"
    );
  }

  // --- LANGKAH 2: Password benar → cek integritas file ---
  const integrityKey = deriveIntegrityKey(password, salt);
  const computedIntegrityHmac = crypto
    .createHmac("sha256", integrityKey)
    .update(encryptedPayload)
    .digest();

  const isFileIntact = crypto.timingSafeEqual(storedIntegrityHmac, computedIntegrityHmac);

  if (!isFileIntact) {
    // Password benar TAPI file telah dimanipulasi!
    throw new VaultError(
      "File vault telah dimanipulasi! Integritas data tidak dapat diverifikasi. " +
        "Hapus file vault dan buat ulang dengan enrollment baru.",
      "VAULT_TAMPERED"
    );
  }

  // --- LANGKAH 3: Password benar + file utuh → decrypt ---
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted;
  try {
    decrypted =
      decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
  } catch (e) {
    // Seharusnya tidak terjadi jika HMAC cocok
    throw new VaultError(
      "File vault rusak — integritas terverifikasi tapi dekripsi gagal.",
      "VAULT_CORRUPT"
    );
  }
  return decrypted;
}

// --- Format LAMA: salt + iv + authTag + encrypted (tanpa HMAC) ---
// Backward compatible: vault lama tanpa HMAC akan di-upgrade saat writeVault berikutnya
function decryptLegacyFormat(buffer, password) {
  if (buffer.length < SALT_LENGTH + IV_LENGTH + 16) {
    throw new VaultError(
      "File vault rusak atau tidak valid.",
      "VAULT_CORRUPT"
    );
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
    // Format lama: tidak bisa membedakan password salah vs file dimanipulasi
    throw new VaultError(
      "Password salah atau file vault telah dimanipulasi. " +
        "Jika Anda yakin password benar, kemungkinan file vault telah diubah oleh pihak lain.",
      "WRONG_PASSWORD_OR_TAMPERED"
    );
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
    if (e instanceof VaultError) {
      // Propagate VaultError dengan code yang tepat
      throw e;
    }
    if (e instanceof SyntaxError) {
      // JSON.parse gagal — data terdekripsi tapi bukan JSON valid
      throw new VaultError(
        "File vault rusak — data terdekripsi bukan format yang valid.",
        "VAULT_CORRUPT"
      );
    }
    throw new VaultError(`Gagal baca vault: ${e.message}`, "VAULT_CORRUPT");
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
    const errorCode = e instanceof VaultError ? e.code : undefined;
    return {
      type: "need-vault-password",
      error: e.message || "Password salah.",
      errorCode,
    };
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
  VaultError,
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
