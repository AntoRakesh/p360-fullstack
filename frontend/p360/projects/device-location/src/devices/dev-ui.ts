// Small shared pieces for the Device & Edge pages: device illustration, site floor map with pins, device details modal.
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UI } from '@p360/shared/ui';
import { Device, DeviceStore, DType, fmtSeen, fmtUptime, statusCls, TYPE_META } from './devices.data';

/* ---------- Device illustration (inline SVG, no external images) ---------- */
@Component({
  selector: 'app-dev-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size() * 0.8" viewBox="0 0 120 96" aria-hidden="true">
      <defs>
        <linearGradient id="dvg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--ka-ffffff)" /><stop offset="1" stop-color="var(--ka-e7e9f0)" /></linearGradient>
        <filter id="dvs" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="var(--ka-1e1b4b)" flood-opacity="0.18" /></filter>
      </defs>
      @switch (type()) {
        @case ('Access Point') {
          <rect x="18" y="8" width="84" height="78" rx="22" fill="url(#dvg)" stroke="var(--kl-d8dbe6)" filter="url(#dvs)" />
          <rect x="26" y="15" width="68" height="64" rx="17" fill="none" stroke="var(--kl-eceef4)" />
          <text x="60" y="38" text-anchor="middle" font-size="6.5" fill="var(--ka-9aa0b4)" font-family="Arial">◳ Extreme</text>
          <circle cx="60" cy="70" r="1.8" fill="var(--ka-22c55e)" />
        }
        @case ('Switch') {
          <rect x="6" y="32" width="108" height="30" rx="4" fill="var(--ka-3b3f52)" filter="url(#dvs)" />
          @for (i of ports; track i) {<rect [attr.x]="14 + i * 8" y="40" width="6" height="6" rx="1" fill="var(--ka-111827)" /><rect [attr.x]="14 + i * 8" y="49" width="6" height="6" rx="1" fill="var(--ka-111827)" /><circle [attr.cx]="17 + i * 8" cy="38" r=".9" [attr.fill]="i % 3 ? 'var(--ka-22c55e)' : 'var(--ka-f59e0b)'" />}
          <text x="104" y="58" text-anchor="end" font-size="5" fill="var(--ka-a5abc0)" font-family="Arial">EXTREME</text>
        }
        @case ('Camera') {
          <rect x="40" y="8" width="40" height="10" rx="3" fill="var(--ka-d6d9e3)" />
          <path d="M22 18h76v14a38 38 0 0 1-76 0z" fill="url(#dvg)" stroke="var(--kl-d1d5e0)" filter="url(#dvs)" />
          <circle cx="60" cy="40" r="17" fill="var(--ka-1f2433)" /><circle cx="60" cy="40" r="9" fill="var(--ka-0b0e17)" /><circle cx="56" cy="36" r="3" fill="var(--ka-4b5675)" />
        }
        @case ('IoT Sensor') {
          <rect x="30" y="10" width="60" height="76" rx="10" fill="url(#dvg)" stroke="var(--kl-d5d8e2)" filter="url(#dvs)" />
          <rect x="38" y="22" width="44" height="26" rx="4" fill="var(--ka-10172a)" />
          <text x="60" y="40" text-anchor="middle" font-size="12" fill="var(--ka-5eead4)" font-family="Arial" font-weight="700">23.4°</text>
          <circle cx="60" cy="66" r="6" fill="none" stroke="var(--kl-c7cad6)" stroke-width="2" />
        }
        @case ('Gateway') {
          <rect x="34" y="6" width="5" height="34" rx="2" fill="var(--ka-4b5263)" /><rect x="81" y="6" width="5" height="34" rx="2" fill="var(--ka-4b5263)" />
          <rect x="14" y="36" width="92" height="48" rx="8" fill="url(#dvg)" stroke="var(--kl-d1d5e0)" filter="url(#dvs)" />
          <circle cx="28" cy="72" r="2" fill="var(--ka-22c55e)" /><circle cx="36" cy="72" r="2" fill="var(--ka-3b82f6)" /><circle cx="44" cy="72" r="2" fill="var(--ka-f59e0b)" />
          <text x="94" y="52" text-anchor="end" font-size="6" fill="var(--ka-9aa0b4)" font-family="Arial">UG</text>
        }
        @default {
          <rect x="36" y="6" width="48" height="84" rx="8" fill="var(--ka-2b3042)" filter="url(#dvs)" />
          <rect x="44" y="16" width="32" height="22" rx="3" fill="var(--ka-0f172a)" /><circle cx="60" cy="60" r="10" fill="none" stroke="var(--kl-7c8aa8)" stroke-width="2" />
          <circle cx="60" cy="80" r="2" fill="var(--ka-22c55e)" />
        }
      }
    </svg>
  `,
  styles: `:host { display: inline-flex; }`,
})
export class DevArt {
  readonly type = input.required<DType>();
  readonly size = input(110);
  protected readonly ports = Array.from({ length: 10 }, (_, i) => i);
}

/* ---------- Site floor map with device pins ---------- */
@Component({
  selector: 'app-dev-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map" [style.height.px]="height()">
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        <g [attr.transform]="'translate(' + (100 - 100 * zoom()) + ' ' + (100 - 100 * zoom()) + ') scale(' + zoom() + ')'">
          <rect x="0" y="0" width="200" height="200" fill="var(--ka-eef2f8)" />
          <g fill="var(--ka-f9fbff)" stroke="var(--kl-c7cfdd)" stroke-width="1.1">
            <rect x="6" y="6" width="56" height="44" /><rect x="62" y="6" width="44" height="44" /><rect x="106" y="6" width="88" height="44" />
            <rect x="6" y="50" width="40" height="62" /><rect x="46" y="66" width="70" height="46" /><rect x="116" y="50" width="78" height="62" />
            <rect x="6" y="112" width="56" height="82" /><rect x="62" y="130" width="64" height="64" /><rect x="126" y="112" width="68" height="82" />
          </g>
          <g stroke="var(--kl-dbe2ee)" stroke-width=".6">
            @for (i of grid; track i) {<line [attr.x1]="i" y1="0" [attr.x2]="i" y2="200" /><line x1="0" [attr.y1]="i" x2="200" [attr.y2]="i" />}
          </g>
          <g fill="var(--ka-e4eaf3)"><rect x="14" y="14" width="14" height="8" rx="1" /><rect x="70" y="14" width="10" height="20" rx="1" /><rect x="132" y="66" width="22" height="10" rx="1" /><rect x="140" y="130" width="40" height="10" rx="1" /><rect x="74" y="146" width="12" height="30" rx="1" /></g>
          @for (p of pins(); track p.id) {
            <g class="pin" [attr.transform]="'translate(' + p.x * 2 + ' ' + p.y * 2 + ') scale(' + 1 / zoom() + ')'" (click)="pick.emit(p.id)">
              <path d="M0 0c-4-5-7-8.5-7-12a7 7 0 0 1 14 0c0 3.5-3 7-7 12z" [attr.fill]="p.id === selected() ? 'var(--ka-2563eb)' : color(p.status)" stroke="var(--kl-ffffff)" stroke-width="1.4" />
              <circle cy="-12" r="2.6" fill="var(--ka-ffffff)" />
              <title>{{ p.name }} · {{ p.status }}</title>
            </g>
          }
        </g>
      </svg>
      @if (sel(); as s) {
        <div class="callout" [style.left.%]="clampX(s.x)" [style.top.%]="clampY(s.y)">
          <b>{{ s.name.replace('-01', '') }}</b><span [class]="'st ' + cls(s.status)">{{ s.status }}</span><small>{{ s.site === 'HQ' ? 'Building A' : s.site }} - {{ s.location.includes('Floor') ? s.location.split(' - ').pop() : s.location }}</small>
        </div>
      }
      <div class="zoom"><button (click)="zoom.set(Math.min(2.4, zoom() + 0.3))" aria-label="Zoom in">+</button><button (click)="zoom.set(Math.max(1, zoom() - 0.3))" aria-label="Zoom out">−</button></div>
    </div>
  `,
  styles: `
    .map { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid var(--kl-e3e7f0); background: var(--kb-eef2f8); }
    svg { width: 100%; height: 100%; display: block; }
    .pin { cursor: pointer; } .pin:hover path { filter: brightness(1.15); }
    .callout { position: absolute; transform: translate(4px, -100%); margin-top: -14px; background: var(--kb-ffffff); border-radius: 6px; box-shadow: 0 6px 18px rgba(20,20,60,.18); padding: 6px 9px; display: flex; flex-direction: column; font-size: 10px; line-height: 1.35; pointer-events: none; white-space: nowrap; }
    .callout b { font-size: 10.5px; } .st.green { color: var(--kf-16a34a); } .st.red { color: var(--kf-dc2626); } .st.amber { color: var(--kf-d97706); } .st.grey { color: var(--kf-64748b); } .callout small { color: var(--kf-4b4f6b); }
    .zoom { position: absolute; right: 6px; top: 6px; display: flex; flex-direction: column; background: var(--kb-ffffff); border-radius: 6px; box-shadow: 0 2px 8px rgba(20,20,60,.12); overflow: hidden; }
    .zoom button { width: 24px; height: 24px; border: 0; background: var(--kb-ffffff); cursor: pointer; font-size: 15px; color: var(--kf-4b4f6b); } .zoom button + button { border-top: 1px solid var(--kl-eef0f5); }
  `,
})
export class DevMap {
  protected readonly Math = Math;
  readonly devices = input.required<Device[]>();
  readonly selected = input<string | null>(null);
  readonly height = input(206);
  readonly pick = output<string>();
  protected readonly zoom = signal(1);
  protected readonly pins = computed(() => this.devices());
  protected readonly sel = computed(() => this.devices().find((d) => d.id === this.selected()) ?? null);
  protected readonly grid = [25, 50, 75, 100, 125, 150, 175];
  protected readonly cls = statusCls;
  protected color(s: string) {
    return s === 'Online' ? 'var(--ka-22c55e)' : s === 'Offline' ? 'var(--ka-ef4444)' : s === 'Maintenance' ? 'var(--ka-f59e0b)' : 'var(--ka-94a3b8)';
  }
  private pos(v: number) {
    return 50 + (v - 50) * this.zoom();
  }
  protected clampX(x: number) {
    return Math.min(38, Math.max(4, this.pos(x)));
  }
  protected clampY(y: number) {
    return Math.min(96, Math.max(34, this.pos(y)));
  }
}

