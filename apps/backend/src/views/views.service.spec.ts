import { ViewsService } from './views.service';

function repo(rows: any[] = [], one: any = null) {
  return {
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn().mockResolvedValue(one),
  } as any;
}

describe('ViewsService sleep view date selection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-12T06:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not show an adjacent previous sleep night for a selected day with no detection', async () => {
    const sleepDetections = [
      {
        id: 'sleep-2026-05-10',
        userId: 'user-1',
        nightDate: new Date('2026-05-09T18:30:00.000Z'),
        bedtime: new Date('2026-05-10T03:45:40.215Z'),
        wakeTime: new Date('2026-05-10T09:23:27.025Z'),
        durationHours: 5.277,
        interruptionCount: 1,
        continuity: 0.82,
        regularity: 0.65,
        validCoverage: 0.18,
        confidence: 0.37,
        updatedAt: new Date('2026-05-12T00:00:00.000Z'),
      },
    ];

    const service = new ViewsService(
      repo(sleepDetections),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
    );

    const view = await service.getSleepView(
      'user-1',
      '2026-05-11',
      'Asia/Kolkata',
    );

    expect(view.selectedDate).toBe('2026-05-11');
    expect(view.selectedDateTitle).toBe('Yesterday');
    expect(view.emptyState.isEmpty).toBe(true);
    expect(view.header.bedtime).toBe('--');
  });

  it('returns a populated home view shape when no sleep data exists', async () => {
    const service = new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
    );

    const view = await service.getHomeView('user-1', '2026-05-12', 'America/Los_Angeles');

    expect(view.selectedDate).toBe('2026-05-12');
    expect(view.cards.recommendation.title).toBe('Steady'); // fallback when no score
    expect(view.cards.stress.title).toBe('--');
    expect(view.cards.loadPressure.title).toBe('--');
  });

  it('builds trend summaries with week-over-week comparisons when at least 8 nights exist', async () => {
    const baseDate = new Date('2026-04-12T00:00:00.000Z').getTime();
    const nightFeatures = Array.from({ length: 10 }, (_, i) => ({
      id: `nf-${i}`,
      userId: 'user-1',
      nightDate: new Date(baseDate + i * 86_400_000),
      restingHeartRate: 60 - i, // declining (improving for resting HR)
      rmssd: 40 + i, // increasing (improving for HRV)
      sdnn: 35,
      pnn50: 12,
      respiratoryRate: 14,
      continuity: 1,
      regularity: 0.9,
      validCoverage: 1,
      confidenceRaw: 1,
      sleepEstimateHours: 7.5,
      sourceBlend: 'strap-history',
    }));

    const service = new ViewsService(
      repo([]),
      repo([]),
      repo(nightFeatures),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
    );

    const view = await service.getTrendsView('user-1', 30);

    expect(view.summaries.hrv.current).toBe(49);
    expect(view.summaries.hrv.weekAgo).toBe(42);
    expect(view.summaries.hrv.trend).toBe('improving');
    expect(view.summaries.restingHr.trend).toBe('improving');
  });

  it('returns null trend summaries when fewer than 8 nights exist', async () => {
    const baseDate = new Date('2026-05-05T00:00:00.000Z').getTime();
    const nightFeatures = Array.from({ length: 5 }, (_, i) => ({
      id: `nf-${i}`,
      userId: 'user-1',
      nightDate: new Date(baseDate + i * 86_400_000),
      restingHeartRate: 60,
      rmssd: 40,
      sdnn: 35,
      pnn50: 12,
      respiratoryRate: 14,
      continuity: 1,
      regularity: 0.9,
      validCoverage: 1,
      confidenceRaw: 1,
      sleepEstimateHours: 7.5,
      sourceBlend: 'strap-history',
    }));

    const service = new ViewsService(
      repo([]),
      repo([]),
      repo(nightFeatures),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
    );

    const view = await service.getTrendsView('user-1', 30);

    expect(view.summaries.hrv.weekAgo).toBeNull();
    expect(view.summaries.hrv.trend).toBeNull();
  });

  it('formatHrvCv returns "--" when window has fewer than 4 valid nights', () => {
    const service = new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
    );

    const selected = {
      nightDate: new Date('2026-05-12T00:00:00.000Z'),
      rmssd: 45,
      validCoverage: 1,
    } as any;
    const sparseWindow = [
      selected,
      { ...selected, nightDate: new Date('2026-05-11T00:00:00.000Z') },
      { ...selected, nightDate: new Date('2026-05-10T00:00:00.000Z') },
    ];

    expect((service as any).formatHrvCv(selected, sparseWindow)).toBe('--');
  });

  it('formatHrvCv excludes low-coverage and zero-rmssd nights from the CV window', () => {
    const service = new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
    );

    const selected = {
      nightDate: new Date('2026-05-12T00:00:00.000Z'),
      rmssd: 50,
      validCoverage: 1,
    } as any;
    const window = [
      selected,
      { nightDate: new Date('2026-05-11T00:00:00.000Z'), rmssd: 48, validCoverage: 1 },
      { nightDate: new Date('2026-05-10T00:00:00.000Z'), rmssd: 52, validCoverage: 1 },
      { nightDate: new Date('2026-05-09T00:00:00.000Z'), rmssd: 0, validCoverage: 1 }, // excluded
      { nightDate: new Date('2026-05-08T00:00:00.000Z'), rmssd: 60, validCoverage: 0.1 }, // excluded
    ];

    // Only selected, -11, -10 qualify — fewer than 4 → '--'.
    expect((service as any).formatHrvCv(selected, window)).toBe('--');
  });

  it('returns "--" formatHrvCv when no feature is selected', () => {
    const service = new ViewsService(
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
    );

    expect((service as any).formatHrvCv(null, [])).toBe('--');
  });

  it('formats sleep header times in the requested timezone', async () => {
    const sleepDetections = [
      {
        id: 'sleep-2026-05-12',
        userId: 'user-1',
        nightDate: new Date('2026-05-11T11:15:00.000Z'),
        bedtime: new Date('2026-05-11T15:55:52.360Z'),
        wakeTime: new Date('2026-05-11T18:26:21.131Z'),
        durationHours: 2.508,
        interruptionCount: 0,
        continuity: 0.78,
        regularity: 0.5,
        validCoverage: 0.36,
        confidence: 0.55,
        updatedAt: new Date('2026-05-12T02:00:00.000Z'),
      },
    ];

    const service = new ViewsService(
      repo(sleepDetections),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
      repo([], null),
      repo([]),
      repo([], null),
      repo([]),
      repo([]),
    );

    const view = await service.getSleepView(
      'user-1',
      '2026-05-12',
      'Pacific/Chatham',
    );

    expect(view.header.bedtime).toBe('4:40 AM');
    expect(view.header.wakeTime).toBe('7:11 AM');
  });
});
