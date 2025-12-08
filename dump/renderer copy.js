import "./index.css";

// --- ELEMEN NAVIGASI & UI (sama seperti sebelumnya) ---
const backButton = document.getElementById("back-button");
const forwardButton = document.getElementById("forward-button");
const reloadButton = document.getElementById("reload-button");
const searchButton = document.getElementById("search-button");
const newTabButton = document.getElementById("new-tab-button");
const goButton = document.getElementById("go");
const urlInputField = document.getElementById("url-input");
const webviewContainer = document.getElementById("webview-container");
const tabsContainer = document.getElementById("tabs-container");
const serviceTabsContainer = document.getElementById("service-tabs-container");
const identityButton = document.getElementById("identity-button");
const identityModal = document.getElementById("identity-modal");
const identityDetailsContent = document.getElementById("identity-details-content");
const closeModalButton = document.getElementById("close-modal-button");
const sidebar = document.getElementById("sidebar");
const sidebarContent = document.getElementById("sidebar-content");
const collapseBtn = document.getElementById("collapse-btn");
const logModal = document.getElementById("log-modal");
const logContent = document.getElementById("log-content");
const closeLogModalButton = document.getElementById("close-log-modal");
const downloadLogButton = document.getElementById("download-log");

// --- ELEMEN AUTH SESUAI HTML ANDA ---
const authScreen = document.getElementById("auth-screen");
const browserContainer = document.querySelector(".app-container"); // sesuai class di HTML

const passwordPromptModal = document.getElementById("password-prompt-modal");
const vaultPasswordInput = document.getElementById("vault-password-input");
const submitPasswordBtn = document.getElementById("submit-vault-password");
const cancelPasswordBtn = document.getElementById("cancel-vault-password");

const initialAuthButtons = document.getElementById("initial-auth-buttons");
const enrollJwtBtn = document.getElementById("enroll-jwt-btn");
const uploadJsonBtn = document.getElementById("upload-json-btn");

const vaultIdentityList = document.getElementById("vault-identity-list");
const noIdentitiesMessage = document.getElementById("no-identities-message");
const addIdentityVaultBtn = document.getElementById("add-identity-vault-btn");

const authErrorMessage = document.getElementById("auth-error-message");

// --- INDICATOR PROSES ---
const processingIndicator = document.createElement("div");
processingIndicator.className = "text-center";
processingIndicator.innerHTML = `<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div><p class="text-lg text-gray-700">Memproses...</p>`;
processingIndicator.classList.add("hidden");
authScreen?.appendChild(processingIndicator);

// --- STATE GLOBAL ---
let tabs = [];
let currentTabIndex = 0;
let activeIdentities = [];
let enabledIdentityIds = new Set();
let activeServiceTabId = null;
let serviceTabs = new Map();
let currentVaultPassword = null;

// --- UTILITAS ---
function handleUrl() {
  let url = urlInputField.value.trim();
  if (!url) return;
  if (!url.startsWith("http://") && !url.startsWith("https://"))
    url = "http://" + url;

  const tab = tabs[currentTabIndex];
  if (tab) {
    tab.url = url;
    tab.webview.src = url;
    urlInputField.value = url;
  }
}

// --- FUNGSI UTILITAS UTAMA ---
function showScreen(screen) {
  // screen = "browser" atau "auth" atau "processing"
  if (screen === "browser") {
    authScreen?.classList.add("hidden");
    browserContainer?.classList.remove("hidden");
  } else if (screen === "processing") {
    authScreen?.classList.remove("hidden");
    browserContainer?.classList.add("hidden");
    authErrorMessage?.classList.add("hidden");
    // Tampilkan indikator di auth screen
    processingIndicator?.classList.remove("hidden");
  } else {
    // screen === "auth"
    authScreen?.classList.remove("hidden");
    browserContainer?.classList.add("hidden");
    processingIndicator?.classList.add("hidden");
    authErrorMessage?.classList.add("hidden");
  }
}

