import { afterEveryRender, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Keeps a <select [value]="..."> in sync after its @for options render.
 * Without this, the browser ignores a value set before the matching <option> exists.
 */
@Directive({ selector: 'select[value]' })
export class SelectValue {
  readonly value = input<unknown>();
  private readonly el = inject(ElementRef<HTMLSelectElement>).nativeElement as HTMLSelectElement;

  constructor() {
    afterEveryRender(() => {
      const v = String(this.value() ?? '');
      if (this.el.value !== v && [...this.el.options].some((o) => o.value === v)) this.el.value = v;
    });
  }
}
