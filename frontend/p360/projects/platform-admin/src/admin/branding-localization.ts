import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { UI } from '@p360/shared/ui';
import { AdminStore, Translation } from './admin.data';
import { ADMIN_CSS, AdminLogo, AdminSwitch, AdminToast } from './admin-ui';

const PRESETS = ['var(--ka-7c3aed)', 'var(--ka-2563eb)', 'var(--ka-0891b2)', 'var(--ka-16a34a)', 'var(--ka-ea580c)', 'var(--ka-db2777)', 'var(--ka-1e293b)', 'var(--ka-b45309)'];
const LANGS = [
  { name: 'English (US)', code: 'en', locale: 'en-US', rtl: false }, { name: 'Arabic', code: 'ar', locale: 'ar-AE', rtl: true },
  { name: 'Hindi', code: 'hi', locale: 'hi-IN', rtl: false }, { name: 'French', code: 'fr', locale: 'fr-FR', rtl: false },
];

@Component({
  selector: 'app-admin-branding-localization',
  imports: [...UI, AdminLogo, AdminSwitch, AdminToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-head title="Branding &amp; Localization" parent="Administration &amp; Configuration" parentLink="/administration-configuration" subtitle="Logo, colours and theme for your tenant, plus languages, formats and translations. Changes preview below before you publish.">
      <button class="btn-ghost" [disabled]="!dirty()" (click)="discard()">Discard</button>
      <button class="btn-primary" [disabled]="!dirty()" (click)="publish()"><app-icon name="admin-save" [size]="16" />Publish</button>
    </app-page-head>

    <section class="kpi-row">
      <app-kpi label="Languages Enabled" [value]="loc().languages.length" icon="admin-languages" color="var(--ka-0d9488)" [sub]="loc().rtl ? 'RTL supported' : 'LTR only'" />
      <app-kpi label="Translation Coverage" [value]="coverage() + '%'" icon="admin-globe" color="var(--ka-7c3aed)" [sub]="store.missingTranslations() + ' strings missing'" [subColor]="store.missingTranslations() ? 'var(--ka-d97706)' : 'var(--ka-16a34a)'" />
      <app-kpi label="Primary Colour" [value]="(b().primary.startsWith('#') ? b().primary : '#' + b().primary.slice(-7, -1)).toUpperCase()" icon="admin-palette" [color]="b().primary" [sub]="contrastOk() ? 'AA contrast with white' : 'low contrast'" />
      <app-kpi label="Default Language" [value]="store.org().language" icon="message" color="var(--ka-2563eb)" [sub]="store.org().timeZone" />
    </section>

    <section class="split">
      <div class="card">
        <h3 class="ct">Brand</h3>
        <div class="fgrid">
          <div class="field full"><span>Logo</span>
            <div class="logo"><app-admin-logo [src]="logo()" [size]="34" [color]="b().primary" />
              <label class="btn-ghost sm">Upload<input type="file" accept="image/*" hidden (change)="upload($event)" /></label>
              @if (logo()) {<button class="btn-ghost sm" (click)="logoDraft.set('')">Use default</button>}</div></div>
          <div class="field"><span>Primary colour</span><div class="sws">@for (c of presets; track c) {<button class="sw" [class.on]="b().primary === c" [style.background]="c" (click)="set('primary', c)" [attr.aria-label]="c"></button>}<input type="color" [value]="(b().primary.startsWith('#') ? b().primary : '#' + b().primary.slice(-7, -1))" (input)="set('primary', $any($event.target).value)" /></div></div>
          <div class="field"><span>Accent colour</span><div class="sws">@for (c of presets.slice(1, 6); track c) {<button class="sw" [class.on]="b().accent === c" [style.background]="c" (click)="set('accent', c)" [attr.aria-label]="c"></button>}<input type="color" [value]="(b().accent.startsWith('#') ? b().accent : '#' + b().accent.slice(-7, -1))" (input)="set('accent', $any($event.target).value)" /></div></div>
          <label class="field">Sidebar style<select class="select" [value]="b().sidebar" (change)="set('sidebar', $any($event.target).value)"><option>Dark purple</option><option>Midnight</option><option>Light</option></select></label>
          <label class="field">Corner radius<input type="range" min="4" max="18" [value]="b().radius" (input)="set('radius', +$any($event.target).value)" /></label>
          <label class="field">Font<select class="select" [value]="b().font" (change)="set('font', $any($event.target).value)"><option>Inter</option><option>Roboto</option><option>Georgia</option><option>system-ui</option></select></label>
          <label class="field">App name<input class="input" [value]="b().appName" (input)="set('appName', $any($event.target).value)" /></label>
          <label class="field full">Login page title<input class="input" [value]="b().loginTitle" (input)="set('loginTitle', $any($event.target).value)" /></label>
          <label class="field full">Email footer<input class="input" [value]="b().emailFooter" (input)="set('emailFooter', $any($event.target).value)" /></label>
        </div>
      </div>

      <div class="card">
        <div class="ch"><h3>Live Preview</h3><div class="seg">@for (l of enabledLangs(); track l.code) {<button [class.on]="pv() === l.code" (click)="pv.set(l.code)">{{ l.code.toUpperCase() }}</button>}</div></div>
        <div class="pv" [style.font-family]="b().font" [attr.dir]="pvLang().rtl && loc().rtl ? 'rtl' : 'ltr'" [style.--r.px]="b().radius">
          <div class="pside" [style.background]="sideBg()"><app-admin-logo [src]="logo()" [size]="18" color="var(--ka-ffffff)" />
            @for (k of ['nav.commandCenter', 'nav.people', 'nav.attendance', 'nav.visitors', 'nav.emergency']; track k; let i = $index) {<span [class.on]="i === 3" [style.background]="i === 3 ? b().primary : null">{{ tr(k) }}</span>}</div>
          <div class="pmain">
            <div class="ptop"><b>{{ b().appName }}</b><span class="pav" [style.background]="b().accent">DL</span></div>
            <div class="pcard"><small>{{ tr('kiosk.welcome').replace('{site}', 'Head Office') }}</small><b>{{ num(1248) }}</b><small>{{ date() }}</small>
              <div class="pbtns"><span [style.background]="b().primary">{{ tr('action.approve') }}</span><span class="ghost" [style.color]="b().primary" [style.border-color]="b().primary">{{ tr('action.reject') }}</span></div></div>
            <div class="palert">⚠ {{ tr('alert.evacuate') }}</div>
          </div>
        </div>
        <div class="login" [style.background]="'linear-gradient(135deg,' + b().primary + ',' + b().accent + ')'"><div><app-admin-logo [src]="logo()" [size]="22" color="var(--ka-ffffff)" /><b>{{ b().loginTitle }}</b><span>Sign in with SSO</span></div></div>
        <small class="muted">Preview only — the live app changes after you publish.</small>
      </div>
    </section>

    <section class="split">
      <div class="card">
        <div class="ch"><h3>Translations</h3>
          <div class="toolbar"><label class="ck"><input type="checkbox" [checked]="onlyMissing()" (change)="onlyMissing.set(!onlyMissing())" />Only missing</label>
            <button class="btn-outline" [disabled]="!store.missingTranslations()" (click)="auto()"><app-icon name="sparkles" [size]="14" />Auto-translate missing ({{ store.missingTranslations() }})</button></div></div>
        <div class="tw"><table class="table">
          <thead><tr><th>Key</th><th>English</th>@for (l of transLangs(); track l.code) {<th>{{ l.name }}</th>}</tr></thead>
          <tbody>@for (t of rows(); track t.key) {<tr><td class="mono">{{ t.key }}</td><td>{{ t.en }}</td>
            @for (l of transLangs(); track l.code) {<td><input class="input ti" [class.miss]="!val(t, l.code)" [attr.dir]="l.rtl ? 'rtl' : 'ltr'" [value]="val(t, l.code)" placeholder="Missing" (change)="edit(t.key, l.code, $any($event.target).value)" /></td>}</tr>}</tbody>
        </table></div>
      </div>
      <div class="card">
        <h3 class="ct">Regional Settings</h3>
        <ul class="pol">@for (l of langs; track l.code) {<li><div><b>{{ l.name }}</b><small>{{ l.locale }}{{ l.rtl ? ' · right-to-left' : '' }}</small></div><app-admin-switch [on]="loc().languages.includes(l.name)" [disabled]="l.code === 'en'" (toggled)="toggleLang(l.name, $event)" /></li>}</ul>
        <div class="fgrid">
          <label class="field">Date format<select class="select" [value]="loc().dateFormat" (change)="setL('dateFormat', $any($event.target).value)"><option>DD MMM YYYY</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label>
          <label class="field">Number format<select class="select" [value]="loc().numberFormat" (change)="setL('numberFormat', $any($event.target).value)"><option>1,234.56</option><option>1.234,56</option><option>1 234,56</option></select></label>
          <label class="field">Calendar<select class="select" [value]="loc().calendar" (change)="setL('calendar', $any($event.target).value)"><option>Gregorian</option><option>Gregorian + Hijri</option></select></label>
          <label class="field">Currency<input class="input" [value]="store.tenant().currency" disabled /></label>
        </div>
        <ul class="pol"><li><div><b>Right-to-left layout for Arabic</b><small>Mirror navigation and tables</small></div><app-admin-switch [on]="loc().rtl" (toggled)="setL('rtl', $event)" /></li></ul>
      </div>
    </section>
    <app-admin-toast />
  `,
  styles: [ADMIN_CSS, `
    .logo { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px dashed var(--border); border-radius: 9px; } .logo app-admin-logo { margin-right: auto; }
    .sws { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .sw { width: 24px; height: 24px; border-radius: 6px; border: 2px solid var(--kl-ffffff); box-shadow: 0 0 0 1px var(--border); cursor: pointer; } .sw.on { box-shadow: 0 0 0 2px var(--text); }
    .sws input { width: 34px; height: 26px; border: 0; padding: 0; background: none; }
    .pv { display: grid; grid-template-columns: 130px 1fr; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; height: 230px; margin-bottom: 10px; }
    .pside { display: flex; flex-direction: column; gap: 4px; padding: 10px 8px; color: var(--kf-ffffff); font-size: 10.5px; } .pside span { padding: 5px 7px; border-radius: calc(var(--r) / 2); opacity: 0.85; } .pside span.on { opacity: 1; font-weight: 600; } .pside app-admin-logo { margin-bottom: 6px; }
    .pmain { background: var(--kb-f5f5fb); padding: 10px; display: flex; flex-direction: column; gap: 8px; } .ptop { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
    .pav { width: 22px; height: 22px; border-radius: 50%; color: var(--kf-ffffff); font-size: 9px; display: grid; place-items: center; }
    .pcard { background: var(--kb-ffffff); border-radius: var(--r); padding: 10px; display: flex; flex-direction: column; gap: 2px; font-size: 11px; } .pcard b { font-size: 20px; } .pcard small { color: var(--muted); }
    .pbtns { display: flex; gap: 6px; margin-top: 6px; } .pbtns span { color: var(--kf-ffffff); padding: 5px 10px; border-radius: calc(var(--r) / 1.5); font-size: 11px; font-weight: 600; } .pbtns .ghost { background: var(--kb-ffffff); border: 1px solid; }
    .palert { background: var(--kb-fef2f2); color: var(--kf-b91c1c); border-radius: var(--r); padding: 7px 10px; font-size: 11px; }
    .login { border-radius: 10px; height: 90px; display: grid; place-items: center; margin-bottom: 8px; } .login div { background: rgba(255,255,255,.14); color: var(--kf-ffffff); padding: 8px 14px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; } .login span { font-size: 10.5px; opacity: .85; }
    .tw { overflow: auto; max-height: 480px; } .mono { font-family: ui-monospace, monospace; font-size: 11px; white-space: nowrap; } .ti { width: 100%; min-width: 140px; padding: 5px 8px; font-size: 12px; font-weight: 400; } .ti.miss { border-color: var(--kl-fbbf24); background: var(--kb-fffbeb); }
    .ck { display: flex; align-items: center; gap: 5px; font-size: 12px; } .fgrid { margin: 10px 0; }
  `],
})
export class BrandingLocalization {
  protected readonly store = inject(AdminStore);
  protected readonly presets = PRESETS;
  protected readonly langs = LANGS;
  protected readonly b = signal({ ...this.store.branding() });
  protected readonly loc = signal({ ...this.store.localization(), languages: [...this.store.localization().languages] });
  protected readonly logoDraft = signal<string | null>(null);
  protected readonly pv = signal('en');
  protected readonly onlyMissing = signal(false);

  protected readonly logo = computed(() => {
    const d = this.logoDraft();
    if (d !== null) return d || null;
    const l = this.store.org().logo;
    return l && l !== 'none' ? l : null;
  });
  protected readonly dirty = computed(() => this.logoDraft() !== null || JSON.stringify(this.b()) !== JSON.stringify(this.store.branding()) || JSON.stringify(this.loc()) !== JSON.stringify(this.store.localization()));
  protected readonly enabledLangs = computed(() => LANGS.filter((l) => this.loc().languages.includes(l.name)));
  protected readonly transLangs = computed(() => this.enabledLangs().filter((l) => l.code !== 'en'));
  protected readonly pvLang = computed(() => LANGS.find((l) => l.code === this.pv()) ?? LANGS[0]);
  protected readonly coverage = computed(() => {
    const total = this.store.translations().length * Math.max(1, this.store.localization().languages.length - 1);
    return Math.round(((total - this.store.missingTranslations()) / total) * 100);
  });
  protected readonly rows = computed(() => this.store.translations().filter((t) => !this.onlyMissing() || this.transLangs().some((l) => !this.val(t, l.code))));
  protected readonly sideBg = computed(() => (this.b().sidebar === 'Light' ? 'var(--ka-64748b)' : this.b().sidebar === 'Midnight' ? 'var(--ka-0f172a)' : `linear-gradient(180deg, var(--ka-2a1065), ${this.b().primary})`));
  protected readonly contrastOk = computed(() => {
    const p = this.b().primary;
    const h = p.startsWith('#') ? p.slice(1) : p.slice(-7, -1);
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * bl + 0.05) >= 4.5;
  });
  protected val(t: Translation, code: string) {
    return (t as unknown as Record<string, string>)[code] ?? '';
  }
  protected tr(key: string) {
    const t = this.store.translations().find((x) => x.key === key);
    return (t && this.val(t, this.pv())) || t?.en || key;
  }
  protected num(n: number) {
    const f = this.loc().numberFormat;
    const s = n.toLocaleString('en-US');
    return f === '1.234,56' ? s.replace(/,/g, '.') : f === '1 234,56' ? s.replace(/,/g, ' ') : s;
  }
  protected date() {
    return new Date().toLocaleDateString(this.pvLang().locale, { day: '2-digit', month: 'short', year: 'numeric', weekday: 'long' });
  }
  protected set(k: string, v: unknown) {
    this.b.update((x) => ({ ...x, [k]: v }));
  }
  protected setL(k: string, v: unknown) {
    this.loc.update((x) => ({ ...x, [k]: v }));
  }
  protected toggleLang(name: string, on: boolean) {
    this.loc.update((x) => ({ ...x, languages: on ? [...x.languages, name] : x.languages.filter((l) => l !== name) }));
    if (!on && this.pvLang().name === name) this.pv.set('en');
  }
  protected upload(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => this.logoDraft.set(String(r.result));
    r.readAsDataURL(f);
  }
  protected edit(key: string, code: string, v: string) {
    this.store.translations.update((l) => l.map((t) => (t.key === key ? { ...t, [code]: v.trim() } : t)));
    this.store.toast(`Translation saved (${code.toUpperCase()}) · ${key}`);
  }
  protected auto() {
    const before = this.store.missingTranslations();
    this.store.autoTranslate();
    this.store.toast(`${before} strings translated · Tenant Health updated`);
  }
  protected discard() {
    this.b.set({ ...this.store.branding() });
    this.loc.set({ ...this.store.localization(), languages: [...this.store.localization().languages] });
    this.logoDraft.set(null);
  }
  protected publish() {
    const prev = this.store.branding();
    this.store.branding.set({ ...this.b() });
    this.store.localization.set({ ...this.loc() });
    if (this.logoDraft() !== null) this.store.org.update((o) => ({ ...o, logo: this.logoDraft() || null }));
    this.logoDraft.set(null);
    this.store.log('Updated', 'Branding', 'Logo and Theme', `Primary ${this.b().primary}, ${this.loc().languages.length} languages`, 'Branding', 'Info', `primary: ${prev.primary}`, `primary: ${this.b().primary}`);
    this.store.toast('Branding & localization published');
  }
}
