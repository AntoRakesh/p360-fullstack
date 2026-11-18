import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { addYears, errorMessage, fromDateInput, toDateInput } from '../../core/format';
import { ActivationInfo, Catalog, EntitlementInput, HOSTING_MODES, HostingMode, TIERS, Tier } from '../../core/models';
import { FeaturesFields, featuresForm, featuresValue } from './features-form';
import { ModulePicker, defaultModules } from './module-picker';

const TIER_BLURB: Record<Tier, string> = {
  Essential: 'Attendance, access control, visitors. Basic analytics, limited API, 1 site.',
  Professional: 'Adds patrol, meals, workforce, emergency. RTLS, twin and customer analytics as add-ons.',
  Enterprise: 'Every module, custom workflows, unlimited sites.',
};

@Component({
  selector: 'app-entitlement-create',
  imports: [ReactiveFormsModule, RouterLink, ModulePicker, FeaturesFields],
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
  protected readonly override = signal(false);
  protected readonly activation = signal<ActivationInfo | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    subscriberCode: this.fb.control<string | null>(null, Validators.pattern(/^[A-Za-z0-9-]{3,40}$/)),
    customerName: this.fb.nonNullable.control('', Validators.required),
    contactEmail: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    tier: this.fb.nonNullable.control<Tier>('Professional'),
    seatLimit: this.fb.nonNullable.control(100, [Validators.required, Validators.min(1)]),
    deviceLimit: new FormControl<number | null>(null, Validators.min(1)),
    validFrom: this.fb.nonNullable.control(toDateInput(new Date()), Validators.required),
    validUntil: this.fb.nonNullable.control(toDateInput(addYears(new Date(), 1)), Validators.required),
    minBuild: this.fb.control<string | null>(null),
    maxBuild: this.fb.control<string | null>(null),
    hostingMode: this.fb.nonNullable.control<HostingMode>('Cloud'),
    hostFingerprint: this.fb.control<string | null>(null),
    notes: this.fb.control<string | null>(null),
    features: featuresForm(),
  });

  constructor() {
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

  /** Tier change re-fills modules and feature defaults. */
  private applyTier(t: Tier): void {
    const c = this.catalog();
    if (!c) return;
    this.modules.set(defaultModules(c, t, this.modules()));
    const def = c.tiers.find((x) => x.tier === t)?.features;
    if (def) this.form.controls.features.reset(def);
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

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please fix the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
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
      features: featuresValue(this.form.controls.features),
      seatLimit: Number(v.seatLimit),
      deviceLimit: v.deviceLimit ? Number(v.deviceLimit) : null,
      validFrom: fromDateInput(v.validFrom),
      validUntil: fromDateInput(v.validUntil, true),
      minBuild: blank(v.minBuild),
      maxBuild: blank(v.maxBuild),
      hostingMode: v.hostingMode,
      hostFingerprint: blank(v.hostFingerprint),
      notes: blank(v.notes),
    };
    this.busy.set(true);
    this.error.set(null);
    this.api.create(input).subscribe({
      next: (e) => this.router.navigate(['/entitlements', e.id], { queryParams: { created: 1 } }),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}
