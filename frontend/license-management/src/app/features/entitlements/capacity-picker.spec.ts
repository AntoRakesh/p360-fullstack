import { CapacityOptions } from '../../core/models';
import { applyConnected, formatQuantity } from './capacity-picker';

const opts: CapacityOptions = { registered: [50000, 200000, null], connected: [100, 500, 2500, 10000, 50000], autoRegistered: 50 };

describe('capacity rules', () => {
  it('Connected alone adds Registered 50 automatically', () => {
    const r = applyConnected({}, true, opts, false);
    expect(r.capacity).toEqual({ connected: { quantity: 100 }, registered: { quantity: 50 } });
    expect(r.autoAdded).toBe(true);
  });

  it('keeps an existing Registered choice when Connected is ticked', () => {
    const r = applyConnected({ registered: { quantity: null } }, true, opts, false);
    expect(r.capacity.registered).toEqual({ quantity: null });
    expect(r.autoAdded).toBe(false);
  });

  it('unticking Connected removes the auto-added Registered', () => {
    const on = applyConnected({}, true, opts, false);
    const off = applyConnected(on.capacity, false, opts, on.autoAdded);
    expect(off.capacity).toEqual({ connected: null, registered: null });
  });

  it('unticking Connected keeps a Registered the admin picked', () => {
    const off = applyConnected({ registered: { quantity: 200000 }, connected: { quantity: 500 } }, false, opts, false);
    expect(off.capacity.registered).toEqual({ quantity: 200000 });
  });

  it('formats quantities', () => {
    expect(formatQuantity(50000)).toBe('50,000');
    expect(formatQuantity(null)).toBe('Unlimited');
  });
});

const connectedOnly: CapacityOptions = { registered: null, connected: [100, 500, 2500, 10000, 50000], autoRegistered: null };

describe('capacity rules, Connected-only product (Environment360)', () => {
  it('Connected alone does not add Registered', () => {
    const r = applyConnected({}, true, connectedOnly, false);
    expect(r.capacity).toEqual({ connected: { quantity: 100 } });
    expect(r.autoAdded).toBe(false);
  });

  it('unticking Connected leaves nothing', () => {
    expect(applyConnected({ connected: { quantity: 500 } }, false, connectedOnly, false).capacity).toEqual({ connected: null });
  });
});
