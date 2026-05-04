// --- Identity Modal (dalam browser mode) ---

import { state } from "./state.js";
import { renderSidebar } from "./service-tabs.js";

const identityModal = document.getElementById("identity-modal");
const identityDetailsContent = document.getElementById(
  "identity-details-content"
);

function displayIdentityData() {
  if (!identityModal || !identityDetailsContent) return;

  let html = "";
  if (state.activeIdentities.length === 0) {
    html += "<p class='text-sm text-gray-400 py-4 text-center'>Tidak ada identitas aktif.</p>";
  } else {
    state.activeIdentities.forEach((id) => {
      const isChecked = state.enabledIdentityIds.has(id.identity_id);
      html += `
        <div class="mb-3 p-3 rounded-xl border transition-colors ${!isChecked ? "bg-gray-50 opacity-75 border-gray-100" : "bg-white border-gray-200"} flex justify-between items-start">
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm text-gray-800">${id.identity_name || "N/A"}</p>
            <p class="text-xs text-gray-400 mt-0.5">ID: ${id.identity_id || "N/A"}</p>
          </div>
          <div class="flex items-center gap-3 ml-3">
            <label class="toggle-switch">
              <input type="checkbox" ${isChecked ? "checked" : ""}
                onchange="toggleIdentityFromModal('${id.identity_id}')"/>
              <span class="toggle-slider"></span>
            </label>
            <button type="button" class="text-gray-400 hover:text-red-500 transition-colors" title="Hapus identitas ini"
              onclick="deleteIdentityFromModal('${id.identity_id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    });
  }

  identityDetailsContent.innerHTML = html;
  identityModal.classList.remove("hidden");
  identityModal.classList.add("flex");
}

window.toggleIdentityFromModal = function (identityId) {
  // Use toggleIdentity from service-tabs (via window global)
  window.toggleIdentity(identityId);
  displayIdentityData();
};

window.deleteIdentityFromModal = async function (identityId) {
  if (!confirm("Yakin ingin menghapus identitas ini?")) return;

  try {
    await window.electronAPI.deleteIdentity(identityId);
    state.activeIdentities = state.activeIdentities.filter(
      (id) => id.identity_id !== identityId
    );
    state.enabledIdentityIds.delete(identityId);

    for (const [tabId, tab] of state.serviceTabs.entries()) {
      if (tab.identityId === identityId) {
        if (tab.webview?.parentNode) tab.webview.remove();
        state.serviceTabs.delete(tabId);
        if (state.activeServiceTabId === tabId)
          state.activeServiceTabId = null;
      }
    }

    renderSidebar();
    displayIdentityData();

    if (state.activeIdentities.length === 0) {
      identityModal.classList.add("hidden");
      identityModal.classList.remove("flex");
      // Lazy import to avoid circular dependency
      const { showScreen } = await import("./screens.js");
      showScreen("authentication");
    }
    console.log(`Identitas ${identityId} dihapus.`);
  } catch (err) {
    console.error("Gagal menghapus identitas:", err);
    alert("Gagal menghapus identitas. Coba lagi.");
  }
};

export { displayIdentityData };