function showError(message) {
  if (authErrorMessage) {
    authErrorMessage.textContent = message;
    authErrorMessage.classList.remove("hidden");
  }
}

function resetAuthUI() {
  vaultPasswordInput.value = "";
  showError("");
}

// --- BROWSER TAB MANAGEMENT (tidak berubah) ---
function showWebview(targetWebview) {
  const allWebviews = [
    ...tabs.map((t) => t.webview),
    ...Array.from(serviceTabs.values()).map((s) => s.webview),
  ];
  allWebviews
    .filter((wv) => wv && wv !== targetWebview)
    .forEach((wv) => wv.classList.add("hidden"));

  if (targetWebview) {
    targetWebview.classList.remove("hidden");
  }
}

function updateNavButtons() {
  let canGoBack = false;
  let canGoForward = false;

  if (activeServiceTabId) {
    const tab = serviceTabs.get(activeServiceTabId);
    if (tab?.webview) {
      try {
        canGoBack = tab.webview.canGoBack();
      } catch (e) {}
      try {
        canGoForward = tab.webview.canGoForward();
      } catch (e) {}
    }
  } else {
    const tab = tabs[currentTabIndex];
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

function renderSidebar() {
  if (!serviceTabsContainer) return;

  const enabledIdentities = activeIdentities.filter((id) =>
    enabledIdentityIds.has(id.identity_id)
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
          const isActive = tabId === activeServiceTabId;
          return `
            <button type="button" class="flex items-center w-full p-2 rounded-md transition-colors duration-200 space-x-2 tab hover:bg-gray-300 ${isActive ? "bg-blue-200 font-semibold" : ""}"
              onclick="openServiceTab('${identity.identity_id}', '${service.replace(/'/g, "\\'")}')"
              title="Akses: http://${service}">
              <span class='text-sm'>${service}</span>
            </button>
          `;
        })
        .join("") || '<p class="text-gray-500 px-2">Tidak ada layanan</p>';

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
  enabledIdentityIds.has(identityId)
    ? enabledIdentityIds.delete(identityId)
    : enabledIdentityIds.add(identityId);
  renderSidebar();
};

window.openServiceTab = function (identityId, serviceName) {
  const tabId = getServiceTabId(identityId, serviceName);
  if (serviceTabs.has(tabId)) {
    switchToServiceTab(tabId);
    return;
  }

  const webview = document.createElement("webview");
  webview.setAttribute("nodeintegration", "false");
  webview.setAttribute("plugins", "false");
  webview.setAttribute("disablewebsecurity", "false");
  webview.style.width = "100%";
  webview.style.height = "100%";
  webview.src = `http://${serviceName}`;
  webview.classList.add("hidden");
  webviewContainer.appendChild(webview);

  serviceTabs.set(tabId, {
    id: tabId,
    identityId,
    serviceName,
    webview,
    title: `${serviceName} (${identityId.substring(0, 6)})`,
  });

  attachWebviewListeners(webview, true, identityId, serviceName);
  switchToServiceTab(tabId);
};

function switchToServiceTab(tabId) {
  const serviceTab = serviceTabs.get(tabId);
  if (!serviceTab) return;

  showWebview(serviceTab.webview);
  urlInputField.value = `http://${serviceTab.serviceName}`;
  urlInputField.disabled = true;
  goButton.disabled = true;
  activeServiceTabId = tabId;
  renderSidebar();
  updateNavButtons();
}

function createWebviewForTab(url) {
  const webview = document.createElement("webview");
  webview.setAttribute("nodeintegration", "false");
  webview.setAttribute("plugins", "false");
  webview.setAttribute("disablewebsecurity", "false");
  webview.style.width = "100%";
  webview.style.height = "100%";
  webview.src = url;
  webview.classList.add("hidden");
  webviewContainer.appendChild(webview);
  return webview;
}

function createBrowserTab(url = "https://www.google.com") {
  const webview = createWebviewForTab(url);
  attachWebviewListeners(webview, false);
  const newTab = {
    id: Date.now().toString(),
    title: "New Tab",
    url,
    webview,
  };
  tabs.push(newTab);
  switchToBrowserTab(tabs.length - 1);
  renderTabs();
}

function renderTabs() {
  if (!tabsContainer) return;
  tabsContainer.innerHTML = "";

  if (tabs.length === 0) {
    createBrowserTab("https://www.google.com");
    return;
  }

  tabs.forEach((tab, index) => {
    const isActive = index === currentTabIndex && activeServiceTabId === null;
    const tabButton = document.createElement("button");
    tabButton.type = "button";
    tabButton.className = `flex items-center w-full p-2 rounded-md transition-colors duration-200 space-x-2 tab relative ${isActive ? "bg-gray-200 active" : "hover:bg-gray-300"}`;
    tabButton.innerHTML = `<span class='text-sm max-w-full truncate'>${tab.title}</span>`;

    tabButton.addEventListener("click", () => switchToBrowserTab(index));

    if (tabs.length > 1) {
      const closeBtn = document.createElement("span");
      closeBtn.innerHTML = "&times;";
      closeBtn.className =
        "close-btn ml-2 text-gray-400 hover:text-red-500 cursor-pointer";
      closeBtn.title = "Tutup Tab";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeBrowserTab(index);
      });
      tabButton.appendChild(closeBtn);
      tabButton.classList.add("group");
    }
    tabsContainer.appendChild(tabButton);
  });
}

