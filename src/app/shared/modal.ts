import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * Ventana modal simple. Esc o clic afuera cierran (emite `closed`).
 * Al abrir enfoca el primer campo marcado con `autofocus`, o el primer input.
 */
@Component({
  selector: 'app-modal',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  styles: `
    :host { display: contents; }
    .backdrop {
      position: fixed; inset: 0; z-index: 50; background: rgba(8, 13, 20, 0.55);
      display: grid; place-items: center; padding: 16px; animation: fade 0.15s ease-out;
    }
    .dialog {
      background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      width: 100%; max-height: calc(100dvh - 32px); display: flex; flex-direction: column;
      animation: pop 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2);
    }
    header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); }
    header h2 { margin-right: auto; }
    .body { padding: 20px; overflow-y: auto; }
    :host ::ng-deep [modal-footer] {
      display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px;
      border-top: 1px solid var(--line); background: var(--surface-2);
      border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
  `,
  template: `
    <div class="backdrop" (mousedown)="onBackdrop($event)">
      <div class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="title()" [style.max-width.px]="width()">
        <header>
          <h2>{{ title() }}</h2>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="closed.emit()" aria-label="Cerrar"><app-icon name="x" /></button>
        </header>
        <div class="body"><ng-content /></div>
        <ng-content select="[modal-footer]" />
      </div>
    </div>
  `,
})
export class Modal {
  private readonly el = inject(ElementRef<HTMLElement>);
  readonly title = input.required<string>();
  readonly width = input(480);
  readonly closed = output<void>();

  constructor() {
    afterNextRender(() => {
      const root = this.el.nativeElement as HTMLElement;
      const target = root.querySelector<HTMLElement>('[autofocus]') ?? root.querySelector<HTMLElement>('.body input, .body select, .body textarea');
      target?.focus();
      if (target instanceof HTMLInputElement) target.select();
    });
  }

  /**
   * Clic en el fondo oscuro (no dentro de la ventana): cierra. Es un método que no devuelve nada a
   * propósito: si el manejador devolviera `false` (por ej. `a && b`), Angular cancelaría el mousedown
   * y los campos de la ventana no podrían recibir el foco ni abrirse los combos.
   */
  protected onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closed.emit();
  }

  protected onEscape(e: Event): void {
    // Solo cierra el modal de más arriba.
    if (document.querySelector('app-dialog-host .dlg-backdrop')) return;
    const all = document.querySelectorAll('app-modal');
    if (all[all.length - 1] === this.el.nativeElement) {
      e.stopPropagation();
      this.closed.emit();
    }
  }
}
