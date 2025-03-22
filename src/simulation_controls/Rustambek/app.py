from flask import Flask, render_template, request, jsonify
import subprocess
import json

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('cesium.html')

@app.route('/process_signal', methods=['POST'])
def process_signal():
    try:
        data = request.get_json()
        sensor_type = data.get("sensor_type", "am_modulator")  # Default to AM Modulator

        script = "Am_modulation.py" if sensor_type == "am_modulator" else "Clover2000.py"
        
        result = subprocess.run(
            ["python3", script], 
            capture_output=True, text=True
        )

        output_data = json.loads(result.stdout)
        return jsonify(output_data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')

