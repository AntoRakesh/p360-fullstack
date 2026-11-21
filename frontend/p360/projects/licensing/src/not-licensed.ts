import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '@p360/shared/icon';
import { MODULES } from '@p360/shared/modules';

/** Shown when a user opens a module that is not in the subscription. */
@Component({
  selector: 'app-not-licensed',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card locked">
      <span class="locked-icon"><app-icon name="key-round" [size]="34" /></span>
      <h2>{{ title() }} is not in your subscription</h2>
      <p>This module is a paid add-on. Ask your administrator to add it, or upgrade the plan.</p>
      <div class="actions">
        <a class="btn-primary" routerLink="/administration-configuration/subscription-licensing"
          >Subscription &amp; Licensing</a
        >
        <a class="btn-outline" routerLink="/command-center">Back to dashboard</a>
      </div>
    </section>
  `,
  styles: `
    .locked {
      min-height: 420px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 8px;
    }
    .locked-icon {
      width: 76px;
      height: 76px;
      border-radius: 20px;
      display: grid;
      place-items: center;
      color: var(--primary);
      background: var(--primary-soft);
      margin-bottom: 10px;
    }
    h2 {
      margin: 0;
      font-size: 20px;
    }
    p {
      margin: 0;
      color: var(--muted);
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 14px;
      flex-wrap: wrap;
      justify-content: center;
    }
  `,
})
export class NotLicensed {
  /** ?module= path, bound via withComponentInputBinding. */
  readonly module = input<string>();
  protected readonly title = computed(
    () => MODULES.find((m) => m.path === this.module())?.title ?? 'This module',
  );
}
