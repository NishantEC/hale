import struct, zlib, datetime, pytz
from enum import Enum

class PacketType(Enum):
    COMMAND = 35
    COMMAND_RESPONSE = 36
    REALTIME_DATA = 40
    HISTORICAL_DATA = 47
    REALTIME_RAW_DATA = 43
    EVENT = 48
    METADATA = 49
    CONSOLE_LOGS = 50
    REALTIME_IMU_DATA_STREAM = 51
    HISTORICAL_IMU_DATA_STREAM = 52

class MetadataType(Enum):
    HISTORY_START = 1
    HISTORY_END = 2
    HISTORY_COMPLETE = 3

class EventNumber(Enum):
    UNDEFINED = 0
    ERROR = 1
    CONSOLE_OUTPUT = 2
    BATTERY_LEVEL = 3
    SYSTEM_CONTROL = 4
    EXTERNAL_5V_ON = 5
    EXTERNAL_5V_OFF = 6
    CHARGING_ON = 7
    CHARGING_OFF = 8
    WRIST_ON = 9
    WRIST_OFF = 10
    BLE_CONNECTION_UP = 11
    BLE_CONNECTION_DOWN = 12
    RTC_LOST = 13
    DOUBLE_TAP = 14
    BOOT = 15
    SET_RTC = 16
    TEMPERATURE_LEVEL = 17
    PAIRING_MODE = 18
    SERIAL_HEAD_CONNECTED = 19
    SERIAL_HEAD_REMOVED = 20
    BATTERY_PACK_CONNECTED = 21
    BATTERY_PACK_REMOVED = 22
    BLE_BONDED = 23
    BLE_HR_PROFILE_ENABLED = 24
    BLE_HR_PROFILE_DISABLED = 25
    TRIM_ALL_DATA = 26
    TRIM_ALL_DATA_ENDED = 27
    FLASH_INIT_COMPLETE = 28
    STRAP_CONDITION_REPORT = 29
    BOOT_REPORT = 30
    EXIT_VIRGIN_MODE = 31
    CAPTOUCH_AUTOTHRESHOLD_ACTION = 32
    BLE_REALTIME_HR_ON = 33
    BLE_REALTIME_HR_OFF = 34
    ACCELEROMETER_RESET = 35
    AFE_RESET = 36
    SHIP_MODE_ENABLED = 37
    SHIP_MODE_DISABLED = 38
    SHIP_MODE_BOOT = 39
    CH1_SATURATION_DETECTED = 40
    CH2_SATURATION_DETECTED = 41
    ACCELEROMETER_SATURATION_DETECTED = 42
    BLE_SYSTEM_RESET = 43
    BLE_SYSTEM_ON = 44
    BLE_SYSTEM_INITIALIZED = 45
    RAW_DATA_COLLECTION_ON = 46
    RAW_DATA_COLLECTION_OFF = 47
    STRAP_DRIVEN_ALARM_SET = 56
    STRAP_DRIVEN_ALARM_EXECUTED = 57
    APP_DRIVEN_ALARM_EXECUTED = 58
    STRAP_DRIVEN_ALARM_DISABLED = 59
    HAPTICS_FIRED = 60
    EXTENDED_BATTERY_INFORMATION = 63
    HIGH_FREQ_SYNC_PROMPT = 96
    HIGH_FREQ_SYNC_ENABLED = 97
    HIGH_FREQ_SYNC_DISABLED = 98
    HAPTICS_TERMINATED = 100