function removeBrowserTab(index) {
  const tab = tabs[index];
  if (tab?.webview?.parentNode) tab.webview.remove();
  tabs.splice(index, 1);

  if (tabs.length === 0 && serviceTabs.size === 0) {
    createBrowserTab("https://www.google.com");
  } else if (activeServiceTabId === null) {
    const newIndex = Math.max(0, Math.min(currentTabIndex, tabs.length - 1));
    switchToBrowserTab(newIndex);
  }
  renderTabs();
}

function switchToBrowserTab(index) {
  if (index < 0 || index >= tabs.length) return;
  const tab = tabs[index];
  if (!tab) return;

  showWebview(tab.webview);
  currentTabIndex = index;
  activeServiceTabId = null;

  urlInputField.value = tab.url;
  urlInputField.disabled = false;
  goButton.disabled = false;

  renderTabs();
  renderSidebar();
  updateNavButtons();
}

function attachWebviewListeners(webview, isService, identityId = "", serviceName = "") {
  const updateUrlField = (url) => {
    if (url.startsWith("data:") || url.startsWith("ziti-")) return;

    if (isService) {
      const tabId = getServiceTabId(identityId, serviceName);
      if (activeServiceTabId === tabId) {
        urlInputField.value = url;
      }
    } else {
      const tab = tabs.find((t) => t.webview === webview);
      if (tab) {
        tab.url = url;
        if (activeServiceTabId === null && tabs[currentTabIndex]?.webview === webview) {
          urlInputField.value = url;
        }
      }
    }
  };

  webview.addEventListener("did-navigate", (e) => updateUrlField(e.url));
  webview.addEventListener("did-navigate-in-page", (e) => updateUrlField(e.url));
  webview.addEventListener("page-title-updated", (e) => {
    if (!isService) {
      const tab = tabs.find((t) => t.webview === webview);
      if (tab) {
        tab.title = e.title || "Untitled";
        renderTabs();
      }
    }
  });
  webview.addEventListener("load-commit", updateNavButtons);
}

// --- FUNGSI ENROLL & UPLOAD ---
// ================================
// FUNGSI VAULT & AUTH (DIPERBAIKI)
// ================================

