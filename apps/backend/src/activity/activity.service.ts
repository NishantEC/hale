import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ActivityDetection } from './entities/activity-detection.entity.js';
import { RawSensorRecord } from '../pipeline/entities/raw-sensor-record.entity.js';
import { BaselineProfile } from '../plans/baseline-profile.entity.js';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityDetection)
    private readonly repo: Repository<ActivityDetection>,
    @InjectRepository(RawSensorRecord)
    private readonly rawSensorRepo: Repository<RawSensorRecord>,
    @InjectRepository(BaselineProfile)
    private readonly baselineRepo: Repository<BaselineProfile>,
  ) {}

  async findByDate(userId: string, date: string) {
    const [year, month, day] = date.split('-').map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0, 0);
    const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

    return this.repo.find({
      where: { userId, startTime: Between(start, end) },
      order: { startTime: 'ASC' },
    });
  }

  async create(userId: string, data: {
    activityType: string;
    startTime: string;
    endTime: string;
    intensity?: string;
    notes?: string;
  }) {
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;

    const entity = this.repo.create({
      userId,
      startTime,
      endTime,
      durationMinutes,
      activityType: data.activityType,
      intensity: data.intensity ?? 'moderate',
      confidence: 1.0, // User-logged = full confidence
      heartRateAvg: 0,
      heartRateMax: 0,
      strainScore: 0,
      source: 'user_logged',
    });
    return this.repo.save(entity);
  }

  async remove(userId: string, id: string) {
    const entity = await this.repo.findOne({ where: { id, userId } });
    if (!entity) return { ok: false };
    await this.repo.remove(entity);
    return { ok: true };
  }

  async confirm(userId: string, id: string, confirmedType?: string) {
    const entity = await this.repo.findOne({ where: { id, userId } });
    if (!entity) return { ok: false as const };
    entity.userConfirmedType = confirmedType ?? entity.activityType;
    entity.dismissedAt = null;
    // Flip source so the pipeline's delete-by-source on next run doesn't
    // wipe this row. Preserves the user's curation across recomputes.
    if (entity.source === 'detected') entity.source = 'user_confirmed';
    await this.repo.save(entity);
    return { ok: true as const, userConfirmedType: entity.userConfirmedType };
  }

  async dismiss(userId: string, id: string) {
    const entity = await this.repo.findOne({ where: { id, userId } });
    if (!entity) return { ok: false as const };
    entity.dismissedAt = new Date();
    if (entity.source === 'detected') entity.source = 'user_dismissed';
    await this.repo.save(entity);
    return { ok: true as const };
  }

  /**
   * Full detail for a single bout: HR curve, HR-zone time breakdown, and an
   * optional motion-intensity strip. Backs GET /activities/:id (BoutDetail
   * screen). Returns null when the bout doesn't belong to the user so the
   * controller can answer 404.
   */
  async getBoutDetail(userId: string, id: string) {
    const bout = await this.repo.findOne({ where: { id, userId } });
    if (!bout) return null;

    const baseline = await this.baselineRepo.findOne({ where: { userId } });
    const restingHR =
      baseline?.restingHeartRate && baseline.restingHeartRate > 0
        ? baseline.restingHeartRate
        : 60;
    const maxHR =
      baseline?.maxHeartRate && baseline.maxHeartRate > 0
        ? baseline.maxHeartRate
        : Math.max(180, Math.round(restingHR * 2.8));

    const rows: Array<{ hr: string; t: Date; g: string | null }> =
      await this.rawSensorRepo
        .createQueryBuilder('r')
        .select('r."heartRate"', 'hr')
        .addSelect('r."timestamp"', 't')
        .addSelect('r."gravityMagnitude"', 'g')
        .where('r."userId" = :userId', { userId })
        .andWhere('r."timestamp" >= :start AND r."timestamp" <= :end', {
          start: bout.startTime,
          end: bout.endTime,
        })
        .andWhere('r."heartRate" > 0')
        .orderBy('r."timestamp"', 'ASC')
        .getRawMany();

    const samples = rows
      .map((r) => ({
        t: new Date(r.t).getTime(),
        hr: Number(r.hr),
        g: r.g == null ? null : Number(r.g),
      }))
      .filter((s) => Number.isFinite(s.hr) && s.hr > 0);

    // HR-zone time via trapezoidal integration. Each sample owns the gap to the
    // next sample, clamped to 60s so a tracking gap can't inflate a zone.
    const zoneSeconds = [0, 0, 0, 0, 0];
    const zoneOf = (hr: number) => {
      const frac = hr / maxHR;
      if (frac < 0.6) return 0;
      if (frac < 0.7) return 1;
      if (frac < 0.8) return 2;
      if (frac < 0.9) return 3;
      return 4;
    };
    for (let i = 0; i < samples.length; i++) {
      const next = i + 1 < samples.length ? samples[i + 1].t : null;
      const dtSec =
        next != null ? Math.min(60, Math.max(0, (next - samples[i].t) / 1000)) : 1;
      zoneSeconds[zoneOf(samples[i].hr)] += dtSec;
    }
    const zoneMinutes = zoneSeconds.map((s) => Math.round((s / 60) * 10) / 10);
    const totalMin = zoneMinutes.reduce((a, b) => a + b, 0) || 1;
    const zonePercents = zoneMinutes.map((m) => Math.round((m / totalMin) * 100));

    const hrCurve = this.downsample(
      samples.map((s) => ({ t: s.t, hr: Math.round(s.hr) })),
      60,
    );

    // Optional motion strip: per-bin mean |gravity − 1g|. Movement perturbs the
    // gravity vector, so deviation from 1g is a cheap motion proxy.
    let motionIntensity: number[] | undefined;
    const gravity = samples.filter(
      (s): s is { t: number; hr: number; g: number } => s.g != null,
    );
    if (gravity.length >= 8) {
      const BINS = 24;
      const startMs = bout.startTime.getTime();
      const span = Math.max(1, bout.endTime.getTime() - startMs);
      const bins: number[][] = Array.from({ length: BINS }, () => []);
      for (const s of gravity) {
        const idx = Math.min(
          BINS - 1,
          Math.max(0, Math.floor(((s.t - startMs) / span) * BINS)),
        );
        bins[idx].push(Math.abs(s.g - 1));
      }
      const binned = bins.map((b) =>
        b.length ? b.reduce((a, c) => a + c, 0) / b.length : 0,
      );
      if (binned.some((v) => v > 0)) motionIntensity = binned;
    }

    const pending =
      bout.userConfirmedType == null &&
      bout.dismissedAt == null &&
      bout.source === 'detected';
    const source: 'detected' | 'candidate' | 'healthkit' | 'manual' = pending
      ? 'candidate'
      : bout.externalSource || bout.source === 'healthkit'
        ? 'healthkit'
        : bout.source === 'user_logged'
          ? 'manual'
          : 'detected';
    const intensity: 'light' | 'moderate' | 'hard' =
      bout.intensity === 'light' || bout.intensity === 'hard'
        ? bout.intensity
        : 'moderate';

    return {
      id: bout.id,
      startTime: bout.startTime.toISOString(),
      endTime: bout.endTime.toISOString(),
      durationMinutes: Math.round(bout.durationMinutes),
      activityType: bout.activityType,
      intensity,
      source,
      confidence: Math.round(bout.confidence * 100) / 100,
      heartRateAvg: Math.round(bout.heartRateAvg),
      heartRateMax: Math.round(bout.heartRateMax),
      strainScore: Math.round(bout.strainScore * 10) / 10,
      hrCurve,
      zonePercents,
      zoneMinutes,
      motionIntensity,
    };
  }

  /** Evenly thin an array down to at most `max` points, preserving order. */
  private downsample<T>(arr: T[], max: number): T[] {
    if (arr.length <= max) return arr;
    const step = arr.length / max;
    const out: T[] = [];
    for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }
}
