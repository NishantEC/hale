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