class CommandNumber(Enum):
    LINK_VALID = 1
    GET_MAX_PROTOCOL_VERSION = 2
    TOGGLE_REALTIME_HR = 3
    REPORT_VERSION_INFO = 7
    TOGGLE_R7_DATA_COLLECTION = 16
    SET_CLOCK = 10
    GET_CLOCK = 11
    TOGGLE_GENERIC_HR_PROFILE = 14
    RUN_HAPTIC_PATTERN_MAVERICK = 19
    ABORT_HISTORICAL_TRANSMITS = 20
    SEND_HISTORICAL_DATA = 22
    HISTORICAL_DATA_RESULT = 23
    GET_BATTERY_LEVEL = 26
    REBOOT_STRAP = 29
    FORCE_TRIM = 25
    POWER_CYCLE_STRAP = 32
    SET_READ_POINTER = 33
    GET_DATA_RANGE = 34
    GET_HELLO_HARVARD = 35
    START_FIRMWARE_LOAD = 36
    LOAD_FIRMWARE_DATA = 37
    PROCESS_FIRMWARE_IMAGE = 38
    START_FIRMWARE_LOAD_NEW = 142
    LOAD_FIRMWARE_DATA_NEW = 143
    PROCESS_FIRMWARE_IMAGE_NEW = 144
    VERIFY_FIRMWARE_IMAGE = 83
    SET_LED_DRIVE = 39
    GET_LED_DRIVE = 40
    SET_TIA_GAIN = 41
    GET_TIA_GAIN = 42
    SET_BIAS_OFFSET = 43
    GET_BIAS_OFFSET = 44
    ENTER_BLE_DFU = 45
    SET_DP_TYPE = 52
    FORCE_DP_TYPE = 53
    SEND_R10_R11_REALTIME = 63
    SET_ALARM_TIME = 66
    GET_ALARM_TIME = 67
    RUN_ALARM = 68
    DISABLE_ALARM = 69
    GET_ADVERTISING_NAME_HARVARD = 76
    SET_ADVERTISING_NAME_HARVARD = 77
    RUN_HAPTICS_PATTERN = 79
    GET_ALL_HAPTICS_PATTERN = 80
    START_RAW_DATA = 81
    STOP_RAW_DATA = 82
    GET_BODY_LOCATION_AND_STATUS = 84
    ENTER_HIGH_FREQ_SYNC = 96
    EXIT_HIGH_FREQ_SYNC = 97
    GET_EXTENDED_BATTERY_INFO = 98
    RESET_FUEL_GAUGE = 99
    CALIBRATE_CAPSENSE = 100
    TOGGLE_IMU_MODE_HISTORICAL = 105
    TOGGLE_IMU_MODE = 106
    TOGGLE_OPTICAL_MODE = 108
    START_FF_KEY_EXCHANGE = 117
    SEND_NEXT_FF = 118
    SET_FF_VALUE = 120
    GET_FF_VALUE = 128
    STOP_HAPTICS = 122
    SELECT_WRIST = 123
    TOGGLE_LABRADOR_FILTERED = 139
    TOGGLE_LABRADOR_RAW_SAVE = 125
    TOGGLE_LABRADOR_DATA_GENERATION = 124
    START_DEVICE_CONFIG_KEY_EXCHANGE = 115
    SEND_NEXT_DEVICE_CONFIG = 116
    SET_DEVICE_CONFIG_VALUE = 119
    GET_DEVICE_CONFIG_VALUE = 121
    SET_RESEARCH_PACKET = 131
    GET_RESEARCH_PACKET = 132
    GET_ADVERTISING_NAME = 141
    SET_ADVERTISING_NAME = 140
    GET_HELLO = 145
    ENABLE_OPTICAL_DATA = 107

crc8tab = [
    0x00, 0x07, 0x0E, 0x09, 0x1C, 0x1B, 0x12, 0x15, 0x38, 0x3F, 0x36, 0x31, 0x24, 0x23, 0x2A, 0x2D,
    0x70, 0x77, 0x7E, 0x79, 0x6C, 0x6B, 0x62, 0x65, 0x48, 0x4F, 0x46, 0x41, 0x54, 0x53, 0x5A, 0x5D,
    0xE0, 0xE7, 0xEE, 0xE9, 0xFC, 0xFB, 0xF2, 0xF5, 0xD8, 0xDF, 0xD6, 0xD1, 0xC4, 0xC3, 0xCA, 0xCD,
    0x90, 0x97, 0x9E, 0x99, 0x8C, 0x8B, 0x82, 0x85, 0xA8, 0xAF, 0xA6, 0xA1, 0xB4, 0xB3, 0xBA, 0xBD,
    0xC7, 0xC0, 0xC9, 0xCE, 0xDB, 0xDC, 0xD5, 0xD2, 0xFF, 0xF8, 0xF1, 0xF6, 0xE3, 0xE4, 0xED, 0xEA,
    0xB7, 0xB0, 0xB9, 0xBE, 0xAB, 0xAC, 0xA5, 0xA2, 0x8F, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9D, 0x9A,
    0x27, 0x20, 0x29, 0x2E, 0x3B, 0x3C, 0x35, 0x32, 0x1F, 0x18, 0x11, 0x16, 0x03, 0x04, 0x0D, 0x0A,
    0x57, 0x50, 0x59, 0x5E, 0x4B, 0x4C, 0x45, 0x42, 0x6F, 0x68, 0x61, 0x66, 0x73, 0x74, 0x7D, 0x7A,
    0x89, 0x8E, 0x87, 0x80, 0x95, 0x92, 0x9B, 0x9C, 0xB1, 0xB6, 0xBF, 0xB8, 0xAD, 0xAA, 0xA3, 0xA4,
    0xF9, 0xFE, 0xF7, 0xF0, 0xE5, 0xE2, 0xEB, 0xEC, 0xC1, 0xC6, 0xCF, 0xC8, 0xDD, 0xDA, 0xD3, 0xD4,
    0x69, 0x6E, 0x67, 0x60, 0x75, 0x72, 0x7B, 0x7C, 0x51, 0x56, 0x5F, 0x58, 0x4D, 0x4A, 0x43, 0x44,
    0x19, 0x1E, 0x17, 0x10, 0x05, 0x02, 0x0B, 0x0C, 0x21, 0x26, 0x2F, 0x28, 0x3D, 0x3A, 0x33, 0x34,
    0x4E, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5C, 0x5B, 0x76, 0x71, 0x78, 0x7F, 0x6A, 0x6D, 0x64, 0x63,
    0x3E, 0x39, 0x30, 0x37, 0x22, 0x25, 0x2C, 0x2B, 0x06, 0x01, 0x08, 0x0F, 0x1A, 0x1D, 0x14, 0x13,
    0xAE, 0xA9, 0xA0, 0xA7, 0xB2, 0xB5, 0xBC, 0xBB, 0x96, 0x91, 0x98, 0x9F, 0x8A, 0x8D, 0x84, 0x83,
    0xDE, 0xD9, 0xD0, 0xD7, 0xC2, 0xC5, 0xCC, 0xCB, 0xE6, 0xE1, 0xE8, 0xEF, 0xFA, 0xFD, 0xF4, 0xF3
]

