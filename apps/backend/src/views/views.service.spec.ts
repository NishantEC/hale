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
