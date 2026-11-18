import { HttpErrorResponse } from '@angular/common/http';
import { daysLeft, errorMessage, fromDateInput } from './format';

describe('format', () => {
  it('daysLeft counts whole days, negative when past', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(daysLeft('2026-01-11T00:00:00Z', now)).toBe(10);
    expect(daysLeft('2025-12-30T00:00:00Z', now)).toBe(-2);
    expect(daysLeft(null, now)).toBeNull();
  });

  it('fromDateInput makes end-of-day UTC for until dates', () => {
    expect(fromDateInput('2026-05-01', true)).toBe('2026-05-01T23:59:59.000Z');
  });

  it('errorMessage reads problem JSON detail', () => {
    const err = new HttpErrorResponse({ status: 409, error: { title: 'Conflict', detail: 'Revision already exists' } });
    expect(errorMessage(err)).toBe('Revision already exists');
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toContain('Cannot reach');
  });
});
