import { app } from "electron";
import path from "node:path";
import { spawn } from "child_process";

// --- STATE ---
let proxyProcess = null;
let logStream = null;
let logFilePath = "";
let _mainWindow = null;

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

// --- FUNGSI: Set mainWindow reference untuk log updates ---
function setMainWindow(win) {
  _mainWindow = win;
}

// --- FUNGSI: Jalankan proxy.exe ---
function startProxy() {
  if (process.platform !== "win32") {
    const msg = "Proxy.exe hanya berjalan di Windows.";
    console.log(msg);
    logStream?.write(`[ERROR] ${msg}\n`);
    _mainWindow?.webContents.send("proxy-log-update", msg);
    return;
  }

  const proxyPath = getProxyPath();
  const fsSync = require("fs");
  if (!fsSync.existsSync(proxyPath)) {
    const msg = `File proxy tidak ditemukan di: ${proxyPath}`;
    console.error(msg);
    logStream?.write(`[ERROR] ${msg}\n`);
    _mainWindow?.webContents.send("proxy-log-update", msg);
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
      _mainWindow?.webContents.send("proxy-log-update", text);
    });

    proxyProcess.stderr.on("data", (data) => {
      const text = "[STDERR] " + data.toString();
      logStream?.write(text);
      _mainWindow?.webContents.send("proxy-log-update", text);
    });

    proxyProcess.on("error", (err) => {
      const msg = `Gagal menjalankan proxy.exe: ${err.message}`;
      console.error(msg);
      logStream?.write(`[ERROR] ${msg}\n`);
      _mainWindow?.webContents.send("proxy-log-update", msg);
    });

    proxyProcess.on("exit", (code, signal) => {
      const msg = `Proxy.exe berhenti (kode: ${code}, sinyal: ${signal})`;
      console.log(msg);
      logStream?.write(`[EXIT] ${msg}\n`);
      _mainWindow?.webContents.send("proxy-log-update", msg);
      proxyProcess = null;
    });

    const msg = "Proxy.exe berhasil dijalankan.";
    console.log(msg);
    logStream?.write(`[INFO] ${msg}\n`);
    _mainWindow?.webContents.send("proxy-log-update", msg);
  } catch (err) {
    const msg = `Error saat memulai proxy: ${err.message}`;
    console.error(msg);
    logStream?.write(`[EXCEPTION] ${msg}\n`);
    _mainWindow?.webContents.send("proxy-log-update", msg);
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

// --- FUNGSI: Dapatkan path log file ---
function getLogFilePath() {
  return logFilePath;
}

export { setupLogFile, startProxy, stopProxy, getLogFilePath, setMainWindow };
