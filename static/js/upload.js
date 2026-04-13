//Camera access, HEIC parsing, EXIF processing, auto-complete places API, and the FormData upload


import { API_BASE, svgSun, svgMoon } from "./constants.js";
import { showToast, isNetworkSlow } from "./utils.js";
import {
  map,
  currentUserLat,
  currentUserLon,
  fetchAllPins,
  fetchSilentGPS,
} from "./map.js";

const mainCaptureBtn = document.getElementById("main-capture-btn");
const uploadSheet = document.getElementById("upload-sheet");
const drawerOverlay = document.getElementById("drawer-overlay");
const btnCamera = document.getElementById("btn-camera");
const btnGallery = document.getElementById("btn-gallery");
const fileInputCamera = document.getElementById("file-input-camera");
const fileInputGallery = document.getElementById("file-input-gallery");

const stagingArea = document.getElementById("staging-area");
const stagingImg = document.getElementById("staging-img");
const stagingBadge = document.getElementById("staging-badge");
const stagingDatePill = document.getElementById("staging-date-pill");
const manualSearchWrapper = document.getElementById("manual-search-wrapper");
const manualSearch = document.getElementById("manual-search");
const manualSearchResults = document.getElementById("manual-search-results");
const btnShareMap = document.getElementById("btn-share-map");
const btnLiveLocation = document.getElementById("btn-live-location");
const closeStagingBtn = document.getElementById("close-staging");
const topUiLayer = document.querySelector(".top-ui-layer");
const galleryModal = document.getElementById("gallery-modal");
const lightboxModal = document.getElementById("lightbox-modal");

let selectedFile = null;
let finalLat = null;
let finalLon = null;
let finalDate = null;
let selectedType = "sun";
let uploadSource = "";
let stagingSearchTimeout;

if (mainCaptureBtn) {
  mainCaptureBtn.addEventListener("click", () => {
    if (isNetworkSlow()) showToast("Weak signal detected.");
    history.pushState({ modal: "upload" }, "");
    uploadSheet.classList.add("show");
    drawerOverlay.classList.add("show");
    fetchSilentGPS();
  });
}

if (btnCamera)
  btnCamera.addEventListener("click", () => {
    uploadSource = "camera";
    fileInputCamera.click();
  });
if (btnGallery)
  btnGallery.addEventListener("click", () => {
    uploadSource = "gallery";
    fileInputGallery.click();
  });

const uploadHandle = document.getElementById("upload-handle");
if (uploadHandle) uploadHandle.addEventListener("click", () => history.back());

const handleFileSelection = (e) => {
  selectedFile = e.target.files[0];
  if (!selectedFile) return;

  selectedType =
    document.querySelector('input[name="capture_type"]:checked')?.value ||
    "sun";
  history.replaceState({ modal: "staging" }, "");

  uploadSheet.classList.remove("show");
  drawerOverlay.classList.remove("show");
  stagingArea.classList.add("show");

  if (topUiLayer) {
    topUiLayer.style.transition =
      "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease";
    topUiLayer.style.transform = "translateY(-150%)";
    topUiLayer.style.opacity = "0";
  }

  const fileExt = selectedFile.name.split(".").pop().toLowerCase();
  stagingImg.removeAttribute("src");
  stagingImg.style.opacity = "0";

  if (
    (fileExt === "heic" || fileExt === "heif") &&
    typeof heic2any !== "undefined"
  ) {
    heic2any({ blob: selectedFile, toType: "image/jpeg", quality: 0.5 })
      .then((conversionResult) => {
        stagingImg.src = URL.createObjectURL(conversionResult);
        stagingImg.style.opacity = "1";
      })
      .catch(() => {
        stagingImg.style.opacity = "1";
      });
  } else {
    stagingImg.src = URL.createObjectURL(selectedFile);
    stagingImg.style.opacity = "1";
  }

  stagingBadge.innerHTML = selectedType === "moon" ? svgMoon : svgSun;
  stagingDatePill.innerText = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  finalDate = new Date().toISOString();
  finalLat = null;
  finalLon = null;
  processExif();
};

if (fileInputCamera)
  fileInputCamera.addEventListener("change", handleFileSelection);
if (fileInputGallery)
  fileInputGallery.addEventListener("change", handleFileSelection);

