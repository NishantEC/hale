/**
 * Sleep-stage classifier validation harness.
 *
 * Scaffold for measuring our `classifySleepStages` output against a
 * ground-truth source (PSG label series). No labelled dataset is wired
 * in yet — this script defines the comparison protocol and confusion-
 * matrix math so once we have labels (CSV / JSON / SQL table), the
 * evaluation runs end-to-end.
 *
 * Usage (once a fixture is provided):
 *   pnpm ts-node apps/backend/src/scripts/validate-sleep-stager.ts \
 *     --labels=.fixtures/sleep-labels/<night>.json \
 *     --predictions-from=db   # or --predictions-from=run (re-run pipeline)
 *
 * Output:
 *   .fixtures/sleep-validation/<night>.report.md  (per-night)
 *   .fixtures/sleep-validation/summary.md          (aggregate)
 */

import 'reflect-metadata';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

type StageLabel = 'awake' | 'light' | 'deep' | 'rem' | 'unknown';

interface LabelEpoch {
  startedAt: string;
  durationSeconds: number;
  stage: StageLabel;
}

interface PredictionEpoch {
  startedAt: string;
  durationSeconds: number;
  stage: StageLabel;
}

interface NightLabels {
  nightDate: string;
  userId: string;
  source: 'psg' | 'observer' | 'reference-device';
  epochs: LabelEpoch[];
}

function parseArgs(argv: string[]) {
  const out: { labels?: string; predictionsFrom?: 'db' | 'run' } = {};
  for (const arg of argv.slice(2)) {
    const [k, v] = arg.startsWith('--') ? arg.slice(2).split('=') : [arg, ''];
    if (k === 'labels') out.labels = v;
    if (k === 'predictions-from') out.predictionsFrom = v as 'db' | 'run';
  }
  return out;
}

