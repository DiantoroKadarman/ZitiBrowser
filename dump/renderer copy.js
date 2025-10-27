import "./index.css";

// --- REFERENSI ELEMEN NAVIGASI & UI ---
const backButton = document.getElementById("back-button");
const forwardButton = document.getElementById("forward-button");
const reloadButton = document.getElementById("reload-button");
const searchButton = document.getElementById("search-button");
const newTabButton = document.getElementById("new-tab-button");
const goButton = document.getElementById("go");
const urlInputField = document.getElementById("url-input");
const webview = document.getElementById("webview");
const tabsContainer = document.getElementById("tabs-container");
const serviceTabsContainer = document.getElementById("service-tabs-container");
const identityButton = document.getElementById("identity-button");
const identityModal = document.getElementById("identity-modal");
const identityDetailsContent = document.getElementById("identity-details-content");
const closeModalButton = document.getElementById("close-modal-button");
const sidebar = document.getElementById("sidebar");
const sidebarContent = document.getElementById("sidebar-content");
const collapseBtn = document.getElementById("collapse-btn");

// --- REFERENSI ELEMEN AUTH ---
const authScreen = document.getElementById("auth-screen");
const authBox = document.getElementById("auth-box");
const enrollmentForm = document.getElementById("enrollment-form");
const enrollJwtFile = document.getElementById("enroll-jwt-file");
const authErrorMessage = document.getElementById("auth-error-message");
const uploadIdentityButton = document.getElementById("upload-identity-button");
const uploadIdentityFile = document.getElementById("upload-identity-file");

// --- INDICATOR PROSES ---
const processingIndicator = document.createElement("div");
processingIndicator.className = "text-center";
processingIndicator.innerHTML = `<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div><p class="text-lg text-gray-700">Memproses...</p>`;
processingIndicator.classList.add("hidden");
authScreen.appendChild(processingIndicator);

// --- STATE GLOBAL BARU ---
let tabs = [];
let currentTabIndex = 0;
let activeIdentities = []; // Array semua identitas aktif
let enabledIdentityIds = new Set(); // Set ID yang di-enable di UI

// --- FUNGSI UTILITAS ---
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

// --- FUNGSI ZITI ---