async function processExif() {
  manualSearchWrapper.style.display = "none";
  btnShareMap.style.display = "none";
  btnShareMap.disabled = true;
  if (btnLiveLocation) btnLiveLocation.style.display = "none";

  try {
    const exifData = await exifr.parse(selectedFile);
    if (exifData && exifData.latitude && exifData.longitude) {
      finalLat = exifData.latitude;
      finalLon = exifData.longitude;

      if (exifData.DateTimeOriginal) {
        finalDate = exifData.DateTimeOriginal.toISOString();
        stagingDatePill.innerText = exifData.DateTimeOriginal.toLocaleString(
          undefined,
          {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          },
        );
      }

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${finalLat}&lon=${finalLon}`,
        );
        const data = await res.json();
        if (data && data.display_name) {
          manualSearch.value = data.display_name
            .split(",")
            .slice(0, 3)
            .join(",");
          manualSearchWrapper.style.display = "flex";
        }
      } catch (err) {
        manualSearchWrapper.style.display = "flex";
      }

      btnShareMap.style.display = "flex";
      btnShareMap.disabled = false;
      btnShareMap.innerText = "Upload Here";
    } else triggerFallbackLocation();
  } catch (err) {
    triggerFallbackLocation();
  }
}

function triggerFallbackLocation() {
  showToast("No location found in photo.", true);
  manualSearchWrapper.style.display = "flex";
  manualSearch.value = "";
  manualSearchResults.innerHTML = "";
  manualSearchResults.classList.remove("show");

  btnShareMap.style.display = "flex";
  btnShareMap.disabled = true;
  btnShareMap.innerText = "Select a location first";
  if (btnLiveLocation) btnLiveLocation.style.display = "flex";
}

if (btnLiveLocation) {
  btnLiveLocation.addEventListener("click", async () => {
    if (currentUserLat && currentUserLon)
      applyLiveLocation(currentUserLat, currentUserLon);
    else {
      showToast("Fetching live location...");
      navigator.geolocation.getCurrentPosition(
        (pos) => applyLiveLocation(pos.coords.latitude, pos.coords.longitude),
        () =>
          showToast("Please allow location access to use this feature.", true),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }
  });
}

async function applyLiveLocation(lat, lon) {
  finalLat = lat;
  finalLon = lon;
  manualSearch.value = "Pinpointing location...";

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
    );
    const data = await res.json();
    if (data && data.display_name)
      manualSearch.value = data.display_name.split(",").slice(0, 3).join(",");
    else manualSearch.value = "Current Live Location";
  } catch (err) {
    manualSearch.value = "Current Live Location";
  }

  if (manualSearchResults) manualSearchResults.classList.remove("show");
  btnShareMap.style.display = "flex";
  btnShareMap.disabled = false;
  btnShareMap.innerText = "Upload Here";
}

if (manualSearch) {
  manualSearch.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearTimeout(stagingSearchTimeout);
    manualSearchResults.innerHTML = "";
    finalLat = null;
    finalLon = null;
    btnShareMap.disabled = true;
    btnShareMap.innerText = "Select a location...";

    if (query.length < 3) {
      manualSearchResults.classList.remove("show");
      return;
    }

    stagingSearchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        );
        const data = await res.json();
        manualSearchResults.innerHTML = "";

        if (data.length === 0) {
          manualSearchResults.innerHTML = `<div class="search-result-item" style="color: #aaa; text-align:center;">No places found</div>`;
          manualSearchResults.classList.add("show");
          return;
        }

        data.forEach((place) => {
          const item = document.createElement("div");
          item.className = "search-result-item";
          item.innerText = place.display_name.split(",").slice(0, 3).join(",");
          item.addEventListener("click", () => {
            finalLat = parseFloat(place.lat);
            finalLon = parseFloat(place.lon);
            manualSearch.value = item.innerText;
            manualSearchResults.classList.remove("show");
            btnShareMap.style.display = "flex";
            btnShareMap.disabled = false;
            btnShareMap.innerText = "Upload Here";
          });
          manualSearchResults.appendChild(item);
        });
        manualSearchResults.classList.add("show");
      } catch (err) {}
    }, 500);
  });
}

if (btnShareMap) {
  btnShareMap.addEventListener("click", async () => {
    if (!finalLat || !finalLon)
      return showToast("Please provide a valid location.", true);

    btnShareMap.innerText = "Uploading...";
    btnShareMap.disabled = true;

    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("lat", finalLat);
    formData.append("lon", finalLon);
    formData.append("captured_at", finalDate);
    formData.append("capture_type", selectedType);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          btnShareMap.innerText = `Uploading... ${percent}%`;
          btnShareMap.style.backgroundImage = `linear-gradient(to right, rgba(255, 94, 58, 0.9) ${percent}%, rgba(255, 255, 255, 0.1) ${percent}%)`;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          showToast("Archived successfully.");
          fetchAllPins();
          map.flyTo([finalLat, finalLon], 16, { animate: true, duration: 1.5 });
          setTimeout(() => {
            stagingArea.classList.remove("show");
            if (topUiLayer) {
              topUiLayer.style.transform = "translateY(0)";
              topUiLayer.style.opacity = "1";
            }
          }, 1000);
        } else {
          showToast("Upload failed.", true);
          btnShareMap.style.backgroundImage = "";
        }
      };
      xhr.onerror = () => {
        showToast("Network error.", true);
        btnShareMap.style.backgroundImage = "";
      };
      xhr.send(formData);
    } catch (error) {
      showToast("Upload failed.", true);
      btnShareMap.style.backgroundImage = "";
    }
  });
}

export function closeStagingArea() {
  if (stagingArea) stagingArea.classList.remove("show");

  if (
    topUiLayer &&
    galleryModal &&
    lightboxModal &&
    !galleryModal.classList.contains("show-modal") &&
    !lightboxModal.classList.contains("show")
  ) {
    topUiLayer.style.transform = "translateY(0)";
    topUiLayer.style.opacity = "1";
  }

  selectedFile = null;
  if (fileInputCamera) fileInputCamera.value = "";
  if (fileInputGallery) fileInputGallery.value = "";
  if (manualSearch) manualSearch.value = "";
  if (manualSearchResults) {
    manualSearchResults.innerHTML = "";
    manualSearchResults.classList.remove("show");
  }
  if (btnLiveLocation) btnLiveLocation.style.display = "none";
  if (btnShareMap) {
    btnShareMap.innerText = "Share to Map";
    btnShareMap.disabled = false;
    btnShareMap.style.background = "";
  }
}

if (closeStagingBtn)
  closeStagingBtn.addEventListener("click", () => history.back());
