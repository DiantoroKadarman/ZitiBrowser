import { state } from "./state.js";
import { updateNavButtons, reloadActiveWebview, webviewContainer } from "./webview.js";
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

  // Home button — tutup semua tabs, kembali ke empty state "Pilih Service"
  if (searchButton) {
    searchButton.addEventListener("click", () => {
      // Hapus semua webview dari DOM
      for (const [, tab] of state.serviceTabs) {
        if (tab.webview?.parentNode) tab.webview.remove();
      }
      state.serviceTabs.clear();
      state.activeServiceTabId = null;

      // Tampilkan empty state
      const emptyState = document.getElementById("empty-state");
      if (emptyState) {
        emptyState.style.display = "flex";
      }

      // Refresh sidebar (hapus active highlight)
      renderSidebar();

      // Reset URL bar
      const urlInput = document.getElementById("url-input");
      if (urlInput) urlInput.value = "";

      updateNavButtons();
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
  // Reload: gunakan smart reload agar bisa recovery dari error state
  reloadButton.addEventListener("click", () => {
    reloadActiveWebview();
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
