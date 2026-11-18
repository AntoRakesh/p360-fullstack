import { ApplicationConfig, Injectable, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

/** Keep the browser tab title fixed as "People360" regardless of route. */
@Injectable()
class FixedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  override updateTitle(_snapshot: RouterStateSnapshot): void {
    this.title.setTitle('People360');
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: FixedTitleStrategy },
  ],
};
