import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { UI } from '../../shared/ui';
import { EmergencyStore } from './emergency.data';

export const INCIDENT_TYPES = ['Fire Alarm', 'Gas Leak', 'Bomb Threat', 'Earthquake', 'Chemical Spill', 'Severe Weather', 'Medical Emergency', 'Active Threat'];
export const TEMPLATES: Record<string, string> = {
  'Evacuate now': 'EMERGENCY: Leave the building immediately by the nearest exit. Do not use lifts. Go to your assigned muster point.',
  'Avoid area': 'Avoid Floor 1 Conference Room area. Use the West or North stairwells.',
  'Report to muster point': 'If you have evacuated, check in at your muster point with your warden or badge reader.',
  'All clear': 'ALL CLEAR: The emergency is over. You may return to the building.',
  'Shelter in place': 'Stay where you are, close doors and windows, and await further instructions.',
};

/** Trigger Evacuation and Broadcast Message dialogs, shared by emergency pages. Call open('trigger' | 'broadcast'). */
@Component({
  selector: 'app-emergency-modals',
  imports: [...UI],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (kind() === 'trigger') {
      <div class="g-overlay" (click)="kind.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); trigger(t.value, l.value, s.value)">
        <div class="modal-head"><h3>{{ store.drillMode() ? 'Start Evacuation Drill' : 'Trigger Evacuation' }}</h3><button type="button" class="close-btn" (click)="kind.set(null)">×</button></div>
        @if (store.evac() && !store.evac()!.endedAt) {<div class="warn">{{ store.evac()!.id }} is still in progress. Starting a new one will close it and reset the roll-call.</div>}
        <div class="form-grid">
          <label>Incident type<select #t class="input">@for (x of types; track x) {<option [value]="store.drillMode() ? 'Fire Drill' : x">{{ store.drillMode() ? 'Drill – ' + x : x }}</option>}</select></label>
          <label>Scope<select #s class="input"><option>Full Building Evacuation</option><option>Floor Evacuation</option><option>Zone Evacuation</option><option>Site-wide Evacuation</option></select></label>
          <label class="full">Location<input #l class="input" value="Head Office – Floor 1 (Conference Room)" required /></label>
        </div>
        <p class="muted">Sirens and PA will sound, all on-site people get Push + SMS, and the roll-call starts from the live RTLS headcount.</p>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="kind.set(null)">Cancel</button><button class="btn-danger" type="submit">{{ store.drillMode() ? 'Start Drill' : 'Trigger Evacuation' }}</button></div>
      </form>
    }
    @if (kind() === 'broadcast') {
      <div class="g-overlay" (click)="kind.set(null)"></div>
      <form class="g-modal" (submit)="$event.preventDefault(); send(tp.value, txt.value, a.value)">
        <div class="modal-head"><h3>Broadcast Message</h3><button type="button" class="close-btn" (click)="kind.set(null)">×</button></div>
        <div class="form-grid">
          <label>Template<select #tp class="input" (change)="txt.value = tpl[$any($event.target).value]">@for (k of tplKeys; track k) {<option [value]="k">{{ k }}</option>}</select></label>
          <label>Audience<select #a class="input"><option>Everyone on site</option><option>Yet to evacuate &amp; missing</option><option>Wardens &amp; responders</option></select></label>
          <label class="full">Message<textarea #txt class="input" rows="4">{{ tpl['Evacuate now'] }}</textarea></label>
        </div>
        <div class="chs">@for (c of channels; track c) {<label><input type="checkbox" [checked]="picked().includes(c)" (change)="flip(c)" />{{ c }}</label>}</div>
        <div class="form-actions"><button type="button" class="btn-ghost" (click)="kind.set(null)">Cancel</button><button class="btn-primary" type="submit" [disabled]="!picked().length">Send to {{ picked().length }} channel(s)</button></div>
      </form>
    }
    @if (msg()) {<div class="g-toast">{{ msg() }}</div>}
  `,
  styles: `
    .warn { padding: 10px 12px; border-radius: 8px; background: var(--kb-fef3c7); color: var(--kf-92400e); font-size: 13px; margin-bottom: 10px; }
    .btn-danger { height: 38px; padding: 0 18px; border: 0; border-radius: 8px; background: var(--kb-e11d2e); color: var(--kf-ffffff); font: inherit; font-weight: 600; cursor: pointer; }
    textarea.input { height: auto; padding: 8px 10px; font: inherit; resize: vertical; }
    .chs { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; margin: 10px 0; } .chs label { display: flex; gap: 6px; align-items: center; } .chs input { accent-color: var(--primary); }
  `,
})
export class EmergencyModals {
  protected readonly store = inject(EmergencyStore);
  protected readonly kind = signal<'trigger' | 'broadcast' | null>(null);
  protected readonly msg = signal<string | null>(null);
  protected readonly types = INCIDENT_TYPES;
  protected readonly tpl = TEMPLATES;
  protected readonly tplKeys = Object.keys(TEMPLATES);
  protected readonly channels = ['SMS', 'Push', 'Email', 'PA System', 'Desktop Pop-up', 'Digital Signage'];
  protected readonly picked = signal(['SMS', 'Push', 'PA System']);

  open(k: string) {
    this.kind.set(k as 'trigger' | 'broadcast');
  }
  protected flip(c: string) {
    this.picked.update((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  }
  protected trigger(type: string, location: string, scope: string) {
    const drill = this.store.drillMode();
    this.store.trigger({ type, location, scope, by: 'Demo login (Manual)', drill });
    this.kind.set(null);
    this.toast(drill ? 'Drill started · roll-call running' : 'Evacuation triggered · sirens, PA and notifications sent');
  }
  protected send(title: string, text: string, audience: string) {
    this.store.broadcast(title, text, this.picked(), audience);
    this.kind.set(null);
    this.toast(`“${title}” sent via ${this.picked().join(', ')}`);
  }
  private toast(m: string) {
    this.msg.set(m);
    setTimeout(() => this.msg.set(null), 2600);
  }
}
