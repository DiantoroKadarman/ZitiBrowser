// --- Webview Factory & Listeners (Strict Whitelist Mode) ---
// Semua webview = service webview. Tidak ada browser tab.

import { state } from "./state.js";
import {
  showProgressBar,
  updateProgress,
  completeProgress,
} from "./progress-bar.js";

const webviewContainer = document.getElementById("webview-container");

function createWebviewForTab(url) {
  const webview = document.createElement("webview");
  webview.setAttribute("nodeintegration", "false");
  webview.setAttribute("plugins", "false");
  webview.setAttribute("disablewebsecurity", "false");
  webview.setAttribute("allowpopups", "true");
  webview.setAttribute(
    "webpreferences",
    "contextIsolation=true, nativeWindowOpen=true"
  );
  webview.style.width = "100%";
  webview.style.height = "100%";
  webview.classList.add("hidden");
  webviewContainer.appendChild(webview);
  return webview;
}

function showWebview(targetWebview) {
  const allWebviews = Array.from(state.serviceTabs.values()).map(
    (s) => s.webview
  );
  allWebviews
    .filter((wv) => wv && wv !== targetWebview)
    .forEach((wv) => wv.classList.add("hidden"));

  if (targetWebview) {
    targetWebview.classList.remove("hidden");
  }
}

function updateNavButtons() {
  const backButton = document.getElementById("back-button");
  const forwardButton = document.getElementById("forward-button");

  let canGoBack = false;
  let canGoForward = false;

  if (state.activeServiceTabId) {
    const tab = state.serviceTabs.get(state.activeServiceTabId);
    if (tab?.webview) {
      try {
        canGoBack = tab.webview.canGoBack();
      } catch (e) {}
      try {
        canGoForward = tab.webview.canGoForward();
      } catch (e) {}
    }
  }

  backButton.disabled = !canGoBack;
  forwardButton.disabled = !canGoForward;
}

function getServiceTabId(identityId, serviceName) {
  return `${identityId}::${serviceName}`;
}

function attachWebviewListeners(
  webview,
  isService = true,
  identityId = "",
  serviceName = ""
) {
  const urlInputField = document.getElementById("url-input");

  const updateUrlField = (url) => {
    if (url.startsWith("data:") || url.startsWith("ziti-")) return;
    const tabId = getServiceTabId(identityId, serviceName);
    if (state.activeServiceTabId === tabId) {
      urlInputField.value = url;
    }
  };

  // ✅ PROGRESS BAR: start
  webview.addEventListener("did-start-loading", () => {
    const isActive =
      state.serviceTabs.get(state.activeServiceTabId)?.webview === webview;
    if (isActive) {
      showProgressBar();
    }
  });

  // ✅ PROGRESS BAR: update
  if (typeof webview.addEventListener === "function") {
    webview.addEventListener("did-progress-load", (e) => {
      if (e.value && e.value > 0) {
        const isActive =
          state.serviceTabs.get(state.activeServiceTabId)?.webview === webview;
        if (isActive) {
          updateProgress(e.value * 100);
        }
      }
    });
  }

  // ✅ PROGRESS BAR: finish
  webview.addEventListener("did-finish-load", () => {
    const isActive =
      state.serviceTabs.get(state.activeServiceTabId)?.webview === webview;
    if (isActive) {
      completeProgress(true);
    }
  });

  // ✅ PROGRESS BAR: error
  webview.addEventListener("did-fail-load", (e) => {
    if (e.errorCode === -3) return; // aborted

    const isActive =
      state.serviceTabs.get(state.activeServiceTabId)?.webview === webview;
    if (isActive) {
      completeProgress(false);
      const errorMsg = mapErrorCodeToMessage(
        e.errorCode,
        e.errorDescription,
        e.validatedURL
      );
      injectWebviewErrorPage(webview, {
        message: errorMsg,
        errorCode: e.errorCode,
        url: e.validatedURL || "—",
      });
    }
  });

  webview.addEventListener("did-navigate", (e) => updateUrlField(e.url));
  webview.addEventListener("did-navigate-in-page", (e) =>
    updateUrlField(e.url)
  );
  webview.addEventListener("load-commit", updateNavButtons);
}

