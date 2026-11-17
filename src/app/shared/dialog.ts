import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Icon, IconName } from './icon';

export type DialogTone = 'danger' | 'warning' | 'info' | 'success';

export interface DialogAction {
  label: string;
  value: string;
  kind?: 'primary' | 'danger' | 'success' | 'default' | 'ghost';
  icon?: IconName;
}

export interface DialogOptions {
  title: string;
  message: string;
  tone?: DialogTone;
  actions: DialogAction[];
}

interface OpenDialog extends DialogOptions {
  resolve: (value: string | null) => void;
}

/**
 * Ventanas de confirmación y aviso propias (reemplazan a alert/confirm del navegador).
 * Devuelven una promesa: `if (await dialog.confirm({...})) { ... }`.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<OpenDialog | null>(null);
  readonly isOpen = computed(() => !!this.current());

  /** Diálogo con botones a medida. Resuelve con el `value` del botón, o null si se cerró. */
  open(options: DialogOptions): Promise<string | null> {
    this.current()?.resolve(null);
    return new Promise((resolve) => this.current.set({ tone: 'info', ...options, resolve }));
  }

  async confirm(o: { title: string; message: string; confirmText?: string; cancelText?: string; tone?: DialogTone }): Promise<boolean> {
    const tone = o.tone ?? 'warning';
    const r = await this.open({
      title: o.title,
      message: o.message,
      tone,
      actions: [
        { label: o.cancelText ?? 'Cancelar', value: 'cancel' },
        { label: o.confirmText ?? 'Aceptar', value: 'ok', kind: tone === 'danger' ? 'danger' : 'primary' },
      ],
    });
    return r === 'ok';
  }

  async alert(o: { title: string; message: string; okText?: string; tone?: DialogTone }): Promise<void> {
    await this.open({ title: o.title, message: o.message, tone: o.tone ?? 'info', actions: [{ label: o.okText ?? 'Entendido', value: 'ok', kind: 'primary' }] });
  }

  close(value: string | null): void {
    const d = this.current();
    if (!d) return;
    this.current.set(null);
    d.resolve(value);
  }
}

const TONE_ICON: Record<DialogTone, IconName> = { danger: 'trash', warning: 'alert', info: 'info', success: 'check' };

@Component({
  selector: 'app-dialog-host',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  styles: `
    .dlg-backdrop {
      position: fixed; inset: 0; z-index: 950; display: grid; place-items: center; padding: 16px;
      background: rgba(8, 13, 20, 0.6); animation: fade 0.15s ease-out;
    }
    .dlg {
      width: 100%; max-width: 420px; padding: 24px 24px 18px; text-align: center;
      background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      animation: pop 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2);
    }
    .tone { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center; }
    .tone-danger { background: var(--danger-soft); color: var(--danger); }
    .tone-warning { background: #fff1d6; color: #c77700; }
    .tone-info { background: var(--primary-soft); color: var(--primary); }
    .tone-success { background: var(--success-soft); color: var(--success); }
    h2 { margin-bottom: 8px; }
    p { color: var(--text-2); line-height: 1.5; white-space: pre-line; }
    .actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
    .actions .btn { flex: 1 1 120px; }
    .actions.many { flex-direction: column; }
    .actions.many .btn { flex: none; width: 100%; }
    .btn-danger-solid { background: var(--danger); border-color: var(--danger); color: #fff; }
    .btn-danger-solid:hover:not(:disabled) { background: #991b1b; border-color: #991b1b; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(0.97); } }
  `,
  template: `
    @if (svc.current(); as d) {
      <div class="dlg-backdrop" (mousedown)="onBackdrop($event)">
        <div class="dlg" role="alertdialog" aria-modal="true" [attr.aria-label]="d.title">
          <div class="tone" [class]="'tone tone-' + d.tone"><app-icon [name]="toneIcon[d.tone!]" [size]="28" /></div>
          <h2>{{ d.title }}</h2>
          <p>{{ d.message }}</p>
          <div class="actions" [class.many]="d.actions.length > 2">
            @for (a of d.actions; track a.value; let last = $last) {
              <button
                type="button"
                class="btn"
                [class.btn-primary]="a.kind === 'primary'"
                [class.btn-success]="a.kind === 'success'"
                [class.btn-danger-solid]="a.kind === 'danger'"
                [class.btn-ghost]="a.kind === 'ghost'"
                [attr.autofocus]="isMain(a, d.actions) ? '' : null"
                (click)="svc.close(a.value)"
              >
                @if (a.icon) {
                  <app-icon [name]="a.icon" [size]="18" />
                }
                {{ a.label }}
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class DialogHost {
  protected readonly svc = inject(DialogService);
  protected readonly toneIcon = TONE_ICON;

  constructor() {
    // Enfoca el botón principal al abrir: Enter confirma, Esc cancela.
    effect(() => {
      if (this.svc.current()) setTimeout(() => document.querySelector<HTMLElement>('app-dialog-host [autofocus]')?.focus());
    });
  }

  /** El botón principal es el primero con estilo fuerte; si no hay, el último. */
  protected isMain(a: DialogAction, all: DialogAction[]): boolean {
    const main = all.find((x) => x.kind === 'primary' || x.kind === 'danger' || x.kind === 'success') ?? all[all.length - 1];
    return a === main;
  }

  /** Clic en el fondo (no en la ventana): cancela. Sin valor de retorno: ver Modal.onBackdrop. */
  protected onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.svc.close(null);
  }

  protected onEscape(e: Event): void {
    if (!this.svc.isOpen()) return;
    e.stopImmediatePropagation();
    this.svc.close(null);
  }
}
