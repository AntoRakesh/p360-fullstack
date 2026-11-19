import { Catalog } from '../../core/models';
import { defaultModules } from './module-picker';

const catalog: Catalog = {
  product: 'People360',
  title: 'People360',
  modules: [
    { key: 'people-identity', title: 'People', group: 'Core', core: true },
    { key: 'time-attendance', title: 'T&A', group: 'Workforce', core: false },
    { key: 'real-time-location', title: 'RTLS', group: 'Location', core: false },
    { key: 'workflow-automation', title: 'Workflows', group: 'Platform', core: false },
  ],
  tiers: [
    {
      tier: 'Professional',
      title: 'Professional',
      inclusion: { 'time-attendance': 'Included', 'real-time-location': 'AddOn', 'workflow-automation': 'None' },
    },
  ],
  capacity: { registered: [50000, 200000, null], connected: [100, 500, 2500, 10000, 50000], autoRegistered: 50 },
};

describe('defaultModules', () => {
  it('turns on core + included, not add-ons or none', () => {
    expect(defaultModules(catalog, 'Professional')).toEqual(['people-identity', 'time-attendance']);
  });

  it('keeps a previously chosen add-on', () => {
    expect(defaultModules(catalog, 'Professional', ['real-time-location', 'workflow-automation'])).toEqual([
      'people-identity',
      'time-attendance',
      'real-time-location',
    ]);
  });
});

const asset: Catalog = {
  product: 'Asset360',
  title: 'Asset360',
  modules: [
    { key: 'asset-registry', title: 'Registry', group: 'Asset Management', core: false },
    { key: 'asset-tracking', title: 'Tracking', group: 'Operations', core: false },
    { key: 'condition-monitoring', title: 'Condition', group: 'Operations', core: false },
  ],
  tiers: [
    { tier: 'Essential', title: 'Asset360 Essential', inclusion: { 'asset-registry': 'Included', 'asset-tracking': 'None', 'condition-monitoring': 'None' } },
    { tier: 'Professional', title: 'Asset360 Professional', inclusion: { 'asset-registry': 'Included', 'asset-tracking': 'Included', 'condition-monitoring': 'AddOn' } },
  ],
  capacity: { registered: [50000, 200000, null], connected: [100, 500, 2500, 10000, 50000], autoRegistered: 50 },
};

describe('defaultModules per product', () => {
  it('uses the product catalog tiers', () => {
    expect(defaultModules(asset, 'Essential')).toEqual(['asset-registry']);
    expect(defaultModules(asset, 'Professional')).toEqual(['asset-registry', 'asset-tracking']);
  });

  it('drops modules of another product', () => {
    expect(defaultModules(asset, 'Professional', ['time-attendance', 'condition-monitoring'])).toEqual([
      'asset-registry',
      'asset-tracking',
      'condition-monitoring',
    ]);
  });
});
