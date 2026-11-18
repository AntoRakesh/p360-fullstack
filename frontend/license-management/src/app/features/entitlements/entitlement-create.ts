import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { addYears, errorMessage, fromDateInput, toDateInput } from '../../core/format';
import { ActivationInfo, Capacity, Catalog, EntitlementInput, HOSTING_MODES, HostingMode, TIERS, Tier } from '../../core/models';
import { Dialog } from '../../shared/dialog';
import { CapacityPicker, formatQuantity } from './capacity-picker';
import { ModulePicker, defaultModules } from './module-picker';

const TIER_BLURB: Record<Tier, string> = {
  Essential: 'Attendance, access control, visitors, dashboards and reports.',
  Professional: 'Adds patrol, meals, workforce, emergency. RTLS, twin and customer analytics as add-ons.',
  Enterprise: 'Every module, including custom workflows.',
};

@Component({
  selector: 'app-entitlement-create',
  imports: [ReactiveFormsModule, RouterLink, ModulePicker, CapacityPicker, Dialog],
  templateUrl: './entitlement-create.html',
})
export class EntitlementCreate {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly tiers = TIERS;
  protected readonly blurb = TIER_BLURB;
  protected readonly modes = HOSTING_MODES;
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly modules = signal<string[]>([]);
  protected readonly capacity = signal<Capacity>({});
  protected readonly override = signal(false);
  protected readonly activation = signal<ActivationInfo | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** License waiting for confirmation in the summary popup. */
  protected readonly pending = signal<EntitlementInput | null>(null);
  protected readonly fmtQty = formatQuantity;

  /** Selected modules grouped like the picker, for the summary popup. */
  protected readonly pendingGroups = computed(() => {
    const p = this.pending();
    const c = this.catalog();
    if (!p || !c) return [];
    const keys = new Set(p.modules.map((m) => m.moduleKey));
    const groups = new Map<string, string[]>();
    for (const m of c.modules) {
      if (!keys.has(m.key)) continue;
      groups.set(m.group, [...(groups.get(m.group) ?? []), m.title]);
    }
    return [...groups].map(([name, titles]) => ({ name, titles }));
  });


  protected readonly form = this.fb.group({
    subscriberCode: this.fb.control<string | null>(null, Validators.pattern(/^[A-Za-z0-9-]{3,40}$/)),
    customerName: this.fb.nonNullable.control('', Validators.required),
    contactEmail: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    tier: this.fb.nonNullable.control<Tier>('Professional'),
    validFrom: this.fb.nonNullable.control(toDateInput(new Date()), Validators.required),
    validUntil: this.fb.nonNullable.control(toDateInput(addYears(new Date(), 1)), Validators.required),
    minBuild: this.fb.control<string | null>(null),
    maxBuild: this.fb.control<string | null>(null),
    hostingMode: this.fb.nonNullable.control<HostingMode>('Cloud'),
    hostFingerprint: this.fb.control<string | null>(null),
    notes: this.fb.control<string | null>(null),
    clientDbConnectionString: this.fb.control<string | null>(null, Validators.maxLength(2000)),
  });

  constructor() {
    // Host fingerprint only applies to OnPrem: clear it when another mode is chosen.
    this.form.controls.hostingMode.valueChanges.pipe(takeUntilDestroyed()).subscribe((m) => {
      if (m !== 'OnPrem') this.form.controls.hostFingerprint.setValue(null);
    });
    this.api.catalog().subscribe({
      next: (c) => {
        this.catalog.set(c);
        this.applyTier(this.form.controls.tier.value);
      },
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  protected pickTier(t: Tier): void {
    this.form.controls.tier.setValue(t);
    this.applyTier(t);
  }

  /** Tier change re-fills the module selection. */
  private applyTier(t: Tier): void {
    const c = this.catalog();
    if (!c) return;
    this.modules.set(defaultModules(c, t, this.modules()));
  }

  protected onOverride(on: boolean): void {
    this.override.set(on);
    if (!on) this.applyTier(this.form.controls.tier.value);
  }

  protected onActreq(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.error.set(null);
    this.api.parseActivation(file).subscribe({
      next: (a) => {
        this.activation.set(a);
        this.form.patchValue({ hostFingerprint: a.hostFingerprint, hostingMode: 'OnPrem' });
        if (a.subscriberCode) this.form.patchValue({ subscriberCode: a.subscriberCode });
      },
      error: (e) => this.error.set(errorMessage(e)),
    });
    (ev.target as HTMLInputElement).value = '';
  }

  /** Step 1: validate and show the summary popup. Nothing is sent yet. */
  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please fix the highlighted fields.');
      return;
    }
    if (this.modules().length === 0) {
      this.error.set('Select at least one module.');
      return;
    }
    const v = this.form.getRawValue();
    if (v.hostingMode === 'OnPrem' && !v.hostFingerprint?.trim()) {
      this.error.set('OnPrem licenses need a host fingerprint. Use "Import .actreq" with the customer\'s activation request.');
      return;
    }
    if (v.validUntil <= v.validFrom) {
      this.error.set('"Valid until" must be after "Valid from".');
      return;
    }
    const blank = (s: string | null) => (s && s.trim() ? s.trim() : null);
    const input: EntitlementInput = {
      subscriberCode: blank(v.subscriberCode),
      customerName: v.customerName.trim(),
      contactEmail: v.contactEmail.trim(),
      tier: v.tier,
      modules: this.modules().map((moduleKey) => ({ moduleKey })),
      capacity: this.capacity(),
      validFrom: fromDateInput(v.validFrom),
      validUntil: fromDateInput(v.validUntil, true),
      minBuild: blank(v.minBuild),
      maxBuild: blank(v.maxBuild),
      hostingMode: v.hostingMode,
      hostFingerprint: v.hostingMode === 'OnPrem' ? blank(v.hostFingerprint) : null,
      notes: blank(v.notes),
      clientDbConnectionString: blank(v.clientDbConnectionString),
    };
    this.error.set(null);
    this.pending.set(input);
  }

  /** Step 2: admin confirmed in the popup. Issue and sign. */
  protected confirmIssue(): void {
    const input = this.pending();
    if (!input || this.busy()) return;
    this.busy.set(true);
    this.api.create(input).subscribe({
      next: (e) => this.router.navigate(['/entitlements', e.id], { queryParams: { created: 1 } }),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.pending.set(null);
        this.busy.set(false);
      },
    });
  }
}