/* ---------- Device details modal (used by several pages) ---------- */
@Component({
  selector: 'app-dev-details',
  imports: [...UI, DevArt],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dev(); as d) {
      <div class="g-overlay" (click)="closed.emit()"></div>
      <div class="g-modal wide">
        <div class="modal-head">
          <div class="mh"><span class="ti" [style.background]="meta(d).color"><app-icon [name]="meta(d).icon" [size]="18" /></span><div><h3>{{ d.name }}</h3><small class="muted">{{ d.type }} · {{ d.vendor }} {{ d.model }} · {{ d.serial }}</small></div><span [class]="'tag ' + cls(d.status)">{{ d.status }}</span></div>
          <button class="close-btn" (click)="closed.emit()">×</button>
        </div>
        <nav class="tabs">@for (t of tabs; track t) {<button [class.on]="tab() === t" (click)="tab.set(t)">{{ t }}</button>}</nav>
        @switch (tab()) {
          @case ('Overview') {
            <div class="ov">
              <div class="art"><app-dev-art [type]="d.type" [size]="150" /></div>
              <dl>
                <dt>IP Address</dt><dd>{{ d.ip }}</dd><dt>MAC Address</dt><dd>{{ d.mac }}</dd><dt>Site / Location</dt><dd>{{ d.site }} · {{ d.location }}</dd>
                <dt>Department</dt><dd>{{ d.dept }}</dd><dt>Owner</dt><dd>{{ d.owner }}</dd><dt>Edge Gateway</dt><dd>{{ d.gateway }}</dd>
                <dt>Firmware</dt><dd>{{ d.firmware }} @if (d.firmware !== meta(d).latest) {<span class="tag amber">{{ meta(d).latest }} available</span>}</dd>
                <dt>Config Profile</dt><dd>{{ d.profile }}</dd><dt>Installed</dt><dd>{{ d.installed }}</dd><dt>Warranty Until</dt><dd>{{ d.warranty }}</dd>
                <dt>Last Seen</dt><dd>{{ seen(d) }}</dd><dt>Uptime</dt><dd>{{ up(d) }}</dd>
              </dl>
            </div>
          }
          @case ('Metrics') {
            <div class="mx">
              <div class="m"><small>Health Score</small><b [style.color]="d.health >= 80 ? 'var(--ka-16a34a)' : d.health >= 50 ? 'var(--ka-d97706)' : 'var(--ka-dc2626)'">{{ d.health }}</b></div>
              <div class="m"><small>CPU</small><b>{{ d.cpu }}%</b></div><div class="m"><small>Memory</small><b>{{ d.mem }}%</b></div>
              <div class="m"><small>Temperature</small><b>{{ d.temp }}°C</b></div><div class="m"><small>Signal</small><b>{{ d.rssi }} dBm</b></div><div class="m"><small>Latency</small><b>{{ d.latency }} ms</b></div>
            </div>
            <app-line-chart [labels]="hours" [series]="trend(d)" [height]="200" suffix="%" />
          }
          @case ('Events') {
            <ul class="ev">
              @for (e of events(d); track $index) {<li><i [style.background]="e.c"></i><div><b>{{ e.t }}</b><small>{{ e.at }} · {{ e.src }}</small></div></li>}
            </ul>
          }
        }
        <div class="form-actions">
          <button class="btn-ghost" (click)="store.reboot(d)"><app-icon name="devices-power" [size]="15" />Reboot</button>
          <button class="btn-ghost" (click)="go('device-health-monitoring', d)"><app-icon name="activity" [size]="15" />Health</button>
          <button class="btn-ghost" (click)="go('device-replacement', d)"><app-icon name="refresh" [size]="15" />Replace</button>
          <button class="btn-primary" (click)="store.updateFirmware([d.id])" [disabled]="d.firmware === meta(d).latest"><app-icon name="devices-export" [size]="15" />Update Firmware</button>
        </div>
      </div>
    }
  `,
  styles: `
    .mh { display: flex; gap: 10px; align-items: center; } .mh h3 { margin: 0; } .mh div { display: flex; flex-direction: column; }
    .ti { width: 34px; height: 34px; border-radius: 8px; color: var(--kf-ffffff); display: grid; place-items: center; }
    .ov { display: grid; grid-template-columns: 200px 1fr; gap: 16px; margin-top: 14px; align-items: start; } .art { display: grid; place-items: center; padding: 20px 0; background: var(--kb-f7f8fc); border-radius: 10px; }
    dl { display: grid; grid-template-columns: 130px 1fr; gap: 8px 12px; margin: 0; font-size: 12.5px; } dt { color: var(--muted); } dd { margin: 0; display: flex; gap: 6px; align-items: center; }
    .mx { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 14px 0; } .m { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; } .m small { color: var(--muted); font-size: 11px; } .m b { font-size: 18px; }
    .ev { list-style: none; padding: 0; margin: 14px 0 0; } .ev li { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--kl-f0f1f6); font-size: 12.5px; } .ev i { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; } .ev div { display: flex; flex-direction: column; } .ev small { color: var(--muted); }
  `,
})
export class DevDetails {
  protected readonly store = inject(DeviceStore);
  private readonly router = inject(Router);
  readonly dev = input<Device | null>(null);
  readonly closed = output<void>();
  protected readonly tabs = ['Overview', 'Metrics', 'Events'];
  protected readonly tab = signal('Overview');
  protected readonly cls = statusCls;
  protected readonly hours = ['04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00', '00:00', '02:00'];
  protected meta(d: Device) {
    return TYPE_META[d.type];
  }
  protected seen(d: Device) {
    return fmtSeen(d.seenAgo);
  }
  protected up(d: Device) {
    return fmtUptime(d.uptimeH);
  }
  protected trend(d: Device) {
    const k = d.id.length + d.cpu;
    return [
      { name: 'CPU', color: 'var(--ka-7c3aed)', values: this.hours.map((_, i) => Math.max(4, Math.round((d.cpu || 20) + Math.sin(i + k) * 12))), area: true },
      { name: 'Memory', color: 'var(--ka-10b981)', values: this.hours.map((_, i) => Math.round((d.mem || 40) + Math.cos(i / 2 + k) * 6)) },
    ];
  }
  protected events(d: Device) {
    const base = [
      { t: `Heartbeat received`, src: d.gateway, c: 'var(--ka-22c55e)', ago: d.seenAgo },
      { t: `Config profile "${d.profile}" verified`, src: 'Config Engine', c: 'var(--ka-3b82f6)', ago: d.seenAgo + 95 },
      { t: `Firmware ${d.firmware} installed`, src: 'Firmware Service', c: 'var(--ka-8b5cf6)', ago: d.seenAgo + 1440 * 4 },
      { t: 'Device registered in inventory', src: 'Rex Kumar', c: 'var(--ka-64748b)', ago: d.seenAgo + 1440 * 120 },
    ];
    if (d.status === 'Offline') base.unshift({ t: 'Device went offline (no heartbeat)', src: 'Monitoring', c: 'var(--ka-ef4444)', ago: d.seenAgo - 15 });
    if (d.status === 'Maintenance') base.unshift({ t: 'Maintenance mode enabled', src: 'Rex Kumar', c: 'var(--ka-f59e0b)', ago: d.seenAgo - 5 });
    return base.map((e) => ({ ...e, at: fmtSeen(Math.max(0, e.ago)) }));
  }
  protected go(path: string, d: Device) {
    this.store.focusId.set(d.id);
    this.closed.emit();
    this.router.navigateByUrl('/device-edge-management/' + path);
  }
}
