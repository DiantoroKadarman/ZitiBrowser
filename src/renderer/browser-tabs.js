// --- Browser Controls (Strict Whitelist Mode) ---
// Tidak ada browser tabs — hanya kontrol navigasi untuk service webviews

import { state } from "./state.js";
import { updateNavButtons } from "./webview.js";
import { renderSidebar } from "./service-tabs.js";

function setupBrowserListeners() {
  const backButton = document.getElementById("back-button");
  const forwardButton = document.getElementById("forward-button");
  const reloadButton = document.getElementById("reload-button");
  const searchButton = document.getElementById("search-button");

  // --- Identity Modal & Sidebar ---
  const identityButton = document.getElementById("identity-button");
  const identityModal = document.getElementById("identity-modal");
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebar-content");
  const collapseBtn = document.getElementById("collapse-btn");

  // --- Settings & Help (new sidebar footer buttons) ---
  const settingsButton = document.getElementById("settings-button");
  const helpButton = document.getElementById("help-button");

  // Home button — placeholder
  if (searchButton) {
    searchButton.addEventListener("click", () => {
      // Placeholder — belum ada aksi. Akan ditentukan nanti.
    });
  }

  // Navigasi: hanya mengacu ke service tab aktif
  backButton.addEventListener("click", () => {
    const webview = state.activeServiceTabId
      ? state.serviceTabs.get(state.activeServiceTabId)?.webview
      : null;
    if (webview) webview.goBack();
  });
  forwardButton.addEventListener("click", () => {
    const webview = state.activeServiceTabId
      ? state.serviceTabs.get(state.activeServiceTabId)?.webview
      : null;
    if (webview) webview.goForward();
  });
  reloadButton.addEventListener("click", () => {
    const webview = state.activeServiceTabId
      ? state.serviceTabs.get(state.activeServiceTabId)?.webview
      : null;
    if (webview) webview.reload();
  });

  // --- IDENTITY BUTTON (toolbar) ---
  if (identityButton) {
    identityButton.addEventListener("click", () => {
      import("./identity-modal.js").then((mod) => mod.displayIdentityData());
    });
  }

  // --- SETTINGS BUTTON (sidebar footer) → Identity Modal ---
  if (settingsButton) {
    settingsButton.addEventListener("click", () => {
      import("./identity-modal.js").then((mod) => mod.displayIdentityData());
    });
  }

  // --- HELP BUTTON (sidebar footer) → Proxy Log Modal ---
  if (helpButton) {
    helpButton.addEventListener("click", () => {
      import("./log-modal.js").then((mod) => mod.showProxyLog());
    });
  }

  // --- MODAL CLOSE (click overlay) ---
  if (identityModal) {
    identityModal.addEventListener("click", (e) => {
      if (e.target === identityModal) {
        identityModal.classList.add("hidden");
        identityModal.classList.remove("flex");
      }
    });
  }

  // --- SIDEBAR COLLAPSE ---
  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  }
}

export { setupBrowserListeners };
