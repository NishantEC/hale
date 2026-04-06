import argparse, numpy as np, matplotlib.pyplot as plt
from scipy.signal import welch
from scipy.integrate import trapezoid
from parser import *

parser = argparse.ArgumentParser(description="WHOOP hrv analysis")
parser.add_argument("file", help="path to the binary file containing the Whoop historical data packets")

args = parser.parse_args()

records = parse_data(args.file)
records = HistoricalRecord.interpolate_anomalies(records)
records = HistoricalRecord.filter_records_by_date(records, "2024-12-28 4:00:00 AM", "2024-12-28 8:00:00 AM")
rr_intervals = []
for record in records:
    if len(record.rr) > 0:
        rr_intervals += record.rr
print(rr_intervals)

#heart_rate = [record.heart_rate for record in records]
# rr_intervals = 60000 / np.array(heart_rate)  # RR intervals in milliseconds
# print(rr_intervals)

def calculate_time_domain_metrics(rr_intervals):
    diff_rr = np.diff(rr_intervals)  # Differences between consecutive RR intervals
    rmssd = np.sqrt(np.mean(diff_rr**2))  # Root Mean Square of Successive Differences
    sdnn = np.std(rr_intervals)  # Standard deviation of RR intervals
    return rmssd, sdnn

def calculate_hrv(rr):
    # Calculate successive differences
    diffs = np.diff(rr)

    # Calculate RMSSD (Root Mean Square of Successive Differences)
    rmssd = np.sqrt(np.mean(diffs ** 2))

    # Calculate natural log of RMSSD
    ln_rmssd = np.log(rmssd)

    # Normalize HRV based on a scale factor of 6.5
    hrv = (ln_rmssd / 6.5) * 100.0

    return hrv

# https://help.elitehrv.com/article/54-how-do-you-calculate-the-hrv-score
hrv = calculate_hrv(rr_intervals)
print(hrv)

# Frequency-domain HRV metrics
def calculate_frequency_domain_metrics(rr_intervals, fs=4.0):
    """
    Compute the frequency domain metrics using Welch's method.
    """
    rr_intervals_sec = np.array(rr_intervals) / 1000.0  # Convert to seconds
    f, pxx = welch(rr_intervals_sec, fs=fs, nperseg=len(rr_intervals_sec))
    
    lf_band = (0.04, 0.15)  # Low-frequency band (Hz)
    hf_band = (0.15, 0.4)   # High-frequency band (Hz)
    
    lf = trapezoid(pxx[(f >= lf_band[0]) & (f < lf_band[1])], f[(f >= lf_band[0]) & (f < lf_band[1])])
    hf = trapezoid(pxx[(f >= hf_band[0]) & (f < hf_band[1])], f[(f >= hf_band[0]) & (f < hf_band[1])])
    lf_hf_ratio = lf / hf if hf > 0 else np.nan
    
    return f, pxx, lf, hf, lf_hf_ratio

# Calculate metrics
rmssd, sdnn = calculate_time_domain_metrics(rr_intervals)
f, pxx, lf, hf, lf_hf_ratio = calculate_frequency_domain_metrics(rr_intervals)

# Display metrics
print(f"Time-Domain Metrics: RMSSD = {rmssd:.2f} ms, SDNN = {sdnn:.2f} ms")
print(f"Frequency-Domain Metrics: LF = {lf:.2f}, HF = {hf:.2f}, LF/HF Ratio = {lf_hf_ratio:.2f}")

# Plot the power spectral density
plt.figure(figsize=(10, 6))
plt.semilogy(f, pxx, label="PSD")
plt.axvspan(0.04, 0.15, color='red', alpha=0.2, label='LF Band')
plt.axvspan(0.15, 0.4, color='blue', alpha=0.2, label='HF Band')
plt.xlabel("Frequency (Hz)")
plt.ylabel("Power Spectral Density")
plt.title("HRV Frequency Domain Analysis")
plt.legend()
plt.show()