function renderSidebar() {
  if (!serviceTabsContainer) return;

  const enabledIdentities = activeIdentities.filter(id =>
    enabledIdentityIds.has(id.identity_id)
  );

  if (enabledIdentities.length === 0) {
    serviceTabsContainer.innerHTML = `<p style='color: #666; padding: 10px;'>Tidak ada identitas yang diaktifkan.</p>`;
    return;
  }

  let html = '';
  enabledIdentities.forEach(identity => {
    const servicesHtml = identity.services?.map(service => {
      const safeService = service.replace(/'/g, "\\'");
      return `
        <button 
          type="button" 
          class="flex items-center w-full p-2 rounded-md transition-colors duration-200 space-x-2 tab hover:bg-gray-300"
          onclick="loadZitiServiceUrl('${safeService}')"
          title="Akses: http://${service}"
        >
          <span class='text-sm'>${service}</span>
        </button>
      `;
    }).join('') || '<p class="text-gray-500 px-2">Tidak ada layanan</p>';

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

window.toggleIdentity = function(identityId) {
  if (enabledIdentityIds.has(identityId)) {
    enabledIdentityIds.delete(identityId);
  } else {
    enabledIdentityIds.add(identityId);
  }
  renderSidebar();
};

window.loadZitiServiceUrl = function(serviceName) {
  const serviceUrl = `http://${serviceName}`;
  tabs[currentTabIndex].url = serviceUrl;
  urlInputField.value = serviceUrl;
  webview.src = serviceUrl;
};

// --- FUNGSI BROWSER ---
function handleUrl() {
  let url = urlInputField.value.trim();
  if (!url) return;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "http://" + url;
  }
  webview.src = url;
  tabs[currentTabIndex].url = url;
}

function renderTabs() {
  if (!tabsContainer) return;
  tabsContainer.innerHTML = "";
  if (tabs.length === 0) {
    tabs.push({ title: "Tab 1", url: "about:blank" });
    currentTabIndex = 0;
  }
  tabs.forEach((tab, index) => {
    const tabButton = document.createElement("button");
    tabButton.type = "button";
    tabButton.className = `flex items-center w-full p-2 rounded-md transition-colors duration-200 space-x-2 tab relative ${
      index === currentTabIndex ? "bg-gray-200 active" : "hover:bg-gray-300"
    }`;
    tabButton.innerHTML = `<span class='text-sm'>${tab.title}</span>`;
    tabButton.addEventListener("click", () => switchToTab(index));

    if (tabs.length > 1) {
      const closeBtn = document.createElement("span");
      closeBtn.innerHTML = "&times;";
      closeBtn.className = "close-btn ml-2 text-gray-400 hover:text-red-500 cursor-pointer";
      closeBtn.title = "Tutup Tab";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeTab(index);
      });
      tabButton.appendChild(closeBtn);
      tabButton.classList.add("group");
      tabButton.addEventListener("mouseenter", () => closeBtn.style.opacity = "1");
      tabButton.addEventListener("mouseleave", () => closeBtn.style.opacity = "0");
    }
    tabsContainer.appendChild(tabButton);
  });
}

function removeTab(index) {
  tabs.splice(index, 1);
  if (currentTabIndex >= tabs.length) currentTabIndex = Math.max(0, tabs.length - 1);
  renderTabs();
  if (tabs.length > 0) switchToTab(currentTabIndex);
}

function switchToTab(index) {
  currentTabIndex = index;
  const tab = tabs[index];
  if (tab) {
    urlInputField.value = tab.url;
    webview.src = tab.url;
  }
  renderTabs();
}

// --- LOGOUT ---
async function handleLogout() {
  try {
    if (identityModal) {
      identityModal.classList.add("hidden");
      identityModal.classList.remove("flex");
    }

    showScreen("processing");
    await window.electronAPI.logout();

    activeIdentities = [];
    enabledIdentityIds = new Set();
    tabs = [];
    currentTabIndex = 0;

    renderTabs();
    switchToTab(0);
    webview.src = "about:blank";

    showScreen("authentication");
    console.log("Logout berhasil.");
  } catch (e) {
    console.error("Gagal Logout:", e);
    handleAuthFailure("Gagal logout. Silakan mulai ulang aplikasi.");
  }
}
window.handleLogout = handleLogout;

// --- TAMPILAN MODAL IDENTITAS ---
  window.displayIdentityData = function() {
    if (!identityModal || !identityDetailsContent) return;

    let html = '<h3 class="font-bold mb-3">IDENTITAS AKTIF</h3>';

    if (activeIdentities.length === 0) {
      html += '<p>Tidak ada identitas aktif.</p>';
    } else {
      activeIdentities.forEach(id => {
        const isChecked = enabledIdentityIds.has(id.identity_id);
        const isDisabled = !isChecked;

        html += `
          <div class="mb-3 p-3 border rounded ${isDisabled ? 'bg-gray-100 opacity-75' : 'bg-white'} flex justify-between items-start">
            <div class="flex-1">
              <p class="font-medium text-gray-800">${id.identity_name || "N/A"}</p>
              <p class="text-xs text-gray-500">ID: ${id.identity_id || "N/A"}</p>
            </div>
            <div class="flex items-center space-x-2 ml-3">
              <!-- Toggle Aktif/Nonaktif -->
              <label class="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  class="sr-only peer" 
                  ${isChecked ? 'checked' : ''}
                  onchange="toggleIdentityFromModal('${id.identity_id}')"
                />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>

              <!-- Tombol Hapus -->
              <button 
                type="button"
                class="text-red-500 hover:text-red-700"
                title="Hapus identitas ini"
                onclick="deleteIdentityFromModal('${id.identity_id}')"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        `;
      });
    }

    html += `
      <button onclick="handleLogout()" class="mt-4 w-full py-2 bg-red-600 text-white rounded">
        Logout Semua Identitas
      </button>
    `;

    identityDetailsContent.innerHTML = html;
    identityModal.classList.remove("hidden");
    identityModal.classList.add("flex");
  };

// Toggle dari modal
window.toggleIdentityFromModal = function(identityId) {
  toggleIdentity(identityId);
  displayIdentityData(); // refresh tampilan
};

// Hapus identitas spesifik dari modal
window.deleteIdentityFromModal = async function(identityId) {
  if (!confirm("Yakin ingin menghapus identitas ini?")) return;

  try {
    await window.electronAPI.deleteIdentity(identityId);
    activeIdentities = activeIdentities.filter(id => id.identity_id !== identityId);
    enabledIdentityIds.delete(identityId);
    renderSidebar();
    displayIdentityData();

    console.log(`Identitas ${identityId} dihapus.`);
  } catch (err) {
    console.error("Gagal menghapus identitas:", err);
    alert("Gagal menghapus identitas. Coba lagi.");
  }
};

// Fungsi helper untuk toggle dari modal
window.toggleIdentityFromModal = function(identityId) {
  toggleIdentity(identityId); // panggil fungsi utama yang sudah ada
  displayIdentityData(); // refresh modal agar tampilan up-to-date
};

// --- OTENTIKASI ---
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function setupAuthListeners() {
  // Enrollment
  if (enrollmentForm) {
    enrollmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = enrollJwtFile.files[0];
      if (!file) return handleAuthFailure("File JWT harus dipilih.");

      showScreen("processing");
      try {
        const jwtContent = await file.text();
        const result = await window.electronAPI.handleEnrollment(jwtContent);
        if (result.success) {
          authBox.classList.add("hidden");
          authErrorMessage.classList.add("hidden");
          const successScreen = document.getElementById("enrollment-success");
          const msgEl = document.getElementById("success-message");
          if (successScreen && msgEl) {
            msgEl.textContent = result.message;
            successScreen.classList.remove("hidden");
          }
          showScreen("authentication");
        } else {
          handleAuthFailure(result.message);
        }
      } catch (err) {
        console.error("Error enrollment:", err);
        handleAuthFailure("Terjadi kesalahan saat enrollment.");
      }
    });
  }

  // Upload Identity
  if (uploadIdentityButton) {
    uploadIdentityButton.addEventListener("click", () => uploadIdentityFile.click());
  }

  if (uploadIdentityFile) {
    uploadIdentityFile.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      showScreen("processing");
      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        const result = await window.electronAPI.handleIdentityUpload(base64);
        if (result.success) {
          activeIdentities = result.identities || [];
          enabledIdentityIds = new Set(activeIdentities.map(id => id.identity_id));
          renderSidebar();
          showScreen("browser");
          if (tabs.length === 0) {
            tabs.push({ title: "Home", url: "https://www.google.com" });
            switchToTab(0);
          }
        } else {
          handleAuthFailure(result.message);
        }
      } catch (err) {
        console.error("Error upload:", err);
        handleAuthFailure(`Gagal membaca file: ${err.message}`);
      } finally {
        e.target.value = null;
      }
    });
  }

  // Kembali ke login
  const returnBtn = document.getElementById("return-to-login-button");
  if (returnBtn) {
    const clone = returnBtn.cloneNode(true);
    returnBtn.parentNode.replaceChild(clone, returnBtn);
    clone.addEventListener("click", () => {
      document.getElementById("enrollment-success")?.classList.add("hidden");
      authBox.classList.remove("hidden");
      enrollmentForm?.reset();
      authErrorMessage.classList.add("hidden");
    });
  }
}

