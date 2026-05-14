import {
  parseBatteryLevel,
  parseBatteryLevelEvent,
  parseExtendedBatteryEvent,
} from "./battery-parsers"
import { CommandNumber, EventNumber, PacketType, WhoopPacket } from "./packet-types"

function makePacket(over: Partial<WhoopPacket>): WhoopPacket {
  return {
    type: PacketType.CommandResponse,
    sequence: 0,
    command: 0,
    data: new Uint8Array(0),
    ...over,
  }
}

// LE u16 helper
function u16(low: number, high: number): [number, number] {
  return [low & 0xff, high & 0xff]
}

describe("parseBatteryLevel (cmd 26)", () => {
  it("returns null on wrong command", () => {
    expect(parseBatteryLevel(makePacket({ command: CommandNumber.GetClock }))).toBeNull()
  })

  it("returns null when data is too short", () => {
    expect(
      parseBatteryLevel(
        makePacket({ command: CommandNumber.GetBatteryLevel, data: new Uint8Array([0, 0]) }),
      ),
    ).toBeNull()
  })

  it("reads uint16 LE at offset 2 and divides by 10", () => {
    // [_, _, 0xfa, 0x03] → 0x03fa = 1018 → 101.8 (above 100, allowed for raw)
    const packet = makePacket({
      command: CommandNumber.GetBatteryLevel,
      data: new Uint8Array([0x00, 0x1a, 0xfa, 0x03]),
    })
    expect(parseBatteryLevel(packet)).toBeCloseTo(101.8, 5)
  })

  it("works for typical mid-range value", () => {
    // 0x0352 = 850 → 85.0%
    const packet = makePacket({
      command: CommandNumber.GetBatteryLevel,
      data: new Uint8Array([0x00, 0x1a, 0x52, 0x03]),
    })
    expect(parseBatteryLevel(packet)).toBeCloseTo(85.0, 5)
  })

  it("does NOT regress to reading offset 0 (the historical 26% bug)", () => {
    // byte 0 is 0x1A = 26 — the historical bug used this as battery.
    // Real value at offset 2 is 0x0352 = 850 → 85.0.
    const packet = makePacket({
      command: CommandNumber.GetBatteryLevel,
      data: new Uint8Array([0x1a, 0x00, 0x52, 0x03]),
    })
    expect(parseBatteryLevel(packet)).toBe(85.0)
    expect(parseBatteryLevel(packet)).not.toBe(26)
  })
})

describe("parseBatteryLevelEvent (event 3)", () => {
  function buildEvent3(socTenths: number, voltageMv: number): WhoopPacket {
    const data = new Uint8Array(16)
    // bytes 0..9: header padding (we don't care about values)
    const socL = socTenths & 0xff
    const socH = (socTenths >> 8) & 0xff
    const vL = voltageMv & 0xff
    const vH = (voltageMv >> 8) & 0xff
    data[10] = socL
    data[11] = socH
    data[14] = vL
    data[15] = vH
    return makePacket({ type: PacketType.Event, command: EventNumber.BatteryLevel, data })
  }

  it("returns null on wrong packet type", () => {
    expect(
      parseBatteryLevelEvent(
        makePacket({ type: PacketType.CommandResponse, command: EventNumber.BatteryLevel }),
      ),
    ).toBeNull()
  })

  it("returns null on wrong event id", () => {
    expect(
      parseBatteryLevelEvent(makePacket({ type: PacketType.Event, command: EventNumber.WristOn })),
    ).toBeNull()
  })

  it("returns null when data is too short", () => {
    expect(
      parseBatteryLevelEvent(
        makePacket({
          type: PacketType.Event,
          command: EventNumber.BatteryLevel,
          data: new Uint8Array(10),
        }),
      ),
    ).toBeNull()
  })

  it("extracts SOC tenths/10 and voltage mV", () => {
    const result = parseBatteryLevelEvent(buildEvent3(850, 3987))
    expect(result).toEqual({ socPct: 85.0, voltageMv: 3987 })
  })

  it("rejects out-of-range SOC (sentinel detection)", () => {
    // 0xFFFE in tenths → 65534, way above 1100 cap
    const data = new Uint8Array(16)
    data[10] = 0xfe
    data[11] = 0xff
    // voltage in-range so we can isolate the SOC clamp
    data[14] = 0x93
    data[15] = 0x0f // 3987 mV
    const packet = makePacket({ type: PacketType.Event, command: EventNumber.BatteryLevel, data })
    const result = parseBatteryLevelEvent(packet)
    expect(result?.socPct).toBeNull()
    expect(result?.voltageMv).toBe(3987)
  })

  it("rejects out-of-range voltage", () => {
    const result = parseBatteryLevelEvent(buildEvent3(500, 5000)) // 5000 mV > Li-ion cap
    expect(result?.voltageMv).toBeNull()
    expect(result?.socPct).toBe(50.0)
  })

  it("accepts boundary voltage 2500..4500", () => {
    expect(parseBatteryLevelEvent(buildEvent3(500, 2500))?.voltageMv).toBe(2500)
    expect(parseBatteryLevelEvent(buildEvent3(500, 4500))?.voltageMv).toBe(4500)
  })
})

describe("parseExtendedBatteryEvent (event 63)", () => {
  function buildEvent63(
    voltageMv: number,
    tempTenths: number,
    iconLevel: number,
    socTenths: number,
  ): WhoopPacket {
    const data = new Uint8Array(27)
    data[14] = voltageMv & 0xff
    data[15] = (voltageMv >> 8) & 0xff
    data[16] = tempTenths & 0xff
    data[17] = (tempTenths >> 8) & 0xff
    data[21] = iconLevel
    data[25] = socTenths & 0xff
    data[26] = (socTenths >> 8) & 0xff
    return makePacket({
      type: PacketType.Event,
      command: EventNumber.ExtendedBatteryInformation,
      data,
    })
  }

  it("returns null on wrong type/command/length", () => {
    expect(parseExtendedBatteryEvent(makePacket({ command: 63 }))).toBeNull() // wrong type
    expect(
      parseExtendedBatteryEvent(makePacket({ type: PacketType.Event, command: 99 })),
    ).toBeNull() // wrong event
    expect(
      parseExtendedBatteryEvent(
        makePacket({
          type: PacketType.Event,
          command: EventNumber.ExtendedBatteryInformation,
          data: new Uint8Array(20),
        }),
      ),
    ).toBeNull() // too short
  })

  it("extracts all four fields with correct scaling", () => {
    // V = 3987, T = 28.3°C (283 tenths), icon=5, SOC = 73.2 (732 tenths)
    const result = parseExtendedBatteryEvent(buildEvent63(3987, 283, 5, 732))
    expect(result).toEqual({
      voltageMv: 3987,
      temperatureC: 28.3,
      iconLevel: 5,
      socPct: 73.2,
    })
  })

  it("clamps icon level to 0..7", () => {
    expect(parseExtendedBatteryEvent(buildEvent63(3987, 283, 7, 500))?.iconLevel).toBe(7)
    expect(parseExtendedBatteryEvent(buildEvent63(3987, 283, 8, 500))?.iconLevel).toBeNull()
  })

  it("rejects temperature outside 5..70 °C", () => {
    expect(parseExtendedBatteryEvent(buildEvent63(3987, 49, 5, 500))?.temperatureC).toBeNull()
    expect(parseExtendedBatteryEvent(buildEvent63(3987, 701, 5, 500))?.temperatureC).toBeNull()
    expect(parseExtendedBatteryEvent(buildEvent63(3987, 50, 5, 500))?.temperatureC).toBe(5.0)
  })
})
