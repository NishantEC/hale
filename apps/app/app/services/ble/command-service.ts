import { PacketType, CommandNumber, WhoopPacket } from './packet-types';
import { encodeFrame, uint8ArrayToBase64 } from './packet-codec';

export class CommandService {
  private sequence = 0;

  private nextSequence(): number {
    const seq = this.sequence;
    this.sequence = (this.sequence + 1) & 0xff;
    return seq;
  }

  private buildCommand(cmd: CommandNumber, data: Uint8Array = new Uint8Array(0)): string {
    const packet: WhoopPacket = {
      type: PacketType.Command,
      sequence: this.nextSequence(),
      command: cmd,
      data,
    };
    return uint8ArrayToBase64(encodeFrame(packet));
  }

  buildGetBatteryLevel(): string {
    return this.buildCommand(CommandNumber.GetBatteryLevel, new Uint8Array([0x00]));
  }

  buildGetHelloHarvard(): string {
    return this.buildCommand(CommandNumber.GetHelloHarvard, new Uint8Array([0x00]));
  }

  buildReportVersionInfo(): string {
    return this.buildCommand(CommandNumber.ReportVersionInfo, new Uint8Array([0x00]));
  }

  buildGetClock(): string {
    return this.buildCommand(CommandNumber.GetClock, new Uint8Array([0x00]));
  }

  buildGetExtendedBatteryInfo(): string {
    return this.buildCommand(CommandNumber.GetExtendedBatteryInfo, new Uint8Array([0x00]));
  }

  buildToggleRealtimeHR(enable: boolean): string {
    return this.buildCommand(CommandNumber.ToggleRealtimeHR, new Uint8Array([enable ? 0x01 : 0x00]));
  }

  buildToggleGenericHRProfile(enable: boolean): string {
    return this.buildCommand(
      CommandNumber.ToggleGenericHRProfile,
      new Uint8Array([enable ? 0x01 : 0x00]),
    );
  }

  buildSendHistoricalData(): string {
    return this.buildCommand(CommandNumber.SendHistoricalData, new Uint8Array([0x00]));
  }

  buildHistoricalDataAck(trimValue: number): string {
    const data = new Uint8Array(9);
    data[0] = 0x01;
    // trimValue as LE uint32 at offset 1
    data[1] = trimValue & 0xff;
    data[2] = (trimValue >> 8) & 0xff;
    data[3] = (trimValue >> 16) & 0xff;
    data[4] = (trimValue >> 24) & 0xff;
    // zeros at offset 5-8 (already zero)
    return this.buildCommand(CommandNumber.HistoricalDataResult, data);
  }

  buildSetClock(date: Date = new Date()): string {
    const unix = Math.floor(date.getTime() / 1000);
    const data = new Uint8Array(4);
    data[0] = unix & 0xff;
    data[1] = (unix >> 8) & 0xff;
    data[2] = (unix >> 16) & 0xff;
    data[3] = (unix >> 24) & 0xff;
    return this.buildCommand(CommandNumber.SetClock, data);
  }

  buildSetScheduledAlarm(date: Date): string {
    const unix = Math.floor(date.getTime() / 1000);
    const data = new Uint8Array(9);
    data[0] = 0x01;
    data[1] = unix & 0xff;
    data[2] = (unix >> 8) & 0xff;
    data[3] = (unix >> 16) & 0xff;
    data[4] = (unix >> 24) & 0xff;
    // zeros at offset 5-8
    return this.buildCommand(CommandNumber.SetScheduledAlarm, data);
  }

  buildGetScheduledAlarm(): string {
    return this.buildCommand(CommandNumber.GetScheduledAlarm, new Uint8Array([0x00]));
  }

  buildRunAlarm(): string {
    return this.buildCommand(CommandNumber.RunAlarm, new Uint8Array([0x00]));
  }

  buildClearScheduledAlarm(): string {
    return this.buildCommand(CommandNumber.ClearScheduledAlarm, new Uint8Array([0x01]));
  }

  buildReboot(): string {
    return this.buildCommand(CommandNumber.RebootStrap, new Uint8Array([0x00]));
  }

