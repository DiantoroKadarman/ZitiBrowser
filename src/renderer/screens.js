// --- Screen State Machine ---

import { state } from "./state.js";
import {
  setupVaultPasswordScreen,
  setupPasswordVisibilityToggles,
} from "./password-prompt.js";
import { initProgressBar } from "./progress-bar.js";
import { createBrowserTab } from "./browser-tabs.js";
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

// --- REFERENSI ELEMEN ---
const authScreen = document.getElementById("auth-screen");
const authBox = document.getElementById("auth-box");
const authDiv = document.getElementById("auth-div");

// --- INDICATOR PROSES ---
const processingIndicator = document.createElement("div");
processingIndicator.className = "text-center";
processingIndicator.innerHTML = `<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div><p class="text-lg text-gray-700">Memproses...</p>`;
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
      document
        .getElementById("initial-setup-message")
        ?.classList.remove("hidden");
      document.getElementById("empty-vault-message")?.classList.add("hidden");
      break;
    case "empty-vault":
      authBox.classList.remove("hidden");
      document.getElementById("initial-setup-message")?.classList.add("hidden");
      document
        .getElementById("empty-vault-message")
        ?.classList.remove("hidden");
      break;
    case "identity-list":
      document
        .getElementById("identity-list-screen")
        ?.classList.remove("hidden");
      break;
    case "processing":
      processingIndicator.classList.remove("hidden");
      break;

    case "need-vault-password":
      console.log("Menampilkan layar need-vault-password juga");
      showScreen("vault-password");
      setupVaultPasswordScreen(showScreen, (pwd, identities) => {
        state.sessionVaultPassword = pwd;
        handleVaultUnlocked(identities);
      });
      break;
    case "vault-password":
      console.log("Menampilkan layar password vault");
      document
        .getElementById("vault-password-screen")
        ?.classList.remove("hidden");
      break;
    case "browser":
      authScreen.classList.add("hidden");
      browserContainer.classList.remove("hidden");
      break;
  }
}

function handleInitialState(sessionState) {
  switch (sessionState.type) {
    case "no-vault":
      showScreen("no-vault");
      break;

    case "need-vault-password":
      showScreen("vault-password");
      setupVaultPasswordScreen(showScreen, (pwd, identities) => {
        state.sessionVaultPassword = pwd;
        handleVaultUnlocked(identities);
      });
      break;

    case "empty-vault":
      showScreen("empty-vault");
      break;

    case "show-identity-list":
      showScreen("identity-list");
      state.activeIdentities = sessionState.payload.identities;
      displayIdentityOnVault();
      break;

    default:
      showScreen("no-vault");
  }
}

async function init() {
  window.electronAPI.onNewTabRequest((url) => {
    console.log("[INFO] Membuka tab baru dari window.open:", url);
    if (state.tabs.length === 0 && state.serviceTabs.size === 0) {
      createBrowserTab("https://www.google.com");
    }
    createBrowserTab(url);
  });

  initProgressBar();
  setupPasswordVisibilityToggles();
  setupBrowserListeners();
  setupLogModal();

  try {
    // 1. Apakah ada identitas aktif di proxy? (artinya session masih jalan)
    const proxyState =
      await window.electronAPI.getActiveIdentitiesFromProxy();

    if (proxyState.success && proxyState.identities.length > 0) {
      state.activeIdentities = proxyState.identities;
      await refreshActiveIdentities(); // isi services lengkap
      renderSidebar();
      showScreen("browser");
      if (state.tabs.length === 0) {
        createBrowserTab("https://www.google.com");
      }
      return;
    }
    const vaultState = await window.electronAPI.checkSession();
    handleInitialState(vaultState);
  } catch (err) {
    console.error("Init error:", err);
    showScreen("no-vault");
  }

  window.electronAPI.onVaultUpdated(handleVaultUpdated);
  window.electronAPI.onVaultLocked(() => {
    window.location.reload();
  });

  document
    .getElementById("add-enroll-from-empty")
    ?.addEventListener("click", () => {
      document.getElementById("enroll-jwt-file")?.click();
    });
  document
    .getElementById("add-upload-from-empty")
    ?.addEventListener("click", () => {
      document.getElementById("identity-file-input")?.click();
    });
  setupAuthListeners();
}

export { showScreen, handleInitialState, init };
