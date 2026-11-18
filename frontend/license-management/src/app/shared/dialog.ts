import { Component, input, output } from '@angular/core';

/** In-page modal. Never use window.alert/confirm in this app. */
@Component({
  selector: 'app-dialog',
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="dlg-backdrop" (click)="closed.emit()"></div>
    <div class="dlg" role="dialog" aria-modal="true" [attr.aria-label]="title()" [class.wide]="wide()">
      <header class="dlg-head">
        <h3>{{ title() }}</h3>
        <button type="button" class="icon-btn" (click)="closed.emit()" aria-label="Close">✕</button>
      </header>
      <div class="dlg-body"><ng-content /></div>
      <footer class="dlg-foot"><ng-content select="[dlg-actions]" /></footer>
    </div>
  `,
})
export class Dialog {
  readonly title = input.required<string>();
  readonly wide = input(false);
  readonly closed = output<void>();
}
