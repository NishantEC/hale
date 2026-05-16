// Service and Characteristic UUIDs
export const WHOOP_SERVICE_UUID = '61080001-8d6d-82b8-614a-1c8cb0f8dcc6';
export const CMD_TO_STRAP_UUID = '61080002-8d6d-82b8-614a-1c8cb0f8dcc6';
export const CMD_FROM_STRAP_UUID = '61080003-8d6d-82b8-614a-1c8cb0f8dcc6';
export const EVENTS_FROM_STRAP_UUID = '61080004-8d6d-82b8-614a-1c8cb0f8dcc6';
export const DATA_FROM_STRAP_UUID = '61080005-8d6d-82b8-614a-1c8cb0f8dcc6';
export const MEMFAULT_UUID = '61080007-8d6d-82b8-614a-1c8cb0f8dcc6';

// Frame constants
export const SOF = 0xaa;
export const MAX_FRAME_LENGTH = 4096;
export const MAX_BUFFER_SIZE = 65536;

// Packet types
export enum PacketType {
  Command = 35,
  CommandResponse = 36,
  RealtimeData = 40,
  RealtimeRawData = 43,
  HistoricalData = 47,
  Event = 48,
  Metadata = 49,
  ConsoleLogs = 50,
  RealtimeIMUStream = 51,
  HistoricalIMUStream = 52,
}

// Commands that can be sent to the strap
export enum CommandNumber {
  ToggleRealtimeHR = 3,
  ReportVersionInfo = 7,
  SetClock = 10,
  GetClock = 11,
  ToggleGenericHRProfile = 14,
  AbortHistoricalTransmits = 20,
  SendHistoricalData = 22,
  HistoricalDataResult = 23,
  ForceTrim = 25,
  GetBatteryLevel = 26,
  RebootStrap = 29,
  PowerCycleStrap = 32,
  SetReadPointer = 33,
  GetDataRange = 34,
  GetHelloHarvard = 35,
  SetScheduledAlarm = 66,
  GetScheduledAlarm = 67,
  RunAlarm = 68,
  ClearScheduledAlarm = 69,
  RunHapticsPattern = 79,
  StartRawData = 81,
  StopRawData = 82,
  EnterHighFreqSync = 96,
  ExitHighFreqSync = 97,
  GetExtendedBatteryInfo = 98,
  ToggleIMUMode = 106,
  EnableOpticalData = 107,
}

// Events received from the strap
export enum EventNumber {
  Undefined = 0,
  Error = 1,
  ConsoleOutput = 2,
  BatteryLevel = 3,
  SystemControl = 4,
  External5vOn = 5,
  External5vOff = 6,
  ChargingOn = 7,
  ChargingOff = 8,
  WristOn = 9,
  WristOff = 10,
  BleConnectionUp = 11,
  BleConnectionDown = 12,
  RtcLost = 13,
  DoubleTap = 14,
  Boot = 15,
  SetRtc = 16,
  TemperatureLevel = 17,
  PairingMode = 18,
  SerialHeadConnected = 19,
  SerialHeadRemoved = 20,
  BatteryPackConnected = 21,
  BatteryPackRemoved = 22,
  BleBonded = 23,
  BleHrProfileEnabled = 24,
  BleHrProfileDisabled = 25,
  TrimAllData = 26,
  TrimAllDataEnded = 27,
  FlashInitComplete = 28,
  StrapConditionReport = 29,
  BootReport = 30,
  ExitVirginMode = 31,
  CaptouchAutothresholdAction = 32,
  BleRealtimeHROn = 33,
  BleRealtimeHROff = 34,
  AccelerometerReset = 35,
  AfeReset = 36,
  ShipModeEnabled = 37,
  ShipModeDisabled = 38,
  ShipModeBoot = 39,
  Ch1SaturationDetected = 40,
  Ch2SaturationDetected = 41,
  AccelerometerSaturationDetected = 42,
  BleSystemReset = 43,
  BleSystemOn = 44,
  BleSystemInitialized = 45,
  RawDataCollectionOn = 46,
  RawDataCollectionOff = 47,
  StrapDrivenAlarmSet = 51,
  StrapDrivenAlarmExecuted = 57,
  AppDrivenAlarmExecuted = 58,
  StrapDrivenAlarmDisabled = 59,
  HapticsFired = 60,
  ExtendedBatteryInformation = 63,
  HighFreqSyncPrompt = 96,
  HighFreqSyncEnabled = 97,
  HighFreqSyncDisabled = 98,
  HapticsTerminated = 100,
}

// Metadata types for history download
export enum MetadataType {
  HistoryStart = 1,
  HistoryEnd = 2,
  HistoryComplete = 3,
}

// Connection states
export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'discovering' | 'ready';

// Decoded packet
export interface WhoopPacket {
  type: PacketType;
  sequence: number;
  command: number;
  data: Uint8Array;
}

// Parsed historical sensor record. The strap sends two formats per timestamp:
//   - V12/V24 (seq=12 or 24, payload >= 77B): full sensor reading
//   - Generic (any other seq, payload >= 24B): HR + RR only
// Sensor fields are nullable so HR-only generic packets can be merged into
// V12/V24 rows downstream without polluting them with zeros.
export interface HistoricalRecord {
  sequenceNumber: number;
  timestamp: Date;
  subseconds: number;
  heartRate: number;
  rrIntervals: number[];
  gravityX: number | null;
  gravityY: number | null;
  gravityZ: number | null;
  skinContact: boolean | null;
  spo2Red: number | null;
  spo2IR: number | null;
  skinTempRaw: number | null;
  respRateRaw: number | null;
  ppgGreen: number | null;
  ppgRedIr: number | null;
  ambientLight: number | null;
  ledDrive1: number | null;
  ledDrive2: number | null;
  signalQuality: number | null;
}

// Scanned device info
export interface ScannedDevice {
  id: string;
  name: string;
  rssi: number;
}

// History download progress
export interface DownloadProgress {
  state: 'requesting' | 'receiving' | 'parsing' | 'complete' | 'error';
  chunksReceived: number;
  recordsParsed: number;
  totalBytes: number;
}
