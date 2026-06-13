// --- Password Prompt & Vault Password Screen ---

function showPasswordPrompt({ minLength = 8, context = "vault" } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("password-modal");
    const pwdInput = document.getElementById("password-input");
    const confirmInput = document.getElementById("password-confirm");
    const submitBtn = document.getElementById("password-submit");
    const cancelBtn = document.getElementById("password-cancel");
    const err1 = document.getElementById("password-error-1"); // di bawah kolom 1
    const err2 = document.getElementById("password-error-2"); // di bawah kolom 2

    // Reset state
    pwdInput.value = "";
    confirmInput.value = "";
    err1.textContent = "";
    err2.textContent = "";
    pwdInput.classList.remove("border-red-500");
    confirmInput.classList.remove("border-red-500");
    modal.classList.remove("hidden");
    pwdInput.focus();

    const cleanup = () => {
      modal.classList.add("hidden");
      submitBtn.removeEventListener("click", onSubmit);
      cancelBtn.removeEventListener("click", onCancel);
      pwdInput.removeEventListener("input", validate1);
      confirmInput.removeEventListener("input", validate2);
      pwdInput.removeEventListener("keydown", onKey);
      confirmInput.removeEventListener("keydown", onKey);
    };

    // Validasi kolom 1: panjang ≥ min
    const validate1 = () => {
      const p1 = pwdInput.value.trim();
      let error = "";
      if (p1.length > 0 && p1.length < minLength) {
        error = `Password minimal ${minLength} karakter.`;
        pwdInput.classList.add("border-red-500");
      } else {
        pwdInput.classList.remove("border-red-500");
      }
      err1.textContent = error;
      // Re-validate kolom 2 juga, karena depend on p1
      validate2();
    };

    // Validasi kolom 2: cocok dengan kolom 1
    const validate2 = () => {
      const p1 = pwdInput.value.trim();
      const p2 = confirmInput.value.trim();
      let error = "";
      if (p2.length > 0) {
        if (p1 !== p2) {
          error = "Password tidak cocok.";
          confirmInput.classList.add("border-red-500");
        } else {
          confirmInput.classList.remove("border-red-500");
        }
      } else {
        confirmInput.classList.remove("border-red-500");
      }
      err2.textContent = error;

      // Update tombol aktif/nonaktif
      const isValid = p1.length >= minLength && p2.length > 0 && p1 === p2;
      submitBtn.disabled = !isValid;
    };

    const onSubmit = () => {
      const pwd = pwdInput.value.trim();
      const conf = confirmInput.value.trim();
      if (pwd.length < minLength) {
        err1.textContent = `Password minimal ${minLength} karakter.`;
        pwdInput.classList.add("border-red-500");
        pwdInput.focus();
        return;
      }
      if (pwd !== conf) {
        err2.textContent = "Password tidak cocok.";
        confirmInput.classList.add("border-red-500");
        confirmInput.focus();
        return;
      }
      cleanup();
      resolve(pwd);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onKey = (e) => {
      if (e.key === "Enter" && !submitBtn.disabled) onSubmit();
      else if (e.key === "Escape") onCancel();
    };

    // Bind listeners
    submitBtn.addEventListener("click", onSubmit);
    cancelBtn.addEventListener("click", onCancel);
    pwdInput.addEventListener("input", validate1);
    confirmInput.addEventListener("input", validate2);
    pwdInput.addEventListener("keydown", onKey);
    confirmInput.addEventListener("keydown", onKey);

    // Initial disabled
    submitBtn.disabled = true;
  });
}

