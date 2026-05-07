/**
 * Extracts structured metadata and log level from WHOOP firmware console log messages.
 */

export interface ParsedLogMetadata {
  logLevel: string;
  metadata: Record<string, any> | null;
}

const PATTERNS: Array<{
  regex: RegExp;
  extract: (match: RegExpMatchArray) => Record<string, any>;
}> = [
  {
    regex: /Ver:\s*([\d.]+)/,
    extract: (m) => ({ firmwareVersion: m[1] }),
  },
  {
    regex: /Branch:\s*(\S+)/,
    extract: (m) => ({ firmwareBranch: m[1] }),
  },
  {
    regex: /Strap Serial Number\s*\((\w+)\)/,
    extract: (m) => ({ serialNumber: m[1] }),
  },
  {
    regex: /Nordic Ver:\s*([\d.]+)/,
    extract: (m) => ({ nordicVersion: m[1] }),
  },
  {
    regex: /Sensor board ID:\s*(0x\w+\s*.+)/,
    extract: (m) => ({ sensorBoard: m[1].trim() }),
  },
  {
    regex: /AFE ID:\s*(\w+)/,
    extract: (m) => ({ afeId: m[1] }),
  },
  {
    regex: /Found Accelerometer type\s+(\w+)/,
    extract: (m) => ({ accelerometer: m[1] }),
  },
  {
    regex: /R(\d+) Datapackets:\s*(Yes|No)/,
    extract: (m) => ({ [`dataPacketR${m[1]}`]: m[2] === 'Yes' }),
  },
  {
    regex: /FG SOC \(tenths\):\s*(\d+)/,
    extract: (m) => ({ batterySocTenths: parseInt(m[1], 10) }),
  },
  {
    regex: /Set advertising name:\s*(.+)/,
    extract: (m) => ({ advertisingName: m[1].trim() }),
  },
  {
    regex: /Historical Dump Complete/,
    extract: () => ({ historyDumpComplete: true }),
  },
  {
    regex: /High Freq duration set to max of (\d+) hours/,
    extract: (m) => ({ highFreqSyncHours: parseInt(m[1], 10) }),
  },
  {
    regex: /Flash chip is (.+)\./,
    extract: (m) => ({ flashChip: m[1].trim() }),
  },
];

const ERROR_KEYWORDS = ['error', 'fail', 'fault', 'invalid', 'corrupt'];
const WARN_KEYWORDS = ['warn', 'power loss', 'timeout', 'POR detected', 'saturation'];

export function parseConsoleLogMetadata(message: string): ParsedLogMetadata {
  const lower = message.toLowerCase();

  // Determine log level
  let logLevel = 'info';
  if (ERROR_KEYWORDS.some((kw) => lower.includes(kw))) {
    logLevel = 'error';
  } else if (WARN_KEYWORDS.some((kw) => lower.includes(kw))) {
    logLevel = 'warn';
  }

  // Extract metadata from known patterns
  let metadata: Record<string, any> | null = null;
  for (const pattern of PATTERNS) {
    const match = message.match(pattern.regex);
    if (match) {
      metadata = { ...(metadata ?? {}), ...pattern.extract(match) };
    }
  }

  return { logLevel, metadata };
}
