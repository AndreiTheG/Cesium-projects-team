import numpy as np
import matplotlib.pyplot as plt

# Define the file path where GNU Radio saved the data
file_path = "/Users/sorker/Downloads/hf_signal_data"

# Define the data type (GNU Radio saves complex float32)
dtype = np.complex64  # Complex numbers

# Read the binary file
def read_signal_data():
    try:
        data = np.fromfile(file_path, dtype=dtype)  # Load as complex numbers
        return data
    except FileNotFoundError:
        print("Error: Signal data file not found.")
        return np.array([])

# Load the signal
signal = read_signal_data()

# Check if data was read correctly
if signal.size == 0:
    print("No data found! Check GNU Radio File Sink.")
else:
    print(f"Loaded {len(signal)} samples from HF signal.")

    # Plot the signal's magnitude
    plt.figure(figsize=(10, 5))
    plt.plot(np.abs(signal[:1000]))  # Plot first 1000 samples
    plt.title("HF Signal Magnitude")
    plt.xlabel("Sample Index")
    plt.ylabel("Magnitude")
    plt.grid()
    plt.show()