function injectWebviewErrorPage(webview, { message, errorCode, url }) {
  if (webview.__hasInjectedError) return;

  const safeMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeUrl = url ? url.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "—";

  const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Ziti Browser</title>
  <style>
    body {
      background-color: #ffffff;
      color: #202124;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      padding: 2rem;
      text-align: center;
    }
    .warning-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: #1e293b;
    }
    p {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0.5rem 0 1rem;
    }
    .url-display {
      font-family: ui-monospace, SFMono-Regular, monospace;
      background: #f1f5f9;
      padding: 0.25rem 0.75rem;
      border-radius: 0.5rem;
      color: #334155;
      font-size: 0.75rem;
      display: inline-block;
      max-width: 100%;
      word-break: break-all;
      margin: 0.5rem 0;
    }
    .error-code {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 1rem;
      font-family: monospace;
    }
    .info-box {
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 1rem;
      margin: 1.5rem 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #475569;
    }
    .info-icon {
      font-size: 1.2rem;
      color: #64748b;
    }
    .btn-group {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-top: 1.5rem;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
      outline: none;
    }
    .btn-advanced {
      background-color: transparent;
      color: #2563eb;
      border: 1px solid #2563eb;
    }
    .btn-advanced:hover {
      background-color: rgba(37, 99, 235, 0.05);
    }
    .btn-back {
      background-color: #2563eb;
      color: white;
    }
    .btn-back:hover {
      background-color: #1d4ed8;
    }
    a {
      color: #2563eb;
      text-decoration: underline;
    }
    a:hover {
      color: #1d4ed8;
    }
  </style>
</head>
<body>
  <div class="container">
    <svg class="warning-icon" viewBox="0 0 24 24" fill="#ef4444">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </svg>

    <!-- Pesan Error Dinamis -->
    <h1>${safeMessage || "Gagal Memuat Halaman"}</h1>

    <!-- Tampilkan URL jika tersedia -->
    ${url ? `<p><span class="url-display">${safeUrl}</span></p>` : ""}

    <!-- Kode Error -->
    <p class="error-code">${errorCode || "Unknown Error"}</p>

</body>
</html>`;

  webview.__hasInjectedError = true;
  webview.loadURL(`data:text/html,${encodeURIComponent(errorHtml)}`);
}

function mapErrorCodeToMessage(code, description, url = "") {
  const hostname = url ? new URL(url).hostname : "server";

  switch (code) {
    case -105: // net::ERR_NAME_NOT_RESOLVED
      return `Nama domain tidak ditemukan: ${hostname}`;
    case -102: // net::ERR_CONNECTION_REFUSED
    case -104: // net::ERR_CONNECTION_RESET
      return `Koneksi ditolak oleh ${hostname}`;
    case -118: // net::ERR_CONNECTION_TIMED_OUT
      return `Koneksi ke ${hostname} timeout`;
    case -21: // net::ERR_CERT_AUTHORITY_INVALID (self-signed, tp di-allow di main)
      return `Sertifikat tidak valid — tetapi diizinkan karena SSL self-signed.`;
    case -3: // net::ERR_ABORTED (biasanya cancel/back/reload)
    case -300: // net::ERR_INSECURE_RESPONSE (sudah di-allow via cert handler)
      return "Permintaan dibatalkan.";
    case 404:
      return `Halaman tidak ditemukan (404) di ${hostname}`;
    case 400:
      return `Permintaan tidak valid (400)`;
    case 500:
      return `Server error (500) di ${hostname}`;
    default:
      return `Gagal memuat: ${description || "Error tidak diketahui."}`;
  }
}

/**
 * Cek apakah URL berada dalam domain service yang sedang aktif.
 * Digunakan untuk memfilter window.open requests.
 */
function isUrlInActiveServiceDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Cek semua service tabs yang aktif
    for (const [, tab] of state.serviceTabs) {
      if (tab.serviceName === hostname) {
        return true;
      }
    }

    // Cek semua services dari active identities
    for (const identity of state.activeIdentities) {
      if (identity.services?.includes(hostname)) {
        return true;
      }
    }
  } catch (e) {
    // URL tidak valid
  }
  return false;
}

export {
  createWebviewForTab,
  showWebview,
  updateNavButtons,
  getServiceTabId,
  attachWebviewListeners,
  injectWebviewErrorPage,
  mapErrorCodeToMessage,
  isUrlInActiveServiceDomain,
  webviewContainer,
};
