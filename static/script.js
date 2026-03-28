const API_BASE = window.location.origin;
let map;
let markersLayer;
let currentUserLat = null;
let currentUserLon = null;

// State for the Lightbox Carousel
let currentGalleryImages = [];
let currentImageIndex = 0;

const lightboxModal = document.getElementById("lightbox-modal");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxDate = document.getElementById("lightbox-date");

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
  
  // Use signature orange for errors, dark gray for normal messages
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
  iconSize: [20, 20],   // The size of the dot + white border
  iconAnchor: [10, 10], // Dead center (half of 20)
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

// --- 2. UPLOAD CLICK ---
uploadBtn.addEventListener("click", () => {
  if (currentUserLat && currentUserLon) {
    fileInput.click();
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
        uploadBtn.innerText = "📸 Select Photo";
        uploadBtn.disabled = false;
        fileInput.click();
      },
      (error) => {
        console.error("Geolocation error:", error);
        showToast("Location is required to upload a sunset.", true);
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

// --- 3. FILE UPLOAD ---
fileInput.addEventListener("change", async (event) => {
  let file = event.target.files[0];
  if (!file) return;

  const originalText = uploadBtn.innerText;
  uploadBtn.innerText = "⏳ Processing...";
  uploadBtn.disabled = true;

  if (file.name.toLowerCase().endsWith(".heic") || file.type === "image/heic") {
    try {
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
      return;
    }
  }

  uploadBtn.innerText = "Uploading...";

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
      await fetchAllPins();
      showToast("Sunset captured successfully!");
    } else {
      const errorData = await response.json();
      showToast("Upload failed: " + (errorData.error || "Unknown error"), true);
    }
  } catch (error) {
    showToast("Network error while uploading.", true);
  } finally {
    uploadBtn.innerText = "📸 Upload Another";
    uploadBtn.disabled = false;
    fileInput.value = "";
  }
});

// --- 4. GALLERY VIEW ---
async function openGallery(pinId) {
  // 1. Smoothly fade in the modal overlay
  galleryModal.classList.add("show-modal");
  galleryContent.innerHTML = "";

  // 2. Reset and show the animated Orbiting Ember loader
  galleryLoading.style.display = "flex";
  galleryLoading.className = "fill-loader"; // Resets class, keeps it centered
  galleryLoading.classList.remove("fade-out"); 
  
  // Inject the pure CSS Orbiting Ember
  galleryLoading.innerHTML = `
    <div class="orbiting-ember"></div>
  `;

  try {
    const response = await fetch(`${API_BASE}/pins/${pinId}`);
    if (!response.ok) throw new Error("Failed to fetch gallery");

    const images = await response.json();

    // 3. Start the slow fade-out of the loader
    galleryLoading.classList.add("fade-out");
    
    // Completely hide it from the layout only AFTER the 0.8s CSS fade finishes
    setTimeout(() => {
        galleryLoading.style.display = "none";
    }, 800); 

    // Handle empty state if no images exist
    if (images.length === 0) {
      galleryContent.innerHTML =
        '<p style="color:white; text-align:center; width:100%; margin-top: 60px;">No sunsets caught here yet.</p>';
      return;
    }

    currentGalleryImages = images;

    // 4. Render the images
    images.forEach((img, index) => {
      const card = document.createElement("div");
      card.className = "image-card";

      // Staggered entrance animation for a cascading effect
      card.style.animationDelay = `${index * 0.1}s`;
      card.onclick = () => openLightbox(index);

      const imgElement = document.createElement("img");
      imgElement.src = img.file_path;
      imgElement.className = "gallery-img";
      imgElement.loading = "lazy";

      const dateElement = document.createElement("div");
      dateElement.className = "image-date";

      // UTC to Local Timezone conversion
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
      card.appendChild(dateElement);
      galleryContent.appendChild(card);
    });
  } catch (error) {
    console.error("Gallery Error:", error);
    // Ensure the loader is visible if there's an error so the user sees the message
    galleryLoading.classList.remove("fade-out"); 
    galleryLoading.style.display = "flex";
    galleryLoading.innerHTML = `<p style="color:#ff5e3a; text-align:center;">Failed to catch the sun.<br>Check your connection.</p>`;
  }
}

// --- LIGHTBOX CAROUSEL LOGIC ---
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

// --- CLOSE GALLERY LOGIC ---
closeBtn.addEventListener("click", () => {
  // CHANGED: Remove class instead of changing display
  galleryModal.classList.remove("show-modal");

  // Clear content after animation finishes
  setTimeout(() => {
    galleryContent.innerHTML = "";
  }, 400);
});

// --- ABOUT DRAWER LOGIC ---
const aboutBtn = document.getElementById("about-btn");
const aboutDrawer = document.getElementById("about-drawer");
const drawerOverlay = document.getElementById("drawer-overlay");

// Open the drawer
aboutBtn.addEventListener("click", () => {
    aboutDrawer.classList.add("show");
    drawerOverlay.classList.add("show");
});

// Close the drawer if they click the dark background overlay
drawerOverlay.addEventListener("click", () => {
    aboutDrawer.classList.remove("show");
    drawerOverlay.classList.remove("show");
});

// Also close it if they swipe down on the drawer handle (simulated with a click for now)
document.querySelector(".drawer-handle").addEventListener("click", () => {
    aboutDrawer.classList.remove("show");
    drawerOverlay.classList.remove("show");
});

window.onload = initApp;
