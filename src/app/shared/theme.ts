import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type Accent = 'violet' | 'indigo' | 'blue' | 'teal' | 'emerald' | 'magenta' | 'graphite';
export type Mode = 'light' | 'dark' | 'system';

export const ACCENTS: { id: Accent; name: string; swatch: string }[] = [
  { id: 'violet', name: 'Violet', swatch: 'oklch(0.541 0.247 292.7)' },
  { id: 'indigo', name: 'Indigo', swatch: 'oklch(0.541 0.235 272)' },
  { id: 'blue', name: 'Ocean', swatch: 'oklch(0.541 0.21 255)' },
  { id: 'teal', name: 'Teal', swatch: 'oklch(0.541 0.148 192)' },
  { id: 'emerald', name: 'Emerald', swatch: 'oklch(0.541 0.153 158)' },
  { id: 'magenta', name: 'Magenta', swatch: 'oklch(0.541 0.222 340)' },
  { id: 'graphite', name: 'Graphite', swatch: 'oklch(0.45 0.03 265)' },
];

const KEY = 'p360.theme';

function load(): { accent: Accent; mode: Mode } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { accent: v.accent ?? 'violet', mode: v.mode ?? 'light' };
  } catch {
    return { accent: 'violet', mode: 'light' };
  }
}

/** Accent + light/dark mode. Writes data-theme / data-mode on <html>; styles.scss + theme-palette.scss do the rest. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly mq = this.doc.defaultView?.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(!!this.mq?.matches);

  readonly accent = signal<Accent>(load().accent);
  readonly mode = signal<Mode>(load().mode);
  readonly dark = computed(() => (this.mode() === 'system' ? this.systemDark() : this.mode() === 'dark'));

  private first = true;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.mq?.addEventListener('change', (e) => this.systemDark.set(e.matches));
    effect(() => {
      const root = this.doc.documentElement;
      const accent = this.accent();
      const dark = this.dark();
      if (!this.first) {
        root.classList.add('theme-switching');
        clearTimeout(this.timer);
        this.timer = setTimeout(() => root.classList.remove('theme-switching'), 450);
      }
      this.first = false;
      root.dataset['theme'] = accent;
      root.dataset['mode'] = dark ? 'dark' : 'light';
      try {
        localStorage.setItem(KEY, JSON.stringify({ accent, mode: this.mode() }));
      } catch {}
    });
  }

  toggleDark() {
    this.mode.set(this.dark() ? 'light' : 'dark');
  }
}
