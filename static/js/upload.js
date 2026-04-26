// Camera access, HEIC parsing, EXIF processing, auto-complete places API, and the FormData upload

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
const manualSearchWrapper = document.getElementById("manual-search-wrapper");
const manualSearch = document.getElementById("manual-search");
const manualSearchResults = document.getElementById("manual-search-results");
const btnShareMap = document.getElementById("btn-share-map");
const btnLiveLocation = document.getElementById("btn-live-location");
const closeStagingBtn = document.getElementById("close-staging");
const topUiLayer = document.querySelector(".top-ui-layer");
const galleryModal = document.getElementById("gallery-modal");
const lightboxModal = document.getElementById("lightbox-modal");

// The split pickers
const manualDateInput = document.getElementById("manual-date");
const manualTimeInput = document.getElementById("manual-time");

// Flatpickr instances
let datePickerInstance = null;
let timePickerInstance = null;

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
if (uploadHandle)
  uploadHandle.addEventListener("click", () => {
    uploadSheet.classList.remove("show");
    drawerOverlay.classList.remove("show");
    history.replaceState({}, "", window.location.pathname);
  });

const handleFileSelection = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  selectedFile = file; 
  selectedType = document.querySelector('input[name="capture_type"]:checked')?.value || "sun";

  history.replaceState({ modal: "staging" }, "");
  uploadSheet.classList.remove("show");
  drawerOverlay.classList.remove("show");
  stagingArea.classList.add("show");

  if (topUiLayer) {
    topUiLayer.style.transition = "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease";
    topUiLayer.style.transform = "translateY(-150%)";
    topUiLayer.style.opacity = "0";
  }

  // Visual Reset
  stagingImg.removeAttribute("src");
  stagingImg.style.opacity = "0";
  stagingImg.style.background = ""; 
  
  if (stagingBadge) {
    stagingBadge.innerHTML = selectedType === "moon" ? svgMoon : svgSun;
  }

  const fileExt = file.name.split(".").pop().toLowerCase();
  const isHeic = fileExt === "heic" || fileExt === "heif" || file.type.includes("heic");

  // Launch EXIF extraction immediately in the background so it doesn't block UI
  processExif(file).catch(err => console.warn("EXIF silently failed:", err));

  if (isHeic && typeof heic2any !== "undefined") {
    // Show a temporary "Processing" UI so the user knows it's working
    stagingImg.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'><rect width='100%' height='100%' fill='rgba(0,0,0,0.05)'/><text x='50%' y='50%' font-family='sans-serif' font-weight='bold' font-size='14' text-anchor='middle' alignment-baseline='middle' fill='%23666'>Processing HEIC...</text></svg>`;
    stagingImg.style.opacity = "1";

    try {
      // Race HEIC conversion against a 4-second timeout to prevent total thread lock
      const conversionPromise = heic2any({ blob: file, toType: "image/jpeg", quality: 0.5 });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000));
      
      const conversionResult = await Promise.race([conversionPromise, timeoutPromise]);
      const finalBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;

      // Render the successfully converted JPEG
      stagingImg.src = URL.createObjectURL(finalBlob);
      
      // Swap the HEIC file out for the new JPEG so the backend doesn't have to process it
      selectedFile = new File([finalBlob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
    } catch (err) {
      console.warn("Mobile HEIC crash averted. Showing SVG fallback.", err);
      // Fallback if the device completely fails to convert
      const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'><rect width='100%' height='100%' fill='rgba(0,0,0,0.05)'/><text x='50%' y='50%' font-family='sans-serif' font-weight='bold' font-size='14' text-anchor='middle' alignment-baseline='middle' fill='%23666'>Photo Ready</text><text x='50%' y='65%' font-family='sans-serif' font-size='12' text-anchor='middle' alignment-baseline='middle' fill='%23888'>Preview unsupported on this Android</text></svg>`;
      stagingImg.src = fallbackSvg;
    }
  } else {
    // Instant execution for JPEGs & PNGs
    stagingImg.src = URL.createObjectURL(file);
    stagingImg.style.opacity = "1";
    
    // In case standard rendering fails (corrupted file)
    stagingImg.onerror = () => {
        const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'><rect width='100%' height='100%' fill='rgba(0,0,0,0.05)'/><text x='50%' y='50%' font-family='sans-serif' font-weight='bold' font-size='14' text-anchor='middle' alignment-baseline='middle' fill='%23666'>Photo Selected</text></svg>`;
        stagingImg.src = fallbackSvg;
    };
  }
};

