import http from "node:http";
import { URL } from "url";

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = "8080";
const API_PORT = "8081";
const ZITI_PROXY_ADDRESS = `${PROXY_HOST}:${PROXY_PORT}`;
const ZITI_API_BASE_URL = `http://${PROXY_HOST}:${API_PORT}`;
const ZITI_IDENTITIES_URL = `${ZITI_API_BASE_URL}/identities`;
const ZITI_IDENTITY_URL = `${ZITI_API_BASE_URL}/identity`;
const ZITI_ENROLL_URL = `${ZITI_API_BASE_URL}/enroll`;

// --- FUNGSI UTILITAS API ---
function makeApiRequest(
  method,
  url,
  data = null,
  contentType = "application/json"
) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    let postData = data;

    if (
      contentType === "application/json" &&
      data &&
      typeof data === "object"
    ) {
      postData = JSON.stringify(data);
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        "Content-Type": contentType,
        ...(postData && { "Content-Length": Buffer.byteLength(postData) }),
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (responseData.trim() === "") {
            resolve({ success: true });
            return;
          }
          try {
            resolve(JSON.parse(responseData));
          } catch {
            reject(new Error(`Gagal parsing JSON. Respons: ${responseData}`));
          }
        } else {
          reject(new Error(`API error ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on("error", (e) => reject(new Error(`API gagal: ${e.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("API timeout."));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

function extractNameFromJwt(jwtString) {
  try {
    const parts = jwtString.split(".");
    if (parts.length !== 3) return null;

    const payloadBase64 = parts[1];
    const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf8");
    const payload = JSON.parse(payloadJson);

    const candidate = payload.sub || payload.name || payload.iss;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    }
  } catch (e) {
    console.warn("Gagal ekstrak nama dari JWT:", e.message);
  }
  return null;
}

export {
  ZITI_PROXY_ADDRESS,
  ZITI_IDENTITIES_URL,
  ZITI_IDENTITY_URL,
  ZITI_ENROLL_URL,
  makeApiRequest,
  extractNameFromJwt,
};
