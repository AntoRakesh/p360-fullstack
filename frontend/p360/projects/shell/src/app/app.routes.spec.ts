import { MODULES } from '@p360/shared/modules';
import { describe, expect, it } from 'vitest';
import { MODULE_SERVICE, SERVICES } from './app.routes';

describe('service libraries', () => {
  it('every module is owned by exactly one service', () => {
    const owned = SERVICES.flatMap((s) => s.SERVICE.modules);
    expect(new Set(owned).size).toBe(owned.length);
    expect(MODULES.map((m) => m.path).filter((p) => !MODULE_SERVICE[p])).toEqual([]);
    expect(owned.filter((p) => !MODULES.some((m) => m.path === p))).toEqual([]);
  });

  it('each service only registers pages for its own modules', () => {
    for (const { SERVICE, PAGES } of SERVICES) {
      const foreign = Object.keys(PAGES).filter((k) => !SERVICE.modules.includes(k.split('/')[0]));
      expect(foreign, SERVICE.key).toEqual([]);
    }
  });
});
