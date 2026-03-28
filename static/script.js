// During local dev this is fine, but for production, we will use a relative path
const API_BASE = window.location.origin;
let map;
let markersLayer;
let currentUserLat = null;
let currentUserLon = null;

const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const galleryModal = document.getElementById("gallery-modal");
const galleryContent = document.getElementById("gallery-content");
const closeBtn = document.getElementById("close-btn");
const galleryLoading = document.getElementById("gallery-loading");
const toast = document.getElementById("toast");

// --- Toast Logic ---
function showToast(message, isError = false) {
  toast.innerText = message;
  toast.style.background = isError ? "#e74c3c" : "#2ecc71";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// --- Custom Marker Design ---
const sunsetIcon = L.divIcon({
  className: "sunset-wrapper",
  html: '<div class="sunset-marker">🌅</div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

function initApp() {
  const bounds = L.latLngBounds(L.latLng(-89.9, -180), L.latLng(89.9, 180));

  map = L.map("map", {
    center: [20, 0],
    zoom: 2,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0,
    minZoom: 2,
  });

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { attribution: "&copy; CARTO" },
  ).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  // --- THE GEOLOCATION BLOCK (With High Accuracy) ---
  if (navigator.geolocation) {
    uploadBtn.innerText = "📍 Locating...";
    uploadBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentUserLat = position.coords.latitude;
        currentUserLon = position.coords.longitude;
        console.log(`Accuracy: ${position.coords.accuracy} meters`);

        map.setView([currentUserLat, currentUserLon], 15); // Zoomed in more for accuracy
        fetchPins();
        uploadBtn.innerText = "📸 Upload Sunset Here";
        uploadBtn.disabled = false;
      },
      (error) => {
        console.error("Geolocation error:", error);
        showToast("Location error. Try moving near a window.", true);
        uploadBtn.innerText = "Location Error";
      },
      {
        enableHighAccuracy: true, // Forces the device to use GPS if available
        timeout: 10000,
        maximumAge: 0,
      },
    );
  } else {
    showToast("Geolocation is not supported by your browser.", true);
  }

  // --- Register Service Worker ---
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then(() => console.log("Service Worker Registered"))
      .catch((err) => console.error("Service Worker Failed", err));
  }
}

async function fetchPins() {
  if (!currentUserLat || !currentUserLon) return;
  try {
    const response = await fetch(
      `${API_BASE}/pins?lat=${currentUserLat}&lon=${currentUserLon}`,
    );
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

uploadBtn.addEventListener("click", () => {
  if (currentUserLat && currentUserLon) fileInput.click();
});

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const originalText = uploadBtn.innerText;
  uploadBtn.innerText = "⏳ Uploading...";
  uploadBtn.disabled = true;

  const formData = new FormData();
  formData.append("image", file);
  formData.append("lat", currentUserLat);
  formData.append("lon", currentUserLon);

  try {
    const response = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      await fetchPins();
      showToast("Sunset captured successfully! 🌅");
    } else {
      const errorData = await response.json();
      showToast("Upload failed: " + (errorData.error || "Unknown error"), true);
    }
  } catch (error) {
    showToast("Network error while uploading.", true);
  } finally {
    uploadBtn.innerText = originalText;
    uploadBtn.disabled = false;
    fileInput.value = "";
  }
});

async function openGallery(pinId) {
  galleryModal.style.display = "flex";
  galleryContent.innerHTML = "";
  galleryLoading.style.display = "block";

  try {
    const response = await fetch(`${API_BASE}/pins/${pinId}`);
    if (!response.ok) throw new Error("Failed to fetch gallery");
    const images = await response.json();
    galleryLoading.style.display = "none";

    if (images.length === 0) {
      galleryContent.innerHTML =
        '<p style="color:white;">No images found for this pin.</p>';
      return;
    }

    images.forEach((img) => {
      const card = document.createElement("div");
      card.className = "image-card";

      const imgElement = document.createElement("img");
      imgElement.src = img.file_path;
      imgElement.className = "gallery-img";
      imgElement.loading = "lazy";

      const dateElement = document.createElement("div");
      dateElement.className = "image-date";

      const localDate = new Date(img.uploaded_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      dateElement.innerText = localDate;

      card.appendChild(imgElement);
      card.appendChild(dateElement);
      galleryContent.appendChild(card);
    });
  } catch (error) {
    galleryLoading.innerText = "Failed to load images.";
  }
}

closeBtn.addEventListener("click", () => {
  galleryModal.style.display = "none";
});

window.onload = initApp;
