// themify: off — fixed logo colors.
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** People360 lock-up: Purple IQ mark + "People360 / by Purple IQ" + orbit ring with people glyph. Scales with `height`. */
@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="logo" [style.--h.px]="height()">
      <img class="mark" src="purpleiq-mark.png" alt="" />
      <span class="words">
        <b class="name">People<em>360</em></b>
        @if (byline()) {
          <small>by Purple IQ</small>
        }
      </span>
      @if (orbit()) {
        <svg class="orbit" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <linearGradient id="p360-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#22d3c5" />
              <stop offset="0.55" stop-color="#1e9bff" />
              <stop offset="1" stop-color="var(--primary)" />
            </linearGradient>
            <linearGradient id="p360-badge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#2ee6c9" />
              <stop offset="1" stop-color="#0e8fa8" />
            </linearGradient>
          </defs>
          <path d="M33 22A46 46 0 0 1 72 15" fill="none" stroke="url(#p360-ring)" stroke-width="6" stroke-linecap="round" />
          <path d="M104 52A46 46 0 0 1 40 103" fill="none" stroke="url(#p360-ring)" stroke-width="6" stroke-linecap="round" />
          <path d="M40 103 28 104l8-13" fill="none" stroke="var(--primary)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
          <g transform="translate(76 4)">
            <rect width="34" height="34" rx="10" fill="url(#p360-badge)" />
            <circle cx="17" cy="12.5" r="5" fill="#ffffff" />
            <path d="M7.5 28c1.4-5.2 5-7.8 9.5-7.8s8.1 2.6 9.5 7.8" fill="#ffffff" />
            <circle cx="8" cy="15" r="3" fill="#ffffff" opacity=".7" />
            <circle cx="26" cy="15" r="3" fill="#ffffff" opacity=".7" />
          </g>
        </svg>
      }
    </span>
  `,
  styles: `
    :host { display: inline-block; }
    .logo { --h: 64px; position: relative; display: inline-flex; align-items: center; gap: calc(var(--h) * 0.14); height: var(--h); }
    .mark { height: var(--h); width: auto; }
    .words { display: flex; flex-direction: column; line-height: 1; padding-right: calc(var(--h) * 0.2); }
    .name { font-size: calc(var(--h) * 0.56); font-weight: 800; letter-spacing: -0.03em; color: var(--text); }
    .name em { font-style: normal; color: var(--primary); }
    small { margin-top: calc(var(--h) * 0.06); font-size: calc(var(--h) * 0.27); font-weight: 500; color: var(--text); }
    .orbit { position: absolute; right: calc(var(--h) * -0.42); top: 50%; width: calc(var(--h) * 1.35); height: calc(var(--h) * 1.35); transform: translateY(-58%); pointer-events: none; }
  `,
})
export class BrandLogo {
  readonly height = input(64);
  readonly byline = input(true);
  readonly orbit = input(true);
}
