import { BleManager as RNBleManager, Device, Subscription, State } from 'react-native-ble-plx';
import { AppState, AppStateStatus, Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WHOOP_SERVICE_UUID, CMD_TO_STRAP_UUID, CMD_FROM_STRAP_UUID,
  EVENTS_FROM_STRAP_UUID, DATA_FROM_STRAP_UUID, MEMFAULT_UUID,
  ConnectionState, WhoopPacket, ScannedDevice,
} from './packet-types';
import { PacketAssembler } from './packet-assembler';
import { base64ToUint8Array } from './packet-codec';
import { runBackgroundDrain } from '../sync/backgroundSync';

const PREFERRED_DEVICE_KEY = 'noop.preferredDeviceId';
const SCAN_TIMEOUT_MS = 15000;

type PacketListener = (packet: WhoopPacket) => void;
type StateListener = (state: ConnectionState) => void;
type MemfaultListener = (base64Chunk: string) => void;

class WhoopBleManager {
  private manager: RNBleManager;
  private device: Device | null = null;
  private subscriptions: Subscription[] = [];
  private cmdAssembler = new PacketAssembler();
  private eventsAssembler = new PacketAssembler();
  private dataAssembler = new PacketAssembler();
  private packetListeners = new Map<string, Set<PacketListener>>();
  private stateListeners = new Set<StateListener>();
  private memfaultListeners = new Set<MemfaultListener>();
  private _connectionState: ConnectionState = 'disconnected';
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private manualDisconnect = false;
  private stateSubscription: Subscription | null = null;
  private pendingAutoConnect = false;
  private isBackground = AppState.currentState !== 'active';
  private appStateSubscription: { remove(): void } | null = null;

  constructor() {
    this.manager = new RNBleManager({
      restoreStateIdentifier: 'noop.strap.ble',
      restoreStateFunction: (restoredState) => {
        this.handleRestoreState(restoredState).catch((err) => {
          console.warn('[ble] restoreState failed', err);
        });
      },
    });
    this.stateSubscription = this.manager.onStateChange((state) => {
      if (state === State.PoweredOn && this.pendingAutoConnect && !this.manualDisconnect) {
        this.pendingAutoConnect = false;
        this.autoConnect().catch(() => undefined);
      }
    }, true);
    this.appStateSubscription = AppState.addEventListener('change', (next) => {
      this.handleAppStateChange(next);
    });
  }

  // Track foreground/background. On iOS, setTimeout-based reconnect
  // timers freeze while the app is suspended, so scheduling them in
  // background is wasted effort — state preservation handles reconnect
  // at the OS level instead. On foreground resume we verify whether
  // we're still connected and re-arm auto-connect if not.
  private handleAppStateChange(next: AppStateStatus) {
    const wasBackground = this.isBackground;
    this.isBackground = next !== 'active';
    if (wasBackground && !this.isBackground) {
      // Foreground: clear any stalled-while-suspended reconnect timer
      // and re-issue a fresh auto-connect attempt if we're disconnected.
      this.clearReconnectTimeout();
      this.reconnectAttempt = 0;
      if (this._connectionState === 'disconnected' && !this.manualDisconnect) {
        this.autoConnect().catch(() => undefined);
      }
    }
  }

  private async handleRestoreState(
    restoredState: { connectedPeripherals?: Device[] } | null,
  ): Promise<void> {
    const peripheral = restoredState?.connectedPeripherals?.[0];
    if (!peripheral) return;
    this.device = peripheral;
    this.manualDisconnect = false;
    this.setState('discovering');
    try {
      await peripheral.discoverAllServicesAndCharacteristics();
      this.setupNotifications(peripheral);
      this.setState('ready');
      peripheral.onDisconnected(() => {
        this.cleanup();
        this.setState('disconnected');
        if (!this.manualDisconnect) {
          this.scheduleReconnect().catch(() => undefined);
        }
      });
      runBackgroundDrain(20_000).catch((err) =>
        console.warn('[ble-restore] background drain failed', err),
      );
    } catch (err) {
      console.warn('[ble] restored peripheral re-attach failed', err);
      this.setState('disconnected');
    }
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  private setState(state: ConnectionState) {
    this._connectionState = state;
    this.stateListeners.forEach(cb => cb(state));
  }

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private async ensurePoweredOn(timeoutMs = 6000): Promise<boolean> {
    try {
      const currentState = await this.manager.state();
      if (currentState === State.PoweredOn) return true;
    } catch {
      // fall through to subscription-based wait
    }

    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        subscription.remove();
        resolve(false);
      }, timeoutMs);

