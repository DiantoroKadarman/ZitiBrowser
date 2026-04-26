# 🔧 Proposal Refactor Struktur ZitiBrowser

## Masalah Utama

| File | Baris | Masalah |
|------|-------|---------|
| `renderer.js` | **~2000** | Campur aduk: auth flow, browser tabs, sidebar, modals, SSL, progress bar, error pages — semua di 1 file |
| `main.js` | **~976** | Campur aduk: vault encryption, proxy management, API calls, semua IPC handlers |
| `index.html` | **~568** | Semua screen (auth, browser, modals) dalam 1 HTML — sulit navigasi |

> [!IMPORTANT]
> `preload.js` (67 baris) sudah cukup bersih — **tidak perlu diubah**.

---

## Struktur yang Disarankan

### Sebelum (Sekarang)
```
src/
├── main.js          ← 976 baris, semua logic main process
├── preload.js       ← 67 baris ✅ sudah oke
├── renderer.js      ← 2000 baris, semua logic renderer
└── index.css        ← 151 baris ✅ sudah oke
```

### Sesudah (Refactored)
```
src/
├── main/
│   ├── main.js              ← Entry point, app lifecycle saja (~80 baris)
│   ├── proxy.js             ← Start/stop proxy, log file (~100 baris)
│   ├── vault.js             ← Vault CRUD, enkripsi/dekripsi (~200 baris)
│   ├── api.js               ← makeApiRequest, extractNameFromJwt (~80 baris)
│   ├── ipc-handlers.js      ← Semua ipcMain.handle(...) (~300 baris)
│   └── ssl.js               ← SSL certificate handler (~80 baris)
│
├── renderer/
│   ├── renderer.js          ← Entry point, init() + event wiring (~100 baris)
│   ├── screens.js           ← showScreen(), handleInitialState() (~80 baris)
│   ├── auth.js              ← Auth flow: enrollment, upload, vault password (~250 baris)
│   ├── browser-tabs.js      ← Tab CRUD: create, remove, switch, render (~150 baris)
│   ├── service-tabs.js      ← Service tab logic + sidebar render (~150 baris)
│   ├── identity-modal.js    ← Identity modal di browser mode (~100 baris)
│   ├── ssl-modal.js         ← SSL warning modal logic (~150 baris)
│   ├── webview.js           ← createWebview, attachListeners, error page (~200 baris)
│   ├── progress-bar.js      ← Progress bar functions (~40 baris)
│   ├── password-prompt.js   ← showPasswordPrompt(), setupVaultPasswordScreen() (~170 baris)
│   └── log-modal.js         ← Proxy log viewer (~50 baris)
│
├── preload.js               ← Tidak berubah ✅
└── index.css                ← Tidak berubah ✅
```

---

## Detail Per Modul

### Main Process

#### `main/main.js` — Entry Point
Hanya berisi app lifecycle, tidak ada business logic.

```js
// main/main.js
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { setupLogFile, startProxy, stopProxy } from './proxy.js';
import { registerAllHandlers } from './ipc-handlers.js';
import { setupSSLHandler } from './ssl.js';

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1000,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
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
};

if (started) app.quit();

app.whenReady().then(() => {
  setupLogFile();
  startProxy();
  createWindow();
  registerAllHandlers(mainWindow);   // ← semua IPC handler
  setupSSLHandler(mainWindow);        // ← SSL certificate logic
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', stopProxy);
app.on('quit', stopProxy);

export { mainWindow };
```

#### `main/vault.js` — Vault Management
Semua yang berhubungan dengan vault terenkripsi.

```js
// main/vault.js — berisi:
// - Konstanta enkripsi (ALGORITHM, KEY_LENGTH, dll)
// - deriveKey(), encryptStringWithPassword(), decryptStringWithPassword()
// - getVaultPath(), vaultExists(), readVault(), writeVault()
// - addIdentityToVault(), removeIdentityFromVault()
// - determineInitialState()
// - vaultLock (mutex)
// - currentVaultPassword (state)

export {
  vaultExists, readVault, writeVault,
  addIdentityToVault, removeIdentityFromVault,
  determineInitialState,
  getCurrentPassword, setCurrentPassword, clearPassword,
};
```

