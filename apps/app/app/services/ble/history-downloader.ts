import { PacketType, MetadataType, CommandNumber, WhoopPacket, HistoricalRecord, DownloadProgress, CMD_FROM_STRAP_UUID, DATA_FROM_STRAP_UUID } from './packet-types';
import { parseHistoricalPacketBatch } from './history-parser';
import { bleManager } from './ble-manager';
import { CommandService } from './command-service';

const DOWNLOAD_TIMEOUT_MS = 120000;
const IDLE_TIMEOUT_MS = 15000; // If no packets for 15s after receiving data, assume done

/**
 * Called once per batch BEFORE the strap is ACK'd for that batch. Must
 * commit the records to durable storage (SQLite). If this throws, the
 * batch is NOT ACK'd — the strap keeps it in flash and will resend on the
 * next sync. This is the fix for over-ACKing data that never made it to
 * disk in release builds.
 */
export type PersistBatch = (records: HistoricalRecord[]) => Promise<void>;

export interface HistoryDownloadOptions {
  onProgress?: (p: DownloadProgress) => void;
  /**
   * Optional per-batch persistence callback. When provided, each batch
   * is persisted (and the call awaited) before the ACK fires. When
   * omitted, the legacy fire-ACK-immediately behavior is used — only the
   * caller's overall promise resolution can be relied on for persistence.
   */
  persistBatch?: PersistBatch;
}

export class HistoryDownloader {
  private commandService = new CommandService();
  private allRecords: HistoricalRecord[] = [];
  private dataBuffer: WhoopPacket[] = [];
  private chunksReceived = 0;
  private totalBytes = 0;
  private resolve: ((records: HistoricalRecord[]) => void) | null = null;
  private reject: ((error: Error) => void) | null = null;
  private unsubscribeCmd: (() => void) | null = null;
  private unsubscribeData: (() => void) | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private idleHandle: ReturnType<typeof setTimeout> | null = null;
  private progressCallback: ((p: DownloadProgress) => void) | null = null;
  private hasReceivedAnyData = false;
  private persistBatch: PersistBatch | null = null;

