// --- Browser Tab Management ---

import { state } from "./state.js";
import {
  createWebviewForTab,
  attachWebviewListeners,
  showWebview,
  updateNavButtons,
} from "./webview.js";
import { renderSidebar } from "./service-tabs.js";

const urlInputField = document.getElementById("url-input");
const goButton = document.getElementById("go");

function handleUrl() {
  let url = urlInputField.value.trim();
  if (!url) return;
  if (!url.startsWith("http://") && !url.startsWith("https://"))
    url = "http://" + url;

  const tab = state.tabs[state.currentTabIndex];
  if (tab) {
    tab.url = url;
    tab.webview.src = url;
    urlInputField.value = url;
  }
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
  state.tabs.push(newTab);
  switchToBrowserTab(state.tabs.length - 1);
  renderTabs();
}

function renderTabs() {
  const tabsContainer = document.getElementById("tabs-container");
  if (!tabsContainer) return;
  tabsContainer.innerHTML = "";

  if (state.tabs.length === 0) {
    createBrowserTab("https://www.google.com");
    return;
  }

  state.tabs.forEach((tab, index) => {
    const isActive =
      index === state.currentTabIndex && state.activeServiceTabId === null;
    const tabButton = document.createElement("button");
    tabButton.type = "button";
    tabButton.className = `flex items-center w-full p-2 rounded-md transition-colors duration-200 space-x-2 tab relative ${isActive ? "bg-gray-200 active" : "hover:bg-gray-300"}`;
    tabButton.innerHTML = `<span class='text-sm max-w-full truncate'>${tab.title}</span>`;

    tabButton.addEventListener("click", () => switchToBrowserTab(index));

    if (state.tabs.length > 1) {
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
  const tab = state.tabs[index];
  if (tab?.webview?.parentNode) tab.webview.remove();
  state.tabs.splice(index, 1);

  if (state.tabs.length === 0 && state.serviceTabs.size === 0) {
    createBrowserTab("https://www.google.com");
  } else if (state.activeServiceTabId === null) {
    const newIndex = Math.max(
      0,
      Math.min(state.currentTabIndex, state.tabs.length - 1)
    );
    switchToBrowserTab(newIndex);
  }
  renderTabs();
}

function switchToBrowserTab(index) {
  if (index < 0 || index >= state.tabs.length) return;
  const tab = state.tabs[index];
  if (!tab) return;

  showWebview(tab.webview);
  state.currentTabIndex = index;
  state.activeServiceTabId = null;

  urlInputField.value = tab.url;
  urlInputField.disabled = false;
  goButton.disabled = false;

  renderTabs();
  renderSidebar();
  updateNavButtons();
}

function setupBrowserListeners() {
  const backButton = document.getElementById("back-button");
  const forwardButton = document.getElementById("forward-button");
  const reloadButton = document.getElementById("reload-button");
  const searchButton = document.getElementById("search-button");
  const newTabButton = document.getElementById("new-tab-button");

  // --- Identity Modal & Sidebar ---
  const identityButton = document.getElementById("identity-button");
  const identityModal = document.getElementById("identity-modal");
  const closeModalButton = document.getElementById("close-modal-button");
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebar-content");
  const collapseBtn = document.getElementById("collapse-btn");

  urlInputField.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !urlInputField.disabled) handleUrl();
  });

  goButton.addEventListener("click", () => {
    if (!goButton.disabled) handleUrl();
  });

  searchButton.addEventListener("click", () => {
    const url = "https://www.google.com";
    const tab = state.tabs[state.currentTabIndex];
    if (tab) {
      tab.url = url;
      tab.webview.src = url;
      urlInputField.value = url;
    }
    state.activeServiceTabId = null;
    renderSidebar();
  });

  backButton.addEventListener("click", () => {
    const webview = state.activeServiceTabId
      ? state.serviceTabs.get(state.activeServiceTabId)?.webview
      : state.tabs[state.currentTabIndex]?.webview;
    if (webview) webview.goBack();
  });
  forwardButton.addEventListener("click", () => {
    const webview = state.activeServiceTabId
      ? state.serviceTabs.get(state.activeServiceTabId)?.webview
      : state.tabs[state.currentTabIndex]?.webview;
    if (webview) webview.goForward();
  });
  reloadButton.addEventListener("click", () => {
    const webview = state.activeServiceTabId
      ? state.serviceTabs.get(state.activeServiceTabId)?.webview
      : state.tabs[state.currentTabIndex]?.webview;
    if (webview) webview.reload();
  });
  newTabButton.addEventListener("click", () => createBrowserTab());

  // --- MODAL & SIDEBAR ---
  if (identityButton) {
    identityButton.addEventListener("click", () => {
      import("./identity-modal.js").then((mod) => mod.displayIdentityData());
    });
  }
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
}

export {
  handleUrl,
  createBrowserTab,
  renderTabs,
  removeBrowserTab,
  switchToBrowserTab,
  setupBrowserListeners,
};
