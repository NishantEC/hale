import { PacketType, MetadataType, CommandNumber, WhoopPacket, HistoricalRecord, DownloadProgress, CMD_FROM_STRAP_UUID, DATA_FROM_STRAP_UUID } from './packet-types';
import { parseHistoricalPacketBatch } from './history-parser';
import { bleManager } from './ble-manager';
import { CommandService } from './command-service';
import { awaitCommandResponse } from './awaitable-response';
import { recordAckResponse, recordPersistFailure } from '../sync/syncTelemetry';

// How long to wait for the strap's CommandResponse to our HistoricalDataAck
// before recording a "timed out" entry. The legitimate response (per the
// whoopsi reference) arrives within ~50ms; 1.5s leaves plenty of margin.
const ACK_RESPONSE_TIMEOUT_MS = 1500;

const DOWNLOAD_TIMEOUT_MS = 120000;
// Drop-time after the last received packet before we treat the strap's
// historical stream as "done." 15 s was too generous now that Maverick
// acks come back in ~150 ms — most idle-windows are the strap waiting
// for the next SendHistoricalData round-trip, and 5 s still leaves
// ~3× the typical inter-batch gap as headroom against early termination.
const IDLE_TIMEOUT_MS = 5000;

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
  private cmdResponseFinishHandle: ReturnType<typeof setTimeout> | null = null;
  private progressCallback: ((p: DownloadProgress) => void) | null = null;
  private hasReceivedAnyData = false;
  private persistBatch: PersistBatch | null = null;
  // Single chain that every HistoryEnd's persist+ACK threads through so
  // batches commit in arrival order. Without this, two HistoryEnd events
  // arriving close together race their persist callbacks — the strap can
  // be ACK'd for trim N+1 while batch N is still uncommitted, defeating
  // the durable-ACK guarantee that justifies the whole pattern.
  private persistChain: Promise<void> = Promise.resolve();

  async startDownload(
    optionsOrCallback?: HistoryDownloadOptions | ((p: DownloadProgress) => void),
  ): Promise<HistoricalRecord[]> {
    this.cleanup();
    this.allRecords = [];
    this.dataBuffer = [];
    this.chunksReceived = 0;
    this.totalBytes = 0;
    this.hasReceivedAnyData = false;
    this.persistChain = Promise.resolve();
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
          void this.persistAndFinish();
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
        void this.persistAndFinish();
      }, IDLE_TIMEOUT_MS);
    }
  }

  // Persist any final buffered records (parsed from packets received
  // since the last HistoryEnd) then resolve the download. Used by
  // terminal paths: HistoryComplete, idle timeout, hard timeout — none
  // of which produce a trim value to ACK with, so we persist without
  // ACKing. Until this existed, terminal-path batches got pushed into
  // allRecords but never reached persistBatch, leaking ~half the
  // per-sync records on the (very common) two-cycle sync pattern.
  private async persistAndFinish() {
    // Wait for any in-flight HistoryEnd persist+ACKs to land first.
    // If the chain already rejected, finishWithError was invoked by the
    // failing batch — bail out instead of resolving with success.
    try {
      await this.persistChain;
    } catch {
      return;
    }
    // Re-check resolve in case cleanup() ran (e.g. cancel() racing the
    // terminal path) — would otherwise double-process the final buffer.
    if (!this.resolve) return;

    const finalBatch = this.parseBufferedData();
    if (finalBatch.length > 0 && this.persistBatch) {
      try {
        await this.persistBatch(finalBatch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        recordPersistFailure({
          at: Date.now(),
          source: 'persistAndFinish',
          trimValue: 0,
          batchSize: finalBatch.length,
          message: msg,
        });
        this.finishWithError(new Error(`final persistBatch failed: ${msg}`));
        return;
      }
    }
    this.emitProgress('complete');
    this.finishSuccess();
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
        void this.persistAndFinish();
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
        // If we already have chunks, give it a few seconds then wrap up.
        // Track the handle so cleanup() can clear it — otherwise the
        // closure keeps the downloader pinned for 3s past completion.
        if (this.chunksReceived > 0 && this.dataBuffer.length === 0) {
          if (this.cmdResponseFinishHandle) clearTimeout(this.cmdResponseFinishHandle);
          this.cmdResponseFinishHandle = setTimeout(() => {
            this.cmdResponseFinishHandle = null;
            if (this.resolve) {
              void this.persistAndFinish();
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
   *
   * Persists are serialized through `persistChain` so two HistoryEnd
   * events arriving close together can never ACK out of order — batch N
   * always commits before batch N+1 is even attempted.
   */
  private persistAndAck(batchRecords: HistoricalRecord[], trimValue: number) {
    const persist = this.persistBatch;
    if (!persist || batchRecords.length === 0) {
      // No persistence required — still serialize the ACK through the
      // chain so it can't fire ahead of a pending batch persist.
      this.persistChain = this.persistChain.then(() => this.sendAckWithResponse(trimValue));
      return;
    }
    this.persistChain = this.persistChain.then(async () => {
      try {
        await persist(batchRecords);
        await this.sendAckWithResponse(trimValue);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        recordPersistFailure({
          at: Date.now(),
          source: 'persistAndAck',
          trimValue,
          batchSize: batchRecords.length,
          message: msg,
        });
        this.finishWithError(new Error(`persistBatch failed: ${msg}`));
        // Re-throw so the chain rejects and any queued-up follow-on
        // batches stop trying to persist + ACK after we've already
        // aborted the download.
        throw err;
      }
    });
  }

  // Send HistoricalDataAck(trimValue) and observe whether the strap emits
  // a CommandResponse for cmd 23. Telemetry records both arms (response
  // arrived vs timed out) so we can tell empirically whether the strap is
  // even acknowledging our acks — central to the cursor-loss investigation.
  private async sendAckWithResponse(trimValue: number): Promise<void> {
    const startedAt = Date.now();
    // Subscribe BEFORE the write so a fast response can't slip through.
    const waiter = awaitCommandResponse(
      CommandNumber.HistoricalDataResult,
      ACK_RESPONSE_TIMEOUT_MS,
    );
    try {
      await bleManager
        .writeCommand(this.commandService.buildHistoricalDataAckMaverick(trimValue))
        .catch(() => undefined);
      try {
        const { bytes, hex } = await waiter.promise;
        recordAckResponse({
          at: Date.now(),
          trimValue,
          durationMs: Date.now() - startedAt,
          responseHex: hex,
          originSeq: bytes.length > 0 ? bytes[0] : null,
          status: bytes.length > 1 ? bytes[1] : null,
        });
      } catch {
        // Timeout — no CommandResponse arrived. Recording this case is
        // the entire point: a consistent timeout means our acks are
        // being ignored.
        recordAckResponse({
          at: Date.now(),
          trimValue,
          durationMs: Date.now() - startedAt,
          responseHex: null,
          originSeq: null,
          status: null,
        });
      }
    } finally {
      waiter.abort();
    }
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
    if (this.cmdResponseFinishHandle) {
      clearTimeout(this.cmdResponseFinishHandle);
      this.cmdResponseFinishHandle = null;
    }
    this.resolve = null;
    this.reject = null;
    this.progressCallback = null;
    this.persistBatch = null;
  }
}