function setupVaultPasswordScreen(showScreenFn, handleVaultUnlockedFn) {
  const input = document.getElementById("vault-password-input");
  const submitBtn = document.getElementById("vault-password-submit");
  const cancelBtn = document.getElementById("vault-password-cancel");
  const errorEl = document.getElementById("vault-password-error");

  // Reset UI
  input.value = "";
  errorEl.textContent = "";
  errorEl.innerHTML = "";
  errorEl.className = "vault-password-error";
  errorEl.style.display = "none";
  input.focus();

  // Listener (gunakan removeEventListener agar tidak double-bind)
  submitBtn.removeEventListener("click", onSubmit);
  cancelBtn.removeEventListener("click", onCancel);
  input.removeEventListener("keydown", onKey);

  submitBtn.addEventListener("click", onSubmit);
  cancelBtn.addEventListener("click", onCancel);
  input.addEventListener("keydown", onKey);

  function onSubmit() {
    const pwd = input.value.trim();
    if (pwd.length < 8) {
      errorEl.textContent = "Password minimal 8 karakter.";
      errorEl.style.display = "block";
      errorEl.className = "vault-password-error";
      input.focus();
      return;
    }

    errorEl.style.display = "none";
    showScreenFn("processing");

    window.electronAPI
      .unlockVault(pwd)
      .then((result) => {
        if (result.success) {
          handleVaultUnlockedFn(pwd, result.identities || []);
        } else {
          // ❌ Kembali ke vault-password-screen + tampilkan error
          showScreenFn("vault-password");

          const code = result.errorCode;

          if (code === "VAULT_TAMPERED") {
            // 🔴 File vault telah dimanipulasi
            errorEl.className = "vault-password-error vault-error-tampered";
            errorEl.innerHTML =
              `<strong>⚠️ Peringatan Keamanan!</strong><br>` +
              `File vault telah dimanipulasi / tidak valid.<br>` +
              `Hapus file vault dan buat ulang dengan enrollment baru.`;
          } else if (code === "VAULT_CORRUPT") {
            // 🟠 File vault rusak
            errorEl.className = "vault-password-error vault-error-corrupt";
            errorEl.innerHTML =
              `<strong>⚠️ File Vault Rusak</strong><br>` +
              (result.message || "File vault tidak dapat dibaca.");
          } else if (code === "WRONG_PASSWORD_OR_TAMPERED") {
            // 🟡 Format lama — ambiguitas
            errorEl.className = "vault-password-error vault-error-ambiguous";
            errorEl.innerHTML =
              `<strong>Password salah atau file dimanipulasi</strong><br>` +
              `Jika Anda yakin password benar, kemungkinan file vault telah diubah oleh pihak lain.`;
          } else {
            // 🔵 Password salah (default / WRONG_PASSWORD)
            errorEl.className = "vault-password-error";
            errorEl.textContent = result.message || "Password salah.";
          }

          errorEl.style.display = "block";
          setTimeout(() => input.focus(), 50);
        }
      })
      .catch((err) => {
        console.error("Unlock vault error:", err);
        showScreenFn("vault-password");
        errorEl.className = "vault-password-error";
        errorEl.textContent = err.message || "Gagal membuka vault.";
        errorEl.style.display = "block";
        setTimeout(() => input.focus(), 50);
      });
  }

  function onCancel() {
    // Opsi: kembali ke no-vault / reload / keluar
    if (confirm("Batalkan dan mulai dari awal?\nVault tidak akan dibuka.")) {
      window.location.reload();
    } else {
      input.focus();
    }
  }

  function onKey(e) {
    if (e.key === "Enter") onSubmit();
    else if (e.key === "Escape") onCancel();
  }
}

function setupPasswordVisibilityToggles() {
  // Toggle visibility — password
  document
    .getElementById("toggle-password-visibility")
    ?.addEventListener("click", function () {
      const input = document.getElementById("password-input");
      const eye = document.getElementById("eye-icon");
      const eyeOff = document.getElementById("eye-off-icon");
      if (input.type === "password") {
        input.type = "text";
        eye.classList.add("hidden");
        eyeOff.classList.remove("hidden");
      } else {
        input.type = "password";
        eye.classList.remove("hidden");
        eyeOff.classList.add("hidden");
      }
    });

  // Toggle visibility — konfirmasi
  document
    .getElementById("toggle-confirm-password-visibility")
    ?.addEventListener("click", function () {
      const input = document.getElementById("password-confirm");
      const eye = document.getElementById("eye-icon-confirm");
      const eyeOff = document.getElementById("eye-off-icon-confirm");
      if (input.type === "password") {
        input.type = "text";
        eye.classList.add("hidden");
        eyeOff.classList.remove("hidden");
      } else {
        input.type = "password";
        eye.classList.remove("hidden");
        eyeOff.classList.add("hidden");
      }
    });

  // Toggle visibility vault password
  document
    .getElementById("toggle-vault-password-visibility")
    ?.addEventListener("click", function () {
      const input = document.getElementById("vault-password-input");
      const eye = document.getElementById("vault-eye-icon");
      const eyeOff = document.getElementById("vault-eye-off-icon");
      if (input.type === "password") {
        input.type = "text";
        eye.classList.add("hidden");
        eyeOff.classList.remove("hidden");
      } else {
        input.type = "password";
        eye.classList.remove("hidden");
        eyeOff.classList.add("hidden");
      }
    });
}

export {
  showPasswordPrompt,
  setupVaultPasswordScreen,
  setupPasswordVisibilityToggles,
};
