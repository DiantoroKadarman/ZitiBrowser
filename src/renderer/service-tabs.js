// --- Service Tab & Sidebar (Strict Whitelist Mode) ---
// Service tabs are the only tabs — no browser tabs exist.

import { state } from "./state.js";
import {
  attachWebviewListeners,
  showWebview,
  showLoadingOverlay,
  updateNavButtons,
  getServiceTabId,
  webviewContainer,
} from "./webview.js";

const urlInputField = document.getElementById("url-input");

// === DEV WHITELIST — Hapus blok ini saat production ===
const DEV_WHITELIST = [
  { label: "Ziti Console", url: "https://ctrl.ziti.local:1280/zac/" },
  // Tambahkan URL dev lainnya di sini:
  // { label: "Grafana", url: "http://grafana.local:3000" },
];
// === END DEV WHITELIST ===

function renderSidebar() {
  const serviceTabsContainer = document.getElementById(
    "service-tabs-container"
  );
  if (!serviceTabsContainer) return;

  const enabledIdentities = state.activeIdentities.filter((id) =>
    state.enabledIdentityIds.has(id.identity_id)
  );
  if (enabledIdentities.length === 0 && DEV_WHITELIST.length === 0) {
    serviceTabsContainer.innerHTML = `<p class="text-sm text-gray-400 px-2 py-3">Tidak ada identitas yang diaktifkan.</p>`;
    return;
  }

  let html = "";
  enabledIdentities.forEach((identity) => {
    // Identity label
    html += `<div class="service-identity-label">${identity.identity_name}</div>`;

    const servicesHtml =
      identity.services
        ?.map((service) => {
          const tabId = getServiceTabId(identity.identity_id, service);
          const isActive = tabId === state.activeServiceTabId;
          return `
            <button type="button" class="service-item ${isActive ? "active" : ""}"
              data-tab-id="${tabId}"
              onclick="openServiceTab('${identity.identity_id}', '${service.replace(/'/g, "\\'")}')"
              title="Akses: ${service}">
              <span class="status-dot"></span>
              <span>${service}</span>
            </button>
          `;
        })
        .join("") ||
      '<p class="text-sm text-gray-400 px-4 py-2">Tidak ada service</p>';

    html += `<div class="px-1">${servicesHtml}</div>`;
  });

  // === DEV WHITELIST RENDERING ===
  if (DEV_WHITELIST.length > 0) {
    html += `
      <div class="mt-3 pt-3 border-t border-gray-200">
        <div class="sidebar-section-label" style="padding-left:4px">Dev Shortcuts</div>
        <div class="px-1">
          ${DEV_WHITELIST.map((item, i) => {
            const tabId = `dev::${i}`;
            const isActive = tabId === state.activeServiceTabId;
            return `
              <button type="button" class="service-item ${isActive ? "active" : ""}"
                data-tab-id="${tabId}"
                onclick="openDevTab(${i})"
                title="${item.url}">
                <span class="status-dot" style="background-color: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,0.2)"></span>
                <span>⚡ ${item.label}</span>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }
  // === END DEV WHITELIST RENDERING ===

  serviceTabsContainer.innerHTML = html;

  // Show/hide empty state based on active service tab
  const emptyState = document.getElementById("empty-state");
  if (emptyState) {
    emptyState.style.display = state.activeServiceTabId ? "none" : "flex";
  }
}

// === DEV WHITELIST — Tab handler ===
window.openDevTab = function (index) {
  const item = DEV_WHITELIST[index];
  if (!item) return;

  const tabId = `dev::${index}`;
  if (state.serviceTabs.has(tabId)) {
    switchToServiceTab(tabId);
    return;
  }

  const webview = document.createElement("webview");
  webview.setAttribute("nodeintegration", "false");
  webview.setAttribute("plugins", "false");
  webview.setAttribute("disablewebsecurity", "false");
  webview.setAttribute("allowpopups", "true");
  webview.setAttribute("webpreferences", "contextIsolation=true, nativeWindowOpen=true");
  webview.style.width = "100%";
  webview.style.height = "100%";
  webview.classList.add("hidden");
  webview.__originalUrl = item.url; // Simpan URL asli untuk recovery dari error
  webviewContainer.appendChild(webview);

  state.serviceTabs.set(tabId, {
    id: tabId,
    identityId: "dev",
    serviceName: item.label,
    webview,
    title: item.label,
  });

  attachWebviewListeners(webview, true, "dev", item.label);
  webview.src = item.url;
  switchToServiceTab(tabId);
};
// === END DEV WHITELIST ===

window.toggleIdentity = function (identityId) {
  state.enabledIdentityIds.has(identityId)
    ? state.enabledIdentityIds.delete(identityId)
    : state.enabledIdentityIds.add(identityId);
  renderSidebar();
};

// --- Protocol Cache (in-memory, per session — auto-clear saat logout/reload) ---
const protocolCache = new Map(); // serviceName → "https" | "http"

window.openServiceTab = async function (identityId, serviceName) {
  const tabId = getServiceTabId(identityId, serviceName);
  if (state.serviceTabs.has(tabId)) {
    switchToServiceTab(tabId);
    return;
  }

  // 1. Tampilkan loading skeleton SEGERA (user mendapat feedback instan)
  showLoadingOverlay(serviceName);

  // 2. Detect protocol (dari cache jika ada, atau via IPC)
  let protocol;
  if (protocolCache.has(serviceName)) {
    protocol = protocolCache.get(serviceName);
  } else {
    try {
      protocol = await window.electronAPI.detectServiceProtocol(serviceName);
    } catch (err) {
      console.warn(`Gagal deteksi protokol untuk ${serviceName}:`, err);
      protocol = "https"; // fallback aman
    }
    protocolCache.set(serviceName, protocol);
  }

  // 3. Buat webview dan load
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
  webview.__originalUrl = fullUrl; // Simpan URL asli untuk recovery dari error
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

  // Targeted update: toggle active class tanpa rebuild innerHTML
  const serviceTabsContainer = document.getElementById("service-tabs-container");
  if (serviceTabsContainer) {
    serviceTabsContainer.querySelectorAll('.service-item.active')
      .forEach(el => el.classList.remove('active'));
    const activeBtn = serviceTabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    } else {
      // Fallback: jika button belum ada di DOM (tab baru), rebuild sidebar
      renderSidebar();
    }
  }

  showWebview(serviceTab.webview);
  urlInputField.value = serviceTab.serviceName;
  state.activeServiceTabId = tabId;

  // Hide empty state
  const emptyState = document.getElementById("empty-state");
  if (emptyState) emptyState.style.display = "none";

  updateNavButtons();
}

export { renderSidebar, switchToServiceTab, getServiceTabId };