if (fileInputCamera)
  fileInputCamera.addEventListener("change", handleFileSelection);
if (fileInputGallery)
  fileInputGallery.addEventListener("change", handleFileSelection);

function showDatePicker(dateToUse) {
  if (!(dateToUse instanceof Date) || isNaN(dateToUse.getTime())) {
    dateToUse = new Date();
  }

  const container = document.getElementById('date-picker-container');
  if (container) {
    container.style.display = "flex";
  }

  if (manualDateInput) {
    if (!datePickerInstance) {
      datePickerInstance = flatpickr(manualDateInput, {
        defaultDate: dateToUse,
        dateFormat: "Y-m-d",
        disableMobile: true,
        monthSelectorType: "static", 
        onChange: handleDatePickerChange
      });
      
      const dateWrapperBtn = document.getElementById('date-wrapper-btn');
      if(dateWrapperBtn) {
          dateWrapperBtn.addEventListener('click', () => datePickerInstance.open());
      }
    } else {
      datePickerInstance.setDate(dateToUse);
    }
  }

  if (manualTimeInput) {
    if (!timePickerInstance) {
      timePickerInstance = flatpickr(manualTimeInput, {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true,
        defaultDate: dateToUse,
        disableMobile: true,
        onChange: handleDatePickerChange,
        onReady: function(selectedDates, dateStr, instance) {
            // FIX: Force hour/minute inputs to be readonly so the mobile keyboard never pops up
            if (instance.timeContainer) {
                const inputs = instance.timeContainer.querySelectorAll('.flatpickr-hour, .flatpickr-minute');
                inputs.forEach(input => {
                    input.setAttribute('readonly', 'readonly');
                });
            }
        }
      });
      
      const timeWrapperBtn = document.getElementById('time-wrapper-btn');
      if(timeWrapperBtn) {
          timeWrapperBtn.addEventListener('click', () => timePickerInstance.open());
      }
    } else {
      timePickerInstance.setDate(dateToUse);
    }
  }
}

function handleDatePickerChange() {
  if (!manualDateInput || !manualTimeInput) return;
  if (!manualDateInput.value || !manualTimeInput.value) return;

  const selectedDate = new Date(`${manualDateInput.value}T${manualTimeInput.value}`);
  if (selectedDate instanceof Date && !isNaN(selectedDate.getTime())) {
    finalDate = selectedDate.toISOString();
  }
}

async function processExif(fileToParse) {
  manualSearchWrapper.style.display = "none";
  btnShareMap.style.display = "none";
  btnShareMap.disabled = true;
  if (btnLiveLocation) btnLiveLocation.style.display = "none";
  
  const container = document.getElementById('date-picker-container');
  if (container) container.style.display = "none";

  const defaultDate = new Date();
  finalDate = defaultDate.toISOString();

  finalLat = null;
  finalLon = null;

  try {
    const exifData = await exifr.parse(fileToParse, {
      gps: true,
      thumbnail: false, 
    });

    showDatePicker(defaultDate);

    if (exifData && exifData.latitude && exifData.longitude) {
        finalLat = exifData.latitude;
        finalLon = exifData.longitude;

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
        return;
    }

    triggerFallbackLocation(defaultDate);
  } catch (err) {
    console.warn("EXIF parsing failed. Using default date and manual location.");
    triggerFallbackLocation(defaultDate);
  }
}

function triggerFallbackLocation(dateToKeep) {
  if (!(dateToKeep instanceof Date) || isNaN(dateToKeep.getTime())) {
    dateToKeep = new Date();
  }

  finalDate = dateToKeep.toISOString();
  showDatePicker(dateToKeep);

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

if (closeStagingBtn) {
  closeStagingBtn.addEventListener("click", () => {
    closeStagingArea();
    history.replaceState({}, "", window.location.pathname);
  });
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