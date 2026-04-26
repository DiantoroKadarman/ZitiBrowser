// --- Proxy Log Modal ---

const logModal = document.getElementById("log-modal");
const logContent = document.getElementById("log-content");
const closeLogModalButton = document.getElementById("close-log-modal");
const downloadLogButton = document.getElementById("download-log");

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

function setupLogModal() {
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
}

export { setupLogModal, showProxyLog, downloadProxyLog };
