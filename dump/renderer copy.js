import "./index.css";

// --- REFERENSI ELEMEN NAVIGASI & TAB (Existing) ---
const backButton = document.getElementById("back-button");
const forwardButton = document.getElementById("forward-button");
const reloadButton = document.getElementById("reload-button");
const searchButton = document.getElementById("search-button");
const newTabButton = document.getElementById("new-tab-button");
const goButton = document.getElementById("go");
const urlInputField = document.getElementById("url-input");
const webview = document.getElementById("webview");
const tabsContainer = document.getElementById("tabs-container");
const serviceTabsContainer = document.getElementById("service-tabs-container"); // REFERENSI SERVICE TABS

// --- REFERENSI ELEMEN BARU (Identity & Sidebar) ---
const identityButton = document.getElementById("identity-button");
const identityModal = document.getElementById("identity-modal"); // Ambil elemen modal
const identityDetailsContent = document.getElementById(
  "identity-details-content"
); // Ambil elemen tempat konten detail
const closeModalButton = document.getElementById("close-modal-button"); // Ambil tombol tutup

const sidebar = document.getElementById("sidebar");
const sidebarContent = document.getElementById("sidebar-content");
const collapseBtn = document.getElementById("collapse-btn");

let tabs = [];
let currentTabIndex = 0;
let zitiIdentity = null; // Variabel global untuk menyimpan data Ziti

function loadZitiServiceUrl(serviceName) {
  const serviceUrl = `http://${serviceName}`;
  console.log(`[Ziti] Loading service URL: ${serviceUrl}`);
  tabs[currentTabIndex].url = serviceUrl;
  urlInputField.value = serviceUrl;
  webview.src = serviceUrl;
}
// Ekspor fungsi ke konteks global agar dapat diakses dari HTML
window.loadZitiServiceUrl = loadZitiServiceUrl;

// Fungsi untuk mengambil data Identity Ziti melalui IPC (LOGIKA FETCH + ERROR HANDLING)
async function fetchIdentityData() {
  try {
    console.log("[Ziti] Requesting Identity data via IPC...");
    const identity = await window.electronAPI.getZitiIdentityData();
    zitiIdentity = identity; // Simpan data ke variabel global
    console.log("✅ Identity Data Received:", identity);
    return identity;
  } catch (error) {
    // LOGIKA DISPLAY ERROR LANGSUNG DI SINI
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

    // Bersihkan serviceTabsContainer saat error
    if (serviceTabsContainer) {
      serviceTabsContainer.innerHTML = `<p class="text-red-500 p-3">Gagal memuat layanan. Periksa status dan koneksi Ziti.</p>`;
    }
    // Lemparkan error lagi agar orchestrator tahu fetch gagal
    throw error;
  }
}

// Fungsi untuk merender Tombol Layanan di SERVICE TABS CONTAINER (Gabungan displayServices dan generateServiceButtonsHTML)
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
      // Hati-hati dengan tanda kutip di nama layanan saat dimasukkan ke onclick
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
  const identity = await fetchIdentityData();
  const textHtml = `
      <div id="ziti-status-popup" class="p-0" style="font-family: Arial, sans-serif;">
        <h3 class="font-bold text-gray-800 uppercase mb-3 text-lg border-b pb-2">IDENTITY DETAILS</h3>
        <p class="truncate mb-1"><span class="font-semibold text-gray-600">NAME :</span> ${identity.identity_name}</p>
        <p class="truncate"><span class="font-semibold text-gray-600">ID :</span> ${identity.identity_id}</p>
      </div>
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
  tabsContainer.innerHTML = "";
  if (tabs.length === 0) {
    tabs.push({ title: "Tab 1", url: "https://google.com" });
    currentTabIndex = 0;
  }
  tabs.forEach((tab, index) => {
    const tabButton = document.createElement("button");
    tabButton.type = "button";
    tabButton.className = `flex items-center w-default p-2 rounded-md transition-colors duration-200 space-x-2 tab relative ${
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

  // Panggil renderZitiServices di sini untuk memastikan layanan selalu ter-render
  if (zitiIdentity) {
    renderZitiServices(zitiIdentity);
  } else {
    // Tampilkan status loading awal atau kosong
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
    tabs.push({ title: "Tab 1", url: "https://google.com" });
    currentTabIndex = 0;
    renderTabs();
    switchToTab(0);
  }
}

function switchToTab(index) {
  currentTabIndex = index;
  const tab = tabs[index];
  urlInputField.value = tab.url;
  webview.src = tab.url;
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

backButton.addEventListener("click", () => {
  webview.goBack();
});

forwardButton.addEventListener("click", () => {
  webview.goForward();
});

reloadButton.addEventListener("click", () => {
  webview.reload();
});

webview.addEventListener("did-navigate", (event) => {
  // Abaikan did-navigate jika itu adalah halaman status Ziti (URL Data)
  if (
    event.url.startsWith("data:text/html") ||
    event.url.startsWith("ziti-identity-status-://")
  ) {
    return;
  }
  const url = event.url;
  urlInputField.value = url;
  tabs[currentTabIndex].url = url;
});

newTabButton.addEventListener("click", () => {
  const tab = {
    title: `Tab ${tabs.length + 1}`,
    url: "https://google.com",
  };
  tabs.push(tab);
  renderTabs();
  switchToTab(tabs.length - 1);
});

if (identityButton) {
  identityButton.addEventListener("click", displayIdentityData);
}

// LOGIKA MODAL IDENTITY
if (closeModalButton && identityModal) {
  closeModalButton.addEventListener("click", () => {
    identityModal.classList.add("hidden"); // Sembunyikan modal
    identityModal.classList.remove("flex"); // Hapus flex untuk memastikan tersembunyi
  });
}

if (identityModal) {
  identityModal.addEventListener("click", (e) => {
    // Cek apakah yang diklik adalah elemen modal itu sendiri (bukan konten di dalamnya)
    if (e.target === identityModal) {
      identityModal.classList.add("hidden");
      identityModal.classList.remove("flex");
    }
  });
}

if (sidebar && collapseBtn) {
  collapseBtn.addEventListener("click", () => {
    const isCollapsed = sidebar.classList.toggle("collapsed");

    if (tabsContainer) {
      tabsContainer.classList.toggle("collapsed", isCollapsed);
    }
    collapseBtn.classList.toggle("rotate-180");

    // Sembunyikan konten dengan delay jika collapse
    if (isCollapsed) {
      setTimeout(() => {
        if (sidebarContent) {
          sidebarContent.classList.add("hidden");
        }
      }, 250);
    } else {
      if (sidebarContent) {
        sidebarContent.classList.remove("hidden");
      }
    }
  });
}

async function init() {
  try {
    // Ini akan memanggil fetchIdentityData, yang akan mengisi zitiIdentity global
    await fetchIdentityData();
  } catch (e) {
    console.log(
      "Initial Ziti service fetch failed, continuing startup without identity data."
    );
  }
  renderTabs();
}

init();
