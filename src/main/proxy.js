import { app } from "electron";
import path from "node:path";
import { spawn } from "child_process";

// --- STATE ---
let proxyProcess = null;
let logStream = null;
let logFilePath = "";
let _mainWindow = null;
let _isStopping = false; // Guard agar stopProxy hanya jalan sekali

// --- KONFIGURASI LOG ROTATION ---
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB
const TRIM_TO_SIZE = 3 * 1024 * 1024; // Trim ke 3 MB (hapus bagian paling lama)

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

// --- FUNGSI: Dapatkan path ke zitihttproxy.exe ---
function getProxyPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", "zitihttproxy.exe");
  } else {
    return path.join(getProjectRoot(), "assets", "zitihttproxy.exe");
  }
}

// --- FUNGSI: Rotasi log jika melebihi batas ukuran ---
function rotateLogIfNeeded() {
  const fsSync = require("fs");
  try {
    if (!fsSync.existsSync(logFilePath)) return;

    const stats = fsSync.statSync(logFilePath);
    if (stats.size <= MAX_LOG_SIZE) return;

    // Baca file, potong bagian paling lama, simpan sisanya
    const content = fsSync.readFileSync(logFilePath, "utf8");
    const bytesToRemove = content.length - TRIM_TO_SIZE;

    if (bytesToRemove <= 0) return;

    // Cari newline terdekat setelah titik potong agar tidak memotong di tengah baris
    const cutIndex = content.indexOf("\n", bytesToRemove);
    if (cutIndex === -1) return; // file hanya 1 baris super panjang, biarkan

    const trimmedContent =
      `[INFO] === Log di-trim pada ${new Date().toISOString()} (entri lama dihapus) ===\n` +
      content.substring(cutIndex + 1);

    // Tutup stream lama, tulis file baru, buka stream baru
    if (logStream) {
      logStream.end();
    }
    fsSync.writeFileSync(logFilePath, trimmedContent, "utf8");
    logStream = fsSync.createWriteStream(logFilePath, { flags: "a" });
  } catch (err) {
    console.error("[LOG ROTATION] Gagal rotasi log:", err.message);
  }
}

// --- FUNGSI: Siapkan file log di userData ---
function setupLogFile() {
  const userDataPath = app.getPath("userData");
  logFilePath = path.join(userDataPath, "PROXY-LOG.log");

  const fsSync = require("fs");
  if (!fsSync.existsSync(userDataPath)) {
    fsSync.mkdirSync(userDataPath, { recursive: true });
  }

  // Rotasi log jika sudah terlalu besar sebelum membuka stream baru
  if (fsSync.existsSync(logFilePath)) {
    rotateLogIfNeeded();
  }

  // Gunakan flags "a" (append), BUKAN "w" (write/truncate)
  logStream = fsSync.createWriteStream(logFilePath, { flags: "a" });
  logStream.write(
    `\n[INFO] ========== Sesi baru dimulai pada ${new Date().toISOString()} ==========\n`
  );
}

// --- FUNGSI: Set mainWindow reference untuk log updates ---
function setMainWindow(win) {
  _mainWindow = win;
}

// --- FUNGSI: Cek apakah mainWindow masih hidup ---
function isWindowAlive() {
  return _mainWindow && !_mainWindow.isDestroyed();
}

// --- FUNGSI: Tulis log dari modul lain (identity activities, dll.) ---
function writeLog(level, message) {
  const timestamp = new Date().toISOString();
  const formatted = `[${level}] [${timestamp}] ${message}\n`;
  logStream?.write(formatted);

  if (isWindowAlive()) {
    _mainWindow.webContents.send("proxy-log-update", formatted);
  }

  // Cek rotasi setelah menulis (tidak setiap kali, hanya periodik)
  rotateLogIfNeeded();
}

// --- FUNGSI: Jalankan proxy.exe ---
function startProxy() {
  if (process.platform !== "win32") {
    const msg = "Proxy.exe hanya berjalan di Windows.";
    console.log(msg);
    writeLog("ERROR", msg);
    return;
  }

  const proxyPath = getProxyPath();
  const fsSync = require("fs");
  if (!fsSync.existsSync(proxyPath)) {
    const msg = `File proxy tidak ditemukan di: ${proxyPath}`;
    console.error(msg);
    writeLog("ERROR", msg);
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
      if (isWindowAlive()) {
        _mainWindow.webContents.send("proxy-log-update", text);
      }
    });

    proxyProcess.stderr.on("data", (data) => {
      const text = "[STDERR] " + data.toString();
      logStream?.write(text);
      if (isWindowAlive()) {
        _mainWindow.webContents.send("proxy-log-update", text);
      }
    });

    proxyProcess.on("error", (err) => {
      const msg = `Gagal menjalankan proxy.exe: ${err.message}`;
      console.error(msg);
      writeLog("ERROR", msg);
    });

    proxyProcess.on("exit", (code, signal) => {
      const msg = `Proxy.exe berhenti (kode: ${code}, sinyal: ${signal})`;
      console.log(msg);
      writeLog("EXIT", msg);
      proxyProcess = null;
    });

    const msg = "Proxy.exe berhasil dijalankan.";
    console.log(msg);
    writeLog("INFO", msg);
  } catch (err) {
    const msg = `Error saat memulai proxy: ${err.message}`;
    console.error(msg);
    writeLog("EXCEPTION", msg);
  }
}

// --- FUNGSI: Hentikan proxy.exe ---
function stopProxy() {
  // Guard: pastikan hanya jalan sekali (dipanggil dari before-quit & quit)
  if (_isStopping) return;
  _isStopping = true;

  if (proxyProcess) {
    const msg = "Menghentikan proxy.exe...";
    console.log(msg);
    // Tulis langsung ke logStream, JANGAN pakai writeLog (window mungkin sudah destroyed)
    logStream?.write(`[INFO] [${new Date().toISOString()}] ${msg}\n`);
    proxyProcess.kill();
    proxyProcess = null;
  }

  // Null-kan _mainWindow agar tidak ada lagi attempt kirim IPC
  _mainWindow = null;

  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

// --- FUNGSI: Dapatkan path log file ---
function getLogFilePath() {
  return logFilePath;
}

export {
  setupLogFile,
  startProxy,
  stopProxy,
  getLogFilePath,
  setMainWindow,
  writeLog,
};
