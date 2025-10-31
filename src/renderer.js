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
const identityDetailsContent = document.getElementById("identity-details-content");
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
const enrollmentForm = document.getElementById("enrollment-form");
const enrollJwtFile = document.getElementById("enroll-jwt-file");
const authErrorMessage = document.getElementById("auth-error-message");
const uploadIdentityButton = document.getElementById("upload-identity-button");

// --- INDICATOR PROSES ---
const processingIndicator = document.createElement("div");
processingIndicator.className = "text-center";
processingIndicator.innerHTML = `<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div><p class="text-lg text-gray-700">Memproses...</p>`;
processingIndicator.classList.add("hidden");
authScreen.appendChild(processingIndicator);

// --- STATE GLOBAL ---
let tabs = [];
let currentTabIndex = 0;
let activeIdentities = [];
let enabledIdentityIds = new Set();
let activeServiceTabId = null;
let serviceTabs = new Map();

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
  const browserContainer = document.querySelector(".app-container");
  browserContainer.classList.toggle("hidden", screen !== "browser");
  authScreen.classList.toggle("hidden", screen === "browser");

  if (screen !== "browser") {
    authBox.classList.toggle("hidden", screen === "processing");
    processingIndicator.classList.toggle("hidden", screen !== "processing");
  }
  authErrorMessage.classList.add("hidden");
  console.log(`Beralih ke tampilan: ${screen}`);
}

function handleAuthFailure(message) {
  authErrorMessage.innerHTML = `<span class="block sm:inline">${message}</span>`;
  authErrorMessage.classList.remove("hidden");
  showScreen("authentication");
}

function showPasswordPrompt() {
  return new Promise((resolve) => {
    const modal = document.getElementById("password-modal");
    const input = document.getElementById("password-input");
    const submitBtn = document.getElementById("password-submit");
    const cancelBtn = document.getElementById("password-cancel");

    input.value = "";
    modal.classList.remove("hidden");

    const cleanup = () => {
      modal.classList.add("hidden");
      submitBtn.removeEventListener("click", onSubmit);
      cancelBtn.removeEventListener("click", onCancel);
      input.removeEventListener("keydown", onKey);
    };

    const onSubmit = () => {
      cleanup();
      resolve(input.value);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onKey = (e) => {
      if (e.key === "Enter") onSubmit();
      if (e.key === "Escape") onCancel();
    };

    submitBtn.addEventListener("click", onSubmit);
    cancelBtn.addEventListener("click", onCancel);
    input.addEventListener("keydown", onKey);
    input.focus();
  });
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

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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
    showScreen("authentication");
    console.log("Logout berhasil.");
  } catch (e) {
    console.error("Gagal Logout:", e);
    handleAuthFailure("Gagal logout. Silakan mulai ulang aplikasi.");
  }
}

window.handleLogout = handleLogout;

