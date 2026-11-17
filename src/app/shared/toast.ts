import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { apiErrorMessage } from '../core/api-error';
import { Icon, IconName } from './icon';

export type ToastType = 'danger' | 'success' | 'warning' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const MAX_VISIBLE = 5;
/** Duración por defecto de cualquier aviso; se pueden cerrar antes con la X. */
const DEFAULT_MS = 5000;

/**
 * Notificaciones emergentes (mismo comportamiento que fireextracking): se cierran solas a los
 * 5 segundos o con la X, y un aviso igual al que ya está visible no se duplica.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  /** Acepta un texto o cualquier error (ApiError, HttpErrorResponse…) y lo traduce. */
  error(err: unknown, ms = DEFAULT_MS): void {
    this.push('danger', typeof err === 'string' ? err : apiErrorMessage(err), ms);
  }
  warning(message: string, ms = DEFAULT_MS): void {
    this.push('warning', message, ms);
  }
  success(message: string, ms = DEFAULT_MS): void {
    this.push('success', message, ms);
  }
  info(message: string, ms = DEFAULT_MS): void {
    this.push('info', message, ms);
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(type: ToastType, message: string, ms: number): void {
    const same = this.toasts().find((t) => t.type === type && t.message === message);
    if (same) {
      this.schedule(same.id, ms);
      return;
    }
    const toast: Toast = { id: this.nextId++, type, message };
    this.toasts.update((list) => {
      const next = [...list, toast];
      for (const old of next.slice(0, -MAX_VISIBLE)) {
        clearTimeout(this.timers.get(old.id));
        this.timers.delete(old.id);
      }
      return next.slice(-MAX_VISIBLE);
    });
    this.schedule(toast.id, ms);
  }

  private schedule(id: number, ms: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), ms),
    );
  }
}

const ICON: Record<ToastType, IconName> = { danger: 'alert', success: 'check', warning: 'alert', info: 'info' };

/**
 * Pila de avisos con los colores de fireextracking. Va abajo a la izquierda (junto al menú)
 * para no tapar el botón Cobrar, que está abajo a la derecha.
 */
@Component({
  selector: 'app-toaster',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .toast-stack {
      position: fixed; left: calc(var(--rail-w) + 16px); bottom: 16px; z-index: 1000;
      display: flex; flex-direction: column; gap: 10px; width: min(400px, calc(100vw - 32px)); pointer-events: none;
    }
    .toast-item {
      position: relative; display: flex; align-items: center; gap: 14px; padding: 14px 44px 14px 16px;
      border-radius: var(--radius); color: #fff; line-height: 1.4; font-weight: 500; pointer-events: auto;
      animation: toast-in 0.25s ease-out;
    }
    .toast-message { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .toast-close {
      position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 26px; height: 26px; padding: 0;
      border: 0; border-radius: 50%; background: transparent; color: #fff; cursor: pointer; opacity: 0.85;
    }
    .toast-close:hover { opacity: 1; background: rgba(255, 255, 255, 0.2); }
    .toast-danger { background: #f55a4e; box-shadow: 0 12px 20px -10px rgba(244, 67, 54, 0.28), 0 4px 20px 0 rgba(0, 0, 0, 0.12), 0 7px 8px -5px rgba(244, 67, 54, 0.2); }
    .toast-success { background: #51b055; box-shadow: 0 12px 20px -10px rgba(76, 175, 80, 0.28), 0 4px 20px 0 rgba(0, 0, 0, 0.12), 0 7px 8px -5px rgba(76, 175, 80, 0.2); }
    .toast-warning { background: #ffa00d; box-shadow: 0 12px 20px -10px rgba(255, 152, 0, 0.28), 0 4px 20px 0 rgba(0, 0, 0, 0.12), 0 7px 8px -5px rgba(255, 152, 0, 0.2); }
    .toast-info { background: #00a9c2; box-shadow: 0 12px 20px -10px rgba(0, 188, 212, 0.28), 0 4px 20px 0 rgba(0, 0, 0, 0.12), 0 7px 8px -5px rgba(0, 188, 212, 0.2); }
    @keyframes toast-in { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .toast-item { animation: none; } }
    @media (max-width: 720px) { .toast-stack { left: 16px; bottom: 80px; } }
  `,
  template: `
    <div class="toast-stack">
      @for (t of svc.toasts(); track t.id) {
        <div [class]="'toast-item toast-' + t.type" [attr.role]="t.type === 'danger' || t.type === 'warning' ? 'alert' : 'status'">
          <app-icon [name]="icon[t.type]" [size]="28" />
          <span class="toast-message">{{ t.message }}</span>
          <button type="button" class="toast-close" aria-label="Cerrar notificación" (click)="svc.dismiss(t.id)">
            <app-icon name="x" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class Toaster {
  protected readonly svc = inject(ToastService);
  protected readonly icon = ICON;
}
