import {
  avatarSvg,
  avatarCacheKey,
  randomConfig,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  CLOTHING,
  CLOTHES_COLORS,
  EYES,
  BACKGROUNDS,
} from '@/lib/avatar-config';

describe('avatar-config', () => {
  describe('avatarSvg', () => {
    it('produces an SVG that is safe for react-native-svg (no CSS <style> blocks)', () => {
      const svg = avatarSvg('user-123');
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox');
      // react-native-svg cannot render CSS <style> blocks — DiceBear avataaars
      // emits inline attributes, so this must stay false.
      expect(svg.includes('<style')).toBe(false);
    });

    it('is deterministic for a given seed (auto avatars are stable per user)', () => {
      expect(avatarSvg('same-seed')).toEqual(avatarSvg('same-seed'));
    });

    it('produces different avatars for different seeds', () => {
      expect(avatarSvg('user-a')).not.toEqual(avatarSvg('user-b'));
    });

    it('applies config overrides (customization changes the render)', () => {
      const light = avatarSvg('seed', { skinColor: SKIN_TONES[0].id });
      const deep = avatarSvg('seed', { skinColor: SKIN_TONES[SKIN_TONES.length - 1].id });
      expect(light).not.toEqual(deep);
    });

    it('falls back to a stable default when seed is empty', () => {
      expect(avatarSvg('')).toEqual(avatarSvg(''));
      expect(avatarSvg('')).toContain('<svg');
    });
  });

  describe('avatarCacheKey', () => {
    it('is stable for identical inputs and varies by config', () => {
      const a = avatarCacheKey('seed', { top: HAIR_STYLES[0].id });
      const b = avatarCacheKey('seed', { top: HAIR_STYLES[0].id });
      const c = avatarCacheKey('seed', { top: HAIR_STYLES[1].id });
      expect(a).toEqual(b);
      expect(a).not.toEqual(c);
    });

    it('distinguishes auto (no config) from customized', () => {
      expect(avatarCacheKey('seed')).toContain('auto');
      expect(avatarCacheKey('seed', { eyes: EYES[0].id })).not.toContain('auto');
    });
  });

  describe('randomConfig', () => {
    it('returns valid catalog ids for every trait', () => {
      const cfg = randomConfig();
      expect(SKIN_TONES.map((o) => o.id)).toContain(cfg.skinColor);
      expect(HAIR_STYLES.map((o) => o.id)).toContain(cfg.top);
      expect(HAIR_COLORS.map((o) => o.id)).toContain(cfg.hairColor);
      expect(CLOTHING.map((o) => o.id)).toContain(cfg.clothing);
      expect(CLOTHES_COLORS.map((o) => o.id)).toContain(cfg.clothesColor);
      expect(EYES.map((o) => o.id)).toContain(cfg.eyes);
      expect(BACKGROUNDS.map((o) => o.id)).toContain(cfg.backgroundColor);
    });
  });
});
