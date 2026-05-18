import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  ComputeDerivedMetricsDayRequestV1,
  PersistedDailyMetricV1,
} from './compute-engine-types';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const COMPUTE_ENGINE_DIR = join(REPO_ROOT, 'apps', 'compute-engine');
const FIXTURE_PATH = join(
  REPO_ROOT,
  'apps',
  'backend',
  '.fixtures',
  'compute-engine-golden',
  'normal-ist.json',
);

function normalizeTimestamps(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalizeTimestamps);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        typeof v === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(v)
      ) {
        out[k] = new Date(v).toISOString();
      } else {
        out[k] = normalizeTimestamps(v);
      }
    }
    return out;
  }
  return value;
}

const TOLERANCE = 1e-9;

function expectDeepNearEqual(actual: unknown, expected: unknown, path = '$'): void {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isNaN(expected) && Number.isNaN(actual)) return;
    const delta = Math.abs(expected - actual);
    const tol = TOLERANCE * Math.max(1, Math.abs(expected), Math.abs(actual));
    if (delta > tol) {
      throw new Error(
        `Float mismatch at ${path}: expected ${expected}, got ${actual} (delta=${delta})`,
      );
    }
    return;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      throw new Error(
        `Array length mismatch at ${path}: expected ${expected.length}, got ${actual.length}`,
      );
    }
    for (let i = 0; i < expected.length; i += 1) {
      expectDeepNearEqual(actual[i], expected[i], `${path}[${i}]`);
    }
    return;
  }
  if (
    expected !== null &&
    actual !== null &&
    typeof expected === 'object' &&
    typeof actual === 'object'
  ) {
    const ekeys = Object.keys(expected).sort();
    const akeys = Object.keys(actual).sort();
    if (ekeys.join(',') !== akeys.join(',')) {
      throw new Error(
        `Key set mismatch at ${path}: expected [${ekeys.join(',')}], got [${akeys.join(',')}]`,
      );
    }
    for (const k of ekeys) {
      expectDeepNearEqual(
        (actual as Record<string, unknown>)[k],
        (expected as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
    }
    return;
  }
  if (expected !== actual) {
    throw new Error(`Mismatch at ${path}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

describe('compute-engine V1 types', () => {
  it('parses the normal-ist fixture input + expected', () => {
    const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as {
      input: unknown;
      expected: unknown;
    };
    expect(() => ComputeDerivedMetricsDayRequestV1.parse(raw.input)).not.toThrow();
    expect(() => PersistedDailyMetricV1.parse(raw.expected)).not.toThrow();
  });

  it('round-trips through the Rust parity bin', () => {
    const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as { input: unknown };
    const parsed = ComputeDerivedMetricsDayRequestV1.parse(raw.input);

    const dir = mkdtempSync(join(tmpdir(), 'compute-engine-parity-'));
    const inputPath = join(dir, 'input.json');
    writeFileSync(inputPath, JSON.stringify(parsed));

    const stdout = execFileSync(
      'cargo',
      ['run', '--release', '--quiet', '--bin', 'parity', '--', inputPath],
      { cwd: COMPUTE_ENGINE_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );

    const rustReparsed = ComputeDerivedMetricsDayRequestV1.parse(JSON.parse(stdout));
    expectDeepNearEqual(
      normalizeTimestamps(rustReparsed),
      normalizeTimestamps(parsed),
    );
  }, 120_000);
});
