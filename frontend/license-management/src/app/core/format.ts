import { HttpErrorResponse } from '@angular/common/http';

const DAY = 86_400_000;

/** Whole days from now until the date (negative = past). */
export function daysLeft(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.ceil((t - now) / DAY);
}

/** yyyy-mm-dd for <input type="date">. */
export function toDateInput(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

/** <input type="date"> value → ISO UTC (start of day, or end of day for "until" dates). */
export function fromDateInput(v: string, endOfDay = false): string {
  return new Date(`${v}T${endOfDay ? '23:59:59' : '00:00:00'}Z`).toISOString();
}

export function addYears(d: Date, years: number): Date {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + years);
  return x;
}

/** Best human-readable message from an API error (RFC 7807 problem JSON or plain text). */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the License API. Is it running?';
    const body = err.error;
    if (body && typeof body === 'object') {
      const b = body as { detail?: string; title?: string; errors?: Record<string, string[]> };
      if (b.errors) return Object.values(b.errors).flat().join(' ');
      if (b.detail || b.title) return b.detail || b.title!;
    }
    if (typeof body === 'string' && body) return body;
    if (err.status === 403) return 'You do not have permission to do that.';
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
