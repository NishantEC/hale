import { PacketType, CommandNumber, WhoopPacket } from './packet-types';
import { encodeFrame, encodeFrameMaverick, uint8ArrayToBase64 } from './packet-codec';

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

  buildHistoricalDataAck(trimValue: number): { frame: string; sequence: number } {
    const data = new Uint8Array(9);
    data[0] = 0x01;
    // trimValue as LE uint32 at offset 1
    data[1] = trimValue & 0xff;
    data[2] = (trimValue >> 8) & 0xff;
    data[3] = (trimValue >> 16) & 0xff;
    data[4] = (trimValue >> 24) & 0xff;
    // zeros at offset 5-8 (already zero)
    const sequence = this.nextSequence();
    const packet = {
      type: PacketType.Command,
      sequence,
      command: CommandNumber.HistoricalDataResult,
      data,
    };
    return { frame: uint8ArrayToBase64(encodeFrame(packet)), sequence };
  }

  // Maverick-framed HistoricalDataAck variant lived here briefly (commit
  // e15d2208 → 361648f2). 2026-05-23 production logs proved Maverick is the
  // WRONG framing for cmd 23 — legacy framing makes the strap silently
  // advance its cursor (verified by trim 116418→116464 across 7 caught_up
  // sessions in 3.5 min). FORCE_TRIM and SetReadPointer need Maverick, but
  // cmd 23 does not. Don't re-add a Maverick variant for this command.

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
   * SetReadPointer (cmd 33). Three legacy shapes (ts/ack/bare) were
   * empirically NOPs (responses came back, but no data flowed). The
   * canonical format per chukfinley/whoopsi APK decompilation is
   * [u32_LE sector, u32_LE offset] (8 bytes), exposed below via
   * `buildSetReadPointerSectorOffset`. Whoopsi notes sector 10 holds
   * the historical circular buffer; (sector=0, offset=0) and
   * (sector=10, offset=0) are the two candidates for "rewind to
   * beginning". Trim watermark may still firmware-block reads past it.
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

  /**
   * FORCE_TRIM (cmd 25 / 0x19) — THE actual rewind command per whoopsi
   * (chukfinley/whoopsi/ble-sync/CLAUDE.md). Payload is 8 bytes of
   * [sector_u32_LE, offset_u32_LE], 4-byte aligned.
   *
   *   (0, 0)                       = rewind trim pointer to start
   *                                  (only exposes the wrap-around
   *                                  segment, not the full ~20 day
   *                                  buffer — partial recovery)
   *   (0xFEFEFEFE, 0xFEFEFEFE)     = PERMANENTLY consume all data for
   *                                  this bond. **NEVER SEND THIS.**
   *                                  Hard-rejected below.
   *
   * The "Trim All" sentinel is what locks the user out of recovery
   * forever; the only undo is unpair+re-pair to create a new bond
   * identity. We refuse to build a packet matching it.
   */
  buildForceTrim(sector: number, offset: number): string {
    const TRIM_ALL_SENTINEL = 0xfefefefe;
    if (
      (sector >>> 0) === TRIM_ALL_SENTINEL ||
      (offset >>> 0) === TRIM_ALL_SENTINEL
    ) {
      throw new Error(
        "buildForceTrim refused: 0xFEFEFEFE is the TRIM-ALL sentinel and would PERMANENTLY consume all flash data for this bond.",
      );
    }
    const data = new Uint8Array(8);
    data[0] = sector & 0xff;
    data[1] = (sector >> 8) & 0xff;
    data[2] = (sector >> 16) & 0xff;
    data[3] = (sector >> 24) & 0xff;
    data[4] = offset & 0xff;
    data[5] = (offset >> 8) & 0xff;
    data[6] = (offset >> 16) & 0xff;
    data[7] = (offset >> 24) & 0xff;
    return this.buildCommand(CommandNumber.ForceTrim, data);
  }

  /**
   * Same payload as buildForceTrim but framed in the Maverick / official-app
   * style (REVISION byte, routing bytes, header CRC16, 4-byte alignment
   * padding). FORCE_TRIM in our legacy framing is silently rejected by
   * Gen4 firmware on this strap — same 8-byte payload via Maverick framing
   * is whoopsi's working path. Reuses the same TRIM-ALL sentinel guard.
   */
  /**
   * GET_HELLO_EXT (cmd 0x91) — Maverick identity-exchange command that
   * whoopsi sends as command #2 of its init sequence (right after
   * ABORT_HISTORICAL_TRANSMITS) on every connect. Returns a payload
   * containing the strap's serial. Hypothesis: the strap may gate
   * FORCE_TRIM / SET_READ_POINTER on having seen this exchange recently.
   *
   * Payload is [0x01] per whoopsi. We send it Maverick-framed by default
   * since the response handling assumes that format too.
   */
  buildGetHelloExtMaverick(): string {
    const frame = encodeFrameMaverick(
      CommandNumber.GetHelloExt,
      this.nextSequence(),
      new Uint8Array([0x01]),
    );
    return uint8ArrayToBase64(frame);
  }

  buildForceTrimMaverick(sector: number, offset: number): string {
    const TRIM_ALL_SENTINEL = 0xfefefefe;
    if (
      (sector >>> 0) === TRIM_ALL_SENTINEL ||
      (offset >>> 0) === TRIM_ALL_SENTINEL
    ) {
      throw new Error(
        "buildForceTrimMaverick refused: 0xFEFEFEFE is the TRIM-ALL sentinel.",
      );
    }
    const params = new Uint8Array(8);
    params[0] = sector & 0xff;
    params[1] = (sector >> 8) & 0xff;
    params[2] = (sector >> 16) & 0xff;
    params[3] = (sector >> 24) & 0xff;
    params[4] = offset & 0xff;
    params[5] = (offset >> 8) & 0xff;
    params[6] = (offset >> 16) & 0xff;
    params[7] = (offset >> 24) & 0xff;
    const frame = encodeFrameMaverick(
      CommandNumber.ForceTrim,
      this.nextSequence(),
      params,
    );
    return uint8ArrayToBase64(frame);
  }

  /**
   * Canonical SetReadPointer payload per whoopsi: 8 bytes of
   * [sector_u32_LE, offset_u32_LE], 4-byte aligned. Sector 10 is the
   * historical circular buffer per whoopsi notes; offset 0 means
   * "start of that region". The strap's actual reaction (rewind vs.
   * NOP vs. error) needs to be observed empirically; pair this with
   * a GetDataRange before+after to detect whether the read pointer
   * actually moved.
   */
  buildSetReadPointerSectorOffset(sector: number, offset: number): string {
    const data = new Uint8Array(8);
    data[0] = sector & 0xff;
    data[1] = (sector >> 8) & 0xff;
    data[2] = (sector >> 16) & 0xff;
    data[3] = (sector >> 24) & 0xff;
    data[4] = offset & 0xff;
    data[5] = (offset >> 8) & 0xff;
    data[6] = (offset >> 16) & 0xff;
    data[7] = (offset >> 24) & 0xff;
    return this.buildCommand(CommandNumber.SetReadPointer, data);
  }

  // Maverick-framed twin of buildSetReadPointerSectorOffset. Same 8-byte
  // payload, but wrapped in the Maverick framing the strap accepts for
  // cursor primitives (per buildForceTrimMaverick, which is the proven
  // reference). The legacy-framed variant is silently dropped on Gen4 —
  // exposing this builder lets us probe cursor manipulation manually
  // (Inspector expert action / debug flow) without wiring it into the
  // auto-recovery path. Auto-invocation is gated on (a) a verified A/B
  // confirming the strap honors it and (b) a response-correlated ACK
  // signal — both still TODO at the time this was added.
  buildSetReadPointerSectorOffsetMaverick(sector: number, offset: number): string {
    const params = new Uint8Array(8);
    params[0] = sector & 0xff;
    params[1] = (sector >> 8) & 0xff;
    params[2] = (sector >> 16) & 0xff;
    params[3] = (sector >> 24) & 0xff;
    params[4] = offset & 0xff;
    params[5] = (offset >> 8) & 0xff;
    params[6] = (offset >> 16) & 0xff;
    params[7] = (offset >> 24) & 0xff;
    const frame = encodeFrameMaverick(
      CommandNumber.SetReadPointer,
      this.nextSequence(),
      params,
    );
    return uint8ArrayToBase64(frame);
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
