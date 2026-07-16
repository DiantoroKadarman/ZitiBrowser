// --- Authentication Flow (Strict Whitelist Mode) ---

import { state } from "./state.js";
import { showScreen } from "./screens.js";
import { showPasswordPrompt } from "./password-prompt.js";
import { renderSidebar } from "./service-tabs.js";
import { displayIdentityData } from "./identity-modal.js";
import { webviewContainer } from "./webview.js";

const identityModal = document.getElementById("identity-modal");

// --- Utilitas Error ---
function handleAuthFailure(msg) {
  console.error("[AUTH] Error:", msg);
  alert(msg);
  // Kembali ke screen yang sesuai
  if (state.currentScreen === "processing") {
    // Coba kembali ke state sebelumnya
    window.electronAPI.checkSession().then((sessionState) => {
      const { handleInitialState } = require("./screens.js");
      handleInitialState(sessionState);
    }).catch(() => {
      showScreen("no-vault");
    });
  }
}

// --- Refresh Identitas dari Proxy ---
async function refreshActiveIdentities() {
  try {
    const result = await window.electronAPI.getZitiIdentityData();
    state.activeIdentities = result.identities || [];
    state.enabledIdentityIds = new Set(
      state.activeIdentities.map((id) => id.identity_id)
    );

    // --- Sinkronkan whitelist ke main process ---
    const allServices = state.activeIdentities
      .flatMap((id) => id.services || [])
      .filter((s) => typeof s === "string" && s.trim());
    const uniqueServices = [...new Set(allServices)];
    window.electronAPI.updateWhitelistServices(uniqueServices);
    console.log("[WHITELIST] Sinkronisasi services:", uniqueServices);
  } catch (e) {
    console.warn("Gagal refresh identitas dari proxy:", e);
  }
}

