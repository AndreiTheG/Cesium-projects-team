from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO
import time
import random

app = Flask(__name__, static_folder="static", template_folder="templates")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")  # ✅ Fix for `flask run`

sensors = {}

# ✅ Add a route to serve the index.html file
@app.route('/')
def index():
    return render_template('index.html')

# Add the following routes to serve the audio files
@app.route('/audio/<model_name>')
def get_audio(model_name):
    audio_map = {
        "telecommunication_tower_low_poly_free": "audio/output_5G.wav",
        "router": "audio/output_audio.wav",
        "arduino": "audio/output_audio.wav",
        "Satellite_antenna": "audio/Bgan_am_up.mp3",
        "satellite": "audio/Bgan_am_up.mp3"
    }
    audio_path = audio_map.get(model_name)
    if audio_path:
        return jsonify({"audio_url": f"/static/{audio_path}"})
    return jsonify({"error": "Audio not found"}), 404

# Add a route to add a new sensor
@app.route("/add_sensor", methods=["POST"])
def add_sensor():
    data = request.json
    sensor_id = data.get("sensorId")

    if not sensor_id:
        return jsonify({"message": "Invalid sensor data"}), 400

    if sensor_id not in sensors:
        sensors[sensor_id] = {
            "sensorId": sensor_id,
            "temperature": random.randint(20, 35),
            "signalStrength": random.randint(50, 100),
            "status": "active"
        }
        print(f"✅ New Sensor Added: {sensors[sensor_id]}")

        # ✅ Start sending sensor updates when the first sensor is added
        if len(sensors) == 1:  
            socketio.start_background_task(send_sensor_data)

        return jsonify({"message": "Sensor added", "sensor": sensors[sensor_id]}), 200

    return jsonify({"message": "Sensor already exists"}), 400


# ✅ Background task to send IoT updates
def send_sensor_data():
    while True:
        if not sensors:
            print("⚠️ No sensors available to send data.")
        else:
            print(f"📡 Current Sensors in Flask: {sensors}")  

            for sensor_id in sensors:
                sensors[sensor_id]["temperature"] = random.randint(20, 35)
                sensors[sensor_id]["signalStrength"] = random.randint(50, 100)
                sensors[sensor_id]["status"] = "active" if random.random() > 0.2 else "inactive"

            socketio.emit("sensor_update", list(sensors.values()), namespace="/")  # ✅ Fix broadcasting
            print(f"📡 Sent IoT Data: {sensors}")

        time.sleep(5)
        
# Use control device to display the current status of the sensors        
@socketio.on("control_device")
def control_device(data):
    sensor_id = data.get("sensorId")
    command = data.get("command")

    if sensor_id in sensors:
        print(f"📡 Received control command: {command} for {sensor_id}")
        sensors[sensor_id]["status"] = "inactive" if command == "turn_off" else "active"
        socketio.emit("sensor_update", list(sensors.values()))  # Send updated status to Cesium
        

# Connect to the client
@socketio.on("connect")
def handle_connect():
    print("✅ Client connected")

# Disconnect from the client
@socketio.on("disconnect")
def handle_disconnect():
    print("❌ Client disconnected")

# Handle messages from the client
@socketio.on("message")
def handle_message(data):
    print(f"📩 Message received: {data}")
    socketio.emit("response", {"message": "Data received!"})  # Send response back to client

# ✅ Start background task when Flask starts
@socketio.on("start_background_task")
def start_background_task():
    socketio.start_background_task(send_sensor_data)

