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
  const closeModalButton = document.getElementById("close-modal-button");
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebar-content");
  const collapseBtn = document.getElementById("collapse-btn");

  // Home button — disediakan tapi belum ada proses di belakangnya
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

  // --- MODAL & SIDEBAR ---
  if (identityButton) {
    identityButton.addEventListener("click", () => {
      import("./identity-modal.js").then((mod) => mod.displayIdentityData());
    });
  }
  if (closeModalButton)
    closeModalButton.addEventListener("click", () => {
      identityModal.classList.add("hidden");
      identityModal.classList.remove("flex");
    });
  if (identityModal)
    identityModal.addEventListener("click", (e) => {
      if (e.target === identityModal) {
        identityModal.classList.add("hidden");
        identityModal.classList.remove("flex");
      }
    });
  if (collapseBtn)
    collapseBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      collapseBtn.classList.toggle("rotate-180");
      sidebarContent.classList.toggle("hidden");
    });
}

export { setupBrowserListeners };
