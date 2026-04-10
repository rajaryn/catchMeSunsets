const API_BASE = window.location.origin;
let map;
let markersLayer;
let currentUserLat = null;
let currentUserLon = null;

// Search Variables
let globalSearchTimeout = null;

// State for the Lightbox Carousel
let currentGalleryImages = [];
let currentImageIndex = 0;

// DOM Elements
const lightboxModal = document.getElementById("lightbox-modal");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxDate = document.getElementById("lightbox-date");

const uploadBtn = document.getElementById("upload-btn");
const fileInputGallery = document.getElementById("file-input-gallery");
const fileInputCamera = document.getElementById("file-input-camera");
const uploadSheet = document.getElementById("upload-sheet");
const btnCamera = document.getElementById("btn-camera");
const btnGallery = document.getElementById("btn-gallery");
const uploadHandle = document.getElementById("upload-handle");

// Search & Side Menu DOM Elements
const brandToggle = document.getElementById("brand-toggle");
const sideMenu = document.getElementById("side-menu");
const globalSearchInput = document.getElementById("global-search-input");
const globalSearchResults = document.getElementById("global-search-results");

const galleryModal = document.getElementById("gallery-modal");
const galleryContent = document.getElementById("gallery-content");
const closeBtn = document.getElementById("close-btn");
const galleryLoading = document.getElementById("gallery-loading");
const drawerOverlay = document.getElementById("drawer-overlay");

// --- Toast Logic (With Native SVGs) ---
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

// --- NETWORK SPEED DETECTOR ---
function isNetworkSlow() {
  if (navigator.connection && navigator.connection.effectiveType) {
    const speed = navigator.connection.effectiveType;
    if (speed === "2g" || speed === "slow-2g" || speed === "3g") {
      return true;
    }
  }
  return false;
}

// --- PWA HARDWARE BACK BUTTON LOGIC ---
window.addEventListener("popstate", (e) => {
  const state = e.state ? e.state.modal : null;

  if (state !== "lightbox") lightboxModal.classList.remove("show");

  if (state !== "gallery" && state !== "lightbox") {
    galleryModal.classList.remove("show-modal");
    setTimeout(() => {
      if (!galleryModal.classList.contains("show-modal")) {
        galleryContent.innerHTML = "";
      }
    }, 400);
  }

  if (state !== "upload") uploadSheet.classList.remove("show");

  if (
    state !== "upload" &&
    (!sideMenu || !sideMenu.classList.contains("show"))
  ) {
    drawerOverlay.classList.remove("show");
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
      attribution: '&copy; <a href="https://carto.com/">Carto</a>',
      maxZoom: 20,
      keepBuffer: 8,
      updateWhenIdle: true,
      detectRetina: false,
    },
  ).addTo(map);

  fetch("/static/india.geojson")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to fetch GeoJSON");
      return response.json();
    })
    .then((data) => {
      L.geoJSON(data, {
        style: { color: "#a3a3a3", weight: 1, opacity: 0.8, fillOpacity: 0 },
        interactive: false,
      }).addTo(map);
    })
    .catch((err) => console.log("Could not load border overlay: ", err));

  markersLayer = L.layerGroup().addTo(map);
  fetchAllPins();

  // Start silently fetching GPS on load so it's ready when they need it
  fetchSilentGPS();
}

