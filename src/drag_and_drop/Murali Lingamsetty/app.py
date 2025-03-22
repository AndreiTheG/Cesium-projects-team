from flask import Flask, request, jsonify, render_template, send_from_directory
import os
import threading
import time
import numpy as np
import wave
import struct
import subprocess

app = Flask(__name__, static_folder="static", template_folder="templates")

# Create necessary directories
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Global variables for FFT processing
latest_fft_data = []
current_wav_file = None  # Keeps track of the latest processed file

# -------------------------------
# Home Route (Serves Digital Twin)
# -------------------------------
@app.route("/")
def home():
    """Serves the Digital Twin HTML page."""
    return render_template("digital_twin.html")


# -------------------------------
# Initial Coordinates for Cesium
# -------------------------------
@app.route("/api/initial-coordinates", methods=["GET"])
def initial_coordinates():
    """Provides initial coordinates for the Cesium 3D globe."""
    return jsonify({
        "latitude": 40.7128,
        "longitude": -74.0060,
        "altitude": 1000
    })


# -------------------------------
# Sensor Data API
# -------------------------------
sensor_data = []  # Stores incoming sensor data

@app.route("/api/sensor-data", methods=["POST"])
def receive_sensor_data():
    """Receives sensor data from the Digital Twin client."""
    new_sensor = request.json
    sensor_data.append(new_sensor)
    return jsonify({"message": "Sensor data received!", "data": new_sensor})


@app.route("/api/sensor-data", methods=["GET"])
def get_sensor_data():
    """Returns all stored sensor data."""
    return jsonify(sensor_data)


# -------------------------------
# GNU Radio - WAV File Processing
# -------------------------------

def process_wav_file(wav_path):
    """Runs GNU Radio processing and extracts FFT data."""
    global latest_fft_data
    try:
        wf = wave.open(wav_path, 'rb')
    except Exception as e:
        print("Error opening WAV file:", e)
        return

    sample_rate = wf.getframerate()
    chunk_size = 1024  # Frames per processing chunk

    while True:
        frames = wf.readframes(chunk_size)
        if len(frames) == 0:
            wf.rewind()  # Loop the WAV file
            continue

        # Convert frames to an array
        num_samples = len(frames) // 2
        samples = struct.unpack('<' + 'h' * num_samples, frames)
        data = np.array(samples, dtype=np.float32) / 32768.0  # Normalize

        # Compute FFT and store result
        fft_result = np.fft.fft(data)
        fft_magnitude = np.abs(fft_result[:len(fft_result)//2])  # Keep positive frequencies
        latest_fft_data = fft_magnitude.tolist()

        # Real-time pacing
        time.sleep(chunk_size / sample_rate)


@app.route("/api/fft-data", methods=["GET"])
def get_fft_data():
    """Provides FFT data for the Digital Twin client."""
    return jsonify({"fft": latest_fft_data})


# -------------------------------
# User Upload for WAV Files
# -------------------------------

@app.route("/api/upload", methods=["POST"])
def upload_wav():
    """Allows users to upload a new .wav file for GNU Radio processing."""
    global current_wav_file

    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files["file"]
    
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    
    if not file.filename.lower().endswith(".wav"):
        return jsonify({"error": "Only .wav files are allowed"}), 400

    # Save uploaded file
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)
    current_wav_file = filepath

    # Restart GNU Radio processing with the new file
    threading.Thread(target=process_wav_file, args=(filepath,), daemon=True).start()

    return jsonify({"message": "File uploaded successfully", "file": file.filename})


# -------------------------------
# Serve Uploaded Files
# -------------------------------
@app.route("/uploads/<filename>")
def uploaded_file(filename):
    """Serves uploaded files."""
    return send_from_directory(UPLOAD_FOLDER, filename)


# # -------------------------------
# # Run GNU Radio Script (Optional)
# # -------------------------------
# @app.route("/api/run-gnu-radio", methods=["POST"])
# def run_gnu_radio():
#     """Executes the GNU Radio script (ELF.py) in the background."""
#     try:
#         subprocess.Popen(["python", "ELF.py"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
#         return jsonify({"message": "GNU Radio script started"}), 200
#     except Exception as e:
#         return jsonify({"error": str(e)}), 500


# -------------------------------
# Main Entry Point
# -------------------------------
if __name__ == "__main__":
    app.run(debug=True)
