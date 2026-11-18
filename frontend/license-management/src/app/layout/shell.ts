import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly mobileOpen = signal(false);
  protected readonly nav = [
    { path: '/dashboard', label: 'Dashboard', icon: 'home' },
    { path: '/entitlements', label: 'Entitlements', icon: 'key' },
    { path: '/entitlements/new', label: 'New license', icon: 'plus' },
    { path: '/audit', label: 'Audit log', icon: 'history' },
  ];
}
