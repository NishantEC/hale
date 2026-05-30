import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferences } from './user-preferences.entity.js';

const DEFAULTS = {
  notifications: {
    recoveryDrop: true,
    sleepBedtimeReminder: true,
    morningSummary: true,
    strapBatteryLow: true,
    weeklyDigest: false,
  },
  goals: {
    sleepTargetMinutes: 480,
    strainTargetDaily: 12,
    activeMinutesDaily: 30,
  },
  metrics: {
    showHealthspan: true,
    showStress: true,
    showHrv: true,
    showRespiratoryRate: true,
  },
  journal: {
    morningReminder: false,
    eveningReminder: false,
  },
} as const;

export type PreferencesShape = typeof DEFAULTS;

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) continue;
    const baseVal = base[k];
    if (
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof baseVal === 'object' &&
      baseVal != null &&
      !Array.isArray(baseVal)
    ) {
      out[k] = deepMerge(baseVal as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

@Injectable()
export class PreferencesService {
  constructor(
    @InjectRepository(UserPreferences)
    private repo: Repository<UserPreferences>,
  ) {}

  async get(userId: string): Promise<PreferencesShape> {
    const row = await this.repo.findOne({ where: { userId } });
    return deepMerge(DEFAULTS as unknown as PreferencesShape, (row?.data ?? {}) as Partial<PreferencesShape>);
  }

  async patch(userId: string, patch: Partial<PreferencesShape>): Promise<PreferencesShape> {
    const existing = await this.repo.findOne({ where: { userId } });
    const merged = deepMerge((existing?.data ?? {}) as PreferencesShape, patch);
    await this.repo.upsert({ userId, data: merged }, ['userId']);
    return deepMerge(DEFAULTS as unknown as PreferencesShape, merged);
  }
}
