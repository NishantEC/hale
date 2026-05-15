import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ActivityDetection } from './entities/activity-detection.entity.js';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityDetection)
    private readonly repo: Repository<ActivityDetection>,
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
}