async function handleEnroll() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".jwt";
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const jwtContent = await file.text();
    let password = currentVaultPassword;

    if (!password) {
      password = prompt("Masukkan password vault (minimal 8 karakter):");
      if (!password || password.length < 8) {
        alert("Password minimal 8 karakter.");
        return;
      }
      currentVaultPassword = password;
    }

    showScreen("processing");
    try {
      const result = await window.vaultAPI.handleEnrollment(jwtContent, password);
      if (result.success) {
        if (result.autoLoggedIn) {
          await initializeBrowserAfterLogin();
        } else {
          await loadAndDisplayVaultIdentities();
        }
      } else {
        showError(result.message || "Gagal enroll.");
      }
    } catch (err) {
      console.error(err);
      showError("Error saat enroll: " + err.message);
    } finally {
      showScreen("auth");
    }
  };
  fileInput.click();
}

async function handleUpload() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json";
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const jsonContent = await file.text();
    const name = file.name.replace(/\.[^/.]+$/, "");
    let password = currentVaultPassword;

    if (!password) {
      password = prompt("Masukkan password vault:");
      if (!password) return;
      currentVaultPassword = password;
    }

    showScreen("processing");
    try {
      const result = await window.vaultAPI.addIdentityToVault(jsonContent, password, name);
      if (result.success) {
        await loadAndDisplayVaultIdentities();
      } else {
        showError(result.message || "Gagal upload.");
      }
    } catch (err) {
      console.error(err);
      showError("Error saat upload: " + err.message);
    } finally {
      showScreen("auth");
    }
  };
  fileInput.click();
}

async function loadAndDisplayVaultIdentities() {
  try {
    const result = await window.vaultAPI.getVaultIdentities();
    if (!result.success) {
      showError("Vault belum dibuka.");
      return;
    }

    const identities = result.identities || [];
    if (identities.length === 0) {
      vaultIdentityList.innerHTML = "";
      noIdentitiesMessage?.classList.remove("hidden");
    } else {
      noIdentitiesMessage?.classList.add("hidden");
      let html = `<div class="mt-4"><h3 class="text-lg font-medium mb-2">Identitas Tersedia:</h3>`;
      identities.forEach((id, idx) => {
        const addedAt = id.addedAt
          ? new Date(id.addedAt).toLocaleString("id-ID")
          : "Tidak diketahui";
        html += `
          <div class="flex justify-between items-center p-2 border rounded mb-2">
            <div>
              <span class="font-medium">${id.name}</span><br>
              <small class="text-gray-500">Ditambahkan: ${addedAt}</small>
            </div>
            <button type="button" class="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
              onclick="loginWithIdentity(${idx})">
              Login
            </button>
          </div>
        `;
      });
      html += `</div>`;
      vaultIdentityList.innerHTML = html;
    }
    addIdentityVaultBtn?.classList.remove("hidden");
    // Tampilkan bagian vault
    document.getElementById("vault-identity-section")?.classList.remove("hidden");
  } catch (err) {
    console.error("Gagal muat daftar identitas:", err);
    showError("Gagal memuat identitas.");
  }
}

window.loginWithIdentity = async function (index) {
  showScreen("processing");
  try {
    const result = await window.vaultAPI.loginWithVaultIdentity(index);
    if (result.success) {
      await initializeBrowserAfterLogin();
    } else {
      showError(result.message || "Login gagal.");
      showScreen("auth");
    }
  } catch (err) {
    console.error(err);
    showError("Error saat login: " + err.message);
    showScreen("auth");
  }
};

async function initializeBrowserAfterLogin() {
  try {
    const res = await window.vaultAPI.getZitiIdentityData();
    if (res.identities && res.identities.length > 0) {
      activeIdentities = res.identities;
      enabledIdentityIds = new Set(activeIdentities.map((id) => id.identity_id));
      renderSidebar();
    }
  } catch (err) {
    console.warn("Gagal ambil data identitas setelah login:", err);
  }
  showScreen("browser");
  if (tabs.length === 0) {
    createBrowserTab("https://www.google.com");
  }
}

