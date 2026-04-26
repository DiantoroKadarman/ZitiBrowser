// =========================
// PROGRESS BAR (Chrome-style)
// =========================

let progressBarContainer = null;
let progressBar = null;

function initProgressBar() {
  progressBarContainer = document.getElementById("loading-progress-bar");
  progressBar = document.getElementById("loading-progress");

  // Jika tidak ada (misal auth mode), skip tanpa error
  if (!progressBarContainer || !progressBar) {
    console.warn(
      "[Progress Bar] Elemen tidak ditemukan — berjalan tanpa loading bar"
    );
    return;
  }

  console.log("[Progress Bar] Berhasil diinisialisasi.");
}

function showProgressBar() {
  if (!progressBarContainer) return;
  progressBarContainer.classList.remove("hidden");
  progressBar.style.width = "15%";
}

function updateProgress(percent) {
  if (!progressBarContainer) return;
  const clamped = Math.min(95, Math.max(10, percent)); // 10%–95% agar tidak full instan
  progressBar.style.width = `${clamped}%`;
}

function completeProgress(success = true) {
  if (!progressBarContainer) return;
  const target = success ? 100 : 90;
  progressBar.style.width = `${target}%`;
  setTimeout(() => {
    if (progressBarContainer) {
      progressBarContainer.classList.add("hidden");
      progressBar.style.width = "0%";
    }
  }, 250);
}

export { initProgressBar, showProgressBar, updateProgress, completeProgress };
