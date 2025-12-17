import "./index.css";

// --- REFERENSI ELEMEN NAVIGASI & UI ---
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
const identityDetailsContent = document.getElementById(
  "identity-details-content"
);
const closeModalButton = document.getElementById("close-modal-button");
const sidebar = document.getElementById("sidebar");
const sidebarContent = document.getElementById("sidebar-content");
const collapseBtn = document.getElementById("collapse-btn");
const logModal = document.getElementById("log-modal");
const logContent = document.getElementById("log-content");
const closeLogModalButton = document.getElementById("close-log-modal");
const downloadLogButton = document.getElementById("download-log");

// --- REFERENSI ELEMEN AUTH ---
const authScreen = document.getElementById("auth-screen");
const authBox = document.getElementById("auth-box");
const authDiv = document.getElementById("auth-div");
const enrollmentForm = document.getElementById("enrollment-form");
const enrollJwtFile = document.getElementById("enroll-jwt-file");
const uploadIdentityButton = document.getElementById("upload-identity-button");

// --- INDICATOR PROSES ---
const processingIndicator = document.createElement("div");
processingIndicator.className = "text-center";
processingIndicator.innerHTML = `<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div><p class="text-lg text-gray-700">Memproses...</p>`;
processingIndicator.classList.add("hidden");
authDiv.appendChild(processingIndicator);

// --- STATE GLOBAL ---
let tabs = [];
let currentTabIndex = 0;
let activeIdentities = [];
let enabledIdentityIds = new Set();
let activeServiceTabId = null;
let serviceTabs = new Map();
let currentScreen = "no-vault";
let sessionVaultPassword = null;
let selectedIdentities = new Set();

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

function showScreen(screen) {
  currentScreen = screen;
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
      // 🔐 Mulai use case 2: minta password
      console.log("Menampilkan layar need-vault-password juga");
      showScreen("vault-password");
      setupVaultPasswordScreen(); // ⬅️ dipanggil sekali
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
  enabledIdentityIds.has(identityId)
    ? enabledIdentityIds.delete(identityId)
    : enabledIdentityIds.add(identityId);
  renderSidebar();
};

