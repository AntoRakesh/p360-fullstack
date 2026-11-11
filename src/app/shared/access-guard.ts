import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Read-only demo lock. Intercepts create / edit / delete / download / upload actions on every page
 * (capture phase, before the page's own handlers run) and shows an "Access denied" toast instead.
 *
 * Detection is by the clicked control's label (aria-label, title or text) and its icon name, plus
 * file pickers, drag-and-drop, programmatic file downloads and print.
 * Add `data-allow` to any element to exempt it.
 */

/** Words in a button/link label that mean the action is blocked. */
const BLOCKED_WORDS = [
  // create
  'add', 'new', 'create', 'register', 'invite', 'duplicate', 'clone', 'enroll', 'raise', 'post', 'insert', 'book', 'issue', 'generate',
  'use template', 'report incident', 'report hazard',
  // edit
  'edit', 'save', 'update', 'rename', 'modify', 'publish', 'submit', 'reorder', 'move',
  // delete
  'delete', 'remove', 'archive', 'revoke', 'deactivate',
  // download
  'export', 'download', 'print', 'csv', 'pdf', 'excel', 'xlsx',
  // upload
  'upload', 'import', 'attach', 'browse',
];
const WORD_RE = new RegExp(`\\b(${BLOCKED_WORDS.join('|')})\\b`, 'i');
/** Labels that contain a blocked word but are only view/navigation helpers. */
const SAFE_RE = /\b(filters?|zoom|view all|view reports|new joiners|what'?s new|duplicate detection|awaiting print|add-ons)\b|\d+\s*new\b|^saved$/i;
/** Icon names (the `name` of <app-icon>) that mean a blocked action. */
const ICON_RE = /(^|-)(edit|pencil|trash|delete|upload|import|export|download|save|plus)$/;
/** Icon-only detection applies to short labels; long ones are cards/rows, not action buttons. */
const ICON_LABEL_MAX = 22;

const ACTIONABLE = 'button, a, [role="button"], [role="menuitem"], label, input[type="submit"], input[type="button"]';
const EXEMPT = '.sidebar, .topbar, app-login, [data-allow]';

export const ACCESS_DENIED = { title: 'Access denied', text: 'Contact your administrator.' };

@Injectable({ providedIn: 'root' })
export class AccessGuard {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);

  /** Toast state: a counter so repeated denials restart the animation. */
  readonly toast = signal<{ id: number; what: string } | null>(null);
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    const d = this.doc;
    d.addEventListener('click', (e) => this.onClick(e), true);
    d.addEventListener('drop', (e) => this.onDrop(e), true);
    d.addEventListener('change', (e) => this.onFileChange(e), true);

    // Safety net: programmatic downloads (export code creating <a download> / blob links) and print.
    const guard = this;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (guard.active() && (this.hasAttribute('download') || /^(blob|data):/.test(this.href))) return guard.deny('download');
      return origClick.call(this);
    };
    const win = d.defaultView;
    if (win) {
      const origPrint = win.print.bind(win);
      win.print = () => (this.active() ? this.deny('print') : origPrint());
    }
  }

  /** Guard is off on the login page. */
  private active() {
    return !this.router.url.startsWith('/login');
  }

  private onClick(e: MouseEvent) {
    if (!this.active()) return;
    const t = e.target as Element | null;
    if (!t?.closest || t.closest(EXEMPT)) return;

    // file pickers (input itself, or a <label> wrapping / pointing at one)
    const fileInput = t.closest('input[type="file"]') ?? this.labelFileInput(t.closest('label'));
    if (fileInput) return this.block(e, 'upload');

    const el = t.closest(ACTIONABLE) as HTMLElement | null;
    if (!el || el.closest(EXEMPT)) return;
    if (el.tagName === 'LABEL') return; // plain labels only matter for file inputs (handled above)
    const what = this.classify(el);
    if (what) this.block(e, what);
  }

  private labelFileInput(label: Element | null) {
    if (!label) return null;
    const forId = label.getAttribute('for');
    return label.querySelector('input[type="file"]') ?? (forId ? this.doc.getElementById(forId)?.matches('input[type="file"]') && this.doc.getElementById(forId) : null) ?? null;
  }

  /** Returns the blocked action name, or null if the control is allowed. */
  private classify(el: HTMLElement): string | null {
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (label && label.length <= 48 && !SAFE_RE.test(label)) {
      const m = label.match(WORD_RE);
      if (m) return m[1].toLowerCase();
    }
    // icon-only (or icon-led) controls: pencil, trash, upload, download, plus…
    if (label.length <= ICON_LABEL_MAX && !SAFE_RE.test(label)) {
      for (const icon of Array.from(el.querySelectorAll('app-icon'))) {
        const name = icon.getAttribute('data-name') || '';
        const m = name.match(ICON_RE);
        if (m) return m[2];
      }
    }
    return null;
  }

  private onDrop(e: DragEvent) {
    if (!this.active()) return;
    const t = e.target as Element | null;
    if (t?.closest?.(EXEMPT)) return;
    this.block(e, e.dataTransfer?.files?.length ? 'upload' : 'edit');
  }

  private onFileChange(e: Event) {
    const t = e.target as HTMLInputElement | null;
    if (!this.active() || t?.type !== 'file') return;
    t.value = '';
    this.block(e, 'upload');
  }

  private block(e: Event, what: string) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    this.deny(what);
  }

  deny(what = 'action') {
    clearTimeout(this.hideTimer);
    this.toast.set({ id: (this.toast()?.id ?? 0) + 1, what });
    this.hideTimer = setTimeout(() => this.toast.set(null), 3200);
  }

  dismiss() {
    clearTimeout(this.hideTimer);
    this.toast.set(null);
  }
}
