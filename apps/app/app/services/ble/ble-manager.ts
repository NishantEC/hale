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
import { appendLog } from '../observability/persistentLog';

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
    } else if (!wasBackground && this.isBackground && Platform.OS === 'ios') {
      // Backgrounding on iOS: a scheduled-but-not-yet-fired reconnect
      // timer would freeze across the suspend and fire at an arbitrary
      // moment after foreground (skewed by suspend duration). Cancel it
      // — foreground resume will re-issue a fresh autoConnect via the
      // first branch.
      this.clearReconnectTimeout();
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
      const perms: string[] = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];
      if (Platform.Version >= 33) {
        perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      const result = await PermissionsAndroid.requestMultiple(
        perms as Parameters<typeof PermissionsAndroid.requestMultiple>[0],
      );
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
        ? await this.manager.devices([deviceId]).then((devices) => devices[0] ?? this.manager.connectToDevice(deviceId, { timeout: 15000 }))
        : await this.manager.connectToDevice(deviceId, { timeout: 15000 });
      this.device = connected;
      // Register the disconnect handler IMMEDIATELY — before discovery,
      // before notifications. If the strap drops between connectToDevice
      // resolving and discovery completing (microseconds, but real on
      // flaky links), we'd otherwise miss the disconnect event entirely
      // and leave UI showing "connecting/discovering" forever. The
      // handler is idempotent: cleanup() + setState('disconnected') can
      // run alongside the catch below without issue.
      connected.onDisconnected(() => {
        this.cleanup();
        this.setState('disconnected');
        if (!this.manualDisconnect) {
          this.scheduleReconnect().catch(() => undefined);
        }
      });
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
  }

  async autoConnect(): Promise<boolean> {
    if (this._connectionState === 'ready' && this.device) return true;
    if (this._connectionState === 'connecting' || this._connectionState === 'discovering') {
      return false;
    }
    const preferredId = await AsyncStorage.getItem(PREFERRED_DEVICE_KEY);
    if (!preferredId) {
      appendLog('warn', 'ble', 'autoConnect skipped', { reason: 'no_preferred_device' });
      return false;
    }

    const poweredOn = await this.ensurePoweredOn();
    if (!poweredOn) {
      appendLog('warn', 'ble', 'autoConnect deferred', { reason: 'ble_not_powered_on' });
      this.pendingAutoConnect = true;
      return false;
    }

    appendLog('info', 'ble', 'autoConnect attempt', {
      preferredId,
      attempt: this.reconnectAttempt + 1,
    });
    try {
      await this.connect(preferredId);
      // Successful connection — reset backoff so the next disconnect
      // starts retrying at the short interval again.
      this.reconnectAttempt = 0;
      appendLog('info', 'ble', 'autoConnect ok', { preferredId });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog('warn', 'ble', 'autoConnect failed', { preferredId, message: msg });
      this.pendingAutoConnect = true;
      // Without this, a launch-time autoConnect failure (strap not yet
      // advertising, BLE not yet warm) leaves the app sitting in
      // "disconnected" with no retry until the next AppState transition.
      // Schedule a retry so the user doesn't have to manually re-trigger
      // from the settings screen.
      if (!this.manualDisconnect) {
        this.scheduleReconnect().catch(() => undefined);
      }
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

  // Cancel the current device connection WITHOUT marking it manual, so the
  // existing onDisconnected handler triggers scheduleReconnect(). Used when
  // the strap is in a stuck state (e.g. echoing empty HistoryEnd metadata at
  // the same trim) and needs a connection bump to recover. We deliberately
  // reset reconnectAttempt so the first retry fires at the short end of the
  // backoff (~1.5 s) instead of inheriting whatever exponent the previous
  // disconnect ladder left behind.
  async forceReconnect(reason: string): Promise<void> {
    if (!this.device) return;
    appendLog('warn', 'ble', 'force reconnect requested', { reason });
    this.reconnectAttempt = 0;
    try {
      await this.manager.cancelDeviceConnection(this.device.id);
    } catch { /* ignore */ }
    // onDisconnected handler does the rest: cleanup + scheduleReconnect.
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
          const value = char.value;
          // Defer the synchronous parse + fan-out off the BLE callback thread.
          // queueMicrotask preserves FIFO ordering across invocations (unlike
          // setTimeout), so packets still hit listeners in arrival order while
          // freeing the BLE bridge to drain its native queue. Critical under
          // 90x history sync where Hermes was getting starved.
          queueMicrotask(() => {
            try {
              const packets = assembler.feed(value);
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
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              appendLog('error', 'ble', 'packet parse/fanout failed', { uuid, message: msg });
            }
          });
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

  // Serializes all BLE writes through a single FIFO. Without this,
  // every caller (battery poll, mode toggles, sync downloader,
  // HistoricalDataAcks, probe/recovery flows) raced to push bytes onto
  // the cmd characteristic. Audit R2 hypothesizes those collisions
  // confused the strap into advancing its cursor past data we never
  // persisted. One outstanding write at a time — done.
  private writeQueue: Promise<void> = Promise.resolve();

  async writeCommand(base64Frame: string): Promise<void> {
    if (!this.device) throw new Error('Not connected');
    const next = this.writeQueue.then(async () => {
      // Re-check `device` inside the queued task: a disconnect could
      // have nulled it while this write was waiting in line.
      if (!this.device) throw new Error('Not connected');
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
    });
    // Keep the chain alive even if this write rejected — a single
    // failure shouldn't deadlock every subsequent caller.
    this.writeQueue = next.catch(() => {});
    return next;
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
