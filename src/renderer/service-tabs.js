// --- Service Tab & Sidebar ---

import { state } from "./state.js";
import {
  attachWebviewListeners,
  showWebview,
  updateNavButtons,
  getServiceTabId,
  webviewContainer,
} from "./webview.js";

const urlInputField = document.getElementById("url-input");
const goButton = document.getElementById("go");

function renderSidebar() {
  const serviceTabsContainer = document.getElementById(
    "service-tabs-container"
  );
  if (!serviceTabsContainer) return;

  const enabledIdentities = state.activeIdentities.filter((id) =>
    state.enabledIdentityIds.has(id.identity_id)
  );
  if (enabledIdentities.length === 0) {
    serviceTabsContainer.innerHTML = `<p style='color: #666; padding: 10px;'>Tidak ada identitas yang diaktifkan.</p>`;
    return;
  }

  let html = "";
  enabledIdentities.forEach((identity) => {
    const servicesHtml =
      identity.services
        ?.map((service) => {
          const tabId = getServiceTabId(identity.identity_id, service);
          const isActive = tabId === state.activeServiceTabId;
          return `
            <button type="button" class="flex items-center w-full p-2 rounded-md transition-colors duration-200 space-x-2 tab hover:bg-gray-300 ${isActive ? "bg-blue-200 font-semibold" : ""}"
              onclick="openServiceTab('${identity.identity_id}', '${service.replace(/'/g, "\\'")}')"
              title="Akses: ${service}">
              <span class='text-sm'>${service}</span>
            </button>
          `;
        })
        .join("") ||
      '<p class="text-gray-500 px-2">Identity tidak mempunyai service</p>';

    html += `
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-semibold text-gray-800">${identity.identity_name}</h4>
        </div>
        <div class="ml-2">${servicesHtml}</div>
      </div>
    `;
  });

  serviceTabsContainer.innerHTML = html;
}

window.toggleIdentity = function (identityId) {
  state.enabledIdentityIds.has(identityId)
    ? state.enabledIdentityIds.delete(identityId)
    : state.enabledIdentityIds.add(identityId);
  renderSidebar();
};

window.openServiceTab = async function (identityId, serviceName) {
  const tabId = getServiceTabId(identityId, serviceName);
  if (state.serviceTabs.has(tabId)) {
    switchToServiceTab(tabId);
    return;
  }

  // 🔍 Deteksi protokol via main process (lebih andal)
  let protocol;
  try {
    protocol = await window.electronAPI.detectServiceProtocol(serviceName);
  } catch (err) {
    console.warn(`Gagal deteksi protokol untuk ${serviceName}:`, err);
    protocol = "https"; // fallback aman
  }

  const fullUrl = `${protocol}://${serviceName}`;
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

  state.serviceTabs.set(tabId, {
    id: tabId,
    identityId,
    serviceName,
    webview,
    title: `${serviceName} (${identityId.substring(0, 6)})`,
  });

  attachWebviewListeners(webview, true, identityId, serviceName);
  webview.src = fullUrl;
  switchToServiceTab(tabId);
};

function switchToServiceTab(tabId) {
  const serviceTab = state.serviceTabs.get(tabId);
  if (!serviceTab) return;

  showWebview(serviceTab.webview);
  urlInputField.value = `http://${serviceTab.serviceName}`;
  urlInputField.disabled = true;
  goButton.disabled = true;
  state.activeServiceTabId = tabId;
  renderSidebar();
  updateNavButtons();
}

export { renderSidebar, switchToServiceTab, getServiceTabId };
