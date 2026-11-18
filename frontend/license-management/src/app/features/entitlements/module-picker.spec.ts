import { Catalog } from '../../core/models';
import { defaultModules } from './module-picker';

const catalog: Catalog = {
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
      features: { analyticsLevel: 'Full', apiAccess: 'Full', apiReadOnly: false },
    },
  ],
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
