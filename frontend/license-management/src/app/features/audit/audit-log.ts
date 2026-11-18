import { DatePipe, JsonPipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/format';
import { AuditEvent, Paged } from '../../core/models';

@Component({
  selector: 'app-audit-log',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, JsonPipe],
  templateUrl: './audit-log.html',
})
export class AuditLog {
  private readonly api = inject(ApiService);
  /** ?subscriberCode= prefill (from detail page link). */
  readonly subscriberCode = input<string>();

  protected readonly pageSize = 50;
  protected readonly page = signal(1);
  protected readonly data = signal<Paged<AuditEvent> | null>(null);
  protected readonly open = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly filters = inject(FormBuilder).nonNullable.group({ subscriberCode: '', action: '' });

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(300)).subscribe(() => {
      this.page.set(1);
      this.load();
    });
  }

  ngOnInit(): void {
    if (this.subscriberCode()) this.filters.patchValue({ subscriberCode: this.subscriberCode() }, { emitEvent: false });
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.api.audit({ ...this.filters.getRawValue(), page: this.page(), pageSize: this.pageSize }).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  protected go(delta: number): void {
    this.page.update((p) => p + delta);
    this.load();
  }

  protected toggle(id: string): void {
    this.open.update((o) => (o === id ? null : id));
  }

  protected pages(d: Paged<AuditEvent>): number {
    return Math.max(1, Math.ceil(d.total / d.pageSize));
  }
}
