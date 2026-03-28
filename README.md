
## catchMeSunsets

**catchMeSunsets** is a mobile-first, location-based web application built to crowdsource and explore sunset photography globally. The platform utilizes a minimalist glassmorphism design system to provide an immersive mapping experience.

### Core Features

* **Interactive Global Mapping:** Powered by Leaflet.js with custom-designed minimalist radar markers.
* **Precision Geolocation:** Uses hardware-level GPS tracking to anchor sunset captures to exact coordinates.
* **Responsive Photo Gallery:** A Masonry-style grid for viewing local sunsets with automated Pinterest-style layouts.
* **High-Resolution Lightbox:** Full-screen carousel for detailed viewing with local timezone data conversion.
* **Client-Side HEIC Conversion:** Built-in support for iPhone HEIC files via browser-side processing.
* **Native-Feel UI:** Floating brand navigation and bottom-sheet "About" drawers optimized for touch gestures.

---

## Technical Stack

* **Backend:** Python 3.12+ (Flask)
* **Package Manager:** uv (Modern, high-performance Python package installer)
* **Database:** TiDB Cloud (MySQL compatible) for spatial metadata storage, Cloudinary for image storage
* **Frontend:** JavaScript (ES6+), CSS3 (Custom Glassmorphism System), HTML5
* **Mapping API:** Leaflet.js

---

## Installation and Local Setup

Since this project uses  **uv** , setup is significantly faster than standard pip environments.

### 1. Project Initialization

Clone the repository and initialize the environment:

**Bash**

```
git clone https://github.com/username/catchmesunsets.git
cd catchmesunsets
uv venv
source .venv/bin/bin/activate  # On Windows: .venv\Scripts\activate
```

### 2. Dependency Management

Install the required packages using  **uv** :

**Bash**

```
uv sync
```

### 3. Environment Configuration

Create a `.env` file in the project root to store your database credentials. Do not commit this file to version control.

### 4. Running the Development Server

Start the Flask application:

**Bash**

```
uv run app.py
```

Access the interface at `http://127.0.0.1:5000`.

---

## Critical Logic: Geolocation and GPS

To ensure functionality in areas with limited mobile data or Wi-Fi triangulation, the application is configured to force hardware GPS activation.

**JavaScript**

```
{
  enableHighAccuracy: true,
  timeout: 60000,
  maximumAge: 0
}
```

This configuration forces the device to utilize its internal GPS chip and provides a 30-second window to establish a satellite handshake, ensuring reliability in remote photography locations.

---

## UI Design System

The application follows a strict glassmorphism design language to ensure a premium aesthetic:

* **Pill Component:** Floating navigation elements use `backdrop-filter: blur(15px)` and `env(safe-area-inset-top)` for compatibility with modern mobile notches.
* **Interactive States:** Buttons utilize `!important` color inversions on hover and active touch to maintain high contrast against the translucent map layers.
* **Radar Markers:** Map pins are rendered via pure CSS animations, avoiding image-based assets for faster load times.

---

## Deployment to Production

For deployment to platforms like Heroku, Railway, or Render, the application requires an exported `requirements.txt` and a `Procfile`.

### Exporting Dependencies

Cloud platforms do not always support **uv** natively yet. Generate a compatible requirements file:

**Bash**

```
uv export --format requirements-txt > requirements.txt
```

### Procfile Configuration

The application uses **gunicorn** as the production WSGI server. Your `Procfile` must contain:

**Plaintext**

```
web: gunicorn app:app
```
