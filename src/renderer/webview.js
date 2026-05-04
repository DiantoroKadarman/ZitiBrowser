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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body {
      background-color: #f9fafb;
      color: #111827;
      font-family: 'Inter', -apple-system, sans-serif;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      line-height: 1.6;
    }
    .container {
      max-width: 480px;
      padding: 2rem;
      text-align: center;
    }
    .error-icon {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      background-color: #fef2f2;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
    }
    .error-icon svg {
      width: 28px;
      height: 28px;
      color: #ef4444;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #111827;
    }
    p {
      font-size: 0.875rem;
      color: #6b7280;
      margin: 0.25rem 0;
    }
    .url-display {
      font-family: ui-monospace, 'Cascadia Code', monospace;
      background: #f3f4f6;
      padding: 0.25rem 0.75rem;
      border-radius: 8px;
      color: #374151;
      font-size: 0.75rem;
      display: inline-block;
      max-width: 100%;
      word-break: break-all;
      margin: 0.75rem 0;
    }
    .error-code {
      font-size: 0.7rem;
      color: #9ca3af;
      margin-top: 1rem;
      font-family: ui-monospace, monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    </div>
    <h1>${safeMessage || "Gagal Memuat Halaman"}</h1>
    ${url ? `<p><span class="url-display">${safeUrl}</span></p>` : ""}
    <p class="error-code">${errorCode || "Unknown Error"}</p>
  </div>
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
