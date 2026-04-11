const API_BASE = window.location.origin;
let map;
let markersLayer;
let currentUserLat = null;
let currentUserLon = null;

// --- SVG ICONS FOR UI (Replacing Emojis) ---
const svgSun = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const svgMoon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
const svgPin = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
const svgCheck = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const svgWarn = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

// Search Variables
let globalSearchTimeout = null;

// State for the Lightbox Carousel
let currentGalleryImages = [];
let currentImageIndex = 0;

// Staging & Upload State
let selectedFile = null;
let finalLat = null;
let finalLon = null;
let finalDate = null;
let selectedType = "sun";
let uploadSource = "";

// DOM Elements - Main UI
const topUiLayer = document.querySelector(".top-ui-layer");
const brandToggle = document.getElementById("brand-toggle");
const sideMenu = document.getElementById("side-menu");
const globalSearchInput = document.getElementById("global-search-input");
const globalSearchResults = document.getElementById("global-search-results");
const drawerOverlay = document.getElementById("drawer-overlay");

// DOM Elements - Capture & Drawer
const mainCaptureBtn = document.getElementById("main-capture-btn");
const uploadSheet = document.getElementById("upload-sheet");
const btnCamera = document.getElementById("btn-camera");
const btnGallery = document.getElementById("btn-gallery");
const fileInputCamera = document.getElementById("file-input-camera");
const fileInputGallery = document.getElementById("file-input-gallery");

// DOM Elements - Staging Area (Preview)
const stagingArea = document.getElementById("staging-area");
const stagingImg = document.getElementById("staging-img");
const stagingBadge = document.getElementById("staging-badge");
const stagingDate = document.getElementById("staging-date");
const stagingDatePill = document.getElementById("staging-date-pill");
const locText = document.getElementById("loc-text");
const manualSearchWrapper = document.getElementById("manual-search-wrapper");
const manualSearch = document.getElementById("manual-search");
const manualSearchResults = document.getElementById("manual-search-results");
const btnShareMap = document.getElementById("btn-share-map");
const closeStagingBtn = document.getElementById("close-staging");
const btnLiveLocation = document.getElementById("btn-live-location"); // NEW: Live Location Button

// DOM Elements - Gallery & Lightbox
const galleryModal = document.getElementById("gallery-modal");
const galleryContent = document.getElementById("gallery-content");
const closeBtn = document.getElementById("close-btn");
const galleryLoading = document.getElementById("gallery-loading");
const lightboxModal = document.getElementById("lightbox-modal");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxDate = document.getElementById("lightbox-date");

// --- Toast Logic ---
function showToast(message, isError = false) {
  const toastEl = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-message");
  const toastIcon = document.querySelector(".toast-icon");

  const successSvg = `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  const errorSvg = `<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

  toastMsg.innerText = message;
  toastIcon.innerHTML = isError ? errorSvg : successSvg;
  toastIcon.style.color = isError ? "#ff4444" : "inherit";

  toastEl.classList.add("show");

  clearTimeout(toastEl.hideTimeout);
  toastEl.hideTimeout = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3000);
}

function isNetworkSlow() {
  if (navigator.connection && navigator.connection.effectiveType) {
    const speed = navigator.connection.effectiveType;
    if (speed === "2g" || speed === "slow-2g" || speed === "3g") return true;
  }
  return false;
}

// --- PWA HARDWARE BACK BUTTON LOGIC ---
window.addEventListener("popstate", (e) => {
  const state = e.state ? e.state.modal : null;

  if (state !== "lightbox") lightboxModal.classList.remove("show");
  if (state !== "staging") closeStagingArea();

  if (state !== "gallery" && state !== "lightbox") {
    galleryModal.classList.remove("show-modal");
    setTimeout(() => {
      if (!galleryModal.classList.contains("show-modal"))
        galleryContent.innerHTML = "";
    }, 400);
  }

  if (state !== "upload") uploadSheet.classList.remove("show");

  if (
    state !== "upload" &&
    (!sideMenu || !sideMenu.classList.contains("show"))
  ) {
    drawerOverlay.classList.remove("show");
  }

  // Restore the Top UI when returning to the map
  if (state !== "gallery" && state !== "lightbox" && state !== "staging") {
    if (topUiLayer) {
      topUiLayer.style.transform = "translateY(0)";
      topUiLayer.style.opacity = "1";
    }
  }
});

