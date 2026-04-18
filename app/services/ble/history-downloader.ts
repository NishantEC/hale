import { PacketType, MetadataType, CommandNumber, WhoopPacket, HistoricalRecord, DownloadProgress, CMD_FROM_STRAP_UUID, DATA_FROM_STRAP_UUID } from './packet-types';
import { parseHistoricalPacket } from './history-parser';
import { bleManager } from './ble-manager';
import { CommandService } from './command-service';

const DOWNLOAD_TIMEOUT_MS = 120000;
const IDLE_TIMEOUT_MS = 15000; // If no packets for 15s after receiving data, assume done

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

  async startDownload(onProgress?: (p: DownloadProgress) => void): Promise<HistoricalRecord[]> {
    this.cleanup();
    this.allRecords = [];
    this.dataBuffer = [];
    this.chunksReceived = 0;
    this.totalBytes = 0;
    this.hasReceivedAnyData = false;
    this.progressCallback = onProgress ?? null;

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
    // The metadata subtype can be in data[0] OR in the command field
    if (packet.type === PacketType.Metadata) {
      const metaType = packet.data.length > 0 ? packet.data[0] : packet.command;

      if (metaType === MetadataType.HistoryStart) {
        // Download starting — no action
        return;
      }

      if (metaType === MetadataType.HistoryEnd) {
        this.parseBufferedData();
        this.chunksReceived++;
        this.emitProgress('receiving');

        // ACK — trim value from data bytes
        let trimValue = 0;
        if (packet.data.length >= 14) {
          trimValue = (packet.data[10]) | (packet.data[11] << 8) | (packet.data[12] << 16) | ((packet.data[13] << 24) >>> 0);
        } else if (packet.data.length >= 5) {
          trimValue = (packet.data[1]) | (packet.data[2] << 8) | (packet.data[3] << 16) | ((packet.data[4] << 24) >>> 0);
        }
        bleManager.writeCommand(this.commandService.buildHistoricalDataAck(trimValue)).catch(() => {});
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

  private parseBufferedData() {
    if (this.dataBuffer.length === 0) return;

    const packets = this.dataBuffer;
    this.dataBuffer = [];

    const records = packets
      .map((packet) => parseHistoricalPacket(packet))
      .filter((record): record is HistoricalRecord => record != null);
    this.allRecords.push(...records);
    console.log('[HistoryDownloader] Parsed', records.length, 'records, total:', this.allRecords.length);
    this.emitProgress('parsing');
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
    this.cleanup();
    this.resolve?.(records);
  }

  private finishWithError(error: Error) {
    console.log('[HistoryDownloader] Error:', error.message);
    // Exit high-frequency sync mode to save battery
    bleManager.writeCommand(this.commandService.buildExitHighFreqSync()).catch(() => {});
    this.cleanup();
    this.reject?.(error);
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
  }
}
