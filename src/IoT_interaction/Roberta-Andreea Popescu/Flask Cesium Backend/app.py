from flask import Flask, request, jsonify, render_template
import os

# Initialize the Flask application
app = Flask(__name__, static_folder="static", template_folder="templates")

# Temporary storage for sensor data
sensor_data = []

# Home route to serve the Cesium client
@app.route("/")
def home():
    # Render the HTML page for the Cesium client
    return render_template("index.html")

# Route to provide initial coordinates for the 3D globe
@app.route("/api/initial-coordinates", methods=["GET"])
def initial_coordinates():
    # Example coordinates for New York City
    data = {
        "latitude": 40.7128,  # Latitude
        "longitude": -74.0060,  # Longitude
        "altitude": 1000  # Initial altitude in meters
    }
    return jsonify(data)

# Route to receive sensor data from the client
@app.route("/api/sensor-data", methods=["POST"])
def receive_sensor_data():
    new_sensor = request.json  # Get JSON data sent by the client
    sensor_data.append(new_sensor)  # Add the new sensor data to the storage
    return jsonify({"message": "Sensor data received!", "data": new_sensor})

# Route to retrieve all stored sensor data
@app.route("/api/sensor-data", methods=["GET"])
def get_sensor_data():
    return jsonify(sensor_data)

# Static files to serve CesiumJS and client assets
@app.route("/static/<path:path>")
def static_files(path):
    return app.send_static_file(path)

# Main entry point to run the Flask server
if __name__ == "__main__":
    # Ensure the templates and static folders exist
    if not os.path.exists("templates"):
        os.makedirs("templates")
    if not os.path.exists("static"):
        os.makedirs("static")

    # Example HTML file for the Cesium client
    with open("templates/index.html", "w") as f:
        f.write("""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Cesium with Flask</title>
            <script src="https://cesium.com/downloads/cesiumjs/releases/1.104/Build/Cesium/Cesium.js"></script>
            <link href="https://cesium.com/downloads/cesiumjs/releases/1.104/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
            <style>
                #cesiumContainer { width: 100%; height: 100vh; margin: 0; padding: 0; }
            </style>
        </head>
        <body>
            <div id="cesiumContainer"></div>
            <script>
                // Initialize Cesium Viewer
                const viewer = new Cesium.Viewer('cesiumContainer', {
                    terrainProvider: Cesium.createWorldTerrain(),
                    animation: false,
                    timeline: false
                });

                // Fetch initial coordinates from the Flask backend
                fetch('/api/initial-coordinates')
                    .then(response => response.json())
                    .then(data => {
                        viewer.camera.flyTo({
                            destination: Cesium.Cartesian3.fromDegrees(
                                data.longitude,
                                data.latitude,
                                data.altitude
                            )
                        });
                    });

                // Example: Sending sensor data to the backend
                const sensorData = {
                    sensor_name: "Ultrasonic",
                    range: 50,
                    field_of_view: 30,
                    color: "blue"
                };

                fetch('/api/sensor-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sensorData)
                })
                .then(response => response.json())
                .then(data => console.log(data));

            </script>
        </body>
        </html>
        """)

    # Run the Flask server in debug mode
    app.run(debug=True)
