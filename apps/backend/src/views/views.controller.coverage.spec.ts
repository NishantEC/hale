import { ViewsController } from './views.controller';

describe('ViewsController.coverage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-19T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('rejects from-month older than 13 months ago', async () => {
    const svc = { getCoverage: jest.fn() } as any;
    const ctrl = new ViewsController(svc);
    const req = { user: { userId: 'u' } } as any;
    // 14 months before May 2026 = March 2025
    await expect(
      ctrl.coverage(req, '2025-03', '2025-04', 'Asia/Kolkata'),
    ).rejects.toThrow(/range too old/i);
    expect(svc.getCoverage).not.toHaveBeenCalled();
  });

  test('rejects to before from', async () => {
    const svc = { getCoverage: jest.fn() } as any;
    const ctrl = new ViewsController(svc);
    const req = { user: { userId: 'u' } } as any;
    await expect(
      ctrl.coverage(req, '2026-05', '2026-04', 'Asia/Kolkata'),
    ).rejects.toThrow(/range/i);
  });

  test('rejects non-YYYY-MM input', async () => {
    const svc = { getCoverage: jest.fn() } as any;
    const ctrl = new ViewsController(svc);
    const req = { user: { userId: 'u' } } as any;
    await expect(
      ctrl.coverage(req, '2026-5', '2026-05', 'Asia/Kolkata'),
    ).rejects.toThrow(/YYYY-MM/);
  });

  test('delegates to service for valid range', async () => {
    const svc = {
      getCoverage: jest.fn().mockResolvedValue({
        days: [{ date: '2026-05-17', coverage: 'full' }],
      }),
    } as any;
    const ctrl = new ViewsController(svc);
    const req = { user: { userId: 'u' } } as any;
    const out = await ctrl.coverage(req, '2026-05', '2026-05', 'Asia/Kolkata');
    expect(out.days).toHaveLength(1);
    expect(svc.getCoverage).toHaveBeenCalledWith('u', '2026-05', '2026-05', 'Asia/Kolkata');
  });
});