  buildPowerCycle(): string {
    return this.buildCommand(CommandNumber.PowerCycleStrap, new Uint8Array([0x00]));
  }

  buildStartRawData(): string {
    return this.buildCommand(CommandNumber.StartRawData, new Uint8Array([0x01]));
  }

  buildStopRawData(): string {
    return this.buildCommand(CommandNumber.StopRawData, new Uint8Array([0x01]));
  }

  buildEnterHighFreqSync(): string {
    return this.buildCommand(CommandNumber.EnterHighFreqSync, new Uint8Array([0x00]));
  }

  /**
   * Cancel any in-progress history transmit on the strap. Safe to call as
   * a preflight before SendHistoricalData — clears half-finished prior
   * sync state without touching the read cursor or trim pointer.
   * Payload format follows the no-arg convention used by other commands
   * (single 0x00 byte). Documented in openwhoop / openWhoop-2 enums but
   * neither implements it; format is best-effort.
   */
  buildAbortHistoricalTransmits(): string {
    return this.buildCommand(CommandNumber.AbortHistoricalTransmits, new Uint8Array([0x00]));
  }

  /**
   * Query the available historical data range on the strap. Response
   * payload format is not reverse-engineered in any open reference; this
   * is a read-only probe — we send the standard no-arg payload and log
   * whatever bytes come back so the format can be decoded empirically.
   * Safe: read-only, doesn't modify any state on the strap.
   */
  buildGetDataRange(): string {
    return this.buildCommand(CommandNumber.GetDataRange, new Uint8Array([0x00]));
  }

  /**
   * DEAD END as of 2026-05-16. The strap responds (status byte = 0x01)
   * but does NOT rewind. Cross-referenced with chukfinley/whoopsi
   * (BLE-protocol decompilation of the official WHOOP Android APK) and
   * jogolden/whoomp + bWanShiTong/openwhoop:
   *
   *   1. Real payload format is [u32_LE sector, u32_LE offset] (8 bytes,
   *      4-byte aligned), flash-space not time-space. Sector 10 is the
   *      circular buffer.
   *   2. The official WHOOP app DEFINES this command but never sends it.
   *   3. Trim watermark is per-BLE-bond. SetReadPointer cannot expose
   *      data older than the current bond's trim, regardless of payload.
   *   4. The whoopsi project's only working recovery mechanism is
   *      connecting the strap to a DIFFERENT phone (new bond = fresh
   *      trim watermark; full ~20-day flash re-streams).
   *
   * Kept here as a breadcrumb. The three shapes are wrong; don't waste
   * time iterating on them. If/when we need recovery in production, the
   * actionable path is a "second device" flow, not this command.
   */
  buildSetReadPointer(
    unixTs: number,
    shape: "ts" | "ack" | "bare" = "ts",
  ): string {
    if (shape === "bare") {
      return this.buildCommand(CommandNumber.SetReadPointer, new Uint8Array([0x00]));
    }
    if (shape === "ack") {
      const data = new Uint8Array(9);
      data[0] = 0x01;
      data[1] = unixTs & 0xff;
      data[2] = (unixTs >> 8) & 0xff;
      data[3] = (unixTs >> 16) & 0xff;
      data[4] = (unixTs >> 24) & 0xff;
      return this.buildCommand(CommandNumber.SetReadPointer, data);
    }
    const data = new Uint8Array(4);
    data[0] = unixTs & 0xff;
    data[1] = (unixTs >> 8) & 0xff;
    data[2] = (unixTs >> 16) & 0xff;
    data[3] = (unixTs >> 24) & 0xff;
    return this.buildCommand(CommandNumber.SetReadPointer, data);
  }

  buildExitHighFreqSync(): string {
    return this.buildCommand(CommandNumber.ExitHighFreqSync, new Uint8Array([0x00]));
  }

  buildToggleIMUMode(enable: boolean): string {
    return this.buildCommand(CommandNumber.ToggleIMUMode, new Uint8Array([enable ? 0x01 : 0x00]));
  }

  buildEnableOpticalData(enable: boolean): string {
    return this.buildCommand(CommandNumber.EnableOpticalData, new Uint8Array([0x01, enable ? 0x01 : 0x00]));
  }
}