  async startDownload(
    optionsOrCallback?: HistoryDownloadOptions | ((p: DownloadProgress) => void),
  ): Promise<HistoricalRecord[]> {
    this.cleanup();
    this.allRecords = [];
    this.dataBuffer = [];
    this.chunksReceived = 0;
    this.totalBytes = 0;
    this.hasReceivedAnyData = false;
    // Backwards-compat: caller can pass just a progress callback (old shape)
    // OR an options object. Both supported so existing call sites don't break.
    if (typeof optionsOrCallback === 'function') {
      this.progressCallback = optionsOrCallback;
      this.persistBatch = null;
    } else {
      this.progressCallback = optionsOrCallback?.onProgress ?? null;
      this.persistBatch = optionsOrCallback?.persistBatch ?? null;
    }

    return new Promise<HistoricalRecord[]>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      // Listen on ALL characteristics — metadata can come on cmd or events
      this.unsubscribeCmd = bleManager.onPacket(CMD_FROM_STRAP_UUID, (packet) => {
        this.handlePacket(packet);
      });
      this.unsubscribeData = bleManager.onPacket(DATA_FROM_STRAP_UUID, (packet) => {
        this.handlePacket(packet);
      });

      // Hard timeout
      this.timeoutHandle = setTimeout(() => {
        // If we have data, finish with what we have instead of erroring
        if (this.allRecords.length > 0 || this.dataBuffer.length > 0) {
          this.parseBufferedData();
          this.emitProgress('complete');
          this.finishSuccess();
        } else {
          this.finishWithError(new Error('History download timed out'));
        }
      }, DOWNLOAD_TIMEOUT_MS);

      this.emitProgress('requesting');

      // Enter high-frequency sync mode for ~90x faster data transfer
      bleManager.writeCommand(this.commandService.buildEnterHighFreqSync()).catch(() => {});
      setTimeout(() => {
        bleManager.writeCommand(this.commandService.buildSendHistoricalData()).catch((err) => {
          this.finishWithError(err);
        });
      }, 200);
    });
  }

  private resetIdleTimer() {
    if (this.idleHandle) clearTimeout(this.idleHandle);
    if (this.hasReceivedAnyData) {
      this.idleHandle = setTimeout(() => {
        // No packets for 15 seconds after data started flowing — assume done
        console.log('[HistoryDownloader] Idle timeout — finishing with', this.allRecords.length, 'records');
        this.parseBufferedData();
        this.emitProgress('complete');
        this.finishSuccess();
      }, IDLE_TIMEOUT_MS);
    }
  }

  private handlePacket(packet: WhoopPacket) {
    this.resetIdleTimer();

    // Metadata packets: type === Metadata (49)
    // The metadata subtype is the `command` byte of the framed packet:
    //   HistoryStart=1, HistoryEnd=2, HistoryComplete=3
    // data[0] is the first byte of the metadata payload (unix_u32_LE), not
    // the subtype — reading from data[0] was the bug that made every batch
    // ACK get skipped, leaving the strap waiting forever.
    if (packet.type === PacketType.Metadata) {
      const metaType = packet.command;
      console.log(
        '[HistoryDownloader] Metadata subtype=', metaType,
        'dataLen=', packet.data.length,
      );

      if (metaType === MetadataType.HistoryStart) {
        console.log('[HistoryDownloader] HistoryStart received');
        return;
      }

      if (metaType === MetadataType.HistoryEnd) {
        console.log(
          '[HistoryDownloader] HistoryEnd received — buffer has',
          this.dataBuffer.length, 'packets to parse',
        );
        const batchRecords = this.parseBufferedData();
        this.chunksReceived++;
        this.emitProgress('receiving');

        // ACK — trim value from data bytes
        let trimValue = 0;
        if (packet.data.length >= 14) {
          trimValue = (packet.data[10]) | (packet.data[11] << 8) | (packet.data[12] << 16) | ((packet.data[13] << 24) >>> 0);
        } else if (packet.data.length >= 5) {
          trimValue = (packet.data[1]) | (packet.data[2] << 8) | (packet.data[3] << 16) | ((packet.data[4] << 24) >>> 0);
        }

        // Durable-ACK ordering: if a persistBatch callback was supplied,
        // commit this batch to local storage BEFORE ACKing. If persistence
        // fails, do NOT ACK — the strap keeps the batch and we'll re-pull
        // it on the next sync. Without this, a release-build crash between
        // parse and persist over-ACKs and the data is gone forever.
        this.persistAndAck(batchRecords, trimValue);
        return;
      }

      if (metaType === MetadataType.HistoryComplete) {
        this.parseBufferedData();
        this.emitProgress('complete');
        this.finishSuccess();
        return;
      }
      return;
    }

    // Historical data packets
    if (packet.type === PacketType.HistoricalData) {
      if (!this.hasReceivedAnyData) {
        console.log(
          '[HistoryDownloader] First HistoricalData arrived — seq=',
          packet.sequence, 'dataLen=', packet.data.length,
        );
      }
      this.hasReceivedAnyData = true;
      this.dataBuffer.push(packet);
      this.totalBytes += packet.data.length;
      return;
    }

    // Command response for historicalDataResult (23) — can indicate completion
    if (packet.type === PacketType.CommandResponse) {
      if (packet.command === CommandNumber.HistoricalDataResult || packet.command === CommandNumber.SendHistoricalData) {
        // After sending data, strap may respond indicating "done"
        // If we already have chunks, give it a few seconds then wrap up
        if (this.chunksReceived > 0 && this.dataBuffer.length === 0) {
          // Likely done — wait briefly then finish
          setTimeout(() => {
            if (this.resolve) {
              this.parseBufferedData();
              this.emitProgress('complete');
              this.finishSuccess();
            }
          }, 3000);
        }
      }
    }
  }

  private parseBufferedData(): HistoricalRecord[] {
    if (this.dataBuffer.length === 0) return [];

    const packets = this.dataBuffer;
    this.dataBuffer = [];

    let emptyPackets = 0;
    const seqCounts: Record<number, number> = {};
    const records: HistoricalRecord[] = [];
    for (const packet of packets) {
      const seq = packet.sequence;
      seqCounts[seq] = (seqCounts[seq] ?? 0) + 1;
      const batch = parseHistoricalPacketBatch(packet);
      if (batch.length === 0) emptyPackets++;
      records.push(...batch);
    }
    this.allRecords.push(...records);
    console.log(
      '[HistoryDownloader] Parsed', records.length, 'records from',
      packets.length, 'packets (', emptyPackets, 'empty). Seq counts:',
      JSON.stringify(seqCounts),
      'Running total:', this.allRecords.length,
    );
    this.emitProgress('parsing');
    return records;
  }

  /**
   * Commit `batchRecords` to durable storage (via persistBatch callback)
   * and only then ACK the strap with `trimValue`. If persistence fails,
   * the ACK is skipped and the sync is aborted with an error so the
   * strap keeps the batch for the next pull. If no persistBatch callback
   * was provided, falls back to legacy ACK-immediately behavior.
   */
  private persistAndAck(batchRecords: HistoricalRecord[], trimValue: number) {
    const persist = this.persistBatch;
    if (!persist) {
      // Legacy path: no caller-supplied persistence, ACK immediately.
      bleManager
        .writeCommand(this.commandService.buildHistoricalDataAck(trimValue))
        .catch(() => {});
      return;
    }
    if (batchRecords.length === 0) {
      // Empty batch — nothing to persist, ACK so strap moves on.
      bleManager
        .writeCommand(this.commandService.buildHistoricalDataAck(trimValue))
        .catch(() => {});
      return;
    }
    // Persistence is async; fire and chain. If it throws, abort the sync
    // so we don't ACK and leave the strap thinking we have data we don't.
    persist(batchRecords)
      .then(() => {
        bleManager
          .writeCommand(this.commandService.buildHistoricalDataAck(trimValue))
          .catch(() => {});
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(
          '[HistoryDownloader] persistBatch failed, NOT acking. trim=', trimValue,
          'err=', msg,
        );
        this.finishWithError(new Error(`persistBatch failed: ${msg}`));
      });
  }

  private emitProgress(state: DownloadProgress['state']) {
    this.progressCallback?.({
      state,
      chunksReceived: this.chunksReceived,
      recordsParsed: this.allRecords.length,
      totalBytes: this.totalBytes,
    });
  }

  private finishSuccess() {
    const records = [...this.allRecords];
    console.log('[HistoryDownloader] Complete:', records.length, 'records');
    // Exit high-frequency sync mode to save battery
    bleManager.writeCommand(this.commandService.buildExitHighFreqSync()).catch(() => {});
    // Capture resolve BEFORE cleanup() — cleanup() nulls this.resolve, and
    // calling it after would silently no-op via optional chaining, leaving
    // the awaiter hung forever. This was the latent bug that made every
    // BLE history download silently swallow its records.
    const resolve = this.resolve;
    this.cleanup();
    resolve?.(records);
  }

  private finishWithError(error: Error) {
    console.log('[HistoryDownloader] Error:', error.message);
    // Exit high-frequency sync mode to save battery
    bleManager.writeCommand(this.commandService.buildExitHighFreqSync()).catch(() => {});
    // Same trap as finishSuccess — capture before cleanup nulls it.
    const reject = this.reject;
    this.cleanup();
    reject?.(error);
  }

  cancel() {
    this.finishWithError(new Error('Download cancelled'));
  }

  private cleanup() {
    this.unsubscribeCmd?.();
    this.unsubscribeData?.();
    this.unsubscribeCmd = null;
    this.unsubscribeData = null;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    if (this.idleHandle) {
      clearTimeout(this.idleHandle);
      this.idleHandle = null;
    }
    this.resolve = null;
    this.reject = null;
    this.progressCallback = null;
    this.persistBatch = null;
  }
}
