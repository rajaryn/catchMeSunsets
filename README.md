# Vesper

**Vesper** is a mobile-first, location-based Progressive Web Application (PWA) built to crowdsource and explore sunset and night sky photography globally. The platform utilizes a minimalist glassmorphism design system to provide an immersive, app-like mapping experience directly in the browser.

---

## Table of Contents
- [Core Features](#-core-features)
- [Technical Stack](#-technical-stack)
- [Local Installation and Setup](#-local-installation-and-setup)
- [Under the Hood: Geolocation](#-under-the-hood-geolocation-logic)
- [UI & Design System](#-ui--design-system)
- [Deployment to Production](#-deployment-to-production)

---

## Core Features
* **Interactive Global Mapping:** Powered by Leaflet.js with custom-designed, CSS-only minimalist radar markers.
* **Smart Geolocation & EXIF Parsing:** Extracts GPS data directly from photo metadata using `exifr`. Falls back to hardware-level GPS tracking or manual search via the OpenStreetMap API if no EXIF data is found.
* **Staging Area Workflow:** A dedicated preview flow that allows users to verify their photo, location, and capture type (Dusk vs. Night Sky) before committing it to the map.
* **Client-Side HEIC Conversion:** Built-in support for iPhone `.heic` and `.heif` files via browser-side processing (`heic2any`), ensuring seamless cross-platform previews.
* **Responsive Photo Gallery:** A dynamic image grid for viewing local skies with automated layouts.
* **High-Resolution Lightbox:** Full-screen carousel for detailed viewing with local timezone data conversion.
* **Native-Feel UI:** Floating brand navigation, frosted glass search bars, and bottom-sheet drawers optimized for touch gestures and mobile notches.

---

## Technical Stack
* **Backend:** Python 3.12+ (Flask)
* **Package Manager:** `uv` (Modern, high-performance Python package installer)
* **Database / Storage:** TiDB Cloud (MySQL compatible) for spatial metadata, Cloudinary for CDN image storage.
* **Frontend:** JavaScript (ES6+), CSS3 (Custom Glassmorphism System), HTML5
* **Mapping API:** Leaflet.js

---

## Local Installation and Setup

This project uses **[uv](https://github.com/astral-sh/uv)** for dependency management, making setup significantly faster than standard `pip` environments.

### 1. Project Initialization
Clone the repository and initialize the virtual environment:
```bash
git clone [https://github.com/username/vesper.git](https://github.com/username/vesper.git)
cd vesper
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

### 2. Dependency Management
Install the required packages using `uv`:
```bash
uv sync
```

### 3. Environment Configuration
Create a `.env` file in the project root to store your database and Cloudinary credentials.
*(Note: Never commit this file to version control. See `.env.example` if available).*

### 4. Running the Development Server
Start the Flask application:
```bash
uv run app.py
```
Access the interface at `http://127.0.0.1:5000`.

---

## Under the Hood: Geolocation Logic

To ensure functionality in areas with limited mobile data or Wi-Fi triangulation (like remote beaches or mountains), the application is configured to force hardware GPS activation via the browser's Geolocation API as a fallback.

```javascript
navigator.geolocation.getCurrentPosition(success, error, {
  enableHighAccuracy: true,
  timeout: 60000,
  maximumAge: 0
});
```

**Why this matters:** This configuration forces the device to utilize its internal GPS chip rather than relying solely on cell towers. It provides a full 60-second window (`timeout: 60000`) to establish a satellite handshake, ensuring high reliability for photographers off the grid.

---

## UI & Design System

The application follows a strict glassmorphism design language to ensure a premium, unobtrusive aesthetic that lets the photos speak for themselves.

* **Pill Component:** Floating navigation elements use `backdrop-filter: blur(15px)` and `env(safe-area-inset-top)` for flawless compatibility with modern mobile notches and dynamic islands.
* **Interactive States:** Buttons utilize color inversions on hover and active touch to maintain high accessibility and contrast against translucent map layers.
* **Radar Markers:** Map pins are rendered via pure CSS animations, avoiding heavy image-based assets to guarantee rapid load times.

---

## Deployment to Production

For deployment to cloud platforms like Heroku, Railway, or Render, the application requires a traditional `requirements.txt` and a `Procfile`.

### Exporting Dependencies
Cloud platforms do not always support `uv` natively. Generate a compatible requirements file before deploying:
```bash
uv export --format requirements-txt > requirements.txt
```

### Procfile Configuration
The application uses `gunicorn` as the production WSGI server. Ensure your `Procfile` contains the following:
```plaintext
web: gunicorn app:app
``` 