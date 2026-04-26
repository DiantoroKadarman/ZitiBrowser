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
    html += "<p class='text-gray-500'>Tidak ada identitas aktif.</p>";
  } else {
    state.activeIdentities.forEach((id) => {
      const isChecked = state.enabledIdentityIds.has(id.identity_id);
      html += `
        <div class="mb-3 p-3 ${!isChecked ? "bg-gray-100 opacity-75" : "bg-white"} flex justify-between items-start rounded-xl">
          <div class="flex-1">
            <p class="font-medium text-gray-800">${id.identity_name || "N/A"}</p>
            <p class="text-xs text-gray-500">ID: ${id.identity_id || "N/A"}</p>
          </div>
          <div class="flex items-center space-x-2 ml-3">
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" class="sr-only peer" ${isChecked ? "checked" : ""}
                onchange="toggleIdentityFromModal('${id.identity_id}')"/>
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
            <button type="button" class="text-red-500 hover:text-red-700" title="Hapus identitas ini"
              onclick="deleteIdentityFromModal('${id.identity_id}')">
              <img src="./icon/trash-red.svg" alt="Hapus" class="w-6 h-6"/>
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
