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
const identityDetailsContent = document.getElementById(
  "identity-details-content"
);
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

// --- Referensi untuk unggah file identitas ---
const uploadIdentityButton = document.getElementById("upload-identity-button");
const uploadIdentityFile = document.getElementById("upload-identity-file"); // Input file yang tersembunyi

const processingIndicator = document.createElement("div");
processingIndicator.className = "text-center";
processingIndicator.innerHTML = `<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div><p class="text-lg text-gray-700">Memproses...</p>`;
processingIndicator.classList.add("hidden");

authScreen.appendChild(processingIndicator);

let tabs = [];
let currentTabIndex = 0;
let zitiIdentity = null;

// --- UTILITY SCRIPT DAN STATE MANAGEMENT ---
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

async function handleActivationSuccess() {
  try {
    await fetchIdentityData();
    renderTabs();
    showScreen("browser");

    if (
      zitiIdentity &&
      zitiIdentity.services &&
      zitiIdentity.services.length > 0
    ) {
      console.log(
        `Aktivasi berhasil untuk Identity: ${zitiIdentity.identity_name}`
      );
    } else {
      console.log(
        "Jaringan Ziti aktif tetapi tidak ada layanan yang tersedia."
      );
      tabs[currentTabIndex].url = "https://www.google.com";
      webview.src = tabs[currentTabIndex].url;
      urlInputField.value = tabs[currentTabIndex].url;
    }
  } catch (e) {
    console.error("Gagal memuat layanan setelah aktivasi sukses.", e);
    webview.src = `data:text/html,${encodeURIComponent("<h1>Gagal Memuat Layanan</h1><p>Jaringan Ziti Aktif, namun gagal mengambil daftar layanan. Coba muat ulang aplikasi.</p>")}`;
  }
}

function handleAuthFailure(message) {
  authErrorMessage.innerHTML = `<span class="block sm:inline">${message}</span>`;
  authErrorMessage.classList.remove("hidden");
  showScreen("authentication");
}

async function handleLogout() {
  try {
    if (identityModal) {
      identityModal.classList.add("hidden");
      identityModal.classList.remove("flex");
    }

    showScreen("processing");
    await window.electronAPI.logout();

    zitiIdentity = null;
    if (serviceTabsContainer) {
      serviceTabsContainer.innerHTML = `<p style='color: #666; padding: 10px;'>Identity terkunci.</p>`;
    }

    tabs = [];
    currentTabIndex = 0;
    renderTabs();
    switchToTab(0);
    webview.src = "about:blank";

    showScreen("authentication");
    console.log("Logout berhasil. Jaringan Ziti dihentikan.");
  } catch (e) {
    console.error("Gagal Logout:", e);
    handleAuthFailure(
      "Gagal saat mencoba logout. Silakan mulai ulang aplikasi."
    );
  }
}
window.handleLogout = handleLogout;

function loadZitiServiceUrl(serviceName) {
  const serviceUrl = `http://${serviceName}`;
  console.log(`[Ziti] Loading service URL: ${serviceUrl}`);
  tabs[currentTabIndex].url = serviceUrl;
  urlInputField.value = serviceUrl;
  webview.src = serviceUrl;
}
window.loadZitiServiceUrl = loadZitiServiceUrl;

async function fetchIdentityData() {
  try {
    console.log("[Ziti] Meminta data Identity ('Status') melalui IPC...");
    const identity = await window.electronAPI.getZitiIdentityData();
    zitiIdentity = identity;
    console.log("Data Identity ('Status') diterima:", identity);
    return identity;
  } catch (error) {
    console.error("Gagal mengambil Data Ziti Identity:", error.message);
    const errorHtml = `<div style="padding: 20px; font-family: Arial, sans-serif; color: #cc0000;">
  <h1>Gagal Mengambil Data dari Ziti Proxy</h1>
  <p>Pastikan ziti-http-proxy berjalan di port yang benar (default: 8081).</p>
  <p>Detail Error:</p>
  <pre style="background: #fee; padding: 10px; border: 1px solid #f99; white-space: pre-wrap;">${error.message}</pre>
  </div>`;
    webview.src = `data:text/html,${encodeURIComponent(errorHtml)}`;
    urlInputField.value = "ziti-identity-error://";
    if (serviceTabsContainer) {
      serviceTabsContainer.innerHTML = `<p class="text-red-500 p-3">Gagal memuat layanan.</p>`;
    }
    throw error;
  }
}

