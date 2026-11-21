// Small shared pieces for the Training, Skills & Compliance pages.
import { ChangeDetectionStrategy, Component, Directive, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppState } from '@p360/shared/app-state';
import { BASE, daysUntil, fd, fmt, iso, Look, Person, PERSON, TrainingStore } from './training.data';

/** Illustrated head-and-shoulders portrait (no external photos). */
@Component({
  selector: 'app-trn-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" [attr.rx]="round() ? 20 : 6" fill="var(--ka-e8eaf0)" />
      @let l = look();
      @if (l.g === 'f' && !l.scarf) {
        <path d="M11 20c-1-9 3-13 9-13s10 4 9 13c0 5-1 9-2 11H13c-1-2-2-6-2-11z" [attr.fill]="l.hair" />
      }
      @if (l.scarf) {
        <path d="M10.5 21c0-8 4-12.5 9.5-12.5S29.5 13 29.5 21c0 4-1 7-3 9h-13c-2-2-3-5-3-9z" fill="var(--ka-6d28d9)" />
      }
      <path d="M5 40c0-6 5-10 10-10.5h10C30 30 35 34 35 40z" [attr.fill]="l.uni" />
      <path d="M17 29.5h6l-3 4z" fill="var(--ka-ffffff)" opacity=".85" />
      <rect x="17.4" y="24" width="5.2" height="6" rx="2" [attr.fill]="l.skin" />
      <ellipse cx="20" cy="18.5" rx="6.3" ry="7.4" [attr.fill]="l.skin" />
      @if (l.scarf) {
        <path d="M13 17c0-5 3-8.3 7-8.3s7 3.3 7 8.3c-1-3-3.5-4.6-7-4.6S14 14 13 17z" fill="var(--ka-7c3aed)" />
      } @else if (l.cap) {
        <path d="M13.2 15.5c0-5 3-7.6 6.8-7.6s6.8 2.6 6.8 7.6z" fill="var(--ka-1e293b)" />
        <path d="M12 15.3h16l-.5 1.6H12.5z" fill="var(--ka-0f172a)" />
        <circle cx="20" cy="11.6" r="1.3" fill="var(--ka-facc15)" />
      } @else if (l.g === 'm') {
        <path d="M13.6 17c-.4-5.6 2.6-8.4 6.4-8.4s6.9 2.8 6.4 8.4c-.6-2.6-2.2-4.2-6.4-4.4-4.2.2-5.8 1.8-6.4 4.4z" [attr.fill]="l.hair" />
      } @else {
        <path d="M13.6 18c-.3-6 2.7-8.8 6.4-8.8s6.7 2.8 6.4 8.8c-1.6-3.2-4-4.6-7.6-4.8-2.2.6-4 2-5.2 4.8z" [attr.fill]="l.hair" />
      }
      <circle cx="17.6" cy="19" r=".75" fill="var(--ka-1f2937)" /><circle cx="22.4" cy="19" r=".75" fill="var(--ka-1f2937)" />
      <path d="M18.3 22.4c1 .8 2.4.8 3.4 0" stroke="var(--kl-7c4a2d)" stroke-width=".7" fill="none" stroke-linecap="round" />
      @if (l.g === 'm' && !l.cap && l.hair === 'var(--ka-1f1a17)') {
        <path d="M15 21.5c1 3.5 3 4.8 5 4.8s4-1.3 5-4.8c-.6 1.2-2 1.6-5 1.6s-4.4-.4-5-1.6z" [attr.fill]="l.hair" opacity=".8" />
      }
    </svg>
  `,
  styles: `:host { display: inline-flex; flex-shrink: 0; line-height: 0; } svg { border-radius: inherit; }`,
})
export class TrnAvatar {
  readonly look = input.required<Look>();
  readonly size = input(28);
  readonly round = input(false);
}

/** Common helpers for the module pages (store, router, toast, formatting). */
@Directive()
export abstract class TrnPage {
  protected readonly store = inject(TrainingStore);
  protected readonly router = inject(Router);
  protected readonly app = inject(AppState);
  protected readonly base = BASE;
  protected readonly fmt = fmt;
  protected readonly fd = fd;
  protected readonly days = daysUntil;
  protected readonly toast = signal<string | null>(null);
  protected msg(m: string) {
    this.toast.set(m);
    setTimeout(() => this.toast() === m && this.toast.set(null), 2600);
  }
  protected go(slug: string, queryParams?: Record<string, string>) {
    this.router.navigate([`${BASE}/${slug}`], { queryParams });
  }
  protected person(id: string): Person {
    return PERSON.get(id) ?? { id, name: id, initials: '?', avatar: 'var(--ka-94a3b8)', dept: '—', role: '—', site: '—' };
  }
  protected course(id: string) {
    return this.store.courseById().get(id);
  }
}
export const enTag = (s: string) => (s === 'Completed' ? 'tag green' : s === 'Overdue' ? 'tag red' : s === 'In Progress' ? 'tag blue' : s === 'Waitlisted' ? 'tag grey' : 'tag amber');
export const certTag = (s: string) => (s === 'Valid' ? 'tag green' : s === 'Expiring' ? 'tag amber' : 'tag red');
export const isoIn = iso;