// --- Vault Event Handlers ---
async function handleVaultUpdated() {
  try {
    const result = await window.electronAPI.checkSession();
    if (result.type === "show-identity-list") {
      state.activeIdentities = result.payload.identities;
      if (state.currentScreen === "browser") {
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
    state.activeIdentities = identities;
    displayIdentityOnVault();
    showScreen("identity-list");
  }
}

// --- Identity List (Vault Screen) ---
function displayIdentityOnVault() {
  const identityListContent = document.getElementById("identity-list-content");
  if (!identityListContent) return;

  let html = "";
  if (state.activeIdentities.length === 0) {
    html = "<p class='text-sm text-gray-400 py-4 text-center'>Tidak ada identitas dalam vault.</p>";
  } else {
    html = `
    <div class="space-y-3">
      <div class="flex justify-between items-center">
        <h3 class="text-sm font-semibold text-gray-500"></h3>

        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500">Pilih Semua</span>
          <button 
            type="button"
            onclick="toggleSelectAll()"
            class="w-5 h-5 flex items-center justify-center focus:outline-none rounded"
          >
            ${
              state.selectedIdentities.size === 0
                ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" stroke-width="2"/></svg>`
                : state.selectedIdentities.size === state.activeIdentities.length
                  ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`
                  : `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><line x1="5" y1="12" x2="19" y2="12" stroke-width="2" stroke-linecap="round"/></svg>`
            }
          </button>
        </div>
      </div>

      ${state.activeIdentities
        .map((id) => {
          const isSelected = state.selectedIdentities.has(id.idString);
          const checkboxId = `chk-${id.idString.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
          return `
          <div class="identity-card ${isSelected ? "selected" : ""}">
            <input 
              type="checkbox" 
              id="${checkboxId}"
              ${isSelected ? "checked" : ""}
              onchange="toggleIdentitySelection('${id.idString.replace(/'/g, "\\'")}', this.checked)"
            />
            <div class="flex-1 min-w-0 cursor-pointer" onclick="toggleCheckbox('${checkboxId}')">
              <p class="font-medium text-sm text-gray-800 truncate">${id.name || "Unnamed Identity"}</p>
              <p class="text-xs text-gray-400 truncate mt-0.5">ID: ${id.idString}</p>
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

// --- Global UI Functions ---
window.toggleCheckbox = function (checkboxId) {
  const checkbox = document.getElementById(checkboxId);
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
};

window.toggleIdentitySelection = function (idString, checked) {
  if (checked) {
    state.selectedIdentities.add(idString);
  } else {
    state.selectedIdentities.delete(idString);
  }

  const checkboxId = `chk-${idString.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const checkbox = document.getElementById(checkboxId);
  if (checkbox) {
    checkbox.checked = checked;
  }

  updateLoginButton();
};

window.toggleSelectAll = function () {
  if (state.selectedIdentities.size === state.activeIdentities.length) {
    state.selectedIdentities.clear();
  } else {
    state.activeIdentities.forEach((id) =>
      state.selectedIdentities.add(id.idString)
    );
  }
  displayIdentityOnVault();
  updateLoginButton();
};

function updateLoginButton() {
  const loginBtn = document.getElementById("login-btn");
  if (!loginBtn) return;

  const count = state.selectedIdentities.size;
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

// --- Login Selection ---
window.handleLoginSelection = async function () {
  const ids = Array.from(state.selectedIdentities);
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
    } else {
      handleAuthFailure(result.message || "Gagal login.");
    }
  } catch (error) {
    console.error("[RENDERER] Login error:", error);
    handleAuthFailure("Terjadi kesalahan saat login.");
  }
};

// --- Logout ---
async function handleLogout() {
  try {
    if (identityModal) {
      identityModal.classList.add("hidden");
      identityModal.classList.remove("flex");
    }

    showScreen("processing");
    await window.electronAPI.logout();

    const allWebviews = Array.from(state.serviceTabs.values()).map((s) => s.webview);
    allWebviews.filter((wv) => wv?.parentNode).forEach((wv) => wv.remove());

    state.activeIdentities = [];
    state.enabledIdentityIds = new Set();
    state.serviceTabs.clear();
    state.activeServiceTabId = null;

    webviewContainer.innerHTML = "";

    const vaultState = await window.electronAPI.checkSession();
    const { handleInitialState } = await import("./screens.js");
    handleInitialState(vaultState);
    console.log("Logout berhasil.");
  } catch (e) {
    console.error("Gagal Logout:", e);
    handleAuthFailure("Gagal logout. Silakan mulai ulang aplikasi.");
  }
}
window.handleLogout = handleLogout;

// --- Upload Identity Dialog ---
function showUploadIdentityDialog() {
  let modal = document.getElementById("upload-identity-dialog");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "upload-identity-dialog";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-card max-w-sm p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Tambah Identitas</h3>
        <div class="space-y-3">
          <button id="btn-upload-json" class="auth-btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload dari File JSON
          </button>
          <button id="btn-upload-jwt" class="auth-btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload dari File JWT
          </button>
        </div>
        <button id="btn-cancel-upload" class="w-full mt-4 py-2 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
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

// --- File Upload (Single Source of Truth) ---
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

    if (!state.sessionVaultPassword) {
      const password = await showPasswordPrompt();
      if (!password || password.length < 8) {
        input.remove();
        return alert("Password minimal 8 karakter.");
      }
      state.sessionVaultPassword = password;
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
              password: state.sessionVaultPassword,
            })
          : window.electronAPI.handleEnrollment({
              jwtContent: fileContent,
              fileName,
              password: state.sessionVaultPassword,
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

      // // ✅ Auto-login semua identitas baru
      // const newIds = successful
      //   .map((r) => r.identity?.idString)
      //   .filter(Boolean);
      // if (newIds.length > 0) {
      //   const loginRes = await window.electronAPI.loginSelected(newIds);
      //   if (!loginRes.success) {
      //     console.warn("Auto-login gagal:", loginRes.message);
      //   }
      // }

      // ✅ UI feedback
      const toast = document.createElement("div");
      toast.className =
        "fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-[200] text-white";
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
      if (state.currentScreen !== "identity-list") {
        showScreen("identity-list");
      }
    }
  };

  document.body.appendChild(input);
  input.click();
}

// --- Remove Identity from Vault ---
window.RemoveIdentityFromVault = async function () {
  const idsToDelete = Array.from(state.selectedIdentities);
  if (idsToDelete.length === 0) {
    alert("Pilih minimal satu identitas yang akan dihapus.");
    return;
  }

  const confirmMsg =
    idsToDelete.length === 1
      ? `Yakin ingin menghapus identitas "${idsToDelete[0]}" dari vault?\n\n⚠️ Aksi ini tidak bisa dibatalkan.`
      : `Yakin ingin menghapus ${idsToDelete.length} identitas terpilih dari vault?\n\n⚠️ Aksi ini tidak bisa dibatalkan.`;

  if (!confirm(confirmMsg)) return;

  // Gunakan password sesi yang sudah ada
  if (!state.sessionVaultPassword) {
    const password = await showPasswordPrompt();
    if (!password || password.length < 8) {
      return alert("Password minimal 8 karakter.");
    }
    state.sessionVaultPassword = password;
  }

  try {
    showScreen("processing");

    // Hapus satu per satu (lebih aman & transparan error)
    for (const idString of idsToDelete) {
      const result = await window.electronAPI.removeIdentityFromVault(
        idString,
        state.sessionVaultPassword
      );

      if (!result.success) {
        throw new Error(
          `Gagal menghapus "${idString}": ${result.message || "Error tidak diketahui."}`
        );
      }
    }

    // ✅ Sukses — reset state & refresh UI
    state.selectedIdentities.clear();
    await handleVaultUpdated();

    // Tampilkan notifikasi sukses
    const toast = document.createElement("div");
    toast.className =
      "fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg z-[200]";
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
    if (state.currentScreen !== "identity-list") {
      showScreen("identity-list");
    }
  }
};

// --- Setup Auth Listeners ---
function setupAuthListeners() {
  const enrollmentForm = document.getElementById("enrollment-form");
  const enrollJwtFile = document.getElementById("enroll-jwt-file");
  const uploadIdentityButton = document.getElementById(
    "upload-identity-button"
  );

  // --- ENROLLMENT (first-time) ---
  if (enrollmentForm) {
    enrollmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const files = Array.from(enrollJwtFile.files);
      if (files.length === 0)
        return handleAuthFailure("File JWT harus dipilih.");

      const password = await showPasswordPrompt();
      if (!password || password.length < 8) {
        return handleAuthFailure("Password minimal 8 karakter.");
      }

      showScreen("processing");
      try {
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

        const sessionRes = await window.electronAPI.checkSession();
        if (sessionRes.type !== "show-identity-list") {
          throw new Error("Vault tidak terbuka setelah enroll.");
        }

        state.activeIdentities = sessionRes.payload.identities;
        const firstId = state.activeIdentities[0];
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

        await refreshActiveIdentities();
        renderSidebar();
        showScreen("browser");
      } catch (err) {
        console.error("Multi-upload (first-time) error:", err);
        handleAuthFailure(err.message || "Gagal memproses identitas.");
      } finally {
        e.target.value = "";
      }
    });
}

export {
  setupAuthListeners,
  handleAuthFailure,
  refreshActiveIdentities,
  handleVaultUpdated,
  handleVaultUnlocked,
  handleLogout,
  displayIdentityOnVault,
};
