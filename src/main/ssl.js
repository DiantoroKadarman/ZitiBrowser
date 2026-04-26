// --- SSL Certificate Handling ---
// Menangani sertifikat SSL yang tidak valid (self-signed, expired, dll)

function setupSSLHandler(app) {
  app.on(
    "certificate-error",
    (event, webContents, url, error, certificate, callback) => {
      console.log(`Mengizinkan sertifikat tidak aman untuk: ${url}`);
      event.preventDefault(); // Jangan blokir
      callback(true); // Percayai sertifikat ini
    }
  );
}

export { setupSSLHandler };