// --- LOGOUT ---
async function handleLogout() {
  try {
    identityModal?.classList.add("hidden");
    showScreen("processing");
    await window.vaultAPI.logout();

    activeIdentities = [];
    enabledIdentityIds = new Set();
    tabs = [];
    serviceTabs.clear();
    currentTabIndex = 0;
    activeServiceTabId = null;
    webviewContainer.innerHTML = "";

    showScreen("auth");
    resetAuthUI();
  } catch (e) {
    console.error("Gagal Logout:", e);
    showError("Gagal logout. Silakan coba lagi.");
  }
}
window.handleLogout = handleLogout;

// --- PASSWORD MODAL ---
function showVaultPasswordPrompt() {
  resetAuthUI();
  passwordPromptModal?.classList.remove("hidden");
  vaultPasswordInput?.focus();
}

function hideVaultPasswordPrompt() {
  passwordPromptModal?.classList.add("hidden");
}

submitPasswordBtn?.addEventListener("click", async () => {
  const password = vaultPasswordInput?.value;
  if (!password) return;

  showScreen("processing");
  try {
    const result = await window.vaultAPI.unlockVault(password);
    hideVaultPasswordPrompt();
    if (result.success) {
      currentVaultPassword = password;
      initialAuthButtons?.classList.add("hidden");
      document.getElementById("vault-identity-section")?.classList.remove("hidden");
      if (result.status === "vault-empty") {
        vaultIdentityList.innerHTML = "";
        noIdentitiesMessage?.classList.remove("hidden");
        addIdentityVaultBtn?.classList.remove("hidden");
      } else if (result.status === "vault-loaded") {
        await loadAndDisplayVaultIdentities();
      }
      showScreen("auth");
    } else {
      showError(result.message || "Password salah.");
      vaultPasswordInput.value = "";
      vaultPasswordInput.focus();
    }
  } catch (err) {
    console.error(err);
    showError("Terjadi kesalahan saat membuka vault.");
    showScreen("auth");
  }
});

cancelPasswordBtn?.addEventListener("click", () => {
  hideVaultPasswordPrompt();
  showScreen("auth");
});

// --- TOMBOL AWAL ---
enrollJwtBtn?.addEventListener("click", handleEnroll);
uploadJsonBtn?.addEventListener("click", handleUpload);
addIdentityVaultBtn?.addEventListener("click", () => {
  const choice = confirm("Pilih:\nOK = Enroll (.jwt)\nCancel = Upload (.json)");
  if (choice) handleEnroll();
  else handleUpload();
});

// --- IPC DARI MAIN ---
window.vaultAPI.onPromptVaultPassword(showVaultPasswordPrompt);
window.vaultAPI.onShowAuthInitial(() => {
  resetAuthUI();
  initialAuthButtons?.classList.remove("hidden");
  document.getElementById("vault-identity-section")?.classList.add("hidden");
  showScreen("auth");
});

// ================================
// EVENT LISTENERS (NAV, LOG, DLL)
// ================================

urlInputField?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !urlInputField.disabled) handleUrl();
});
goButton?.addEventListener("click", () => {
  if (!goButton.disabled) handleUrl();
});
searchButton?.addEventListener("click", () => {
  const url = "https://www.google.com";
  const tab = tabs[currentTabIndex];
  if (tab) {
    tab.url = url;
    tab.webview.src = url;
    urlInputField.value = url;
  }
  activeServiceTabId = null;
  renderSidebar();
});
backButton?.addEventListener("click", () => {
  const webview = activeServiceTabId
    ? serviceTabs.get(activeServiceTabId)?.webview
    : tabs[currentTabIndex]?.webview;
  if (webview) webview.goBack();
});
forwardButton?.addEventListener("click", () => {
  const webview = activeServiceTabId
    ? serviceTabs.get(activeServiceTabId)?.webview
    : tabs[currentTabIndex]?.webview;
  if (webview) webview.goForward();
});
reloadButton?.addEventListener("click", () => {
  const webview = activeServiceTabId
    ? serviceTabs.get(activeServiceTabId)?.webview
    : tabs[currentTabIndex]?.webview;
  if (webview) webview.reload();
});
newTabButton?.addEventListener("click", () => createBrowserTab());

