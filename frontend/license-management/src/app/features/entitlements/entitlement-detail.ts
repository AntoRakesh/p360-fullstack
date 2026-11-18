import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { addYears, errorMessage, fromDateInput, saveBlob, toDateInput } from '../../core/format';
import { Capacity, Catalog, Entitlement, InstallKey, RenewInput, TIERS, Tier } from '../../core/models';
import { Dialog } from '../../shared/dialog';
import { Icon } from '../../shared/icon';
import { Badge, DaysLeft } from '../../shared/state-badge';
import { CapacityPicker } from './capacity-picker';
import { ModulePicker, defaultModules } from './module-picker';

type StateAction = 'suspend' | 'resume' | 'revoke';

@Component({
  selector: 'app-entitlement-detail',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, Badge, DaysLeft, Dialog, Icon, ModulePicker, CapacityPicker],
  templateUrl: './entitlement-detail.html',
})
export class EntitlementDetail {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  /** Route param :id and ?created=1, bound via withComponentInputBinding. */
  readonly id = input.required<string>();
  readonly created = input<string>();

  protected readonly tiers = TIERS;
  protected readonly ent = signal<Entitlement | null>(null);
  protected readonly history = signal<Entitlement[]>([]);
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly moduleKeys = computed(() => this.ent()?.modules.map((m) => m.moduleKey) ?? []);
  protected readonly current = computed(() => this.history()[0] ?? null);
  protected readonly isCurrent = computed(() => !this.current() || this.current()?.id === this.ent()?.id);
  protected readonly canRenew = computed(() => {
    const s = this.ent()?.state;
    return this.isCurrent() && (s === 'Live' || s === 'Expired' || s === 'Suspended');
  });

  // ---- dialogs ----
  protected readonly stateDialog = signal<StateAction | null>(null);
  protected readonly reason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] });

  protected readonly renewOpen = signal(false);
  protected readonly renewChangePlan = signal(false);
  protected readonly renewOverride = signal(false);
  protected readonly renewModules = signal<string[]>([]);
  protected readonly renewCapacity = signal<Capacity>({});
  protected readonly renewForm = new FormGroup({
    validUntil: new FormControl('', { nonNullable: true, validators: Validators.required }),
    tier: new FormControl<Tier>('Professional', { nonNullable: true }),
    notes: new FormControl<string | null>(null),
  });

  protected readonly installKey = signal<InstallKey | null>(null);
  /** Full client DB connection string after "Show"; cleared when the page changes. */
  protected readonly clientDb = signal<string | null>(null);
  protected readonly copied = signal(false);

  constructor() {
    this.api.catalog().subscribe({ next: (c) => this.catalog.set(c), error: () => {} });
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private load(id: string): void {
    this.error.set(null);
    this.ent.set(null);
    this.clientDb.set(null);
    if (this.created()) this.notice.set('License issued and signed.');
    this.api.get(id).subscribe({
      next: (e) => {
        this.ent.set(e);
        this.api.history(e.subscriberCode).subscribe({ next: (h) => this.history.set(h), error: () => {} });
      },
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  // ---- state change ----
  protected openState(a: StateAction): void {
    this.reason.reset('');
    this.stateDialog.set(a);
  }

  protected confirmState(): void {
    const a = this.stateDialog();
    const e = this.ent();
    if (!a || !e) return;
    if (this.reason.invalid) return this.reason.markAsTouched();
    this.busy.set(true);
    this.api.changeState(e.id, a, this.reason.value.trim()).subscribe({
      next: (u) => {
        this.ent.set(u);
        this.stateDialog.set(null);
        this.notice.set(`License ${a === 'resume' ? 'resumed' : a + 'd'}.`);
        this.busy.set(false);
        this.api.history(u.subscriberCode).subscribe((h) => this.history.set(h));
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }

  // ---- renew ----
  protected openRenew(): void {
    const e = this.ent();
    if (!e) return;
    const base = new Date(Math.max(Date.now(), new Date(e.validUntil).getTime()));
    this.renewForm.reset({
      validUntil: toDateInput(addYears(base, 1)),
      tier: e.tier,
      notes: e.notes ?? null,
    });
    this.renewModules.set(this.moduleKeys());
    this.renewCapacity.set(e.capacity ?? {});
    this.renewChangePlan.set(false);
    this.renewOverride.set(false);
    this.renewOpen.set(true);
  }

  protected renewTier(t: Tier): void {
    this.renewForm.controls.tier.setValue(t);
    const c = this.catalog();
    if (!c) return;
    this.renewModules.set(defaultModules(c, t, this.renewModules()));
  }

  protected confirmRenew(): void {
    const e = this.ent();
    if (!e || this.renewForm.invalid) return this.renewForm.markAllAsTouched();
    const v = this.renewForm.getRawValue();
    const body: RenewInput = { validUntil: fromDateInput(v.validUntil, true), notes: v.notes?.trim() || null };
    if (this.renewChangePlan()) {
      if (this.renewModules().length === 0) {
        this.error.set('Select at least one module.');
        return;
      }
      body.tier = v.tier;
      body.capacity = this.renewCapacity();
      // keep per-module data (e.g. module end dates) for modules that stay
      const prev = new Map(e.modules.map((m) => [m.moduleKey, m]));
      body.modules = this.renewModules().map((k) => prev.get(k) ?? { moduleKey: k });
    }
    this.busy.set(true);
    this.api.renew(e.id, body).subscribe({
      next: (n) => {
        this.renewOpen.set(false);
        this.busy.set(false);
        this.notice.set(`Renewed as revision ${n.revision}. Signed file emailed to ${n.contactEmail}.`);
        this.router.navigate(['/entitlements', n.id]);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }

  // ---- file + install key ----
  protected download(): void {
    const e = this.ent();
    if (!e) return;
    this.api.downloadFile(e.id).subscribe({
      next: (b) => saveBlob(b, `${e.subscriberCode}-r${e.revision}.entl`),
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected toggleClientDb(): void {
    const e = this.ent();
    if (!e) return;
    if (this.clientDb()) return this.clientDb.set(null);
    this.api.revealClientDb(e.id).subscribe({
      next: (r) => this.clientDb.set(r.connectionString),
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected generateKey(): void {
    const e = this.ent();
    if (!e) return;
    this.busy.set(true);
    this.api.installKey(e.id).subscribe({
      next: (k) => {
        this.installKey.set(k);
        this.copied.set(false);
        this.ent.update((x) => (x ? { ...x, installKeyPrefix: k.keyPrefix } : x));
        this.busy.set(false);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }

  protected async copyKey(): Promise<void> {
    const k = this.installKey();
    if (!k) return;
    try {
      await navigator.clipboard.writeText(k.apiKey);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }
}
