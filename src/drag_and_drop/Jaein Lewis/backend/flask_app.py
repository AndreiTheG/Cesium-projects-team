from flask import Flask, render_template, jsonify
import subprocess
import os
import threading
import json

app = Flask(__name__, template_folder=os.path.join(os.getcwd(), '..', 'frontend'))

SCRIPT_DIR = os.getcwd()
initialized = False

GNU_RADIO_SCRIPTS = {}

def load_scripts():
    """Load GNU Radio scripts dynamically from the SCRIPT_DIR."""
    global GNU_RADIO_SCRIPTS
    GNU_RADIO_SCRIPTS = {}
    # Scan the directory for Python files
    for filename in os.listdir(SCRIPT_DIR):
        if filename.endswith(".py") and 'flask' not in filename:
            script_name = filename[:-3]  # Remove .py extension for script name
            script_path = os.path.join(SCRIPT_DIR, filename)
            json_file = f"{script_name}.json"  # Corresponding JSON file
            GNU_RADIO_SCRIPTS[script_name] = {
                "path": script_path,
                "json_file": os.path.join(SCRIPT_DIR, json_file)
            }

def run_gnuradio_script(script_name):
    """Run the specified GNU Radio script."""
    try:
        script_info = GNU_RADIO_SCRIPTS.get(script_name)
        if script_info:
            subprocess.run(['python', script_info['path']], check=True)
        else:
            print(f"Script {script_name} not found.")
    except Exception as e:
        print(f"Error running the GNU Radio script: {e}")

@app.before_request
def before_first_request():
    """Runs before the first request, generating signal data for available scripts."""
    global initialized
    if not initialized:
        load_scripts()  # Load scripts dynamically
        for script_name in GNU_RADIO_SCRIPTS:
            run_gnuradio_script(script_name)
        initialized = True

@app.route('/')
def home():
    return render_template('cesium.html')

@app.route('/signal-data/<script_name>')
def signal_data(script_name):
    """API endpoint to serve the signal data for a specific script."""
    script_info = GNU_RADIO_SCRIPTS.get(script_name)
    if script_info:
        json_file_path = script_info['json_file']
        if os.path.exists(json_file_path):
            with open(json_file_path, 'r') as json_file:
                signal_data = json.load(json_file)
            return jsonify(signal_data)
        else:
            return jsonify({"error": f"Signal data for {script_name} not available yet."}), 500
    else:
        return jsonify({"error": f"Script {script_name} not found."}), 404
    

@app.route('/get_signal_list')
def get_signal_list():
    return jsonify({"signals": list(GNU_RADIO_SCRIPTS.keys())})

if __name__ == '__main__':
    app.run(debug=True)