      const subscription = this.manager.onStateChange((state) => {
        if (state !== State.PoweredOn || settled) return;
        settled = true;
        clearTimeout(timeout);
        subscription.remove();
        resolve(true);
      }, true);
    });
  }

  private async scheduleReconnect() {
    this.clearReconnectTimeout();
    const preferredId = await AsyncStorage.getItem(PREFERRED_DEVICE_KEY);
    if (!preferredId || this.manualDisconnect) return;

    // iOS suspends setTimeout when the app is backgrounded, so scheduling
    // a JS-level retry is a no-op until foreground. Skip — iOS's state
    // preservation will re-deliver the connection via restoreStateFunction
    // when the strap is back in range and we're allowed to wake.
    if (Platform.OS === 'ios' && this.isBackground) return;

    // Exponential backoff with jitter: 1.5s → 3s → 6s → 12s → 24s,
    // capped at 60s. Without this, a strap that's out of range
    // re-tries every 1.5s forever, draining the phone's battery and
    // hammering the BLE stack. The attempt counter resets in
    // autoConnect() on every successful connection.
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 6);
    const base = 1_500 * 2 ** (this.reconnectAttempt - 1);
    const capped = Math.min(60_000, base);
    const jitter = capped * 0.3 * Math.random();
    const delay = Math.floor(capped + jitter);
    this.reconnectTimeout = setTimeout(() => {
      this.autoConnect().catch(() => undefined);
    }, delay);
  }

  // --- Permissions ---

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') return true;
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(result).every(v => v === 'granted');
    }
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return result === 'granted';
    }
    return false;
  }

  // --- Scanning ---

  async startScan(onFound: (device: ScannedDevice) => void): Promise<void> {
    this.setState('scanning');
    const seen = new Set<string>();

    this.manager.startDeviceScan(
      [WHOOP_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error || !device) return;
        if (seen.has(device.id)) return;
        seen.add(device.id);
        onFound({
          id: device.id,
          name: device.name || device.localName || 'Unknown',
          rssi: device.rssi ?? -100,
        });
      },
    );

    this.scanTimeout = setTimeout(() => this.stopScan(), SCAN_TIMEOUT_MS);
  }

  stopScan(): void {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    this.manager.stopDeviceScan();
    if (this._connectionState === 'scanning') {
      this.setState('disconnected');
    }
  }

  // --- Connection ---

  async connect(deviceId: string): Promise<void> {
    if (
      this.device?.id === deviceId &&
      (this._connectionState === 'ready' || this._connectionState === 'discovering')
    ) {
      return;
    }

    this.manualDisconnect = false;
    this.clearReconnectTimeout();
    this.stopScan();
    this.setState('connecting');

    try {
      const existing = await this.manager.isDeviceConnected(deviceId);
      const connected = existing
        ? await this.manager.devices([deviceId]).then((devices) => devices[0] ?? this.manager.connectToDevice(deviceId, { timeout: 8000 }))
        : await this.manager.connectToDevice(deviceId, { timeout: 8000 });
      this.device = connected;
      await AsyncStorage.setItem(PREFERRED_DEVICE_KEY, deviceId);

      this.setState('discovering');
      await connected.discoverAllServicesAndCharacteristics();

      // Set up notification listeners
      this.setupNotifications(connected);
      this.setState('ready');
    } catch (error) {
      this.setState('disconnected');
      throw error;
    }

    // Monitor disconnection
    this.device?.onDisconnected(() => {
      this.cleanup();
      this.setState('disconnected');
      if (!this.manualDisconnect) {
        this.scheduleReconnect().catch(() => undefined);
      }
    });
  }

  async autoConnect(): Promise<boolean> {
    if (this._connectionState === 'ready' && this.device) return true;
    if (this._connectionState === 'connecting' || this._connectionState === 'discovering') {
      return false;
    }
    const preferredId = await AsyncStorage.getItem(PREFERRED_DEVICE_KEY);
    if (!preferredId) return false;

    const poweredOn = await this.ensurePoweredOn();
    if (!poweredOn) {
      this.pendingAutoConnect = true;
      return false;
    }

    try {
      await this.connect(preferredId);
      // Successful connection — reset backoff so the next disconnect
      // starts retrying at the short interval again.
      this.reconnectAttempt = 0;
      return true;
    } catch {
      this.pendingAutoConnect = true;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.pendingAutoConnect = false;
    this.clearReconnectTimeout();
    if (this.device) {
      try {
        await this.manager.cancelDeviceConnection(this.device.id);
      } catch { /* ignore */ }
    }
    this.cleanup();
    this.setState('disconnected');
  }

  private cleanup() {
    this.subscriptions.forEach(s => s.remove());
    this.subscriptions = [];
    this.cmdAssembler.reset();
    this.eventsAssembler.reset();
    this.dataAssembler.reset();
    this.device = null;
  }

  // --- Notifications ---

  private setupNotifications(device: Device) {
    const monitor = (uuid: string, assembler: PacketAssembler) => {
      const sub = device.monitorCharacteristicForService(
        WHOOP_SERVICE_UUID,
        uuid,
        (error, char) => {
          if (error || !char?.value) return;
          const packets = assembler.feed(char.value);
          const listeners = this.packetListeners.get(uuid);
          if (listeners) {
            for (const packet of packets) {
              listeners.forEach(cb => cb(packet));
            }
          }
          // Also notify "all" listeners
          const allListeners = this.packetListeners.get('*');
          if (allListeners) {
            for (const packet of packets) {
              allListeners.forEach(cb => cb(packet));
            }
          }
        },
      );
      this.subscriptions.push(sub);
    };

    monitor(CMD_FROM_STRAP_UUID, this.cmdAssembler);
    monitor(EVENTS_FROM_STRAP_UUID, this.eventsAssembler);
    monitor(DATA_FROM_STRAP_UUID, this.dataAssembler);

    // MEMFAULT (0x0007) — firmware crash/debug chunks. Not framed like
    // command/event packets, so we forward raw base64 chunks straight
    // through to listeners without an assembler.
    const memfaultSub = device.monitorCharacteristicForService(
      WHOOP_SERVICE_UUID,
      MEMFAULT_UUID,
      (error, char) => {
        if (error || !char?.value) return;
        for (const cb of this.memfaultListeners) cb(char.value);
      },
    );
    this.subscriptions.push(memfaultSub);
  }

  onMemfault(cb: MemfaultListener): () => void {
    this.memfaultListeners.add(cb);
    return () => {
      this.memfaultListeners.delete(cb);
    };
  }

  // --- Commands ---

  async writeCommand(base64Frame: string): Promise<void> {
    if (!this.device) throw new Error('Not connected');
    // Decode the base64 to hex so we can see exactly what bytes hit the
    // wire. Useful for confirming Maverick framing / CRC bytes match
    // what whoopsi / the official APK send. Comment out the log if
    // chatty.
    try {
      const bytes = base64ToUint8Array(base64Frame);
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`[bleManager.writeCommand] ${bytes.length}B: ${hex}`);
    } catch {
      // ignore decode failures
    }
    await this.device.writeCharacteristicWithResponseForService(
      WHOOP_SERVICE_UUID,
      CMD_TO_STRAP_UUID,
      base64Frame,
    );
  }

  // --- Listeners ---

  onPacket(characteristicUuid: string, callback: PacketListener): () => void {
    if (!this.packetListeners.has(characteristicUuid)) {
      this.packetListeners.set(characteristicUuid, new Set());
    }
    this.packetListeners.get(characteristicUuid)!.add(callback);
    return () => {
      this.packetListeners.get(characteristicUuid)?.delete(callback);
    };
  }

  onConnectionStateChange(callback: StateListener): () => void {
    this.stateListeners.add(callback);
    return () => { this.stateListeners.delete(callback); };
  }

  // --- Getters ---

  getDeviceName(): string | null {
    return this.device?.name || this.device?.localName || null;
  }

  getDeviceId(): string | null {
    return this.device?.id || null;
  }
}

// Singleton export
export const bleManager = new WhoopBleManager();