// --- INISIALISASI ---
async function init() {
  renderTabs();
  setupAuthListeners();

  // SETUP LISTENER DARI MAIN PROCESS
  window.electronAPI.onSessionRestored((event, payload) => {
    activeIdentities = payload.identities || [];
    enabledIdentityIds = new Set(activeIdentities.map(id => id.identity_id));
    renderSidebar();
    showScreen("browser");
    if (tabs.length === 0) {
      tabs.push({ title: "Home", url: "https://www.google.com" });
      switchToTab(0);
    }
  });

  window.electronAPI.onShowAuth(() => {
    showScreen("authentication");
  });

  window.electronAPI.onProxyNotRunning(() => {
    handleAuthFailure("ziti-http-proxy tidak berjalan. Jalankan proxy terlebih dahulu.");
    showScreen("authentication");
  });
}

document.addEventListener("DOMContentLoaded", init);

// --- EVENT LISTENER BROWSER ---
urlInputField.addEventListener("keydown", (e) => { if (e.key === "Enter") handleUrl(); });
goButton.addEventListener("click", handleUrl);
searchButton.addEventListener("click", () => {
  const url = "https://www.google.com";
  urlInputField.value = url;
  webview.src = url;
  tabs[currentTabIndex] = { title: "Google", url };
});
backButton.addEventListener("click", () => webview.goBack());
forwardButton.addEventListener("click", () => webview.goForward());
reloadButton.addEventListener("click", () => webview.reload());

webview.addEventListener("did-navigate", (e) => {
  if (e.url.startsWith("data:") || e.url.startsWith("ziti-")) return;
  urlInputField.value = e.url;
  if (tabs[currentTabIndex]) tabs[currentTabIndex].url = e.url;
});

newTabButton.addEventListener("click", () => {
  const tab = { title: `Tab ${tabs.length + 1}`, url: "https://www.google.com" };
  tabs.push(tab);
  switchToTab(tabs.length - 1);
});

// Modal & Sidebar
if (identityButton) identityButton.addEventListener("click", displayIdentityData);
if (closeModalButton) closeModalButton.addEventListener("click", () => {
  identityModal.classList.add("hidden");
  identityModal.classList.remove("flex");
});
if (identityModal) identityModal.addEventListener("click", (e) => {
  if (e.target === identityModal) {
    identityModal.classList.add("hidden");
    identityModal.classList.remove("flex");
  }
});
if (collapseBtn) collapseBtn.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
  collapseBtn.classList.toggle("rotate-180");
  sidebarContent.classList.toggle("hidden");
});