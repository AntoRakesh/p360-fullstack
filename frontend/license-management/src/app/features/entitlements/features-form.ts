import { Component, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AnalyticsLevel, ApiAccess, Features } from '../../core/models';

export type FeaturesForm = FormGroup<{
  analyticsLevel: FormControl<AnalyticsLevel>;
  apiAccess: FormControl<ApiAccess>;
  apiDailyCallLimit: FormControl<number | null>;
  apiReadOnly: FormControl<boolean>;
  maxSites: FormControl<number | null>;
}>;

export function featuresForm(f?: Features): FeaturesForm {
  return new FormGroup({
    analyticsLevel: new FormControl<AnalyticsLevel>(f?.analyticsLevel ?? 'Full', { nonNullable: true }),
    apiAccess: new FormControl<ApiAccess>(f?.apiAccess ?? 'Full', { nonNullable: true }),
    apiDailyCallLimit: new FormControl<number | null>(f?.apiDailyCallLimit ?? null, Validators.min(1)),
    apiReadOnly: new FormControl<boolean>(f?.apiReadOnly ?? false, { nonNullable: true }),
    maxSites: new FormControl<number | null>(f?.maxSites ?? null, Validators.min(1)),
  });
}

/** Normalizes empty number inputs to null. */
export function featuresValue(g: FeaturesForm): Features {
  const v = g.getRawValue();
  const n = (x: number | null) => (x === null || (x as unknown) === '' || Number.isNaN(Number(x)) ? null : Number(x));
  return { ...v, apiDailyCallLimit: n(v.apiDailyCallLimit), maxSites: n(v.maxSites) };
}

@Component({
  selector: 'app-features-fields',
  imports: [ReactiveFormsModule],
  template: `
    <div class="grid grid-3" [formGroup]="group()">
      <label class="field">
        <span>Analytics</span>
        <select formControlName="analyticsLevel">
          <option value="Basic">Basic: standard dashboards only</option>
          <option value="Full">Full: custom builder + AI insights</option>
        </select>
      </label>
      <label class="field">
        <span>API access</span>
        <select formControlName="apiAccess">
          <option value="Limited">Limited</option>
          <option value="Full">Full</option>
        </select>
      </label>
      <label class="field">
        <span>API calls per day</span>
        <input type="number" min="1" formControlName="apiDailyCallLimit" placeholder="Unlimited" />
      </label>
      <label class="field">
        <span>Max sites</span>
        <input type="number" min="1" formControlName="maxSites" placeholder="Unlimited" />
      </label>
      <div class="field">
        <span>API write access</span>
        <label class="check"><input type="checkbox" formControlName="apiReadOnly" /> Read-only API</label>
      </div>
    </div>
  `,
})
export class FeaturesFields {
  readonly group = input.required<FeaturesForm>();
}