function fetchSilentGPS() {
  if (navigator.geolocation && !currentUserLat) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentUserLat = position.coords.latitude;
        currentUserLon = position.coords.longitude;
      },
      () => {
        console.log("Silent GPS fetch denied or failed.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
}

async function fetchAllPins() {
  try {
    const response = await fetch(`${API_BASE}/pins`);
    if (!response.ok) throw new Error("Failed to fetch pins");
    const pins = await response.json();
    markersLayer.clearLayers();

    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    pins.forEach((pin) => {
      let isToday = false;

      if (pin.last_upload_at) {
        const safeDateStr =
          pin.last_upload_at.replace(" ", "T") +
          (pin.last_upload_at.endsWith("Z") ? "" : "Z");
        const uploadDate = new Date(safeDateStr);
        const uploadDateString = `${uploadDate.getFullYear()}-${String(uploadDate.getMonth() + 1).padStart(2, "0")}-${String(uploadDate.getDate()).padStart(2, "0")}`;
        if (uploadDateString === todayString) isToday = true;
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
        const currentZoom = map.getZoom();
        const streetLevelZoom = 18;
        if (currentZoom < streetLevelZoom) {
          map.flyTo([pin.lat, pin.lon], streetLevelZoom, {
            duration: 0.8,
            easeLinearity: 0.25,
          });
        } else {
          openGallery(pin.id);
        }
      });

      markersLayer.addLayer(marker);
    });
  } catch (error) {
    console.error("Error fetching pins:", error);
  }
}

// --- 2. BRAND MENU LOGIC (SIDE DRAWER) ---
if (brandToggle && sideMenu) {
  const searchContainer = document.querySelector(".glass-search-container");

  brandToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = sideMenu.classList.contains("show");

    if (isOpen) {
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

  drawerOverlay.addEventListener("click", () => {
    if (sideMenu.classList.contains("show")) {
      sideMenu.classList.remove("show");
      brandToggle.classList.remove("open");
      drawerOverlay.classList.remove("show");

      if (searchContainer) {
        searchContainer.style.opacity = "1";
        searchContainer.style.pointerEvents = "auto";
      }
    }
  });
}

// --- 3. INSTANT UPLOAD DRAWER LOGIC ---
uploadBtn.addEventListener("click", () => {
  if (isNetworkSlow())
    showToast("Weak signal detected. Uploads may take a while.");

  // Open instantly (No more waiting for GPS!)
  history.pushState({ modal: "upload" }, "");
  uploadSheet.classList.add("show");
  drawerOverlay.classList.add("show");

  // Trigger a background GPS fetch just in case they haven't gotten one yet
  fetchSilentGPS();
});

// --- 4. ACTION SHEET ROUTING & CLOSING ---
let uploadSource = "";

btnCamera.addEventListener("click", () => {
  uploadSource = "camera";
  fileInputCamera.click();
});
btnGallery.addEventListener("click", () => {
  uploadSource = "gallery";
  fileInputGallery.click();
});
uploadHandle.addEventListener("click", () => {
  history.back();
});
drawerOverlay.addEventListener("click", () => {
  if (uploadSheet.classList.contains("show")) history.back();
});

// --- 5. MASTER FILE HANDLING (THE BRAIN) ---
const handleFileSelection = async (event) => {
  let file = event.target.files[0];
  if (!file) {
    showToast("No photo detected. Please try again.", true);
    return;
  }

  // Close the drawer immediately
  if (uploadSheet.classList.contains("show")) history.back();

  uploadBtn.innerText = "Preparing upload...";
  uploadBtn.disabled = true;
  await new Promise((resolve) => setTimeout(resolve, 50));

  let finalLat = null;
  let finalLon = null;
  let finalTime = new Date().toISOString();

  // STEP 1: Attempt EXIF extraction (Gallery Only)
  try {
    if (uploadSource === "gallery" && typeof exifr !== "undefined") {
      const exifData = await exifr.parse(file);
      if (exifData) {
        if (exifData.latitude && exifData.longitude) {
          finalLat = exifData.latitude;
          finalLon = exifData.longitude;
        }
        if (exifData.DateTimeOriginal) {
          finalTime = exifData.DateTimeOriginal.toISOString();
        }
      }
    }
  } catch (error) {
    console.log("No EXIF data found.");
  }

  // STEP 2: Fallback Logic if EXIF failed (or if it's a Live Camera shot)
  if (finalLat === null || finalLon === null) {
    if (uploadSource === "camera") {
      // Camera MUST use live GPS
      if (currentUserLat && currentUserLon) {
        finalLat = currentUserLat;
        finalLon = currentUserLon;
      } else {
        showToast("Live location required for camera captures.", true);
        uploadBtn.innerText = `Capture`;
        uploadBtn.disabled = false;
        fileInputCamera.value = "";
        return; // Abort the upload
      }
    } else if (uploadSource === "gallery") {
      // Gallery with NO EXIF: Use the center of the map!
      const mapCenter = map.getCenter();
      finalLat = mapCenter.lat;
      finalLon = mapCenter.lng;
      showToast("No GPS found in photo. Using current map location.");
    }
  }

  // Final Data Assembly
  const formData = new FormData();
  formData.append("image", file);
  formData.append("lat", finalLat);
  formData.append("lon", finalLon);
  formData.append("captured_at", finalTime);
  const selectedType =
    document.querySelector('input[name="capture_type"]:checked')?.value ||
    "sun";
  formData.append("capture_type", selectedType);

  // STEP 3: Execute Upload
  try {
    const response = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/upload`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          uploadBtn.innerText = `Uploading... ${percent}%`;
          uploadBtn.style.setProperty(
            "background",
            `linear-gradient(to right, #ff5e3a ${percent}%, rgba(255, 255, 255, 0.3) ${percent}%)`,
            "important",
          );
          uploadBtn.style.setProperty(
            "border-color",
            "transparent",
            "important",
          );
          uploadBtn.style.setProperty("color", "white", "important");
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300)
          resolve(JSON.parse(xhr.responseText));
        else reject({ error: "Server error" });
      };
      xhr.onerror = () => reject({ error: "Network disconnected" });
      xhr.send(formData);
    });

    await fetchAllPins();
    map.flyTo([finalLat, finalLon], 16, {
      animate: true,
      duration: 1.5,
      easeLinearity: 0.25,
    });
    showToast(
      `${selectedType === "moon" ? "Night sky" : "Evening"} archived successfully.`,
    );
  } catch (errorData) {
    showToast("Upload failed.", true);
  } finally {
    uploadBtn.style.removeProperty("background");
    uploadBtn.style.removeProperty("border-color");
    uploadBtn.style.removeProperty("color");
    uploadBtn.innerText = `Capture`;
    uploadBtn.disabled = false;
    fileInputCamera.value = "";
    fileInputGallery.value = "";
    uploadSource = "";
  }
};