function loadLabels(path: string): NightLabels {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function alignEpochs(
  labels: LabelEpoch[],
  predictions: PredictionEpoch[],
): Array<{ t: number; label: StageLabel; pred: StageLabel }> {
  // Align by 30-second bins. Both stagers report epochs with start time
  // and duration; we map each epoch onto a canonical 30s grid.
  const BIN_MS = 30_000;
  if (labels.length === 0 || predictions.length === 0) return [];

  const labelStart = new Date(labels[0].startedAt).getTime();
  const labelEnd = labelStart + labels.reduce((s, e) => s + e.durationSeconds * 1000, 0);

  function stageAt(epochs: { startedAt: string; durationSeconds: number; stage: StageLabel }[], t: number): StageLabel {
    for (const e of epochs) {
      const start = new Date(e.startedAt).getTime();
      const end = start + e.durationSeconds * 1000;
      if (t >= start && t < end) return e.stage;
    }
    return 'unknown';
  }

  const out: Array<{ t: number; label: StageLabel; pred: StageLabel }> = [];
  for (let t = labelStart; t < labelEnd; t += BIN_MS) {
    out.push({ t, label: stageAt(labels, t), pred: stageAt(predictions, t) });
  }
  return out;
}

function confusionMatrix(aligned: Array<{ label: StageLabel; pred: StageLabel }>): {
  matrix: Record<StageLabel, Record<StageLabel, number>>;
  perStageAccuracy: Record<StageLabel, number>;
  overallAccuracy: number;
  kappa: number;
} {
  const stages: StageLabel[] = ['awake', 'light', 'deep', 'rem', 'unknown'];
  const matrix = {} as Record<StageLabel, Record<StageLabel, number>>;
  for (const s of stages) {
    matrix[s] = {} as Record<StageLabel, number>;
    for (const p of stages) matrix[s][p] = 0;
  }
  for (const r of aligned) matrix[r.label][r.pred]++;

  const perStageAccuracy = {} as Record<StageLabel, number>;
  let correct = 0;
  const total = aligned.length;
  for (const s of stages) {
    const rowTotal = stages.reduce((sum, p) => sum + matrix[s][p], 0);
    perStageAccuracy[s] = rowTotal > 0 ? matrix[s][s] / rowTotal : 0;
    correct += matrix[s][s];
  }
  const overallAccuracy = total > 0 ? correct / total : 0;

  // Cohen's kappa
  let pe = 0;
  for (const s of stages) {
    const rowTotal = stages.reduce((sum, p) => sum + matrix[s][p], 0);
    const colTotal = stages.reduce((sum, p) => sum + matrix[p][s], 0);
    if (total > 0) pe += (rowTotal / total) * (colTotal / total);
  }
  const kappa = pe < 1 ? (overallAccuracy - pe) / (1 - pe) : 0;

  return { matrix, perStageAccuracy, overallAccuracy, kappa };
}

function formatReport(nightDate: string, result: ReturnType<typeof confusionMatrix>): string {
  const stages: StageLabel[] = ['awake', 'light', 'deep', 'rem', 'unknown'];
  const lines: string[] = [];
  lines.push(`# Sleep-stager validation — ${nightDate}`);
  lines.push('');
  lines.push(`Overall accuracy: ${(result.overallAccuracy * 100).toFixed(1)}%`);
  lines.push(`Cohen's kappa: ${result.kappa.toFixed(3)} (>0.6 = substantial, >0.8 = near-perfect)`);
  lines.push('');
  lines.push(`## Per-stage recall`);
  for (const s of stages) {
    lines.push(`- ${s}: ${(result.perStageAccuracy[s] * 100).toFixed(1)}%`);
  }
  lines.push('');
  lines.push(`## Confusion matrix (rows = truth, cols = prediction)`);
  lines.push(`|        | ${stages.join(' | ')} |`);
  lines.push(`|--------|${stages.map(() => '---').join('|')}|`);
  for (const truth of stages) {
    const row = stages.map((p) => result.matrix[truth][p]).join(' | ');
    lines.push(`| ${truth} | ${row} |`);
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.labels) {
    console.error(
      'Usage: ts-node validate-sleep-stager.ts --labels=<labels.json> [--predictions-from=db|run]',
    );
    console.error('');
    console.error('No labels supplied. Validation requires a ground-truth dataset.');
    console.error('Place a labels JSON at .fixtures/sleep-labels/<night>.json with shape:');
    console.error('  { nightDate, userId, source, epochs: [{startedAt, durationSeconds, stage}, …] }');
    console.error('');
    console.error('Acquisition options for ground truth:');
    console.error('  - PSG: gold standard but requires a sleep-lab study or home PSG kit.');
    console.error('  - Reference wearable (Apple Watch / Oura / Polar) — softer floor, easier.');
    console.error('  - Manual scoring by the wearer over a few nights.');
    process.exit(0);
  }

  const labels = loadLabels(args.labels);

  // Fetching our predictions:
  //   --predictions-from=db   → query sleep_stages for the user × night
  //   --predictions-from=run  → re-run classifySleepStages on raw signals
  // For now, scaffold the contract; a follow-up commit can implement
  // either branch once the labels-acquisition path is decided.
  const predictions: PredictionEpoch[] = [];
  if (args.predictionsFrom === 'db') {
    console.error('TODO: query sleep_stages for', labels.userId, labels.nightDate);
    process.exit(1);
  } else if (args.predictionsFrom === 'run') {
    console.error('TODO: load raw_sensor_records, call classifySleepStages, return epochs');
    process.exit(1);
  } else {
    console.error('Pass --predictions-from=db or --predictions-from=run');
    process.exit(1);
  }

  // (Once predictions are populated, the next block runs as-is.)
  const aligned = alignEpochs(labels.epochs, predictions);
  const result = confusionMatrix(aligned);
  const report = formatReport(labels.nightDate, result);

  const outDir = join(process.cwd(), '.fixtures', 'sleep-validation');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, `${labels.nightDate}.report.md`);
  writeFileSync(reportPath, report);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