function renderZitiServices(identity) {
  const services = identity?.services;
  if (!services || services.length === 0) {
    if (serviceTabsContainer) {
      serviceTabsContainer.innerHTML =
        "<p style='color: #666; padding: 10px;'>Tidak ada layanan Ziti.</p>";
    }
    return;
  }
  const serviceButtonsHTML = services
    .map((service) => {
      const serviceName = service.replace(/'/g, "\\'");
      return `
  <button 
   type="button" 
   class="flex items-center w-full p-2 rounded-md transition-colors duration-200 space-x-2 tab relative hover:bg-gray-300"
   onclick="loadZitiServiceUrl('${serviceName}')"
   title="Akses layanan: http://${service}"
  >
   <span class='text-s'>${service}</span>
  </button>
 `;
    })
    .join("");
  if (serviceTabsContainer) {
    serviceTabsContainer.innerHTML = serviceButtonsHTML;
  }
}

async function displayIdentityData() {
  if (!identityModal || !identityDetailsContent) return;

  if (!zitiIdentity) {
    try {
      await fetchIdentityData();
    } catch (e) {
      handleAuthFailure("Gagal memuat data Identity. Silakan coba lagi.");
      return;
    }
  }

  const identity = zitiIdentity;
  const textHtml = `
     <div id="ziti-status-popup" class="p-0" style="font-family: Arial, sans-serif;">
       <h3 class="font-bold text-gray-800 uppercase mb-3 text-lg border-b pb-2">DETAIL IDENTITAS</h3>
         <p class="truncate mb-1"><span class="font-semibold text-gray-600">NAMA:</span> <span class="font-small text-gray-500">${identity.identity_name || "N/A"}</span></p>
         <p class="truncate"><span class="font-semibold text-gray-600">ID:</span> <span class="font-small text-gray-500">${identity.identity_id || "N/A"}</span></p>
         <p class="truncate mt-2 text-xs text-green-600">STATUS: 🟢 AKTIF</p>
     </div>
     <button id="logout-button" onclick="handleLogout()" class="mt-6 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
       Logout & Kunci Identitas
     </button>`;
  identityDetailsContent.innerHTML = textHtml;
  identityModal.classList.remove("hidden");
  identityModal.classList.add("flex");
}

// --- FUNGSI MANAJEMEN TAB & BROWSER ---
function handleUrl() {
  let url = "";
  const inputUrl = urlInputField.value;
  if (inputUrl.startsWith("http://") || inputUrl.startsWith("https://")) {
    url = inputUrl;
  } else {
    url = "http://" + inputUrl;
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

    // Tombol hapus tab (tanda silang)
    if (tabs.length > 1) {
      const closeBtn = document.createElement("span");
      closeBtn.innerHTML = "&times;";
      closeBtn.className =
        "close-btn ml-2 text-gray-400 hover:text-red-500 cursor-pointer";
      closeBtn.style.transition = "opacity 0.2s";
      closeBtn.title = "Tutup Tab";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeTab(index);
      });
      tabButton.appendChild(closeBtn);
      tabButton.classList.add("group");
      tabButton.addEventListener("mouseenter", () => {
        closeBtn.style.opacity = "1";
      });
      tabButton.addEventListener("mouseleave", () => {
        closeBtn.style.opacity = "0";
      });
    }
    tabsContainer.appendChild(tabButton);
  });

  if (zitiIdentity) {
    renderZitiServices(zitiIdentity);
  } else if (serviceTabsContainer) {
    serviceTabsContainer.innerHTML = `<p style='color: #666; padding: 10px;'>Identity terkunci.</p>`;
  }
}

