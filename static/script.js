const API_BASE = window.location.origin;
let map;
let markersLayer;
let currentUserLat = null;
let currentUserLon = null;

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

const galleryModal = document.getElementById("gallery-modal");
const galleryContent = document.getElementById("gallery-content");
const closeBtn = document.getElementById("close-btn");
const galleryLoading = document.getElementById("gallery-loading");
const toast = document.getElementById("toast");
const aboutBtn = document.getElementById("about-btn");
const aboutDrawer = document.getElementById("about-drawer");
const drawerOverlay = document.getElementById("drawer-overlay");

// --- Toast Logic ---
function showToast(message, isError = false) {
  toast.innerText = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
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
  // Check what state the phone's history just went back to
  const state = e.state ? e.state.modal : null;

  // 1. Lightbox Layer
  if (state !== "lightbox") {
    lightboxModal.classList.remove("show");
  }
  // 2. Gallery Layer
  if (state !== "gallery" && state !== "lightbox") {
    galleryModal.classList.remove("show-modal");
    // Delay clearing content so the fade-out animation is smooth
    setTimeout(() => {
      if (!galleryModal.classList.contains("show-modal")) {
        galleryContent.innerHTML = "";
      }
    }, 400);
  }
  // 3. Upload Drawer Layer
  if (state !== "upload") {
    uploadSheet.classList.remove("show");
  }
  // 4. About Drawer Layer
  if (state !== "about") {
    aboutDrawer.classList.remove("show");
  }
  // 5. Global Overlay (Close if neither drawer is active)
  if (state !== "upload" && state !== "about") {
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
  });

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: '&copy; <a href="https://carto.com/">Carto</a>',
      maxZoom: 20,
      keepBuffer: 8,
      updateWhenIdle: true,
    },
  ).addTo(map);

  fetch("/static/india.geojson")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to fetch GeoJSON");
      return response.json();
    })
    .then((data) => {
      L.geoJSON(data, {
        style: {
          color: "#a3a3a3",
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0,
        },
        interactive: false,
      }).addTo(map);
    })
    .catch((err) => console.log("Could not load border overlay: ", err));

  markersLayer = L.layerGroup().addTo(map);
  fetchAllPins();
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

        if (uploadDateString === todayString) {
          isToday = true;
        }
      }

      const pinClass = isToday ? "today-pin" : "premium-pin";

      const dynamicIcon = L.divIcon({
        className: "sunset-wrapper",
        html: `<div class="${pinClass}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

    
      // Add a microscopic random offset (about 5-10 meters) to the coordinates.
      // This ensures pins at the exact same location slightly separate when zoomed in!
      const jitterLat = parseFloat(pin.lat) + (Math.random() - 0.5) * 0.00015;
      const jitterLon = parseFloat(pin.lon) + (Math.random() - 0.5) * 0.00015;

      const marker = L.marker([jitterLat, jitterLon], { icon: dynamicIcon });

      // --- THE FLY-TO FIX ---
      marker.on("click", () => {
        const currentZoom = map.getZoom();
        const streetLevelZoom = 18; // Close enough to see the jitter separation

        if (currentZoom < streetLevelZoom) {
          // If zoomed out, fly down to the cluster smoothly
          map.flyTo([jitterLat, jitterLon], streetLevelZoom, {
            duration: 0.8, // 0.8 seconds for a cinematic swoop
            easeLinearity: 0.25,
          });
        } else {
          // If already zoomed in, trigger the gallery!
          openGallery(pin.id);
        }
      });

      markersLayer.addLayer(marker);
    });
  } catch (error) {
    console.error("Error fetching pins:", error);
  }
}

// --- 2. MAIN UPLOAD BUTTON CLICK ---
uploadBtn.addEventListener("click", () => {
  if (isNetworkSlow()) {
    showToast("Weak signal detected. Uploads may take a while.");
  }

  // If we ALREADY have their location, trigger the drawer AND push history state
  if (currentUserLat && currentUserLon) {
    history.pushState({ modal: "upload" }, "");
    uploadSheet.classList.add("show");
    drawerOverlay.classList.add("show");
    return;
  }

  if (navigator.geolocation) {
    uploadBtn.innerText = "Locating...";
    uploadBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentUserLat = position.coords.latitude;
        currentUserLon = position.coords.longitude;

        map.setView([currentUserLat, currentUserLon], 15);
        showToast("Live at your location");

        uploadBtn.innerText = "Select Photo";
        uploadBtn.disabled = false;
      },
      (error) => {
        console.error("Geolocation error:", error);
        showToast("Location is required.", true);
        uploadBtn.innerText = "Share Location to Upload";
        uploadBtn.disabled = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 60000,
        maximumAge: 0,
      },
    );
  } else {
    showToast("Location not supported by browser.", true);
  }
});

// --- 3. ACTION SHEET ROUTING & CLOSING ---
btnCamera.addEventListener("click", () => fileInputCamera.click());
btnGallery.addEventListener("click", () => fileInputGallery.click());

// Triggers the popstate event to elegantly close the drawer
uploadHandle.addEventListener("click", () => {
  history.back();
});

// Triggers the popstate event to elegantly close any open drawer
drawerOverlay.addEventListener("click", () => {
  if (
    uploadSheet.classList.contains("show") ||
    aboutDrawer.classList.contains("show")
  ) {
    history.back();
  }
});

document
  .querySelector("#about-drawer .drawer-handle")
  .addEventListener("click", () => {
    history.back();
  });

// --- 4. MASTER FILE HANDLING ---
const handleFileSelection = async (event) => {
  let file = event.target.files[0];
  if (!file) return;

  // Elegantly close the drawer by stepping back in history
  if (uploadSheet.classList.contains("show")) {
    history.back();
  }

  uploadBtn.innerText = "Uploading...";
  uploadBtn.disabled = true;

  // EXIF EXTRACTION
  let finalLat = currentUserLat;
  let finalLon = currentUserLon;
  let finalTime = new Date().toISOString();

  try {
    if (typeof exifr !== "undefined") {
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
    console.log("No EXIF data found, relying on live location and time.");
  }

  // EXECUTE UPLOAD
  const formData = new FormData();
  formData.append("image", file);
  formData.append("lat", finalLat);
  formData.append("lon", finalLon);
  formData.append("captured_at", finalTime);

  const selectedType =
    document.querySelector('input[name="capture_type"]:checked')?.value ||
    "sun";
  formData.append("capture_type", selectedType);

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
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            reject(JSON.parse(xhr.responseText));
          } catch (e) {
            reject({ error: "Server error" });
          }
        }
      };

      xhr.onerror = () => reject({ error: "Network disconnected" });
      xhr.send(formData);
    });

    await fetchAllPins();
    const successWord = selectedType === "moon" ? "Night sky" : "Evening";
    showToast(`${successWord} archived successfully.`);
  } catch (errorData) {
    showToast("Upload failed: " + (errorData.error || "Unknown error"), true);
  } finally {
    uploadBtn.style.removeProperty("background");
    uploadBtn.style.removeProperty("border-color");
    uploadBtn.style.removeProperty("color");

    uploadBtn.innerText = `Capture`;
    uploadBtn.disabled = false;

    fileInputCamera.value = "";
    fileInputGallery.value = "";
  }
};

fileInputGallery.addEventListener("change", handleFileSelection);
fileInputCamera.addEventListener("change", handleFileSelection);

// --- 5. GALLERY VIEW LOGIC ---
async function openGallery(pinId) {
  // Push state to history before opening
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
      imgElement.decoding = "async";

      const dateElement = document.createElement("div");
      dateElement.className = "image-date";

      const safeDateString = img.uploaded_at.replace(" ", "T");
      const utcString = safeDateString.endsWith("Z")
        ? safeDateString
        : safeDateString + "Z";
      const localDate = new Date(utcString).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      dateElement.innerText = localDate;

      card.appendChild(imgElement);
      card.appendChild(typeBadge);
      card.appendChild(dateElement);
      galleryContent.appendChild(card);
    });
  } catch (error) {
    console.error("Gallery Error:", error);
    galleryLoading.classList.remove("fade-out");
    galleryLoading.style.display = "flex";
    galleryLoading.innerHTML = `<p style="color:#ff5e3a; text-align:center;">Failed to catch the view.<br>Check your connection.</p>`;
  }
}

closeBtn.addEventListener("click", () => {
  // Triggers popstate to close gallery
  history.back();
});

// --- 6. LIGHTBOX & SWIPE LOGIC ---
function openLightbox(index) {
  currentImageIndex = index;
  updateLightboxView();

  // Push state to history before opening
  history.pushState({ modal: "lightbox" }, "");
  lightboxModal.classList.add("show");
}

function closeLightbox() {
  // Triggers popstate to close lightbox
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
    const localDate = new Date(utcString).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    lightboxDate.innerText = localDate;

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
    handleSwipe();
  },
  false,
);

function handleSwipe() {
  const swipeThreshold = 40;
  const swipeDistance = touchStartX - touchEndX;

  if (swipeDistance > swipeThreshold) {
    nextImage();
  } else if (swipeDistance < -swipeThreshold) {
    prevImage();
  }
}

// --- 7. ABOUT DRAWER LOGIC ---
aboutBtn.addEventListener("click", () => {
  // Push state to history before opening
  history.pushState({ modal: "about" }, "");
  aboutDrawer.classList.add("show");
  drawerOverlay.classList.add("show");
});

// --- 8. SYSTEM-WIDE DARK MODE TOGGLE LOGIC ---
function initThemeLogic() {
  const themeToggle = document.getElementById("theme-toggle");
  const body = document.body;

  if (!themeToggle) {
    console.error("Theme toggle button not found in the HTML!");
    return;
  }

  function applyTheme(isDark) {
    const themeMeta = document.querySelector('meta[name="theme-color"]');

    if (isDark) {
      body.classList.add("dark-mode");
      themeToggle.innerText = "☀️";
      if (themeMeta) themeMeta.setAttribute("content", "#0d1117");
    } else {
      body.classList.remove("dark-mode");
      themeToggle.innerText = "🌙";
      if (themeMeta) themeMeta.setAttribute("content", "#fffcfb");
    }
  }

  const savedTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;

  if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
    applyTheme(true);
  } else {
    applyTheme(false);
  }

  themeToggle.addEventListener("click", () => {
    const isCurrentlyDark = body.classList.contains("dark-mode");
    applyTheme(!isCurrentlyDark);
    localStorage.setItem("theme", !isCurrentlyDark ? "dark" : "light");
  });

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (!localStorage.getItem("theme")) {
        applyTheme(e.matches);
      }
    });
}

// --- AUTO-REFRESH ON WAKE ---
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    console.log("App woke up. Refreshing the sky...");
    fetchAllPins();
  }
});

window.onload = () => {
  initApp();
  initThemeLogic();
};
