import argparse
import matplotlib.pyplot as plt
from parser import *

def plot_heart_rate(records):
    timestamps = [record.timestamp() for record in records]
    heart_rates = [record.heart_rate for record in records]

    plt.figure(figsize=(10, 5))
    plt.plot(timestamps, heart_rates, linestyle="-", color="b")
    plt.xticks(rotation=45)
    plt.xlabel("Timestamp (EST)")
    plt.ylabel("Heart Rate (bpm)")
    plt.title("Heart Rate Over Time")
    plt.tight_layout()
    plt.show()

def main():
    parser = argparse.ArgumentParser(description="process and plot heart rate data from Whoop packets.")
    parser.add_argument("file", help="path to the binary file containing the Whoop historical data packets")
    parser.add_argument("--start_date", help="start date-time in 'YYYY-MM-DD HH:MM:SS AM/PM' format")
    parser.add_argument("--end_date", help="end date-time in 'YYYY-MM-DD HH:MM:SS AM/PM' format")
    parser.add_argument('--interval', type=int, default=5, help="Downsampling interval in seconds (default is 5)")
    args = parser.parse_args()

    records = parse_data(args.file)

    if args.start_date and args.end_date:
        filtered_records = HistoricalRecord.filter_records_by_date(records, args.start_date, args.end_date)
    else:
        filtered_records = records

    # Interpolate anomalies (heart rate < 20)
    filtered_records = HistoricalRecord.interpolate_anomalies(filtered_records)

    # Downsample the records based on the specified interval
    downsampled_records = HistoricalRecord.downsample(filtered_records, interval=args.interval)

    plot_heart_rate(downsampled_records)

if __name__ == "__main__":
    main()