// --- 1. INITIAL LOAD ---
function initApp() {
  const bounds = L.latLngBounds(L.latLng(-89.9, -180), L.latLng(89.9, 180));
  map = L.map("map", {
    center: [22.5937, 78.9629],
    zoom: 4,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
    minZoom: 2,
    zoomControl: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "&copy; Carto",
      maxZoom: 20,
      keepBuffer: 8,
      updateWhenIdle: true,
    },
  ).addTo(map);

  fetch("/static/india.geojson")
    .then((res) => res.json())
    .then((data) =>
      L.geoJSON(data, {
        style: { color: "#a3a3a3", weight: 1, fillOpacity: 0 },
        interactive: false,
      }).addTo(map),
    )
    .catch((err) => console.log("Border err:", err));

  markersLayer = L.layerGroup().addTo(map);
  fetchAllPins();
  fetchSilentGPS();
}

function fetchSilentGPS() {
  if (navigator.geolocation && !currentUserLat) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentUserLat = pos.coords.latitude;
        currentUserLon = pos.coords.longitude;
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
}

async function fetchAllPins() {
  try {
    const response = await fetch(`${API_BASE}/pins`);

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const pins = await response.json();
    markersLayer.clearLayers();

    // Prevent crashing if the backend sends an error object instead of an array
    if (!Array.isArray(pins)) {
      console.error("Expected an array of pins, got:", pins);
      return;
    }

    const todayString = new Date().toISOString().split("T")[0];

    pins.forEach((pin) => {
      let isToday = false;
      if (pin.last_upload_at) {
        const safeDateStr =
          pin.last_upload_at.replace(" ", "T") +
          (pin.last_upload_at.endsWith("Z") ? "" : "Z");
        if (safeDateStr.split("T")[0] === todayString) isToday = true;
      }

      const pinClass = isToday ? "today-pin" : "premium-pin";
      const dynamicIcon = L.divIcon({
        className: "sunset-wrapper",
        html: `<div class="${pinClass}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marker = L.marker([parseFloat(pin.lat), parseFloat(pin.lon)], {
        icon: dynamicIcon,
      });
      marker.on("click", () => {
        if (map.getZoom() < 18)
          map.flyTo([pin.lat, pin.lon], 18, { duration: 0.8 });
        else openGallery(pin.id);
      });
      markersLayer.addLayer(marker);
    });
  } catch (error) {
    console.error("Pin err:", error);
  }
}

// --- 2. UPLOAD FLOW: DRAWER & SELECTION ---
mainCaptureBtn.addEventListener("click", () => {
  if (isNetworkSlow()) showToast("Weak signal detected.");
  history.pushState({ modal: "upload" }, "");
  uploadSheet.classList.add("show");
  drawerOverlay.classList.add("show");
  fetchSilentGPS();
});

btnCamera.addEventListener("click", () => {
  uploadSource = "camera";
  fileInputCamera.click();
});
btnGallery.addEventListener("click", () => {
  uploadSource = "gallery";
  fileInputGallery.click();
});

document
  .getElementById("upload-handle")
  .addEventListener("click", () => history.back());
drawerOverlay.addEventListener("click", () => {
  if (uploadSheet.classList.contains("show")) history.back();
  if (sideMenu.classList.contains("show")) brandToggle.click();
});

// --- 3. UPLOAD FLOW: STAGING AREA (PREVIEW) ---
const handleFileSelection = (e) => {
  selectedFile = e.target.files[0];
  if (!selectedFile) return;

  selectedType =
    document.querySelector('input[name="capture_type"]:checked')?.value ||
    "sun";

  history.replaceState({ modal: "staging" }, "");

  // Manually hide drawer
  uploadSheet.classList.remove("show");
  drawerOverlay.classList.remove("show");

  // Show Staging Area
  stagingArea.classList.add("show");

  // Hide Map UI
  if (topUiLayer) {
    topUiLayer.style.transition =
      "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease";
    topUiLayer.style.transform = "translateY(-150%)";
    topUiLayer.style.opacity = "0";
  }

  // --- THE FIX: HEIC / HEIF Visual Preview Handler ---
  const fileExt = selectedFile.name.split(".").pop().toLowerCase();

  // Completely hide the image element while processing so no text/broken icons show
  stagingImg.removeAttribute("src");
  stagingImg.style.opacity = "0";

  if (
    (fileExt === "heic" || fileExt === "heif") &&
    typeof heic2any !== "undefined"
  ) {
    heic2any({
      blob: selectedFile,
      toType: "image/jpeg",
      quality: 0.5,
    })
      .then((conversionResult) => {
        stagingImg.src = URL.createObjectURL(conversionResult);
        stagingImg.style.opacity = "1";
      })
      .catch((err) => {
        stagingImg.style.opacity = "1";
      });
  } else {
    stagingImg.src = URL.createObjectURL(selectedFile);
    stagingImg.style.opacity = "1";
  }

  // Setup Rest of Preview UI
  stagingBadge.innerHTML = selectedType === "moon" ? svgMoon : svgSun;

  const dateStr = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  stagingDatePill.innerText = dateStr;

  finalDate = new Date().toISOString();
  finalLat = null;
  finalLon = null;

  processExif();
};

fileInputCamera.addEventListener("change", handleFileSelection);
fileInputGallery.addEventListener("change", handleFileSelection);

async function processExif() {
  // Hide initially while processing
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
        const exifDateStr = exifData.DateTimeOriginal.toLocaleString(
          undefined,
          {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          },
        );
        stagingDatePill.innerText = exifDateStr;
      }

      // Reverse Geocoding
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
        console.error("Reverse geocoding failed:", err);
        manualSearchWrapper.style.display = "flex";
      }

      // Setup Button
      btnShareMap.style.display = "flex";
      btnShareMap.disabled = false;
      btnShareMap.innerText = "Upload Here";
      if (btnLiveLocation) btnLiveLocation.style.display = "none";
    } else {
      triggerFallbackLocation();
    }
  } catch (err) {
    triggerFallbackLocation();
  }
}

// ALWAYS SHOW SEARCH BAR IF NO EXIF FOUND
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

// --- LIVE LOCATION CROSSHAIR LOGIC ---
if (btnLiveLocation) {
  btnLiveLocation.addEventListener("click", async () => {
    if (currentUserLat && currentUserLon) {
      applyLiveLocation(currentUserLat, currentUserLon);
    } else {
      showToast("Fetching live location...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          currentUserLat = pos.coords.latitude;
          currentUserLon = pos.coords.longitude;
          applyLiveLocation(currentUserLat, currentUserLon);
        },
        (err) => {
          showToast("Please allow location access to use this feature.", true);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }
  });
}

async function applyLiveLocation(lat, lon) {
  finalLat = lat;
  finalLon = lon;

  // Give immediate visual feedback
  manualSearch.value = "Pinpointing location...";

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
    );
    const data = await res.json();
    if (data && data.display_name) {
      manualSearch.value = data.display_name.split(",").slice(0, 3).join(",");
    } else {
      manualSearch.value = "Current Live Location";
    }
  } catch (err) {
    manualSearch.value = "Current Live Location";
  }

  // Hide the dropdown and unlock the Share button!
  if (manualSearchResults) manualSearchResults.classList.remove("show");
  btnShareMap.style.display = "flex";
  btnShareMap.disabled = false;
  btnShareMap.innerText = "Upload Here";
}

// --- LIVE AUTOCOMPLETE FOR PREVIEW SEARCH ---
let stagingSearchTimeout;
manualSearch.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  clearTimeout(stagingSearchTimeout);
  manualSearchResults.innerHTML = "";

  // Wipe final location while they are typing to prevent accidental uploads
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
    } catch (err) {
      console.error(err);
    }
  }, 500);
});

// --- 4. UPLOAD FLOW: EXECUTE UPLOAD ---
btnShareMap.addEventListener("click", async () => {
  if (!finalLat || !finalLon) {
    showToast("Please provide a valid location.", true);
    return;
  }

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

    const originalBackground = btnShareMap.style.background;

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

function resetShareBtn() {
  btnShareMap.innerText = "Share to Map";
  btnShareMap.disabled = false;
  btnShareMap.style.background = "";
}

function closeStagingArea() {
  stagingArea.classList.remove("show");

  if (
    topUiLayer &&
    !galleryModal.classList.contains("show-modal") &&
    !lightboxModal.classList.contains("show")
  ) {
    topUiLayer.style.transform = "translateY(0)";
    topUiLayer.style.opacity = "1";
  }

  selectedFile = null;
  fileInputCamera.value = "";
  fileInputGallery.value = "";
  manualSearch.value = "";
  manualSearchResults.innerHTML = "";
  manualSearchResults.classList.remove("show");
  if (btnLiveLocation) btnLiveLocation.style.display = "none";
  resetShareBtn();
}

closeStagingBtn.addEventListener("click", () => history.back());

// --- 5. GALLERY VIEW & LIGHTBOX LOGIC ---
async function openGallery(pinId) {
  history.pushState({ modal: "gallery" }, "");
  galleryModal.classList.add("show-modal");

  if (topUiLayer) {
    topUiLayer.style.transition =
      "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease";
    topUiLayer.style.transform = "translateY(-150%)";
    topUiLayer.style.opacity = "0";
  }

  galleryContent.innerHTML = "";
  galleryLoading.style.display = "flex";
  galleryLoading.classList.remove("fade-out");
  galleryLoading.innerHTML = `<div class="orbiting-ember"></div>`;

  try {
    const response = await fetch(`${API_BASE}/pins/${pinId}`);
    if (!response.ok) throw new Error("Fetch failed");
    const images = await response.json();

    galleryLoading.classList.add("fade-out");
    setTimeout(() => {
      galleryLoading.style.display = "none";
    }, 800);

    if (images.length === 0) {
      galleryContent.innerHTML = `<p style="color:white; text-align:center; width:100%; margin-top: 60px;">No skies caught here yet.</p>`;
      return;
    }

    currentGalleryImages = images;

    images.forEach((img, index) => {
      const card = document.createElement("div");
      card.className = "image-card";
      card.style.animationDelay = `${index * 0.1}s`;
      card.onclick = () => openLightbox(index);

      // SVG Badge Injection
      const typeBadge = document.createElement("div");
      typeBadge.className = "type-badge";
      typeBadge.style.display = "flex";
      typeBadge.style.alignItems = "center";
      typeBadge.style.justifyContent = "center";
      typeBadge.innerHTML = img.capture_type === "moon" ? svgMoon : svgSun;

      const imgElement = document.createElement("img");
      imgElement.src = img.file_path;
      imgElement.className = "gallery-img";
      imgElement.loading = "lazy";

      const dateElement = document.createElement("div");
      dateElement.className = "image-date";
      const safeDateString = img.uploaded_at.replace(" ", "T");
      const utcString = safeDateString.endsWith("Z")
        ? safeDateString
        : safeDateString + "Z";
      dateElement.innerText = new Date(utcString).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      card.appendChild(imgElement);
      card.appendChild(typeBadge);
      card.appendChild(dateElement);
      galleryContent.appendChild(card);
    });
  } catch (error) {
    galleryLoading.classList.remove("fade-out");
    galleryLoading.style.display = "flex";
    galleryLoading.innerHTML = `<p style="color:#ff5e3a; text-align:center;">Failed to catch the view.</p>`;
  }
}

closeBtn.addEventListener("click", () => history.back());

function openLightbox(index) {
  currentImageIndex = index;
  updateLightboxView();
  history.pushState({ modal: "lightbox" }, "");
  lightboxModal.classList.add("show");
}

function closeLightbox() {
  history.back();
}

function updateLightboxView(direction = "none") {
  const img = currentGalleryImages[currentImageIndex];
  lightboxModal.style.opacity = "0";

  if (direction === "next")
    lightboxImg.style.transform = "translateX(-30px) scale(0.95)";
  else if (direction === "prev")
    lightboxImg.style.transform = "translateX(30px) scale(0.95)";
  else lightboxImg.style.transform = "scale(0.95)";

  setTimeout(() => {
    lightboxImg.src = img.file_path;
    const safeDateString = img.uploaded_at.replace(" ", "T");
    const utcString = safeDateString.endsWith("Z")
      ? safeDateString
      : safeDateString + "Z";
    lightboxDate.innerText = new Date(utcString).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    lightboxImg.onload = () => {
      lightboxModal.style.opacity = "1";
      lightboxImg.style.transform = "translateX(0) scale(1)";
    };
  }, 200);
}

function prevImage() {
  currentImageIndex--;
  if (currentImageIndex < 0)
    currentImageIndex = currentGalleryImages.length - 1;
  updateLightboxView("prev");
}

function nextImage() {
  currentImageIndex++;
  if (currentImageIndex >= currentGalleryImages.length) currentImageIndex = 0;
  updateLightboxView("next");
}

lightboxModal.addEventListener("click", (e) => {
  if (e.target === lightboxModal) closeLightbox();
});

let touchStartX = 0;
let touchEndX = 0;
lightboxModal.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.changedTouches[0].screenX;
  },
  false,
);
lightboxModal.addEventListener(
  "touchend",
  (e) => {
    touchEndX = e.changedTouches[0].screenX;
    if (touchStartX - touchEndX > 40) nextImage();
    else if (touchStartX - touchEndX < -40) prevImage();
  },
  false,
);

// --- 6. BRAND MENU & SYSTEM DARK MODE ---
if (brandToggle && sideMenu) {
  const searchContainer = document.querySelector(".glass-search-container");

  brandToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (sideMenu.classList.contains("show")) {
      sideMenu.classList.remove("show");
      brandToggle.classList.remove("open");
      drawerOverlay.classList.remove("show");
      if (searchContainer) {
        searchContainer.style.opacity = "1";
        searchContainer.style.pointerEvents = "auto";
      }
    } else {
      sideMenu.classList.add("show");
      brandToggle.classList.add("open");
      drawerOverlay.classList.add("show");
      if (searchContainer) {
        searchContainer.style.opacity = "0";
        searchContainer.style.pointerEvents = "none";
      }
    }
  });
}

function initThemeLogic() {
  const themeToggle = document.getElementById("theme-toggle");
  const body = document.body;
  if (!themeToggle) return;

  function applyTheme(isDark) {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const moonIcon =
      '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    const sunIcon =
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';

    if (isDark) {
      body.classList.add("dark-mode");
      themeToggle.innerHTML = `<span class="menu-icon">${sunIcon}</span> Light Mode`;
      if (themeMeta) themeMeta.setAttribute("content", "#0d1117");
    } else {
      body.classList.remove("dark-mode");
      themeToggle.innerHTML = `<span class="menu-icon">${moonIcon}</span> Dark Mode`;
      if (themeMeta) themeMeta.setAttribute("content", "#fffcfb");
    }
  }

  const savedTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;

  if (savedTheme === "dark" || (!savedTheme && systemPrefersDark))
    applyTheme(true);
  else applyTheme(false);

  themeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    const isCurrentlyDark = body.classList.contains("dark-mode");
    applyTheme(!isCurrentlyDark);
    localStorage.setItem("theme", !isCurrentlyDark ? "dark" : "light");

    if (sideMenu) sideMenu.classList.remove("show");
    if (brandToggle) brandToggle.classList.remove("open");
    if (drawerOverlay && !uploadSheet.classList.contains("show"))
      drawerOverlay.classList.remove("show");

    const searchContainer = document.querySelector(".glass-search-container");
    if (searchContainer) {
      searchContainer.style.opacity = "1";
      searchContainer.style.pointerEvents = "auto";
    }
  });

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (!localStorage.getItem("theme")) applyTheme(e.matches);
    });
}

// --- 7. GLOBAL MAP SEARCH LOGIC (TOP NAVIGATION) ---
if (globalSearchInput) {
  globalSearchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearTimeout(globalSearchTimeout);
    globalSearchResults.innerHTML = "";

    if (query.length < 3) {
      globalSearchResults.classList.remove("show");
      return;
    }

    globalSearchTimeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        );
        const results = await response.json();
        globalSearchResults.innerHTML = "";

        if (results.length === 0) {
          globalSearchResults.innerHTML = `<div class="search-result-item" style="color: #aaa; text-align:center;">No places found</div>`;
          globalSearchResults.classList.add("show");
          return;
        }

        results.forEach((place) => {
          const item = document.createElement("div");
          item.className = "search-result-item";
          item.innerText = place.display_name.split(",").slice(0, 3).join(",");

          item.addEventListener("click", () => {
            const lat = parseFloat(place.lat);
            const lon = parseFloat(place.lon);
            globalSearchInput.value = "";
            globalSearchResults.classList.remove("show");
            globalSearchInput.blur();
            map.flyTo([lat, lon], 12, {
              animate: true,
              duration: 2.0,
              easeLinearity: 0.25,
            });
          });
          globalSearchResults.appendChild(item);
        });
        globalSearchResults.classList.add("show");
      } catch (error) {
        console.error("Search error:", error);
      }
    }, 500);
  });
}

// Global click-outside listener to close BOTH search dropdowns
document.addEventListener("click", (e) => {
  if (
    globalSearchInput &&
    e.target !== globalSearchInput &&
    !globalSearchResults.contains(e.target)
  ) {
    globalSearchResults.classList.remove("show");
  }
  if (
    manualSearch &&
    e.target !== manualSearch &&
    !manualSearchResults.contains(e.target)
  ) {
    manualSearchResults.classList.remove("show");
  }
});

// --- AUTO-REFRESH ON WAKE ---
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") fetchAllPins();
});

window.onload = () => {
  initApp();
  initThemeLogic();
};
