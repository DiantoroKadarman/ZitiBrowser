let progressBarContainer = null;
let progressBar = null;
let trickleTimer = null;
let currentProgress = 0;

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
  stopTrickle();
  currentProgress = 15;
  progressBarContainer.classList.remove("hidden");
  progressBar.style.width = `${currentProgress}%`;
  startTrickle();
}

/**
 * Trickle: simulasi progress naik secara bertahap.
 * Semakin tinggi progress, semakin lambat increment-nya.
 * Ini karena Electron webview tidak punya event 'did-progress-load'.
 */
function startTrickle() {
  stopTrickle();
  trickleTimer = setInterval(() => {
    if (currentProgress >= 90) {
      stopTrickle();
      return;
    }
    // Semakin tinggi progress, increment semakin kecil
    let increment;
    if (currentProgress < 30) increment = 3;
    else if (currentProgress < 50) increment = 2;
    else if (currentProgress < 70) increment = 1;
    else if (currentProgress < 85) increment = 0.5;
    else increment = 0.2;

    currentProgress = Math.min(90, currentProgress + increment);
    progressBar.style.width = `${currentProgress}%`;
  }, 200);
}

function stopTrickle() {
  if (trickleTimer) {
    clearInterval(trickleTimer);
    trickleTimer = null;
  }
}

function updateProgress(percent) {
  if (!progressBarContainer) return;
  stopTrickle();
  currentProgress = Math.min(95, Math.max(10, percent));
  progressBar.style.width = `${currentProgress}%`;
}

function completeProgress(success = true) {
  if (!progressBarContainer) return;
  stopTrickle();
  currentProgress = success ? 100 : 90;
  progressBar.style.width = `${currentProgress}%`;
  setTimeout(() => {
    if (progressBarContainer) {
      progressBarContainer.classList.add("hidden");
      progressBar.style.width = "0%";
      currentProgress = 0;
    }
  }, 250);
}

export { initProgressBar, showProgressBar, updateProgress, completeProgress, stopTrickle };