def crc8(buffer):
    crc = 0
    for b in buffer:
        crc = crc8tab[crc ^ b]
    return crc

# return "RawDataStreamResult(type=" + this.f100235a + ", timestampSeconds=" + this.f100236b + ", timestampSubseconds=" + this.f100237c + ", heartRate=" + C15640x.m68903i(this.f100238d) + ", accelerometerSamplesX=" + Arrays.toString(this.f100239e) + ", accelerometerSamplesY=" + Arrays.toString(this.f100240f) + ", accelerometerSamplesZ=" + Arrays.toString(this.f100241g) + ", gyroscopeSamplesX=" + Arrays.toString(this.f100242h) + ", gyroscopeSamplesY=" + Arrays.toString(this.f100243i) + ", gyroscopeSamplesZ=" + Arrays.toString(this.f100244j) + ")";

def timestring(unix):
    dt = datetime.datetime.fromtimestamp(unix)
    est_timezone = pytz.timezone("US/Eastern")
    dt_est = dt.astimezone(est_timezone)

    return dt_est.strftime('%Y-%m-%d %I:%M:%S %p')

# Gen4PacketFrame and FramedPacket from Java
class WhoopPacket:
    sof = 0xAA

    def __init__(self, type=PacketType.COMMAND, seq=0, cmd=CommandNumber.GET_HELLO, data=b""):
        self.type = type
        self.seq = seq
        self.cmd = cmd
        self.data = data

    def __str__(self):        
        te = self.type
        if type(self.type) != PacketType:
            te = PacketType(self.type)

        # realtime data
        if te == PacketType.REALTIME_DATA:
            # TODO: fix this its bad, special case
            recon = struct.pack("<B", self.cmd) + self.data[:7]
            unix, subsec, heart, rrnum = struct.unpack("<LHBB", recon)
            print(unix, subsec, heart, rrnum)
            resp = f"WhoopPacket: type[{te}] time({timestring(unix)}) heart({heart}) "
            if rrnum > 0:
                rr1, rr2, rr3 = struct.unpack("<HHH", self.data[7:7 + 6])
                resp += f"rr({rr1} {rr2} {rr3})"
            
            return resp
        # event
        elif te == PacketType.EVENT:
            ee = self.cmd
            if type(self.cmd) != EventNumber:
                ee = EventNumber(self.cmd)

            resp = f"WhoopPacket: type[{te}] seq[{hex(self.seq)}] event({ee}) "
            if ee == EventNumber.WRIST_ON:
                # aa100057 30 7e 09 00 c2e96e67 685d0000a2a61c12
                unix = struct.unpack("<L", self.data[1:5])[0]
                resp += f"timestamp({unix})"
            elif ee == EventNumber.WRIST_OFF:
                # aa100057 30 04 0a 00 3bea6e67 58690000c7b723e7
                unix = struct.unpack("<L", self.data[1:5])[0]
                resp += f"timestamp({unix})"
            else:
                resp += f"data[{self.data.hex()}]"
            
            return resp
        elif te == PacketType.COMMAND or te == PacketType.COMMAND_RESPONSE:
            ce = self.cmd
            if type(self.cmd) != CommandNumber:
                ce = CommandNumber(self.cmd)
            
            resp = f"WhoopPacket: type[{te}] seq[{hex(self.seq)}] cmd[{ce}] "
            if ce == CommandNumber.GET_CLOCK:
                unix = struct.unpack("<L", self.data[2:6])[0]
                resp += f"timestamp({unix})"
            elif ce == CommandNumber.GET_BATTERY_LEVEL:
                level = float(struct.unpack("<H", self.data[2:4])[0]) / 10
                resp += f"battery({level}%)" 
            elif ce == CommandNumber.REPORT_VERSION_INFO:
                unpack = struct.unpack("<BBBLLLLLLLLLLLLLLLLBBL", self.data)
                harvard = f"{unpack[3]}.{unpack[4]}.{unpack[5]}.{unpack[6]}"
                boylston = f"{unpack[7]}.{unpack[8]}.{unpack[9]}.{unpack[10]}"
                resp += f"version harvard({harvard}) boylston({boylston})" 
            else:
                resp += f"data[{self.data.hex()}]"

            return resp
        elif te == PacketType.HISTORICAL_DATA:
            unix, subseconds = struct.unpack("<LH", self.data[0:4 + 2])
            
            resp = f"WhoopPacket: type[{te}] seq[{hex(self.seq)}] {self.data.hex()}" #unix({unix}) subseconds({subseconds})"

            return resp

        elif te == PacketType.METADATA:
            # 75c47a67 9858 06000000100000000200000029000000100000000600000000000000080200
            # 75c47a67 186b 33000000948b000000000000000000
            # 76c47a67 8802 06000000100000000200000029000000100000000600000000000000080200
            # 76c47a67 2815 32000000998b000000000000000000

            # end
            # c9c47a67 a006 320000009e8b000000000000000000
            # c9c47a67 182e 39000000a38b000000000000000000
            # c9c47a67 f875 67000000a68b000000000000000000
            # cac47a67 f825 48000000a98b000000000000000000
            # cac47a67 3063 4c000000ac8b000000000000000000
            # cbc47a67 e008 37000000ae8b000000000000000000

            # complete
            # b2c57a67 7033 000000

            return f"WhoopPacket: type[{te}] metadata[{MetadataType(self.cmd)}] data[{self.data.hex()}]"
        elif te == PacketType.CONSOLE_LOGS:
            # aa44000f 32 32 02 0053ea6e67 186b 340001726473203d20320a2031302c20333136373830323a2053494750524f432d574541522d4445544543542056333a206d6f766900 21e17a8d
            # aa44000f 32 33 02 0053ea6e67 186b 3400016e672066726f6d207374617465203120746f207374617465203320286465627567203d2034292c2073746174655f636e742000 09a813f6
            # aa44000f 32 5b 02 0081ea6e67 f053 34000165616c74696d652048522064697361626c65640a2031302c20333233373632303a2053656e736f72733a205265616c74696d0007ed8ada
            return self.data[7:len(self.data) - 1].decode()
        else:
            return f"WhoopPacket: type[{te}]"

    def from_data(data):
        # verify SOF
        if data[0] != WhoopPacket.sof:
            raise Exception(f"invalid packet sof: {data.hex()}")
        
        # verify header crc8
        if crc8(data[1:3]) != data[3]:
            raise Exception(f"invalid packet header crc8")

        # verify data crc32
        length = struct.unpack("<H", data[1:3])[0]
        pkt = data[4:length]
        calculated = zlib.crc32(pkt) & 0xFFFFFFFF
        expected = struct.unpack("<L", data[length:length + 4])[0]
        if calculated != expected:
            raise Exception(f"invalid packet data crc32")
        
        return WhoopPacket(PacketType(pkt[0]), pkt[1], pkt[2], pkt[3:length])

    def create_packet(self):
        tv = self.type
        if type(self.type) == PacketType:
            tv = self.type.value

        tc = self.cmd
        if type(self.cmd) == CommandNumber:
            tc = self.cmd.value

        return struct.pack("<BBB", tv, self.seq, tc) + self.data

    def framed_packet(self):
        pkt = self.create_packet()
        blen = struct.pack("<H", len(pkt) + 4)
        crc32 = zlib.crc32(pkt) & 0xFFFFFFFF
        return struct.pack("<B", WhoopPacket.sof) + blen + struct.pack("<B", crc8(blen)) + pkt + struct.pack("<L", crc32)

if __name__ == "__main__":
    # COMMAND = 35
    # TOGGLE_REALTIME_HR = 3
    realtimehr = WhoopPacket(PacketType.COMMAND, 0x28, CommandNumber.TOGGLE_REALTIME_HR, data=b"\x01")
    data = realtimehr.framed_packet()
    print(data.hex())

    print(WhoopPacket.from_data(data).framed_packet() == data)
