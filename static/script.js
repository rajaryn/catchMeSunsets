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
  toast.style.color = isError ? "#ff5e3a" : "#333";
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// --- Premium Map Marker ---
const sunsetIcon = L.divIcon({
  className: "sunset-wrapper",
  html: '<div class="premium-pin"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
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
    { attribution: "&copy; CARTO" },
  ).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  fetchAllPins();
}

async function fetchAllPins() {
  try {
    const response = await fetch(`${API_BASE}/pins`);
    if (!response.ok) throw new Error("Failed to fetch pins");
    const pins = await response.json();
    markersLayer.clearLayers();
    pins.forEach((pin) => {
      const marker = L.marker([pin.lat, pin.lon], { icon: sunsetIcon });
      marker.on("click", () => openGallery(pin.id));
      markersLayer.addLayer(marker);
    });
  } catch (error) {
    console.error("Error fetching pins:", error);
  }
}

// --- 2. MAIN UPLOAD BUTTON CLICK ---
uploadBtn.addEventListener("click", () => {
  if (currentUserLat && currentUserLon) {
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
        uploadBtn.innerText = "Select Photo";
        uploadBtn.disabled = false;

        uploadSheet.classList.add("show");
        drawerOverlay.classList.add("show");
      },
      (error) => {
        console.error("Geolocation error:", error);
        showToast("Location is required to upload a sunset.", true);
        uploadBtn.innerText = "Share Location to Upload";
        uploadBtn.disabled = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      },
    );
  } else {
    showToast("Location not supported by browser.", true);
  }
});

// --- 3. ACTION SHEET ROUTING ---
btnCamera.addEventListener("click", () => fileInputCamera.click());
btnGallery.addEventListener("click", () => fileInputGallery.click());

uploadHandle.addEventListener("click", () => {
  uploadSheet.classList.remove("show");
  drawerOverlay.classList.remove("show");
});

// --- LAZY LOAD HEIC CONVERTER LOGIC ---
let heicLoaded = false;
function loadHeicLibrary() {
  return new Promise((resolve, reject) => {
    if (heicLoaded) return resolve();
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    script.onload = () => {
      heicLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load HEIC converter"));
    document.head.appendChild(script);
  });
}

// --- 4. MASTER FILE HANDLING ---
const handleFileSelection = async (event) => {
  let file = event.target.files[0];
  if (!file) return;

  uploadSheet.classList.remove("show");
  drawerOverlay.classList.remove("show");

  const originalText = uploadBtn.innerText;
  uploadBtn.innerText = "⏳ Processing...";
  uploadBtn.disabled = true;

  if (file.name.toLowerCase().endsWith(".heic") || file.type === "image/heic") {
    try {
      showToast("Loading Apple Image Engine...");
      await loadHeicLibrary();

      showToast("Converting iPhone photo...");
      const blob = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.8,
      });
      file = new File([blob], file.name.replace(/\.heic/i, ".jpg"), {
        type: "image/jpeg",
      });
    } catch (e) {
      showToast("Could not process HEIC file", true);
      uploadBtn.innerText = originalText;
      uploadBtn.disabled = false;
      fileInputCamera.value = "";
      fileInputGallery.value = "";
      return;
    }
  }

  uploadBtn.innerText = "Uploading...";
  const formData = new FormData();
  formData.append("image", file);
  formData.append("lat", currentUserLat);
  formData.append("lon", currentUserLon);

  const selectedType =
    document.querySelector('input[name="capture_type"]:checked')?.value ||
    "sun";
  formData.append("capture_type", selectedType);

  try {
    const response = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      await fetchAllPins();
      const successWord = selectedType === "moon" ? "Moon" : "Sunset";
      showToast(`${successWord} captured successfully!`);
    } else {
      const errorData = await response.json();
      showToast("Upload failed: " + (errorData.error || "Unknown error"), true);
    }
  } catch (error) {
    showToast("Network error while uploading.", true);
  } finally {
    uploadBtn.innerText = "Upload Another";
    uploadBtn.disabled = false;
    fileInputCamera.value = "";
    fileInputGallery.value = "";
  }
};

