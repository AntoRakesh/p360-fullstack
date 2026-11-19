import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/format';
import { Entitlement, EntitlementState, HOSTING_MODES, HostingMode, PRODUCTS, Paged, Product, STATES, TIERS, Tier } from '../../core/models';
import { Badge, DaysLeft } from '../../shared/state-badge';

@Component({
  selector: 'app-entitlement-list',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, Badge, DaysLeft],
  templateUrl: './entitlement-list.html',
})
export class EntitlementList implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly router = inject(Router);

  // Query-param prefill (dashboard links) via withComponentInputBinding.
  readonly state = input<string>();
  readonly tier = input<string>();
  readonly product = input<string>();

  protected readonly products = PRODUCTS;
  protected readonly states = STATES;
  protected readonly tiers = TIERS;
  protected readonly modes = HOSTING_MODES;
  protected readonly pageSize = 20;
  protected readonly page = signal(1);
  protected readonly data = signal<Paged<Entitlement> | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly filters = inject(FormBuilder).nonNullable.group({
    search: '',
    product: '' as Product | '',
    state: '' as EntitlementState | '',
    tier: '' as Tier | '',
    hostingMode: '' as HostingMode | '',
  });

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(250)).subscribe(() => {
      this.page.set(1);
      this.load();
    });
  }

  ngOnInit(): void {
    this.filters.patchValue(
      {
        product: (this.product() ?? '') as Product | '',
        state: (this.state() ?? '') as EntitlementState | '',
        tier: (this.tier() ?? '') as Tier | '',
      },
      { emitEvent: false },
    );
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.api.list({ ...this.filters.getRawValue(), page: this.page(), pageSize: this.pageSize }).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  protected go(delta: number): void {
    this.page.update((p) => p + delta);
    this.load();
  }

  protected pages(d: Paged<Entitlement>): number {
    return Math.max(1, Math.ceil(d.total / d.pageSize));
  }
}
