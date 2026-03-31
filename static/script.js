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

  // 1. YOUR ORIGINAL CLEAN MAP (Using Carto Light)
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: '&copy; <a href="https://carto.com/">Carto</a>',
      maxZoom: 20,
    },
  ).addTo(map);

  // 2. ENFORCING THE BORDERS (The GeoJSON Overlay)
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

    // Get today's local date formatted as YYYY-MM-DD
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    pins.forEach((pin) => {
      let isToday = false;

      // Check if this pin has an upload, and if the date matches today
      if (pin.last_upload_at) {
        // Convert the database timestamp into a safe local date (fixes iOS Safari bugs)
        const safeDateStr =
          pin.last_upload_at.replace(" ", "T") +
          (pin.last_upload_at.endsWith("Z") ? "" : "Z");
        const uploadDate = new Date(safeDateStr);

        const uploadDateString = `${uploadDate.getFullYear()}-${String(uploadDate.getMonth() + 1).padStart(2, "0")}-${String(uploadDate.getDate()).padStart(2, "0")}`;

        if (uploadDateString === todayString) {
          isToday = true;
        }
      }

      // If it's today, use 'today-pin', otherwise use the normal 'premium-pin'
      const pinClass = isToday ? "today-pin" : "premium-pin";

      const dynamicIcon = L.divIcon({
        className: "sunset-wrapper",
        html: `<div class="${pinClass}"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marker = L.marker([pin.lat, pin.lon], { icon: dynamicIcon });
      marker.on("click", () => openGallery(pin.id));
      markersLayer.addLayer(marker);
    });
  } catch (error) {
    console.error("Error fetching pins:", error);
  }
}

// --- 2. MAIN UPLOAD BUTTON CLICK ---
uploadBtn.addEventListener("click", () => {
  // If we ALREADY have their location, clicking the button opens the drawer instantly
  if (currentUserLat && currentUserLon) {
    uploadSheet.classList.add("show");
    drawerOverlay.classList.add("show");
    return;
  }

  // If we DON'T have their location, we find them first
  if (navigator.geolocation) {
    uploadBtn.innerText = "Locating...";
    uploadBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentUserLat = position.coords.latitude;
        currentUserLon = position.coords.longitude;

        // 1. Pan the map beautifully to their location
        map.setView([currentUserLat, currentUserLon], 15);

        // 2. Pop the quiet toast
        showToast("Live at your location");

        // 3. Change the button to be ready for the actual upload,
        // but DO NOT open the drawer yet!
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

  // Keep a reference if we need to revert on failure
  const originalText = uploadBtn.innerText;

  // ONE unified, poetic loading message for the entire process
  uploadBtn.innerText = "Catching the light...";
  uploadBtn.disabled = true;

  // --- 1. TIME TRAVEL (EXIF EXTRACTION) ---
  // Do this BEFORE HEIC conversion, because conversion strips the metadata!
  let finalLat = currentUserLat;
  let finalLon = currentUserLon;
  let finalTime = new Date().toISOString(); // Default to right now

  try {
    // Parse the image for GPS and Time tags
    const exifData = await exifr.parse(file);
    if (exifData) {
      if (exifData.latitude && exifData.longitude) {
        finalLat = exifData.latitude;
        finalLon = exifData.longitude;
        console.log("Time Travel: Found original GPS coordinates!");
      }
      if (exifData.DateTimeOriginal) {
        finalTime = exifData.DateTimeOriginal.toISOString();
        console.log("Time Travel: Found original capture time!");
      }
    }
  } catch (error) {
    console.log("No EXIF data found, relying on live location and time.");
  }

  // --- 2. HEIC CONVERTER (Lazy Loaded) ---
  const fileName = file.name.toLowerCase();
  const isAppleFormat =
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif") ||
    file.type === "image/heic" ||
    file.type === "image/heif";

  if (isAppleFormat) {
    try {
      await loadHeicLibrary();

      let conversionResult = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.8,
      });

      const finalBlob = Array.isArray(conversionResult)
        ? conversionResult[0]
        : conversionResult;

      // Use a Regex to replace either .heic or .heif with .jpg
      file = new File([finalBlob], file.name.replace(/\.hei[cf]/i, ".jpg"), {
        type: "image/jpeg",
      });
    } catch (e) {
      console.error("Apple Image Conversion Error:", e);
      showToast("Could not process Apple image.", true);
      uploadBtn.innerText = "Capture";
      uploadBtn.disabled = false;
      fileInputCamera.value = "";
      fileInputGallery.value = "";
      return;
    }
  }

  // --- 3. EXECUTE UPLOAD ---
  const formData = new FormData();
  formData.append("image", file);

  // Send the extracted (or live) data to the backend
  formData.append("lat", finalLat);
  formData.append("lon", finalLon);
  formData.append("captured_at", finalTime);

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
      const successWord =
        selectedType === "moon" ? "Night sky" : "Evening";
      showToast(`${successWord} archived successfully.`);
    } else {
      const errorData = await response.json();
      showToast("Upload failed: " + (errorData.error || "Unknown error"), true);
    }
  } catch (error) {
    showToast("Network error while uploading.", true);
  } finally {
    uploadBtn.innerText = "Capture";
    uploadBtn.disabled = false;
    fileInputCamera.value = "";
    fileInputGallery.value = "";
  }
};

fileInputGallery.addEventListener("change", handleFileSelection);
fileInputCamera.addEventListener("change", handleFileSelection);

// --- 5. GALLERY VIEW LOGIC ---
async function openGallery(pinId) {
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

// --- 6. LIGHTBOX & SWIPE LOGIC ---
function openLightbox(index) {
  currentImageIndex = index;
  updateLightboxView();
  lightboxModal.classList.add("show");
}

function closeLightbox() {
  lightboxModal.classList.remove("show");
}

function updateLightboxView(direction = "none") {
  const img = currentGalleryImages[currentImageIndex];

  lightboxImg.style.opacity = "0";
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
      lightboxImg.style.opacity = "1";
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