function removeTab(index) {
  tabs.splice(index, 1);
  if (currentTabIndex >= tabs.length) {
    currentTabIndex = tabs.length - 1;
  }
  renderTabs();
  if (tabs.length > 0) {
    switchToTab(currentTabIndex);
  } else {
    renderTabs();
    switchToTab(0);
  }
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

// --- EVENT LISTENER & STARTUP CALL ---
urlInputField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleUrl();
  }
});
goButton.addEventListener("click", handleUrl);
searchButton.addEventListener("click", () => {
  const url = "https://www.google.com";
  urlInputField.value = url;
  webview.src = url;
  tabs[currentTabIndex].url = url;
});
backButton.addEventListener("click", () => webview.goBack());
forwardButton.addEventListener("click", () => webview.goForward());
reloadButton.addEventListener("click", () => webview.reload());

webview.addEventListener("did-navigate", (event) => {
  if (event.url.startsWith("data:") || event.url.startsWith("ziti-")) return;
  urlInputField.value = event.url;
  if (tabs[currentTabIndex]) {
    tabs[currentTabIndex].url = event.url;
  }
});

newTabButton.addEventListener("click", () => {
  const tab = { title: `Tab ${tabs.length + 1}`, url: "https://google.com" };
  tabs.push(tab);
  switchToTab(tabs.length - 1);
});

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

// --- LOGIKA OTENTIKASI (DIPERBAIKI SESUAI MAIN.JS BARU) ---

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function setupAuthListeners() {
  // --- Enrollment Form ---
  if (enrollmentForm) {
    enrollmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = enrollJwtFile.files[0];
      if (!file) {
        handleAuthFailure("File JWT harus dipilih.");
        return;
      }

      showScreen("processing");

      try {
        const jwtContent = await file.text();
        const result = await window.electronAPI.handleEnrollment(jwtContent);

        if (result.success) {
          // Sembunyikan form, tampilkan pesan sukses
          authBox.classList.add("hidden");
          authErrorMessage.classList.add("hidden");

          const successMessageEl = document.getElementById("success-message");
          const successScreen = document.getElementById("enrollment-success");

          if (successMessageEl && successScreen) {
            successMessageEl.textContent = result.message;
            successScreen.classList.remove("hidden");
          }

          showScreen("authentication");
        } else {
          handleAuthFailure(result.message);
        }
      } catch (err) {
        console.error("Error during enrollment:", err);
        handleAuthFailure("Terjadi kesalahan saat memproses enrollment.");
      }
    });
  }

  // --- Upload Identity Button ---
  if (uploadIdentityButton) {
    uploadIdentityButton.addEventListener("click", () => {
      uploadIdentityFile.click();
    });
  }

  if (uploadIdentityFile) {
    uploadIdentityFile.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      showScreen("processing");
      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        const result = await window.electronAPI.handleIdentityUpload(base64);
        if (result.success) {
          handleActivationSuccess();
        } else {
          handleAuthFailure(result.message);
        }
      } catch (err) {
        console.error("Error saat membaca file:", err);
        handleAuthFailure(`Gagal membaca file: ${err.message}`);
      } finally {
        event.target.value = null;
      }
    });
  }

  // --- Listener untuk tombol "Kembali ke Login" ---
  const returnBtn = document.getElementById("return-to-login-button");
  if (returnBtn) {
    // Hindari duplikasi listener
    const newBtn = returnBtn.cloneNode(true);
    returnBtn.parentNode.replaceChild(newBtn, returnBtn);
    newBtn.addEventListener("click", () => {
      // Sembunyikan pesan sukses
      document.getElementById("enrollment-success")?.classList.add("hidden");
      // Tampilkan kembali form
      authBox.classList.remove("hidden");
      // Reset form & error
      enrollmentForm?.reset();
      authErrorMessage.classList.add("hidden");
    });
  }
}

async function init() {
  renderTabs();
  setupAuthListeners();
  showScreen("authentication");
}

document.addEventListener("DOMContentLoaded", init);
