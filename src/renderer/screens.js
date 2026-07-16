// --- Screen State Machine (Strict Whitelist Mode) ---

import { state } from "./state.js";
import {
  setupVaultPasswordScreen,
  setupPasswordVisibilityToggles,
} from "./password-prompt.js";
import { initProgressBar } from "./progress-bar.js";
import { renderSidebar } from "./service-tabs.js";
import {
  setupAuthListeners,
  refreshActiveIdentities,
  handleVaultUpdated,
  handleVaultUnlocked,
  displayIdentityOnVault,
} from "./auth.js";
import { setupBrowserListeners } from "./browser-tabs.js";
import { setupLogModal } from "./log-modal.js";
import { isUrlInActiveServiceDomain, reloadActiveWebview, injectBlockedNavigationPage } from "./webview.js";
import { setupThemeToggle } from "./theme-toggle.js";

const authScreen = document.getElementById("auth-screen");
const authBox = document.getElementById("auth-box");
const authDiv = document.getElementById("auth-div");

const processingIndicator = document.createElement("div");
processingIndicator.className = "processing-spinner";
processingIndicator.innerHTML = `<div class="spinner-ring"></div><p class="spinner-text">Memproses...</p>`;
processingIndicator.classList.add("hidden");
authDiv.appendChild(processingIndicator);

function showScreen(screen) {
  state.currentScreen = screen;
  const browserContainer = document.querySelector(".app-container");
  browserContainer.classList.toggle("hidden", screen !== "browser");
  authScreen.classList.toggle("hidden", screen === "browser");
  authBox.classList.add("hidden");
  document.getElementById("identity-list-screen")?.classList.add("hidden");
  document.getElementById("vault-password-screen")?.classList.add("hidden");
  processingIndicator.classList.add("hidden");

  switch (screen) {
    case "no-vault":
      authBox.classList.remove("hidden");
      document.getElementById("initial-setup-message")?.classList.remove("hidden");
      document.getElementById("empty-vault-message")?.classList.add("hidden");
      break;
    case "empty-vault":
      authBox.classList.remove("hidden");
      document.getElementById("initial-setup-message")?.classList.add("hidden");
      document.getElementById("empty-vault-message")?.classList.remove("hidden");
      break;
    case "identity-list":
      document.getElementById("identity-list-screen")?.classList.remove("hidden");
      break;
    case "processing":
      processingIndicator.classList.remove("hidden");
      break;
    case "need-vault-password":
      showScreen("vault-password");
      setupVaultPasswordScreen(showScreen, (pwd, identities) => {
        state.sessionVaultPassword = pwd;
        handleVaultUnlocked(identities);
      });
      break;
    case "vault-password":
      document.getElementById("vault-password-screen")?.classList.remove("hidden");
      break;
    case "browser":
      authScreen.classList.add("hidden");
      browserContainer.classList.remove("hidden");
      break;
  }
}

function handleInitialState(sessionState) {
  switch (sessionState.type) {
    case "no-vault": showScreen("no-vault"); break;
    case "need-vault-password":
      showScreen("vault-password");
      setupVaultPasswordScreen(showScreen, (pwd, identities) => {
        state.sessionVaultPassword = pwd;
        handleVaultUnlocked(identities);
      });
      break;
    case "empty-vault": showScreen("empty-vault"); break;
    case "show-identity-list":
      showScreen("identity-list");
      state.activeIdentities = sessionState.payload.identities;
      displayIdentityOnVault();
      break;
    default: showScreen("no-vault");
  }
}

async function init() {
  // window.open — hanya izinkan URL dalam domain service aktif
  window.electronAPI.onNewTabRequest((url) => {
    if (isUrlInActiveServiceDomain(url)) {
      console.log("[INFO] window.open diizinkan (domain service):", url);
      if (state.activeServiceTabId) {
        const tab = state.serviceTabs.get(state.activeServiceTabId);
        if (tab?.webview) tab.webview.src = url;
      }
    } else {
      console.warn("[BLOCKED] window.open diblokir:", url);
      // Tampilkan halaman peringatan di webview aktif
      if (state.activeServiceTabId) {
        const tab = state.serviceTabs.get(state.activeServiceTabId);
        if (tab?.webview) injectBlockedNavigationPage(tab.webview, url);
      }
    }
  });

  // will-navigate — tampilkan peringatan saat navigasi ke luar whitelist diblokir
  window.electronAPI.onNavigationBlocked((url) => {
    console.warn("[BLOCKED] Navigasi in-page diblokir:", url);
    if (state.activeServiceTabId) {
      const tab = state.serviceTabs.get(state.activeServiceTabId);
      if (tab?.webview) injectBlockedNavigationPage(tab.webview, url);
    }
  });

  initProgressBar();
  setupPasswordVisibilityToggles();
  setupBrowserListeners();
  setupLogModal();
  setupThemeToggle();

  // Ctrl+R / F5 → reload hanya webview aktif (bukan seluruh BrowserWindow)
  window.electronAPI.onReloadActiveWebview(() => {
    reloadActiveWebview();
  });

  try {
    const proxyState = await window.electronAPI.getActiveIdentitiesFromProxy();
    if (proxyState.success && proxyState.identities.length > 0) {
      state.activeIdentities = proxyState.identities;
      await refreshActiveIdentities();
      renderSidebar();
      showScreen("browser");
      return;
    }
    const vaultState = await window.electronAPI.checkSession();
    handleInitialState(vaultState);
  } catch (err) {
    console.error("Init error:", err);
    showScreen("no-vault");
  }

  window.electronAPI.onVaultUpdated(handleVaultUpdated);
  window.electronAPI.onVaultLocked(() => window.location.reload());

  document.getElementById("add-enroll-from-empty")?.addEventListener("click", () => {
    document.getElementById("enroll-jwt-file")?.click();
  });
  document.getElementById("add-upload-from-empty")?.addEventListener("click", () => {
    document.getElementById("identity-file-input")?.click();
  });
  setupAuthListeners();
}

export {showScreen, handleInitialState, init};