window.displayIdentityData = function () {
  if (!identityModal || !identityDetailsContent) return;

  let html = "";
  if (activeIdentities.length === 0) {
    html += "<p class='text-gray-500'>Tidak ada identitas aktif.</p>";
  } else {
    activeIdentities.forEach((id) => {
      const isChecked = enabledIdentityIds.has(id.identity_id);
      html += `
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
            <button type="button" class="text-red-500 hover:text-red-700" title="Hapus identitas ini"
              onclick="deleteIdentityFromModal('${id.identity_id}')">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
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
};

window.toggleIdentityFromModal = function (identityId) {
  toggleIdentity(identityId);
  displayIdentityData();
};

// --- TAMBAH IDENTITAS DARI MODAL ---
window.uploadIdentityFromModal = async function () {
  // Trigger file picker
  const fileInput = document.getElementById("identity-file-input");
  if (!fileInput) {
    console.error("File input tidak ditemukan!");
    return;
  }

  // Reset dan buka dialog
  fileInput.value = "";
  fileInput.click();

  // Tunggu sampai file dipilih (gunakan Promise + event listener sekali pakai)
  const filesSelected = new Promise((resolve) => {
    const handler = (e) => {
      fileInput.removeEventListener("change", handler);
      resolve(Array.from(e.target.files));
    };
    fileInput.addEventListener("change", handler);
  });

  const files = await filesSelected;
  if (files.length === 0) return;

  // Minta password
  const password = await showPasswordPrompt();
  if (!password) {
    fileInput.value = "";
    return;
  }

  // Tampilkan indikator proses (opsional: bisa tampilkan di modal)
  showScreen("processing");

  try {
    const uploadPromises = files.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      return window.electronAPI.handleIdentityUpload(base64, password); 
    });

    const results = await Promise.all(uploadPromises);
    const hasSuccess = results.some((r) => r.success);
    const allMessages = results
      .filter((r) => !r.success && r.message)
      .map((r) => r.message)
      .join("\n");

    if (hasSuccess) {
      // Muat ulang sesi
      const sessionResult = await window.electronAPI.checkSession();
      if (sessionResult.type === "session-restored") {
        activeIdentities = sessionResult.payload.identities;
        enabledIdentityIds = new Set(
          activeIdentities.map((id) => id.identity_id)
        );
        renderSidebar();
        displayIdentityData(); // Perbarui modal
        // Tidak perlu pindah layar, tetap di browser
      } else {
        throw new Error("Gagal memuat sesi setelah upload.");
      }
    } else {
      handleAuthFailure(allMessages || "Gagal memuat semua file identitas.");
    }
  } catch (err) {
    console.error("Upload dari modal error:", err);
    handleAuthFailure(`Gagal memproses file: ${err.message}`);
  } finally {
    fileInput.value = "";
    // Kembalikan tampilan ke browser jika sedang di processing
    if (authScreen.classList.contains("hidden") === false) {
      showScreen("browser");
    }
  }
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

// --- AUTH LISTENERS ---
function setupAuthListeners() {
  // --- ENROLLMENT ---
  if (enrollmentForm) {
    enrollmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = enrollJwtFile.files[0];
      if (!file) return handleAuthFailure("File JWT harus dipilih.");

      const jwtContent = await file.text();
      const password = await showPasswordPrompt();
      if (!password) return;
      if (password.length < 8)
        return handleAuthFailure("Password minimal 8 karakter.");

      showScreen("processing");
      try {
        const result = await window.electronAPI.handleEnrollment(
          jwtContent,
          password
        );
        if (result.success) {
          const modal = document.getElementById("enrollment-success-modal");
          const msgEl = document.getElementById("success-message");
          if (modal && msgEl) {
            msgEl.textContent = result.message;
            modal.classList.remove("hidden");
            document.body.classList.add("overflow-hidden");
          }
        } else {
          handleAuthFailure(result.message);
        }
      } catch (err) {
        console.error("Error enrollment:", err);
        handleAuthFailure("Terjadi kesalahan saat enrollment.");
      } finally {
        enrollmentForm.reset();
      }
    });
  }

  // --- UPLOAD IDENTITY: HANYA trigger file input ---
  if (uploadIdentityButton) {
    uploadIdentityButton.addEventListener("click", () => {
      document.getElementById("identity-file-input").click();
    });
  }
}

// --- EVENT LISTENERS ---
document.getElementById("identity-file-input")
  ?.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const password = await showPasswordPrompt();
    if (!password) {
      e.target.value = "";
      return;
    }

    showScreen("processing");

    try {
      const uploadPromises = files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        return window.electronAPI.handleIdentityUpload(base64, password);
      });

      const results = await Promise.all(uploadPromises);
      const hasSuccess = results.some((r) => r.success);
      const allMessages = results
        .filter((r) => !r.success && r.message)
        .map((r) => r.message)
        .join("\n");

      if (hasSuccess) {
        const sessionResult = await window.electronAPI.checkSession();
        if (sessionResult.type === "session-restored") {
          activeIdentities = sessionResult.payload.identities;
          enabledIdentityIds = new Set(
            activeIdentities.map((id) => id.identity_id)
          );
          renderSidebar();
          showScreen("browser");
          if (tabs.length === 0) createBrowserTab("https://www.google.com");
        } else {
          throw new Error("Gagal memuat sesi setelah upload.");
        }
      } else {
        handleAuthFailure(allMessages || "Gagal memuat semua file identitas.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      handleAuthFailure(`Gagal memproses file: ${err.message}`);
    } finally {
      e.target.value = "";
    }
  });

function setupEnrollmentModalListener() {
  const closeBtn = document.getElementById("close-success-modal");
  if (closeBtn) {
    const clone = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(clone, closeBtn);
    clone.addEventListener("click", () => {
      const modal = document.getElementById("enrollment-success-modal");
      if (modal) {
        modal.classList.add("hidden");
        document.body.classList.remove("overflow-hidden");
      }
      authBox.classList.remove("hidden");
      authErrorMessage.classList.add("hidden");
      enrollmentForm?.reset();
      showScreen("authentication");
    });
  }
}

urlInputField.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !urlInputField.disabled) handleUrl();
});
goButton.addEventListener("click", () => {
  if (!goButton.disabled) handleUrl();
});

searchButton.addEventListener("click", () => {
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


// --- INIT ---
async function init() {
  setupAuthListeners();
  setupEnrollmentModalListener(); // 👈 penting!

  try {
    const result = await window.electronAPI.checkSession();
    if (result.type === "session-restored") {
      activeIdentities = result.payload.identities;
      enabledIdentityIds = new Set(
        activeIdentities.map((id) => id.identity_id)
      );
      renderSidebar();
      showScreen("browser");
      if (tabs.length === 0) createBrowserTab("https://www.google.com");
    } else if (result.type === "show-auth") {
      showScreen("authentication");
    } else if (result.type === "proxy-not-running") {
      handleAuthFailure("ziti-http-proxy tidak berjalan.");
      showScreen("authentication");
    }
  } catch (err) {
    console.error("Gagal cek sesi:", err);
    showScreen("authentication");
  }

  window.electronAPI.onSessionRestored((_, payload) => {
    activeIdentities = payload.identities || [];
    enabledIdentityIds = new Set(activeIdentities.map((id) => id.identity_id));
    renderSidebar();
    showScreen("browser");
    if (tabs.length === 0) createBrowserTab("https://www.google.com");
  });

  window.electronAPI.onShowAuth(() => showScreen("authentication"));
  window.electronAPI.onProxyNotRunning(() => {
    handleAuthFailure(
      "ziti-http-proxy tidak berjalan. Jalankan proxy terlebih dahulu."
    );
    showScreen("authentication");
  });
}

document.addEventListener("DOMContentLoaded", init);