window.openServiceTab = async function (identityId, serviceName) {
  const tabId = getServiceTabId(identityId, serviceName);
  if (serviceTabs.has(tabId)) {
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

  serviceTabs.set(tabId, {
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
  webview.setAttribute("allowpopups", "true");
  webview.setAttribute(
    "webpreferences",
    "contextIsolation=true, nativeWindowOpen=true"
  );
  webview.style.width = "100%";
  webview.style.height = "100%";
  webview.classList.add("hidden");
  webviewContainer.appendChild(webview);
  return webview;
}

function createBrowserTab(url = "https://www.google.com") {
  const webview = createWebviewForTab(url);
  attachWebviewListeners(webview, false);
  webview.src = url;
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
    // 🔧 DIPERBAIKI: hapus spasi
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
    // 🔧 DIPERBAIKI: hapus spasi
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

function attachWebviewListeners(
  webview,
  isService,
  identityId = "",
  serviceName = ""
) {
  const updateUrlField = (url) => {
    // Jangan update untuk URL internal/data
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
        if (
          activeServiceTabId === null &&
          tabs[currentTabIndex]?.webview === webview
        ) {
          urlInputField.value = url;
        }
      }
    }
  };

  webview.addEventListener("did-navigate", (e) => {
    updateUrlField(e.url);
  });

  webview.addEventListener("did-navigate-in-page", (e) => {
    // Gunakan e.url (bukan e.newURL) — di Electron, `url` sudah benar
    updateUrlField(e.url);
  });

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

async function showProxyLog() {
  try {
    const logText = await window.electronAPI.getProxyLogContent();
    logContent.textContent = logText;
    logModal.classList.remove("hidden");
    logModal.classList.add("flex");
    logContent.scrollTop = logContent.scrollHeight; // Scroll ke bawah
  } catch (err) {
    console.error("Gagal membaca log:", err);
    alert("Tidak bisa memuat log proxy.");
  }
}

async function downloadProxyLog() {
  try {
    const content = await window.electronAPI.getProxyLogContent();
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
    console.error("Gagal download log:", err);
    alert("Tidak bisa mengunduh log.");
  }
}

async function handleLogout() {
  try {
    if (identityModal) {
      identityModal.classList.add("hidden");
      identityModal.classList.remove("flex");
    }

    showScreen("processing");
    await window.electronAPI.logout();

    const allWebviews = [
      ...tabs.map((t) => t.webview),
      ...Array.from(serviceTabs.values()).map((s) => s.webview),
    ];
    allWebviews.filter((wv) => wv?.parentNode).forEach((wv) => wv.remove());

    activeIdentities = [];
    enabledIdentityIds = new Set();
    tabs = [];
    serviceTabs.clear();
    currentTabIndex = 0;
    activeServiceTabId = null;

    webviewContainer.innerHTML = "";
    renderTabs();

    const vaultState = await window.electronAPI.checkSession();
    handleInitialState(vaultState);
    console.log("Logout berhasil.");
  } catch (e) {
    console.error("Gagal Logout:", e);
    handleAuthFailure("Gagal logout. Silakan mulai ulang aplikasi.");
  }
}
window.handleLogout = handleLogout;

async function refreshActiveIdentities() {
  try {
    const result = await window.electronAPI.getZitiIdentityData(); // pastikan sudah di-expose di preload.js
    activeIdentities = result.identities || [];
    enabledIdentityIds = new Set(activeIdentities.map((id) => id.identity_id));
  } catch (e) {
    console.warn("Gagal refresh identitas dari proxy:", e);
  }
}

// --- WRAPPER MODAL IDENTITAS (dalam browser) ---
window.displayIdentityData = function () {
  if (!identityModal || !identityDetailsContent) return;

  let html = "";
  if (activeIdentities.length === 0) {
    html += "<p class='text-gray-500'>Tidak ada identitas aktif.</p>";
  } else {
    activeIdentities.forEach((id) => {
      const isChecked = enabledIdentityIds.has(id.identity_id);
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
};

window.toggleIdentityFromModal = function (identityId) {
  toggleIdentity(identityId);
  displayIdentityData();
};

window.deleteIdentityFromModal = async function (identityId) {
  if (!confirm("Yakin ingin menghapus identitas ini?")) return;

  try {
    await window.electronAPI.deleteIdentity(identityId);
    activeIdentities = activeIdentities.filter(
      (id) => id.identity_id !== identityId
    );
    enabledIdentityIds.delete(identityId);

    for (const [tabId, tab] of serviceTabs.entries()) {
      if (tab.identityId === identityId) {
        if (tab.webview?.parentNode) tab.webview.remove();
        serviceTabs.delete(tabId);
        if (activeServiceTabId === tabId) activeServiceTabId = null;
      }
    }

    renderSidebar();
    displayIdentityData();

    if (activeIdentities.length === 0) {
      identityModal.classList.add("hidden");
      identityModal.classList.remove("flex");
      showScreen("authentication");
    }
    console.log(`Identitas ${identityId} dihapus.`);
  } catch (err) {
    console.error("Gagal menghapus identitas:", err);
    alert("Gagal menghapus identitas. Coba lagi.");
  }
};
// --- END MODAL IDENTITAS WRAPPER ---

// ------ AUTH PAGE FUNCTIONS ------
function setupAuthListeners() {
  // --- ENROLLMENT (first-time) ---
  if (enrollmentForm) {
    enrollmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const files = Array.from(enrollJwtFile.files); // ✅ multiple
      if (files.length === 0)
        return handleAuthFailure("File JWT harus dipilih.");

      const password = await showPasswordPrompt();
      if (!password || password.length < 8) {
        return handleAuthFailure("Password minimal 8 karakter.");
      }

      showScreen("processing");
      try {
        // ✅ Proses semua file
        const enrollPromises = files.map(async (file) => {
          const jwtContent = await file.text();
          return window.electronAPI.handleEnrollment({
            jwtContent,
            fileName: file.name,
            password,
          });
        });

        const results = await Promise.all(enrollPromises);
        const successful = results.filter((r) => r.success);

        if (successful.length === 0) {
          throw new Error(
            results
              .map((r) => r.message)
              .filter(Boolean)
              .join("; ") || "Enroll gagal."
          );
        }

        // 🔁 Lanjutkan ke auto-login *sekali* seperti sebelumnya (ke identitas pertama)
        // (atau — opsional — langsung login semua successful identities)
        const sessionRes = await window.electronAPI.checkSession();
        if (sessionRes.type !== "show-identity-list") {
          throw new Error("Vault tidak terbuka setelah enroll.");
        }

        activeIdentities = sessionRes.payload.identities;
        const firstId = activeIdentities[0];
        if (!firstId?.idString) throw new Error("Identitas tanpa idString.");

        const newlyEnrolledIds = successful
          .map((r) => r.identity?.idString)
          .filter(Boolean);
        const loginRes =
          await window.electronAPI.loginSelected(newlyEnrolledIds);
        if (!loginRes.success) throw new Error(loginRes.message);

        await refreshActiveIdentities();
        renderSidebar();
        showScreen("browser");
        if (tabs.length === 0) createBrowserTab("https://www.google.com");
      } catch (err) {
        console.error("Enrollment error:", err);
        handleAuthFailure(err.message || "Gagal enroll identitas.");
      } finally {
        enrollmentForm.reset();
      }
    });
  }

  // --- UPLOAD JSON (first-time) ---
  if (uploadIdentityButton) {
    uploadIdentityButton.addEventListener("click", () => {
      document.getElementById("identity-file-input").click();
    });
  }

  // --- FILE INPUT CHANGE HANDLER ---
  document
    .getElementById("identity-file-input")
    ?.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) {
        e.target.value = "";
        return;
      }

      const password = await showPasswordPrompt();
      if (!password || password.length < 8) {
        return handleAuthFailure("Password minimal 8 karakter.");
      }

      showScreen("processing");
      try {
        // ✅ Proses semua file
        const uploadPromises = files.map(async (file) => {
          const textContent = await file.text();
          return window.electronAPI.handleIdentityUpload({
            identityFile: textContent,
            fileName: file.name,
            password: password,
          });
        });

        const results = await Promise.all(uploadPromises);
        const successful = results.filter((r) => r.success);
        if (successful.length === 0) {
          throw new Error(
            results
              .map((r) => r.message)
              .filter(Boolean)
              .join("; ") || "Upload gagal."
          );
        }

        // ✅ Login semua identitas yang baru diupload
        const newIds = successful
          .map((r) => r.identity?.idString)
          .filter(Boolean);
        if (newIds.length === 0) {
          throw new Error("Tidak ada identitas valid untuk login.");
        }

        const loginRes = await window.electronAPI.loginSelected(newIds);
        if (!loginRes.success) {
          throw new Error(loginRes.message || "Gagal login otomatis.");
        }

        // ✅ Lanjut ke browser
        await refreshActiveIdentities();
        renderSidebar();
        showScreen("browser");
        if (tabs.length === 0) createBrowserTab("https://www.google.com");
      } catch (err) {
        console.error("Multi-upload (first-time) error:", err);
        handleAuthFailure(err.message || "Gagal memproses identitas.");
      } finally {
        e.target.value = "";
      }
    });
}

window.handleLoginSelection = async function () {
  const ids = Array.from(selectedIdentities);
  if (ids.length === 0) {
    return alert("Pilih minimal satu identitas.");
  }

  try {
    const result = await window.electronAPI.loginSelected(ids);

    if (result.success) {
      await refreshActiveIdentities();
      renderSidebar();
      displayIdentityData();
      showScreen("browser");
      if (tabs.length === 0) {
        createBrowserTab("https://www.google.com");
      }
    } else {
      handleAuthFailure(result.message || "Gagal login.");
    }
  } catch (error) {
    console.error("[RENDERER] Login error:", error);
    handleAuthFailure("Terjadi kesalahan saat login.");
  }
};
function displayIdentityOnVault() {
  const identityListContent = document.getElementById("identity-list-content");
  if (!identityListContent) return;

  let html = "";
  if (activeIdentities.length === 0) {
    html = "<p class='text-gray-500'>Tidak ada identitas dalam vault.</p>";
  } else {
    html = `
    <div class="space-y-3">
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold"></h3>

        <div class="flex items-center space-x-1">
          <span class="text-sm text-black-600">Pilih Semua</span>
          <button 
            type="button"
            onclick="toggleSelectAll()"
            class="w-5 h-5 flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
          >
            ${
              selectedIdentities.size === 0
                ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" stroke-width="2"/></svg>`
                : selectedIdentities.size === activeIdentities.length
                  ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`
                  : `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></svg>`
            }
          </button>
        </div>
      </div>

      ${activeIdentities
        .map((id) => {
          const isSelected = selectedIdentities.has(id.idString);
          const checkboxId = `chk-${id.idString.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
          return `
          <div class="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer flex items-start gap-3 transition-colors ${
            isSelected ? "border-indigo-500 bg-indigo-50" : "border-gray-200"
          }">
            <input 
              type="checkbox" 
              id="${checkboxId}"
              ${isSelected ? "checked" : ""}
              onchange="toggleIdentitySelection('${id.idString.replace(/'/g, "\\'")}', this.checked)"
              class="mt-1 h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <div class="flex-1 min-w-0" onclick="toggleCheckbox('${checkboxId}')">
              <p class="font-medium truncate">${id.name || "Unnamed Identity"}</p>
              <p class="text-sm text-gray-500 truncate">ID: ${id.idString}</p>
              ${
                id.enrolledFrom
                  ? `<p class="text-xs text-gray-400 mt-1">Source: ${id.enrolledFrom}</p>`
                  : id.addedAt
                    ? `<p class="text-xs text-gray-400 mt-1">Added: ${new Date(id.addedAt).toLocaleDateString()}</p>`
                    : ""
              }
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
    `;
  }

  identityListContent.innerHTML = html;
}
window.toggleCheckbox = function (checkboxId) {
  const checkbox = document.getElementById(checkboxId);
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    // Trigger onchange (agar toggleIdentitySelection terpanggil)
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
};
window.toggleIdentitySelection = function (idString, checked) {
  // Update state
  if (checked) {
    selectedIdentities.add(idString);
  } else {
    selectedIdentities.delete(idString);
  }

  // Update UI *semua* checkbox yang relevan (jaga konsistensi)
  const checkboxId = `chk-${idString.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const checkbox = document.getElementById(checkboxId);
  if (checkbox) {
    checkbox.checked = checked;
  }

  // Update tombol
  updateLoginButton();
};
window.toggleSelectAll = function () {
  if (selectedIdentities.size === activeIdentities.length) {
    selectedIdentities.clear();
  } else {
    activeIdentities.forEach((id) => selectedIdentities.add(id.idString));
  }
  displayIdentityOnVault();
  updateLoginButton(); // pastikan tombol ikut update
};
function updateLoginButton() {
  const loginBtn = document.getElementById("login-btn"); // ← pastikan ID ini di index.html
  if (!loginBtn) return;

  const count = selectedIdentities.size;
  if (count === 0) {
    loginBtn.textContent = "Pilih Identitas";
    loginBtn.disabled = true;
    loginBtn.classList.add("opacity-50", "cursor-not-allowed");
    loginBtn.classList.remove("opacity-100");
  } else {
    loginBtn.textContent =
      count === 1 ? "Login 1 Identitas" : `Login ${count} Identitas`;
    loginBtn.disabled = false;
    loginBtn.classList.remove("opacity-50", "cursor-not-allowed");
    loginBtn.classList.add("opacity-100");
  }
  loginBtn.classList.add("bg-green-600", "hover:bg-green-700");
}

// --- VAULT EVENT HANDLERS ---
async function handleVaultUpdated() {
  try {
    const result = await window.electronAPI.checkSession();
    if (result.type === "show-identity-list") {
      activeIdentities = result.payload.identities;
      if (currentScreen === "browser") {
        await refreshActiveIdentities(); // hanya di browser
        renderSidebar();
      } else {
        displayIdentityOnVault();
        showScreen("identity-list");
      }
    } else if (result.type === "empty-vault") {
      showScreen("empty-vault");
    }
  } catch (e) {
    console.warn("Vault update refresh failed:", e);
  }
}

function handleVaultUnlocked(identities) {
  if (identities.length === 0) {
    showScreen("empty-vault");
  } else {
    activeIdentities = identities; // ← ini dari vault (ada idString, name, dll)
    displayIdentityOnVault();
    showScreen("identity-list");
  }
}

function showUploadIdentityDialog() {
  // Buat modal jika belum ada
  let modal = document.getElementById("upload-identity-dialog");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "upload-identity-dialog";
    modal.className =
      "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4";
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Tambah Identitas</h3>
        <div class="space-y-3">
          <button id="btn-upload-json" class="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:bg-indigo-800 font-medium shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 flex items-center justify-center gap-3"">
            <img src="./icon/upload.svg" alt="" class="w-5 h-5" />
            Upload dari File JSON
          </button>
          <button id="btn-upload-jwt" class="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:bg-indigo-800 font-medium shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 flex items-center justify-center gap-3"">
            <img src="./icon/upload.svg" alt="" class="w-5 h-5" />
            Upload dari File JWT
          </button>
        </div>
        <button id="btn-cancel-upload" class="w-full mt-4 py-2 text-gray-600 hover:text-gray-800">
          Batal
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    // Setup listeners
    modal.querySelector("#btn-cancel-upload").onclick = () =>
      (modal.style.display = "none");
    modal.querySelector("#btn-upload-json").onclick = () => {
      modal.style.display = "none";
      triggerFileUpload("json");
    };
    modal.querySelector("#btn-upload-jwt").onclick = () => {
      modal.style.display = "none";
      triggerFileUpload("jwt");
    };
  }

  modal.style.display = "flex";
}
window.showUploadIdentityDialog = showUploadIdentityDialog;

//  SINGLE SOURCE OF TRUTH — multi-file support for JSON & JWT
async function triggerFileUpload(type) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = type === "json" ? ".json" : ".jwt,.token,.txt";
  input.style.display = "none";

  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    console.log(
      `[DEBUG] Upload ${type}: memilih ${files.length} file`,
      files.map((f) => f.name)
    );
    if (files.length === 0) {
      input.remove();
      return;
    }

    if (!sessionVaultPassword) {
      const password = await showPasswordPrompt();
      if (!password || password.length < 8) {
        input.remove();
        return alert("Password minimal 8 karakter.");
      }
      sessionVaultPassword = password;
    }

    showScreen("processing");

    try {
      const uploadPromises = files.map(async (file) => {
        const fileName = file.name;
        const fileContent = await file.text();
        return type === "json"
          ? window.electronAPI.handleIdentityUpload({
              identityFile: fileContent,
              fileName,
              password: sessionVaultPassword,
            })
          : window.electronAPI.handleEnrollment({
              jwtContent: fileContent,
              fileName,
              password: sessionVaultPassword,
            });
      });

      const results = await Promise.all(uploadPromises);
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (successful.length === 0) {
        throw new Error(
          failed
            .map((r) => r.message)
            .filter(Boolean)
            .join("; ") || "Semua file gagal diproses."
        );
      }

      // ✅ Auto-login semua identitas baru
      const newIds = successful
        .map((r) => r.identity?.idString)
        .filter(Boolean);
      if (newIds.length > 0) {
        const loginRes = await window.electronAPI.loginSelected(newIds);
        if (!loginRes.success) {
          console.warn("Auto-login gagal:", loginRes.message);
        }
      }

      // ✅ UI feedback
      const toast = document.createElement("div");
      toast.className =
        "fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-50 text-white";
      if (successful.length === 1) {
        toast.classList.add("bg-green-600");
        toast.textContent = `✅ ${successful[0].message}`;
      } else {
        toast.classList.add("bg-blue-600");
        toast.textContent = `✅ ${successful.length} identitas berhasil ditambahkan${failed.length ? ` (${failed.length} gagal)` : ""}.`;
      }
      document.body.appendChild(toast);
      setTimeout(() => toast.remove?.(), 4000);

      await handleVaultUpdated(); // refresh identity list
    } catch (err) {
      console.error(`[triggerFileUpload ${type}] Error:`, err);
      handleAuthFailure(
        err.message || `Gagal memproses file ${type.toUpperCase()}.`
      );
    } finally {
      input.remove();
      if (currentScreen !== "identity-list") {
        showScreen("identity-list");
      }
    }
  };

  document.body.appendChild(input);
  input.click();
}

window.RemoveIdentityFromVault = async function () {
  const idsToDelete = Array.from(selectedIdentities);
  if (idsToDelete.length === 0) {
    alert("Pilih minimal satu identitas yang akan dihapus.");
    return;
  }

  const confirmMsg =
    idsToDelete.length === 1
      ? `Yakin ingin menghapus identitas "${idsToDelete[0]}" dari vault?\n\n⚠️ Aksi ini tidak bisa dibatalkan.`
      : `Yakin ingin menghapus ${idsToDelete.length} identitas terpilih dari vault?\n\n⚠️ Aksi ini tidak bisa dibatalkan.`;

  if (!confirm(confirmMsg)) return;

  // Gunakan password sesi yang sudah ada — jangan minta ulang tiap hapus
  if (!sessionVaultPassword) {
    const password = await showPasswordPrompt();
    if (!password || password.length < 8) {
      return alert("Password minimal 8 karakter.");
    }
    sessionVaultPassword = password;
  }

  try {
    showScreen("processing");

    // Hapus satu per satu (lebih aman & transparan error)
    for (const idString of idsToDelete) {
      const result = await window.electronAPI.removeIdentityFromVault(
        idString,
        sessionVaultPassword
      );

      if (!result.success) {
        throw new Error(
          `Gagal menghapus "${idString}": ${result.message || "Error tidak diketahui."}`
        );
      }
    }

    // ✅ Sukses — reset state & refresh UI
    selectedIdentities.clear();
    await handleVaultUpdated(); // ini akan refresh `activeIdentities` dan render ulang

    // Tampilkan notifikasi sukses
    const toast = document.createElement("div");
    toast.className =
      "fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg z-50";
    toast.textContent =
      idsToDelete.length === 1
        ? `✅ Identitas "${idsToDelete[0]}" berhasil dihapus.`
        : `✅ ${idsToDelete.length} identitas berhasil dihapus.`;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  } catch (err) {
    console.error("RemoveIdentityFromVault error:", err);
    alert(`Gagal menghapus identitas: ${err.message}`);
  } finally {
    // Pastikan kembali ke identity-list screen
    if (currentScreen !== "identity-list") {
      showScreen("identity-list");
    }
  }
};

// --- EVENT LISTENERS ---

// --- PASSWORD ---
function showPasswordPrompt({ minLength = 8, context = "vault" } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("password-modal");
    const pwdInput = document.getElementById("password-input");
    const confirmInput = document.getElementById("password-confirm");
    const submitBtn = document.getElementById("password-submit");
    const cancelBtn = document.getElementById("password-cancel");
    const err1 = document.getElementById("password-error-1"); // di bawah kolom 1
    const err2 = document.getElementById("password-error-2"); // di bawah kolom 2

    // Reset state
    pwdInput.value = "";
    confirmInput.value = "";
    err1.textContent = "";
    err2.textContent = "";
    pwdInput.classList.remove("border-red-500");
    confirmInput.classList.remove("border-red-500");
    modal.classList.remove("hidden");
    pwdInput.focus();

    const cleanup = () => {
      modal.classList.add("hidden");
      submitBtn.removeEventListener("click", onSubmit);
      cancelBtn.removeEventListener("click", onCancel);
      pwdInput.removeEventListener("input", validate1);
      confirmInput.removeEventListener("input", validate2);
      pwdInput.removeEventListener("keydown", onKey);
      confirmInput.removeEventListener("keydown", onKey);
    };

    // Validasi kolom 1: panjang ≥ min
    const validate1 = () => {
      const p1 = pwdInput.value.trim();
      let error = "";
      if (p1.length > 0 && p1.length < minLength) {
        error = `Password minimal ${minLength} karakter.`;
        pwdInput.classList.add("border-red-500");
      } else {
        pwdInput.classList.remove("border-red-500");
      }
      err1.textContent = error;
      // Re-validate kolom 2 juga, karena depend on p1
      validate2();
    };

    // Validasi kolom 2: cocok dengan kolom 1
    const validate2 = () => {
      const p1 = pwdInput.value.trim();
      const p2 = confirmInput.value.trim();
      let error = "";
      if (p2.length > 0) {
        if (p1 !== p2) {
          error = "Password tidak cocok.";
          confirmInput.classList.add("border-red-500");
        } else {
          confirmInput.classList.remove("border-red-500");
        }
      } else {
        confirmInput.classList.remove("border-red-500");
      }
      err2.textContent = error;

      // Update tombol aktif/nonaktif
      const isValid = p1.length >= minLength && p2.length > 0 && p1 === p2;
      submitBtn.disabled = !isValid;
    };

    const onSubmit = () => {
      const pwd = pwdInput.value.trim();
      const conf = confirmInput.value.trim();
      if (pwd.length < minLength) {
        err1.textContent = `Password minimal ${minLength} karakter.`;
        pwdInput.classList.add("border-red-500");
        pwdInput.focus();
        return;
      }
      if (pwd !== conf) {
        err2.textContent = "Password tidak cocok.";
        confirmInput.classList.add("border-red-500");
        confirmInput.focus();
        return;
      }
      cleanup();
      resolve(pwd);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onKey = (e) => {
      if (e.key === "Enter" && !submitBtn.disabled) onSubmit();
      else if (e.key === "Escape") onCancel();
    };

    // Bind listeners
    submitBtn.addEventListener("click", onSubmit);
    cancelBtn.addEventListener("click", onCancel);
    pwdInput.addEventListener("input", validate1);
    confirmInput.addEventListener("input", validate2);
    pwdInput.addEventListener("keydown", onKey);
    confirmInput.addEventListener("keydown", onKey);

    // Initial disabled
    submitBtn.disabled = true;
  });
}
function setupVaultPasswordScreen() {
  const input = document.getElementById("vault-password-input");
  const submitBtn = document.getElementById("vault-password-submit");
  const cancelBtn = document.getElementById("vault-password-cancel");
  const errorEl = document.getElementById("vault-password-error");

  // Reset UI
  input.value = "";
  errorEl.textContent = "";
  errorEl.style.display = "none";
  input.focus();

  // Listener (gunakan once agar tidak double-bind)
  submitBtn.removeEventListener("click", onSubmit);
  cancelBtn.removeEventListener("click", onCancel);
  input.removeEventListener("keydown", onKey);

  submitBtn.addEventListener("click", onSubmit);
  cancelBtn.addEventListener("click", onCancel);
  input.addEventListener("keydown", onKey);

  function onSubmit() {
    const pwd = input.value.trim();
    if (pwd.length < 8) {
      errorEl.textContent = "Password minimal 8 karakter.";
      errorEl.style.display = "block";
      input.focus();
      return;
    }

    errorEl.style.display = "none";
    showScreen("processing");

    window.electronAPI
      .unlockVault(pwd)
      .then((result) => {
        if (result.success) {
          sessionVaultPassword = pwd;
          handleVaultUnlocked(result.identities || []);
        } else {
          // ❌ Kembali ke vault-password-screen + tampilkan error
          showScreen("vault-password");
          errorEl.textContent = result.message || "Password salah.";
          errorEl.style.display = "block";
          setTimeout(() => input.focus(), 50);
        }
      })
      .catch((err) => {
        console.error("Unlock vault error:", err);
        showScreen("vault-password");
        errorEl.textContent = err.message || "Gagal membuka vault.";
        errorEl.style.display = "block";
        setTimeout(() => input.focus(), 50);
      });
  }

  function onCancel() {
    // Opsi: kembali ke no-vault / reload / keluar
    if (confirm("Batalkan dan mulai dari awal?\nVault tidak akan dibuka.")) {
      window.location.reload(); // atau showScreen("no-vault") + vault reset via API
    } else {
      input.focus();
    }
  }

  function onKey(e) {
    if (e.key === "Enter") onSubmit();
    else if (e.key === "Escape") onCancel();
  }
}

// Toggle visibility — password
document
  .getElementById("toggle-password-visibility")
  ?.addEventListener("click", function () {
    const input = document.getElementById("password-input");
    const eye = document.getElementById("eye-icon");
    const eyeOff = document.getElementById("eye-off-icon");
    if (input.type === "password") {
      input.type = "text";
      eye.classList.add("hidden");
      eyeOff.classList.remove("hidden");
    } else {
      input.type = "password";
      eye.classList.remove("hidden");
      eyeOff.classList.add("hidden");
    }
  });

// 🔹 BARU: Toggle visibility — konfirmasi
document
  .getElementById("toggle-confirm-password-visibility")
  ?.addEventListener("click", function () {
    const input = document.getElementById("password-confirm");
    const eye = document.getElementById("eye-icon-confirm");
    const eyeOff = document.getElementById("eye-off-icon-confirm");
    if (input.type === "password") {
      input.type = "text";
      eye.classList.add("hidden");
      eyeOff.classList.remove("hidden");
    } else {
      input.type = "password";
      eye.classList.remove("hidden");
      eyeOff.classList.add("hidden");
    }
  });

// Toggle visibility vault password
document
  .getElementById("toggle-vault-password-visibility")
  ?.addEventListener("click", function () {
    const input = document.getElementById("vault-password-input");
    const eye = document.getElementById("vault-eye-icon");
    const eyeOff = document.getElementById("vault-eye-off-icon");
    if (input.type === "password") {
      input.type = "text";
      eye.classList.add("hidden");
      eyeOff.classList.remove("hidden");
    } else {
      input.type = "password";
      eye.classList.remove("hidden");
      eyeOff.classList.add("hidden");
    }
  });

urlInputField.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !urlInputField.disabled) handleUrl();
});

goButton.addEventListener("click", () => {
  if (!goButton.disabled) handleUrl();
});

searchButton.addEventListener("click", () => {
  // 🔧 DIPERBAIKI: hapus spasi
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

backButton.addEventListener("click", () => {
  const webview = activeServiceTabId
    ? serviceTabs.get(activeServiceTabId)?.webview
    : tabs[currentTabIndex]?.webview;
  if (webview) webview.goBack();
});
forwardButton.addEventListener("click", () => {
  const webview = activeServiceTabId
    ? serviceTabs.get(activeServiceTabId)?.webview
    : tabs[currentTabIndex]?.webview;
  if (webview) webview.goForward();
});
reloadButton.addEventListener("click", () => {
  const webview = activeServiceTabId
    ? serviceTabs.get(activeServiceTabId)?.webview
    : tabs[currentTabIndex]?.webview;
  if (webview) webview.reload();
});
newTabButton.addEventListener("click", () => createBrowserTab());

// --- MODAL & SIDEBAR ---
if (identityButton)
  identityButton.addEventListener("click", displayIdentityData);
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
// --- LOG MODAL ---
const logButton = document.getElementById("log-button");
if (logButton) {
  logButton.addEventListener("click", showProxyLog);
}
if (closeLogModalButton) {
  closeLogModalButton.addEventListener("click", () => {
    logModal.classList.add("hidden");
    logModal.classList.remove("flex");
  });
}
if (logModal) {
  logModal.addEventListener("click", (e) => {
    if (e.target === logModal) {
      logModal.classList.add("hidden");
      logModal.classList.remove("flex");
    }
  });
}
if (downloadLogButton) {
  downloadLogButton.addEventListener("click", downloadProxyLog);
}

function handleInitialState(sessionState) {
  switch (sessionState.type) {
    case "no-vault":
      showScreen("no-vault");
      break;

    case "need-vault-password":
      // 🔐 Mulai use case 2: minta password
      showScreen("vault-password");
      setupVaultPasswordScreen(); // ⬅️ dipanggil sekali
      break;

    case "empty-vault":
      showScreen("empty-vault");
      break;

    case "show-identity-list":
      showScreen("identity-list"); // ← pastikan ini ada!
      activeIdentities = sessionState.payload.identities;
      displayIdentityOnVault();
      break;

    default:
      showScreen("no-vault");
  }
}

async function init() {
  // --- [FIX] Aktifkan Listener IPC ---
  window.electronAPI.onNewTabRequest((url) => {
    console.log("[INFO] Membuka tab baru dari window.open:", url);
    // Jika tidak ada tab sama sekali, buat tab default dulu (opsional)
    if (tabs.length === 0 && serviceTabs.size === 0) {
      createBrowserTab("https://www.google.com");
    }
    // Buat tab baru dengan URL dari window.open
    createBrowserTab(url);
  });

  try {
    // 1. Apakah ada identitas aktif di proxy? (artinya session masih jalan)
    const proxyState = await window.electronAPI.getActiveIdentitiesFromProxy();

    if (proxyState.success && proxyState.identities.length > 0) {
      activeIdentities = proxyState.identities;
      await refreshActiveIdentities(); // isi services lengkap
      renderSidebar();
      showScreen("browser");
      if (tabs.length === 0) {
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

document.addEventListener("DOMContentLoaded", init);
