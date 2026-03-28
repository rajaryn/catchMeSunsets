import os
import math
import heapq
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from db import get_db_connection
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


app = Flask(__name__)
CORS(app)

# Cloudinary Configuration
cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET')
)

app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 # Limit uploads to 5MB

# Helper: Haversine distance
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# --- Frontend Serving Routes ---
@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/service-worker.js')
def serve_sw():
    return send_from_directory('static', 'service_worker.js')

# --- API Routes ---
@app.route('/test', methods=['GET'])
def test_server():
    return jsonify({"status": "Sunsets API is running!"}), 200

@app.route('/upload', methods=['POST'])
def upload():
    # 1. Input Validation
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    file = request.files['image']
    lat_str = request.form.get('lat')
    lon_str = request.form.get('lon')

    if not file or file.filename == '' or not lat_str or not lon_str:
        return jsonify({'error': 'Missing required data'}), 400

    try:
        lat = round(float(lat_str), 3)
        lon = round(float(lon_str), 3)
    except ValueError:
        return jsonify({'error': 'Invalid coordinates format'}), 400

    # 2. Upload directly to Cloudinary
    try:
        upload_result = cloudinary.uploader.upload(
            file,
            folder="catchmesunsets", # Creates a neat folder in your Cloudinary dashboard
            resource_type="image"
        )
        # Extract the secure HTTPS URL provided by Cloudinary
        image_url = upload_result.get('secure_url')
    except Exception as e:
        print(f"🔥 CLOUDINARY ERROR: {e}") # <--- ADD THIS LINE
        return jsonify({'error': 'Cloudinary upload failed', 'details': str(e)}), 500

    # 3. Database Transaction
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = conn.cursor(dictionary=True)
    try:
        # Check if pin exists
        cursor.execute("SELECT id FROM pins WHERE lat = %s AND lon = %s", (lat, lon))
        pin = cursor.fetchone()

        if pin:
            pin_id = pin['id']
        else:
            # Create new pin
            cursor.execute("INSERT INTO pins (lat, lon) VALUES (%s, %s)", (lat, lon))
            pin_id = cursor.lastrowid

        # Insert the absolute Cloudinary URL into the database
        cursor.execute(
            "INSERT INTO images (pin_id, file_path) VALUES (%s, %s)",
            (pin_id, image_url)
        )

        conn.commit()
        return jsonify({'message': 'Upload successful', 'pin_id': pin_id}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': 'Database transaction failed', 'details': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/pins', methods=['GET'])
def get_pins():
    try:
        user_lat = float(request.args.get('lat'))
        user_lon = float(request.args.get('lon'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Valid lat and lon queries are required'}), 400

    conn = get_db_connection()

    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT id, lat, lon FROM pins")
        all_pins = cursor.fetchall()

        for pin in all_pins:
            p_lat = float(pin['lat'])
            p_lon = float(pin['lon'])
            pin['distance'] = haversine(user_lat, user_lon, p_lat, p_lon)
            pin['lat'] = p_lat
            pin['lon'] = p_lon

        closest_pins = heapq.nsmallest(30, all_pins, key=lambda x: x['distance'])
        return jsonify(closest_pins), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/pins/<int:pin_id>', methods=['GET'])
def get_gallery(pin_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor.execute(
            "SELECT id, file_path, uploaded_at FROM images WHERE pin_id = %s ORDER BY uploaded_at DESC",
            (pin_id,)
        )
        images = cursor.fetchall()
        
        for img in images:
            if isinstance(img['uploaded_at'], datetime):
                img['uploaded_at'] = img['uploaded_at'].isoformat() 
                
        return jsonify(images), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    app.run(debug=True)