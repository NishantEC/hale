
import sys, struct, datetime, pytz, numpy as np
from packet import *

class HistoricalRecord:
    def __init__(self, unix, heart_rate, rr):
        self.unix = unix
        self.heart_rate = heart_rate
        self.rr = rr
    
    def timestamp(self):
        dt = datetime.datetime.fromtimestamp(self.unix)
        est_timezone = pytz.timezone("US/Eastern")
        dt_est = dt.astimezone(est_timezone)

        return dt_est.strftime('%Y-%m-%d %I:%M:%S %p')

    def __repr__(self):
        return f"HistoricalRecord(timestamp={self.timestamp()}, heart_rate={self.heart_rate})"
    
    @staticmethod
    def filter_records_by_date(records, start_date, end_date):
        """
        Filters the list of HistoricalRecord objects by a given date range.
        """
        start_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d %I:%M:%S %p")
        end_dt = datetime.datetime.strptime(end_date, "%Y-%m-%d %I:%M:%S %p")
        
        filtered_records = [
            record for record in records
            if start_dt <= datetime.datetime.strptime(record.timestamp(), "%Y-%m-%d %I:%M:%S %p") <= end_dt
        ]
        
        return filtered_records

    @staticmethod
    def interpolate_anomalies(records):
        """
        Interpolates heart rate values that are below 20 (considered anomalies).
        Handles the case where both previous and next records are anomalies.
        """
        for i in range(1, len(records) - 1):
            if records[i].heart_rate < 20:
                prev_record = records[i - 1]
                next_record = records[i + 1]
                
                # Case 1: Both previous and next records are valid, interpolate
                if prev_record.heart_rate >= 20 and next_record.heart_rate >= 20:
                    interpolated_heart_rate = (prev_record.heart_rate + next_record.heart_rate) / 2
                    records[i].heart_rate = interpolated_heart_rate
                
                # Case 2: If previous or next records are anomalies, replace with nearest valid record
                elif prev_record.heart_rate < 20 or next_record.heart_rate < 20:
                    # Search forward or backward for a valid record
                    # Look forward for the next valid record
                    forward_idx = i + 1
                    while forward_idx < len(records) and records[forward_idx].heart_rate < 20:
                        forward_idx += 1
                    
                    # If a valid record is found, use it
                    if forward_idx < len(records):
                        records[i].heart_rate = records[forward_idx].heart_rate
                    else:
                        # If no valid record found forward, look backward
                        backward_idx = i - 1
                        while backward_idx >= 0 and records[backward_idx].heart_rate < 20:
                            backward_idx -= 1
                        
                        if backward_idx >= 0:
                            records[i].heart_rate = records[backward_idx].heart_rate
                        else:
                            # If no valid record found at all, replace with a default value (e.g., mean or zero)
                            records[i].heart_rate = 60  # Default value (could be modified as needed)
        
        # Check the first and last record in case they are anomalies
        if records[0].heart_rate < 20:
            for i in range(1, len(records)):
                if records[i].heart_rate >= 20:
                    records[0].heart_rate = records[i].heart_rate  # Set the first value to the first valid heart rate
                    break

        if records[-1].heart_rate < 20:
            for i in range(len(records) - 2, -1, -1):
                if records[i].heart_rate >= 20:
                    records[-1].heart_rate = records[i].heart_rate  # Set the last value to the last valid heart rate
                    break
        
        return records

    @staticmethod
    def downsample(records, interval=5):
        """
        Downsamples records to a specific interval (in seconds).
        """
        # downsampled_records = []
        # last_time = None
        
        # for record in records:
        #     if last_time is None or record.unix - last_time >= interval:
        #         downsampled_records.append(record)
        #         last_time = record.unix
                
        # return downsampled_records
        downsampled_records = []
        interval_start_time = records[0].unix  # Initialize the start time of the first interval
        interval_values = []
        
        for record in records:
            # If the current record is within the same interval, add it to the interval_values list
            if record.unix < interval_start_time + interval:
                interval_values.append(record.heart_rate)
            else:
                # If the current record is outside the current interval, calculate the average and create a new record
                if interval_values:
                    avg_heart_rate = np.mean(interval_values)
                    downsampled_records.append(HistoricalRecord(interval_start_time, avg_heart_rate, []))
                
                # Reset for the next interval
                interval_values = [record.heart_rate]
                interval_start_time = record.unix
        
        # Ensure the last interval is included
        if interval_values:
            avg_heart_rate = np.mean(interval_values)
            downsampled_records.append(HistoricalRecord(interval_start_time, avg_heart_rate, []))
        
        return downsampled_records
    
def parse_data(file_path):
    with open(file_path, "rb") as f:
        data = f.read()

    records = []

    dp = 0
    while dp != len(data):
        length = struct.unpack("<H", data[dp + 1:dp + 3])[0] + 4 # add crc32 length
        pkt = WhoopPacket.from_data(data[dp:dp + length])
        dp += length

        # unpack the heart rate and timestamp data
        unix, subsec, unk, heart = struct.unpack("<LHLB", pkt.data[4:4 + 11])

        # rr intervals
        rrnum = pkt.data[15]
        rr1, rr2, rr3, rr4 = struct.unpack("<HHHH", pkt.data[16:24])
        rr = []
        if rrnum == 1:
            rr = [rr1]
        elif rrnum == 2:
            rr = [rr1, rr2]
        elif rrnum == 3:
            rr = [rr1, rr2, rr3]
        elif rrnum == 4:
            rr = [rr1, rr2, rr3, rr4]
        elif rrnum != 0:
            raise Exception(f"rrnum not 1, 2, 3, or 4: {rrnum}")

        records.append(HistoricalRecord(unix, heart, rr))

    return records

if __name__ == "__main__":
    records = parse_data(sys.argv[1])

    print(records[-1])
    print(len(records))