fileInputGallery.addEventListener("change", handleFileSelection);
fileInputCamera.addEventListener("change", handleFileSelection);

// --- 5. GALLERY VIEW LOGIC ---
// --- 5. GALLERY VIEW LOGIC ---
async function openGallery(pinId) {
  galleryModal.classList.add("show-modal");
  galleryContent.innerHTML = "";
  galleryLoading.style.display = "flex";
  galleryLoading.className = "fill-loader";
  galleryLoading.classList.remove("fade-out");
  galleryLoading.innerHTML = `<div class="orbiting-ember"></div>`;

  try {
    // ✅ THE FIX: We removed the ?type= filter. Now it fetches ALL photos for this pin!
    const response = await fetch(`${API_BASE}/pins/${pinId}`);
    if (!response.ok) throw new Error("Failed to fetch gallery");

    const images = await response.json();
    galleryLoading.classList.add("fade-out");
    setTimeout(() => {
      galleryLoading.style.display = "none";
    }, 800);

    if (images.length === 0) {
      // ✅ THE FIX: A universal, poetic message
      galleryContent.innerHTML = `<p style="color:white; text-align:center; width:100%; margin-top: 60px;">No skies caught here yet.</p>`;
      return;
    }

    currentGalleryImages = images;

    images.forEach((img, index) => {
      const card = document.createElement("div");
      card.className = "image-card";
      card.style.animationDelay = `${index * 0.1}s`;
      card.onclick = () => openLightbox(index);

      // ✅ THE FIX: Generate the Sun/Moon badge based on the database
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
      const localDate = new Date(utcString).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      dateElement.innerText = localDate;
      
      // Append everything to the card
      card.appendChild(imgElement);
      card.appendChild(typeBadge); // Add the badge!
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

// --- 6. LIGHTBOX & SWIPE LOGIC ---
function openLightbox(index) {
  currentImageIndex = index;
  updateLightboxView();
  lightboxModal.classList.add("show");
}

function closeLightbox() {
  lightboxModal.classList.remove("show");
}

function updateLightboxView() {
  const img = currentGalleryImages[currentImageIndex];
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
}

function prevImage() {
  currentImageIndex--;
  if (currentImageIndex < 0)
    currentImageIndex = currentGalleryImages.length - 1;
  updateLightboxView();
}

function nextImage() {
  currentImageIndex++;
  if (currentImageIndex >= currentGalleryImages.length) currentImageIndex = 0;
  updateLightboxView();
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

closeBtn.addEventListener("click", () => {
  galleryModal.classList.remove("show-modal");
  setTimeout(() => {
    galleryContent.innerHTML = "";
  }, 400);
});

// --- 7. ABOUT DRAWER LOGIC ---
aboutBtn.addEventListener("click", () => {
  aboutDrawer.classList.add("show");
  drawerOverlay.classList.add("show");
});

drawerOverlay.addEventListener("click", () => {
  aboutDrawer.classList.remove("show");
  uploadSheet.classList.remove("show");
  drawerOverlay.classList.remove("show");
});

// FIXED: Targeting the specific handle in the about drawer so it doesn't conflict with the upload sheet
document
  .querySelector("#about-drawer .drawer-handle")
  .addEventListener("click", () => {
    aboutDrawer.classList.remove("show");
    drawerOverlay.classList.remove("show");
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
    if (isDark) {
      body.classList.add("dark-mode");
      themeToggle.innerText = "☀️";
    } else {
      body.classList.remove("dark-mode");
      themeToggle.innerText = "🌙";
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

// FIXED: Consolidated window.onload to fire both initializing functions
window.onload = () => {
  initApp();
  initThemeLogic();
};