#### `main/proxy.js` — Proxy Lifecycle
```js
// main/proxy.js — berisi:
// - setupLogFile()
// - startProxy() — spawn zitihttproxy.exe
// - stopProxy()
// - getProxyPath(), getProjectRoot()
```

#### `main/api.js` — HTTP API Utilities
```js
// main/api.js — berisi:
// - PROXY_HOST, PROXY_PORT, API_PORT, URL constants
// - makeApiRequest()
// - extractNameFromJwt()
```

#### `main/ipc-handlers.js` — Semua IPC Handlers
```js
// main/ipc-handlers.js
// Satu function registerAllHandlers(mainWindow) yang mendaftarkan semua:
// - handle-enrollment
// - handle-identity-upload
// - vault:check-exists, vault:unlock, vault:get-identities, dll
// - delete-identity, check-session, logout
// - detect-service-protocol
// - vault:login-selected
// - proxy:get-active-identities, proxy:get-log-content
```

#### `main/ssl.js` — SSL Certificate Handling
```js
// main/ssl.js — berisi:
// - approvedHosts Set
// - setupSSLHandler(mainWindow) — register app.on('certificate-error', ...)
// - IPC handlers: ssl:approve-certificate, ssl:is-approved
```

---

### Renderer Process

#### `renderer/renderer.js` — Entry Point
Hanya wiring, tidak ada business logic.

```js
// renderer/renderer.js
import '../index.css';
import { init } from './screens.js';
import { setupAuthListeners } from './auth.js';
import { setupBrowserListeners } from './browser-tabs.js';
import { setupLogModal } from './log-modal.js';
import { loadSSLModal } from './ssl-modal.js';
import { initProgressBar } from './progress-bar.js';

document.addEventListener('DOMContentLoaded', () => {
  initProgressBar();
  setupBrowserListeners();  // nav buttons, url input, sidebar
  setupLogModal();
  setupAuthListeners();
  init();                    // check session → show correct screen

  // Load SSL modal lazily
  if (requestIdleCallback) {
    requestIdleCallback(() => loadSSLModal());
  } else {
    setTimeout(() => loadSSLModal(), 100);
  }
});
```

#### `renderer/screens.js` — Screen State Machine
```js
// renderer/screens.js — berisi:
// - currentScreen state
// - showScreen(screen) — switch between auth/browser/vault-password/etc
// - handleInitialState(sessionState)
// - init() — check session, check proxy, determine initial screen
```

#### `renderer/auth.js` — Authentication Flow
```js
// renderer/auth.js — berisi:
// - setupAuthListeners() — enrollment form, upload button, file input
// - triggerFileUpload(type)
// - handleLoginSelection()
// - RemoveIdentityFromVault()
// - showUploadIdentityDialog()
// - displayIdentityOnVault() + toggleSelectAll, toggleIdentitySelection
```

#### `renderer/browser-tabs.js` — Browser Tab Management
```js
// renderer/browser-tabs.js — berisi:
// - tabs[] state
// - createBrowserTab(), removeBrowserTab(), switchToBrowserTab()
// - renderTabs()
// - handleUrl()
// - setupBrowserListeners() — back, forward, reload, home, new tab
```

#### `renderer/service-tabs.js` — Service Tab & Sidebar
```js
// renderer/service-tabs.js — berisi:
// - serviceTabs Map, activeServiceTabId
// - openServiceTab(), switchToServiceTab()
// - renderSidebar()
// - toggleIdentity()
```

#### `renderer/webview.js` — Webview Factory & Listeners
```js
// renderer/webview.js — berisi:
// - createWebviewForTab()
// - attachWebviewListeners()
// - injectWebviewErrorPage()
// - mapErrorCodeToMessage()
// - showWebview(), updateNavButtons()
```

#### `renderer/password-prompt.js` — Password UI
```js
// renderer/password-prompt.js — berisi:
// - showPasswordPrompt()
// - setupVaultPasswordScreen()
// - Toggle visibility listeners (3x)
```

