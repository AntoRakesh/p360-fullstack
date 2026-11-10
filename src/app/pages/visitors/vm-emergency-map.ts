// SVG campus map with muster points for Emergency Visitor Accountability.
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AccRow, Muster } from './vm-emergency.data';

const ZONE_XY: Record<string, [number, number]> = {
  'Main Entrance': [238, 138], Reception: [205, 122], 'Meeting Rooms – 3F': [180, 82], 'Visitor Lounge': [140, 112],
  'Executive Floor': [292, 92], Boardroom: [262, 120], Cafeteria: [318, 132], 'Parking Gate': [400, 160],
  'Plant Site – North Block': [455, 30], 'Restricted Zone': [372, 52], 'Meeting Rooms': [180, 82], 'Plant Floor': [455, 30], 'Server Room': [340, 100],
};

@Component({
  selector: 'vm-e-muster-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vm-e-map' },
  template: `
    <svg viewBox="0 0 480 190" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern [attr.id]="'vmeHatch' + uid" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--ka-fee2e2)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--kl-f87171)" stroke-width="2" /></pattern>
        <marker [attr.id]="'vmeArr' + uid" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="var(--ka-16a34a)" /></marker>
      </defs>
      <rect width="480" height="190" rx="8" fill="var(--ka-f8f7ff)" />
      @for (t of trees; track $index) { <g [attr.transform]="'translate(' + t[0] + ' ' + t[1] + ')'" fill="var(--ka-86c66b)"><circle cx="-2.5" cy="0" r="3" /><circle cx="2.5" cy="0" r="3" /><circle cx="0" cy="-2.5" r="3" /><circle cx="0" cy="2.5" r="3" /></g> }
      <rect x="55" y="12" width="370" height="150" rx="3" fill="var(--ka-eeebfb)" stroke="var(--kl-a7a1d9)" stroke-width="1.4" />
      <g stroke="var(--kl-c9c4ec)" stroke-width="1" fill="none">
        <rect x="65" y="22" width="70" height="40" /><rect x="65" y="70" width="40" height="40" /><rect x="110" y="70" width="40" height="30" />
        <rect x="330" y="80" width="40" height="30" /><rect x="375" y="80" width="40" height="40" /><rect x="65" y="120" width="60" height="32" />
        <rect x="300" y="122" width="60" height="30" /><path d="M140 22 V62 M240 70 V150 M160 110 H320" /><rect x="225" y="140" width="28" height="16" />
      </g>
      <rect x="150" y="22" width="180" height="40" rx="3" fill="var(--ka-ddd6fe)" stroke="var(--kl-a78bfa)" />
      <text x="240" y="47" text-anchor="middle" class="t-b">Main Campus – Tower A</text>
      <rect x="338" y="22" width="80" height="48" [attr.fill]="'url(#vmeHatch' + uid + ')'" stroke="var(--kl-ef4444)" stroke-width="1.2" (click)="zone.emit('Restricted Zone')" class="clk" />
      <path d="M378 32c4 6 9 9 9 16a9 9 0 0 1-18 0c0-4 2-6 4-8 0 3 2 5 3 5 0-5-1-9 2-13z" fill="var(--ka-ef4444)" />
      <g stroke="var(--kl-16a34a)" stroke-width="2" stroke-dasharray="5 4" fill="none">
        <path d="M228 132 H 96" [attr.marker-end]="'url(#vmeArr' + uid + ')'" />
        <path d="M118 132 V 46 H 96" [attr.marker-end]="'url(#vmeArr' + uid + ')'" />
        <path d="M252 132 H 360 V 118 H 386" [attr.marker-end]="'url(#vmeArr' + uid + ')'" />
        <path d="M352 132 V 82" [attr.marker-end]="'url(#vmeArr' + uid + ')'" />
      </g>
      <path d="M232 156 v-12 h12 v12 M235 156 v-9 M238 156 v-9 M241 156 v-9" stroke="var(--kl-334155)" stroke-width="1" fill="none" />
      <text x="240" y="174" text-anchor="middle" class="t-s">Main Entrance</text>
      @for (m of boxes(); track m.id) {
        <g class="mp clk" [class.on]="active() === m.id" [attr.transform]="'translate(' + m.x + ' ' + m.y + ')'" (click)="pick.emit(m.id)">
          <rect width="80" height="50" rx="6" fill="var(--ka-16a34a)" stroke="var(--kl-ffffff)" stroke-width="2" />
          <g fill="var(--ka-ffffff)" transform="translate(13 25)"><circle cx="0" cy="-6" r="4" /><path d="M-7 6a7 7 0 0 1 14 0z" /><circle cx="-8" cy="-3" r="2.6" opacity=".85" /><circle cx="8" cy="-3" r="2.6" opacity=".85" /></g>
          <text x="50" y="15" text-anchor="middle" class="t-w">Muster</text>
          <text x="50" y="28" text-anchor="middle" class="t-w">Point {{ m.id }}</text>
          <text x="50" y="42" text-anchor="middle" class="t-w">({{ m.total }})</text>
        </g>
      }
      @if (big()) {
        @for (z of pins(); track z.loc) {
          <g class="clk" [attr.transform]="'translate(' + z.x + ' ' + z.y + ')'" (click)="zone.emit(z.loc)">
            <circle r="9" fill="var(--ka-dc2626)" opacity=".18"><animate attributeName="r" values="6;11;6" dur="1.6s" repeatCount="indefinite" /></circle>
            <circle r="5.5" fill="var(--ka-dc2626)" stroke="var(--kl-ffffff)" stroke-width="1.4" />
            <text y="2.6" text-anchor="middle" class="t-n">{{ z.n }}</text>
            <text y="-9" text-anchor="middle" class="t-z">{{ z.label }}</text>
          </g>
        }
      }
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; height: 100%; display: block; }
    .t-b { font: 700 12px system-ui, sans-serif; fill: var(--ka-1e1b4b); }
    .t-s { font: 700 10px system-ui, sans-serif; fill: var(--ka-1e1b4b); }
    .t-w { font: 700 10.5px system-ui, sans-serif; fill: var(--ka-ffffff); }
    .t-n { font: 700 6.5px system-ui, sans-serif; fill: var(--ka-ffffff); }
    .t-z { font: 600 6px system-ui, sans-serif; fill: var(--ka-991b1b); paint-order: stroke; stroke: var(--kl-ffffff); stroke-width: 2px; }
    .clk { cursor: pointer; }
    .mp rect { transition: filter .15s; } .mp:hover rect { filter: brightness(1.1); }
    .mp.on rect { stroke: var(--kl-fbbf24); stroke-width: 3; }
  `,
})
export class VmEMusterMap {
  private static n = 0;
  protected readonly uid = ++VmEMusterMap.n;
  readonly rows = input.required<AccRow[]>();
  readonly big = input(false);
  readonly active = input<Muster | ''>('');
  readonly pick = output<Muster>();
  readonly zone = output<string>();
  protected readonly trees = [[100, 8], [470, 10], [30, 92], [470, 80], [50, 178], [140, 182], [430, 182], [300, 176]];
  protected readonly boxes = computed(() => {
    const pos: Record<Muster, [number, number]> = { A: [14, 20], B: [10, 104], C: [388, 92] };
    return (['A', 'B', 'C'] as Muster[]).map((id) => ({ id, x: pos[id][0], y: pos[id][1], total: this.rows().filter((r) => r.muster === id).length }));
  });
  protected readonly pins = computed(() => {
    const g = new Map<string, number>();
    for (const r of this.rows()) if (r.status === 'Unaccounted') g.set(r.location, (g.get(r.location) ?? 0) + 1);
    return [...g].map(([loc, n]) => {
      const [x, y] = ZONE_XY[loc] ?? [240, 100];
      return { loc, n, x, y, label: loc.replace(' – North Block', '').replace(' – 3F', '') };
    });
  });
}
