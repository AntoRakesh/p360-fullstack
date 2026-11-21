import { DatePipe } from '@angular/common';
import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AppModule, MODULES } from '@p360/shared/modules';
import { AppState } from '@p360/shared/app-state';
import { Icon } from '@p360/shared/icon';
import { ACCENTS, ThemeService } from '@p360/shared/theme';
import { LicenseService } from '@p360/licensing';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, DatePipe],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  protected readonly state = inject(AppState);
  protected readonly theme = inject(ThemeService);
  protected readonly license = inject(LicenseService);
  protected readonly accents = ACCENTS;
  protected readonly modes = [
    { id: 'light', name: 'Light', icon: 'th-sun' },
    { id: 'dark', name: 'Dark', icon: 'th-moon' },
    { id: 'system', name: 'System', icon: 'th-monitor' },
  ] as const;
  /** Open top-bar dropdown. */
  protected readonly menu = signal<'site' | 'notif' | 'apps' | 'profile' | 'theme' | null>(null);
  protected readonly quickApps = [
    { title: 'Dashboard', icon: 'home', path: '/command-center' },
    { title: 'People', icon: 'users', path: '/people-identity' },
    { title: 'Attendance', icon: 'clock', path: '/time-attendance' },
    { title: 'Visitors', icon: 'user-plus', path: '/visitor-management' },
    { title: 'Access', icon: 'shield-check', path: '/physical-access-control' },
    { title: 'Emergency', icon: 'siren', path: '/emergency-mustering' },
    { title: 'RTLS', icon: 'map-pin', path: '/real-time-location' },
    { title: 'Reports', icon: 'file-chart', path: '/reports-analytics' },
    { title: 'Settings', icon: 'settings', path: '/administration-configuration' },
  ];
  protected readonly collapsed = signal(false);
  protected readonly mobileOpen = signal(false);
  protected readonly menuQuery = signal('');
  /** Parent module expanded in the sidebar (accordion: one at a time). */
  protected readonly open = signal<string | null>(null);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** Login renders full-screen without the app shell. Initial check uses location so the shell never flashes. */
  protected readonly isAuthPage = computed(() => {
    const u = this.url();
    return (u === '/' ? location.pathname : u).startsWith('/login') || (u === '/' && location.pathname === '/');
  });

  /** Modules filtered by the sidebar search; parent matches keep all children, child matches keep only matching children. */
  protected readonly modules = computed(() => {
    const q = this.menuQuery().trim().toLowerCase();
    if (!q) return MODULES;
    return MODULES.flatMap((m) => {
      if (m.title.toLowerCase().includes(q)) return [m];
      const kids = m.children?.filter((c) => c.title.toLowerCase().includes(q));
      return kids?.length ? [{ ...m, children: kids }] : [];
    });
  });

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.mobileOpen.set(false);
      // Auto-expand the parent of the active submodule.
      const parent = MODULES.find((m) => m.children && this.isActive(m));
      if (parent) this.open.set(parent.path);
    });
  }

  protected signOut() {
    this.menu.set(null);
    try {
      sessionStorage.removeItem('p360.auth');
    } catch {}
    this.router.navigateByUrl('/login');
  }

  protected toggleMenu(m: 'site' | 'notif' | 'apps' | 'profile' | 'theme') {
    this.menu.update((cur) => (cur === m ? null : m));
  }

  protected openDatePicker(input: HTMLInputElement) {
    this.menu.set(null);
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  protected toggleLive() {
    if (!this.state.isToday()) {
      this.state.date.set(new Date());
      this.state.liveEnabled.set(true);
    } else this.state.liveEnabled.update((v) => !v);
  }

  @HostListener('document:click')
  protected closeMenus() {
    this.menu.set(null);
  }

  protected pad(n: number) {
    return n.toString().padStart(2, '0');
  }

  protected isActive(m: AppModule) {
    return this.url().startsWith(`/${m.path}/`) || this.url() === `/${m.path}`;
  }

  protected isOpen(m: AppModule) {
    return this.open() === m.path || (!!this.menuQuery().trim() && !!m.children?.length);
  }

  /** Locked (unlicensed) module: open it so the license guard shows the "not in subscription" page. */
  protected openLocked(m: AppModule) {
    this.open.set(null);
    this.router.navigateByUrl(`/${m.children?.length ? m.path + '/' + m.children[0].path : m.path}`);
  }

  protected toggle(m: AppModule) {
    if (this.collapsed()) this.collapsed.set(false);
    this.open.update((p) => (p === m.path ? null : m.path));
  }

  protected toggleSidebar() {
    if (window.innerWidth <= 900) this.mobileOpen.update((v) => !v);
    else this.collapsed.update((v) => !v);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      document.getElementById('global-search')?.focus();
    }
  }
}
