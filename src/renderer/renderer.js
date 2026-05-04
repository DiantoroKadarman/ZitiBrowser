// --- Renderer Entry Point ---
// Hanya wiring, tidak ada business logic.

import "../index.css";
import { init } from "./screens.js";

// Reveal body after CSS is loaded (prevents FOUC)
document.body.classList.add("css-ready");

document.addEventListener("DOMContentLoaded", init);
