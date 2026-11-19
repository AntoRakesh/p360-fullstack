import { TestBed } from '@angular/core/testing';
import { CapacityPicker } from './capacity-picker';

async function render(options: unknown) {
  const f = TestBed.createComponent(CapacityPicker);
  f.componentRef.setInput('options', options);
  await f.whenStable();
  return f;
}

function click(el: HTMLElement, index: number) {
  (el.querySelectorAll('input[type=checkbox]')[index] as HTMLInputElement).click();
}

describe('CapacityPicker DOM', () => {
  it('shows quantity dropdowns after ticking', async () => {
    const f = await render({ registered: [50000, 200000, null], connected: [100, 500, 2500, 10000, 50000], autoRegistered: 50 });
    const el = f.nativeElement as HTMLElement;
    click(el, 1);
    await f.whenStable();
    expect(el.querySelectorAll('select.qty').length).toBe(2);
    const reg = el.querySelectorAll('select.qty')[0] as HTMLSelectElement;
    expect(reg.value).toBe('50');
    expect([...reg.options].map((o) => o.text)).toEqual(['50', '50,000', '200,000', 'Unlimited']);
  });

  it('removes Registered 50 again when Connected is unticked', async () => {
    const f = await render(undefined);
    const el = f.nativeElement as HTMLElement;
    click(el, 1);
    await f.whenStable();
    click(el, 1);
    await f.whenStable();
    expect(el.querySelectorAll('select.qty').length).toBe(0);
  });

  it('still works when the catalog has no capacity options (old API)', async () => {
    const f = await render(undefined);
    const el = f.nativeElement as HTMLElement;
    click(el, 0);
    await f.whenStable();
    expect(el.querySelectorAll('select.qty').length).toBe(1);
  });

  it('Connected-only product: no Registered row, Connected alone adds nothing', async () => {
    const f = await render({ registered: null, connected: [100, 500, 2500, 10000, 50000], autoRegistered: null });
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('input[type=checkbox]').length).toBe(1);
    expect(el.textContent).not.toContain('Registered');
    click(el, 0);
    await f.whenStable();
    expect(el.querySelectorAll('select.qty').length).toBe(1);
    expect(f.componentInstance.value()).toEqual({ connected: { quantity: 100 } });
  });
});
