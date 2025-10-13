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

// --- REFERENSI ELEMEN BARU (Identity & Sidebar) ---
const identityButton = document.getElementById("identity-button");
const sidebar = document.getElementById("sidebar");
const sidebarContent = document.getElementById("sidebar-content");
const collapseBtn = document.getElementById("collapse-btn");

let tabs = [];
let currentTabIndex = 0;

// --- FUNGSI BARU: FETCH DATA ZITI VIA IPC ---

async function fetchAndDisplayIdentityData() {
  console.log("[Ziti] Requesting Identity data via IPC...");

  // Memberi nama URL unik saat menampilkan status
  const IDENTITY_STATUS_URL = "ziti-identity-status://";

  try {
    // PANGGILAN IPC KE MAIN PROCESS: Minta data dari API 8081
    // window.electronAPI.getZitiIdentityData() didefinisikan di preload.js
    const identity = await window.electronAPI.getZitiIdentityData();

    console.log("✅ Identity Data Received:", identity);

    // --- Generate HTML untuk Tampilan Sukses ---
    const servicesList = identity.services
      ? identity.services
          .map(
            (s) =>
              `<li style="list-style-type: disc; margin-left: 20px;">${s}</li>`
          )
          .join("")
      : "<li>No services found for this identity.</li>";

    const htmlContent = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <h1 style="color: #2E86C1;">Ziti Identity Status</h1>
                <p>Status: <span style="color: green; font-weight: bold;">Terhubung dan Data Diterima</span></p>
                <h2 style="margin-top: 20px;">Identity Details</h2>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <tr><td style="padding: 8px; border: 1px solid #ddd; width: 30%;">Name</td><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${identity.identity_name}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #ddd;">ID</td><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${identity.identity_id}</td></tr>
                </table>
                <h2 style="margin-top: 20px;">Available Services</h2>
                <ul style="padding: 0;">${servicesList}</ul>
            </div>
        `;

    // Memuat konten ke webview
    webview.src = `data:text/html,${encodeURIComponent(htmlContent)}`;
    urlInputField.value = IDENTITY_STATUS_URL;
  } catch (error) { 
    console.error(
      "❌ Failed to fetch Ziti Identity Data via IPC:",
      error.message
    );

    // --- Generate HTML untuk Tampilan Gagal ---
    const errorHtml = `
            <div style="padding: 20px; font-family: Arial, sans-serif; color: #cc0000;">
                <h1>❌ Gagal Mengambil Data Ziti API</h1>
                <p>Periksa koneksi ke API Server (Port 8081).</p>
                <p>Detail Error:</p>
                <pre style="background: #fee; padding: 10px; border: 1px solid #f99; white-space: pre-wrap;">${error.message}</pre>
            </div>
        `;
    // Memuat error HTML ke webview
    webview.src = `data:text/html,${encodeURIComponent(errorHtml)}`;
    urlInputField.value = "ziti-identity-error://";
  }
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

// --- EVENT LISTENERS (Existing) ---
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

// New Tab Functionality
newTabButton.addEventListener("click", () => {
  const tab = {
    title: `Tab ${tabs.length + 1}`,
    url: "https://google.com",
  };
  tabs.push(tab);
  renderTabs();
  switchToTab(tabs.length - 1);
});

// Render Tabs
function renderTabs() {
  tabsContainer.innerHTML = "";
  if (tabs.length === 0) {
    tabs.push({ title: "Tab 1", url: "https://google.com" });
    currentTabIndex = 0;
  }
  tabs.forEach((tab, index) => {
    const tabButton = document.createElement("button");
    tabButton.type = "button";
    tabButton.className = `flex items-center w-default p-2 rounded-md transition-colors duration-200 space-x-2 tab relative ${index === currentTabIndex ? "bg-gray-200 active" : "hover:bg-gray-300"}`;
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

// Switch Tabs
function switchToTab(index) {
  currentTabIndex = index;
  const tab = tabs[index];
  urlInputField.value = tab.url;
  webview.src = tab.url;
  renderTabs();
}

// Inisialisasi tampilan tab awal
renderTabs();

// --- EVENT LISTENER BARU (Ziti Identity Button) ---
if (identityButton) {
  identityButton.addEventListener("click", fetchAndDisplayIdentityData);
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
