import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/format';
import { Dashboard, STATES, TIERS } from '../../core/models';
import { Badge, DaysLeft } from '../../shared/state-badge';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, Badge, DaysLeft],
  templateUrl: './dashboard.html',
})
export class DashboardPage {
  private readonly api = inject(ApiService);
  protected readonly router = inject(Router);
  protected readonly states = STATES;
  protected readonly tiers = TIERS;
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.api.dashboard().subscribe({ next: (d) => this.data.set(d), error: (e) => this.error.set(errorMessage(e)) });
  }

  protected total(rec: Partial<Record<string, number>> | undefined): number {
    return Object.values(rec ?? {}).reduce((a: number, b) => a + (b ?? 0), 0);
  }
}
