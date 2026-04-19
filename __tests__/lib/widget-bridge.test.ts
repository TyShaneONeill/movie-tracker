jest.mock('../../modules/widget-bridge', () => ({
  __esModule: true,
  default: {
    writeWidgetData: jest.fn().mockResolvedValue(undefined),
    writePosterFile: jest.fn().mockResolvedValue(undefined),
    reloadWidgetTimelines: jest.fn().mockResolvedValue(undefined),
  },
}));

import { writeWidgetData, writePosterFile, reloadWidgetTimelines, WidgetPayload } from '@/lib/widget-bridge';
import WidgetBridge from '../../modules/widget-bridge';

const samplePayload: WidgetPayload = {
  version: 1,
  cached_at: 123,
  stats: { films_watched: 68, shows_watched: 12 },
  shows: [],
  movies: [],
};

describe('widget-bridge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stringifies and forwards payload to writeWidgetData', async () => {
    await writeWidgetData(samplePayload);
    expect((WidgetBridge as any).writeWidgetData).toHaveBeenCalledWith(JSON.stringify(samplePayload));
  });

  it('forwards poster filename + base64 to writePosterFile', async () => {
    await writePosterFile('poster_0.jpg', 'BASE64==');
    expect((WidgetBridge as any).writePosterFile).toHaveBeenCalledWith('poster_0.jpg', 'BASE64==');
  });

  it('calls reloadWidgetTimelines', async () => {
    await reloadWidgetTimelines();
    expect((WidgetBridge as any).reloadWidgetTimelines).toHaveBeenCalled();
  });

  it('swallows native errors in dev with a warn', async () => {
    const originalDev = (global as any).__DEV__;
    (global as any).__DEV__ = true;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (WidgetBridge.writeWidgetData as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await expect(writeWidgetData(samplePayload)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    (global as any).__DEV__ = originalDev;
  });
});
