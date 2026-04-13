//the entry point

import { initApp, fetchAllPins } from "./map.js";
import { initThemeLogic } from "./ui.js";

// Importing these triggers their top-level event listeners automatically
import "./upload.js";
import "./gallery.js";

window.onload = () => {
  initApp();
  initThemeLogic();
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") fetchAllPins();
});
