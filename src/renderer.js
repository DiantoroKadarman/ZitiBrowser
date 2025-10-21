import "./index.css";
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
const reactivationOptions = document.getElementById("reactivation-options");
const useSavedIdentityButton = document.getElementById("use-saved-identity");
const showEnrollmentLink = document.getElementById("show-enrollment-link");
const authErrorMessage = document.getElementById("auth-error-message");
// BARU: Referensi ke tombol hapus/lupakan
const forgetIdentityButton = document.getElementById("forget-identity-button");

const processingIndicator = document.createElement("div");
processingIndicator.className = "text-center";
processingIndicator.innerHTML = `
  <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
  <p class="text-lg text-gray-700">Memproses...</p>
`;
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

    if (screen === "enrollment") {
      enrollmentForm.classList.remove("hidden");
      reactivationOptions.classList.add("hidden");
    } else if (screen === "reactivation") {
      enrollmentForm.classList.add("hidden");
      reactivationOptions.classList.remove("hidden");
    }
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
      // loadZitiServiceUrl(zitiIdentity.services[0]);
      console.log(
        `Aktivasi berhasil untuk Identity: ${zitiIdentity.identity_name}`
      );
      console.log(`Service pertama: ${zitiIdentity.services[0]}`);
    } else {
      console.log(`Service tidak ada atau kosong.`);
    }
  } catch (e) {
    console.error("Gagal memuat layanan setelah aktivasi sukses.", e);
    webview.src = `data:text/html,${encodeURIComponent("<h1>Gagal Memuat Layanan</h1><p>Jaringan Ziti Aktif, namun gagal mengambil daftar layanan. Coba reload.</p>")}`;
  }
}

function handleAuthFailure(message) {
  authErrorMessage.innerHTML = `<span class="block sm:inline">${message}</span>`;
  authErrorMessage.classList.remove("hidden");

  window.electronAPI.checkIdentityStatus().then((status) => {
    if (status === "IDENTITY_SAVED") {
      showScreen("reactivation");
    } else {
      showScreen("enrollment");
    }
  });
}

async function handleLogout() {
  try {
    if (identityModal) {
      identityModal.classList.add("hidden");
      identityModal.classList.remove("flex");
    }

    showScreen("processing");
    // Memanggil logic logout yang ada di main process
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
    const status = await window.electronAPI.checkIdentityStatus();
    if (status === "IDENTITY_SAVED") {
      showScreen("reactivation");
    } else {
      showScreen("enrollment");
    }
    console.log("Logout berhasil. Jaringan Ziti dihentikan.");
  } catch (e) {
    console.error("Gagal Logout:", e);
    handleAuthFailure("Gagal logout.");
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
    console.log("[Ziti] Requesting Identity data via IPC...");
    const identity = await window.electronAPI.getZitiIdentityData();
    zitiIdentity = identity;
    console.log(" Identity Data Received:", identity);
    return identity;
  } catch (error) {
    console.error("Failed to fetch Ziti Identity Data via IPC:", error.message);
    const errorHtml = `<div style="padding: 20px; font-family: Arial, sans-serif; color: #cc0000;">
    <h1> Gagal Mengambil Data Ziti API</h1>
    <p>Periksa koneksi ke API Server (Port 8081).</p>
    <p>Detail Error:</p>
    <pre style="background: #fee; padding: 10px; border: 1px solid #f99; white-space: pre-wrap;">
      ${error.message}
    </pre>
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
        "<p style='color: #666; padding: 10px;'>Tidak ada layanan Ziti yang tersedia.</p>";
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
  if (!identityModal || !identityDetailsContent) {
    console.error("Modal elements not found in DOM.");
    return;
  }
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
   <h3 class="font-bold text-gray-800 uppercase mb-3 text-lg border-b pb-2">IDENTITY DETAILS</h3>
   <p class="truncate mb-1"><span class="font-semibold text-gray-600">NAME :</span> <span class="font-small text-gray-500">${identity.identity_name || "N/A"}</span> </p>
   <p class="truncate"><span class="font-semibold text-gray-600">ID :</span> <span class="font-small text-gray-500">${identity.identity_id || "N/A"}</span></p>
   <p class="truncate mt-2 text-xs text-green-600">STATUS : 🟢 AKTIF</p>
  </div>
  <button id="logout-button" onclick="handleLogout()" class="mt-6 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
    Logout & Kunci Identitas
  </button>
 `;
  identityDetailsContent.innerHTML = textHtml;
  identityModal.classList.remove("hidden");
  identityModal.classList.add("flex");
}

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
  } else {
    if (serviceTabsContainer) {
      serviceTabsContainer.innerHTML = `<p style='color: #666; padding: 10px;'>Memuat layanan...</p>`;
    }
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
goButton.addEventListener("click", (event) => {
  event.preventDefault();
  handleUrl();
});
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
  if (
    event.url.startsWith("data:text/html") ||
    event.url.startsWith("ziti-identity-error")
  ) {
    return;
  }
  const url = event.url;
  urlInputField.value = url;
  if (tabs[currentTabIndex]) {
    tabs[currentTabIndex].url = url;
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

// --- LOGIKA OTENTIKASI ---
function setupAuthListeners() {
  if (enrollmentForm) {
    enrollmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = enrollJwtFile.files[0];
      if (!file) {
        handleAuthFailure("File JWT harus diisi.");
        return;
      }
      showScreen("processing");
      const jwtContent = await file.text();
      const result = await window.electronAPI.handleEnrollment(jwtContent);
      if (result.success) {
        handleActivationSuccess();
      } else {
        handleAuthFailure(result.message);
      }
    });
  }

  if (useSavedIdentityButton) {
    useSavedIdentityButton.addEventListener("click", async () => {
      showScreen("processing");
      const result = await window.electronAPI.reactivateSavedIdentity();
      if (result.success) {
        handleActivationSuccess();
      } else {
        handleAuthFailure(result.message);
      }
    });
  }

  if (showEnrollmentLink) {
    showEnrollmentLink.addEventListener("click", () =>
      showScreen("enrollment")
    );
  }

  // BARU: Tambahkan event listener untuk tombol hapus
  if (forgetIdentityButton) {
    forgetIdentityButton.addEventListener("click", handleLogout);
  }
}

async function init() {
  renderTabs();
  setupAuthListeners();

  const status = await window.electronAPI.checkIdentityStatus();
  console.log("Initial Identity Status:", status);

  if (status === "IDENTITY_SAVED") {
    showScreen("reactivation");
  } else {
    showScreen("enrollment");
  }
}

document.addEventListener("DOMContentLoaded", init);