fileInputGallery.addEventListener("change", handleFileSelection);
fileInputCamera.addEventListener("change", handleFileSelection);

// --- 6. GALLERY VIEW & LIGHTBOX LOGIC ---
async function openGallery(pinId) {
  history.pushState({ modal: "gallery" }, "");
  galleryModal.classList.add("show-modal");
  galleryContent.innerHTML = "";
  galleryLoading.style.display = "flex";
  galleryLoading.className = "fill-loader";
  galleryLoading.classList.remove("fade-out");
  galleryLoading.innerHTML = `<div class="orbiting-ember"></div>`;

  try {
    const response = await fetch(`${API_BASE}/pins/${pinId}`);
    if (!response.ok) throw new Error("Failed to fetch gallery");
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

      const typeBadge = document.createElement("div");
      typeBadge.className = "type-badge";
      typeBadge.innerText = img.capture_type === "moon" ? "🌙" : "☀️";

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

// --- 7. SYSTEM-WIDE DARK MODE TOGGLE LOGIC ---
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
    if (drawerOverlay && !uploadSheet.classList.contains("show")) {
      drawerOverlay.classList.remove("show");
    }

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

// --- 8. GLOBAL MAP SEARCH LOGIC (TOP NAVIGATION) ---
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
        console.error("Global search error:", error);
      }
    }, 500);
  });
}

document.addEventListener("click", (e) => {
  if (
    globalSearchInput &&
    e.target !== globalSearchInput &&
    !globalSearchResults.contains(e.target)
  ) {
    globalSearchResults.classList.remove("show");
  }
});

// --- AUTO-REFRESH ON WAKE ---
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (
      uploadBtn.innerText === "Capture" &&
      !uploadSheet.classList.contains("show")
    ) {
      fetchAllPins();
    }
  }
});

window.onload = () => {
  initApp();
  initThemeLogic();
};