#### `renderer/identity-modal.js` — Identity Modal (Browser Mode)
```js
// renderer/identity-modal.js — berisi:
// - displayIdentityData()
// - toggleIdentityFromModal()
// - deleteIdentityFromModal()
```

---

## Shared State

Beberapa state perlu diakses lintas modul. Ada 2 pendekatan:

### Opsi A: Simple State Module (Recommended)
Buat 1 file `renderer/state.js` yang meng-export shared state:

```js
// renderer/state.js
export const state = {
  tabs: [],
  currentTabIndex: 0,
  activeIdentities: [],
  enabledIdentityIds: new Set(),
  activeServiceTabId: null,
  serviceTabs: new Map(),
  currentScreen: 'no-vault',
  sessionVaultPassword: null,
  selectedIdentities: new Set(),
  pendingCertificateError: null,
};
```

Setiap modul import `state` dan mutate langsung:
```js
import { state } from './state.js';
state.tabs.push(newTab);
state.currentTabIndex = 0;
```

### Opsi B: Getter/Setter (Lebih Strict)
Kalau mau lebih ketat, bisa pakai getter/setter, tapi untuk project skala ini **Opsi A sudah cukup**.

---

## Apa yang TIDAK Perlu Diubah

| File | Alasan |
|------|--------|
| `preload.js` | Sudah clean, hanya bridge IPC |
| `index.css` | Kecil dan focused |
| `index.html` | Bisa tetap 1 file — splitting HTML ke komponen butuh framework (overkill) |
| `forge.config.js` | Config file, sudah bersih |
| `vite.*.config.mjs` | Minimal config, tidak perlu disentuh |

> [!NOTE]
> `index.html` memang besar (568 baris), tapi tanpa framework (React/Vue), splitting HTML tidak praktis. Biarkan saja — yang penting JS-nya modular.

---

## Perubahan Vite Config

Setelah refactor, entry point berubah. Update `forge.config.js`:

```diff
 build: [
   {
-    entry: "src/main.js",
+    entry: "src/main/main.js",
     config: "vite.main.config.mjs",
     target: "main",
   },
   // preload tetap sama
 ],
```

Dan `renderer.js` entry di `vite.renderer.config.mjs` perlu menunjuk ke `src/renderer/renderer.js`.

---

## Strategi Migrasi (Step-by-Step)

> [!TIP]
> **Jangan refactor sekaligus.** Lakukan bertahap agar tidak break app.

### Phase 1 — Main Process (Risiko rendah)
1. Pindahkan vault logic → `main/vault.js`
2. Pindahkan proxy logic → `main/proxy.js`
3. Pindahkan API utilities → `main/api.js`
4. Pindahkan SSL handler → `main/ssl.js`
5. Bungkus IPC handlers → `main/ipc-handlers.js`
6. Bersihkan `main.js` jadi entry point saja
7. **Test**: pastikan app masih jalan normal

### Phase 2 — Renderer Process (Lebih berisiko)
1. Buat `renderer/state.js` dulu
2. Extract `progress-bar.js` (paling kecil, paling mudah)
3. Extract `log-modal.js`
4. Extract `password-prompt.js`
5. Extract `webview.js`
6. Extract `browser-tabs.js` + `service-tabs.js`
7. Extract `identity-modal.js`
8. Extract `auth.js`
9. Extract `ssl-modal.js`
10. Extract `screens.js`
11. Bersihkan `renderer.js` jadi entry point
12. **Test setiap step**

---

## Estimasi Hasil

| Metrik | Sebelum | Sesudah |
|--------|---------|---------|
| File terbesar | 2000 baris | ~300 baris |
| Jumlah file JS | 3 | ~18 |
| Waktu cari logic | Scroll banyak | Langsung ke file yang tepat |
| Risiko conflict (git) | Tinggi (1 file) | Rendah (file kecil) |

> [!CAUTION]
> Refactor ini **tidak mengubah logic atau fitur sama sekali** — hanya memindahkan code ke file yang tepat. Pastikan setiap phase diakhiri dengan testing lengkap.