// Modal & Sidebar
identityButton?.addEventListener("click", () => {
  window.displayIdentityData?.();
});
closeModalButton?.addEventListener("click", () => {
  identityModal?.classList.add("hidden");
});
identityModal?.addEventListener("click", (e) => {
  if (e.target === identityModal) identityModal?.classList.add("hidden");
});
collapseBtn?.addEventListener("click", () => {
  sidebar?.classList.toggle("collapsed");
  collapseBtn?.classList.toggle("rotate-180");
  sidebarContent?.classList.toggle("hidden");
});

// Log
const logButton = document.getElementById("log-button");
logButton?.addEventListener("click", async () => {
  try {
    const logText = await window.vaultAPI.getProxyLogContent();
    logContent.textContent = logText;
    logModal?.classList.remove("hidden");
  } catch (err) {
    alert("Gagal memuat log.");
  }
});
closeLogModalButton?.addEventListener("click", () => logModal?.classList.add("hidden"));
logModal?.addEventListener("click", (e) => {
  if (e.target === logModal) logModal?.classList.add("hidden");
});
downloadLogButton?.addEventListener("click", async () => {
  try {
    const content = await window.vaultAPI.getProxyLogContent();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ziti-proxy.log";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Gagal mengunduh log.");
  }
});

// Identity Modal Functions (harus tetap ada)
window.displayIdentityData = function () {
  if (!identityModal || !identityDetailsContent) return;
  let html = activeIdentities.length === 0
    ? "<p class='text-gray-500'>Tidak ada identitas aktif.</p>"
    : activeIdentities.map(id => {
        const isChecked = enabledIdentityIds.has(id.identity_id);
        return `
          <div class="mb-3 p-3 border rounded ${!isChecked ? "bg-gray-100 opacity-75" : "bg-white"} flex justify-between items-start">
            <div class="flex-1">
              <p class="font-medium text-gray-800">${id.identity_name || "N/A"}</p>
              <p class="text-xs text-gray-500">ID: ${id.identity_id || "N/A"}</p>
            </div>
            <div class="flex items-center space-x-2 ml-3">
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" class="sr-only peer" ${isChecked ? "checked" : ""}
                  onchange="toggleIdentityFromModal('${id.identity_id}')"/>
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
              <button type="button" class="text-red-500 hover:text-red-700"
                onclick="deleteIdentityFromModal('${id.identity_id}')">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join("");

  identityDetailsContent.innerHTML = html;
  identityModal.classList.remove("hidden");
};

window.toggleIdentityFromModal = function (identityId) {
  toggleIdentity(identityId);
  displayIdentityData();
};

window.deleteIdentityFromModal = async function (identityId) {
  if (!confirm("Yakin ingin menghapus identitas ini?")) return;
  try {
    await window.vaultAPI.deleteIdentity(identityId);
    activeIdentities = activeIdentities.filter(id => id.identity_id !== identityId);
    enabledIdentityIds.delete(identityId);
    for (const [tabId, tab] of serviceTabs.entries()) {
      if (tab.identityId === identityId) {
        tab.webview?.remove();
        serviceTabs.delete(tabId);
        if (activeServiceTabId === tabId) activeServiceTabId = null;
      }
    }
    renderSidebar();
    displayIdentityData();
    if (activeIdentities.length === 0) {
      identityModal?.classList.add("hidden");
      showScreen("auth");
    }
  } catch (err) {
    alert("Gagal menghapus identitas.");
  }
};

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
  // Jangan tampilkan apa-apa dulu — tunggu instruksi dari main
  showScreen("auth"); // ini hanya fallback, nanti akan di-override oleh event
});