import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AppModule, SubModule } from '@p360/shared/modules';
import { Icon } from '@p360/shared/icon';

@Component({
  selector: 'app-module-page',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <div>
        <h1>{{ title() }}</h1>
        <p>
          @if (sub()) {
            {{ module().title }} ·
          }
          Module {{ module().no.toString().padStart(2, '0') }}
        </p>
      </div>
    </div>
    <section class="card empty">
      <span class="empty-icon"><app-icon [name]="icon()" [size]="34" /></span>
      <h2>{{ title() }}</h2>
      <p>Content for this {{ sub() ? 'section' : 'module' }} will be added soon.</p>
    </section>
  `,
  styles: `
    .empty {
      min-height: 420px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 6px;
    }
    .empty-icon {
      width: 76px;
      height: 76px;
      border-radius: 20px;
      display: grid;
      place-items: center;
      color: var(--primary);
      background: var(--primary-soft);
      margin-bottom: 10px;
    }
    h2 { margin: 0; font-size: 20px; }
    .empty p { margin: 0; color: var(--muted); }
  `,
})
export class ModulePage {
  readonly module = input.required<AppModule>();
  readonly sub = input<SubModule>();
  protected readonly title = computed(() => this.sub()?.title ?? this.module().title);
  protected readonly icon = computed(() => this.sub()?.icon ?? this.module().icon);
}
