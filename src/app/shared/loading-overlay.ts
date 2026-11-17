import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoadingService } from '../core/loading';

/** Overlay de carga a pantalla completa (el de fireextracking, con los colores de Benqui Go). */
@Component({
  selector: 'app-loading-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .loading {
      position: fixed; inset: 0; z-index: 2000; // por encima de modales, guía y avisos
      display: grid; place-items: center;
      background-color: rgba(8, 13, 20, 0.7);
      animation: fade-in 0.15s ease-out;
    }
    .box { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .lds-ripple { position: relative; width: 80px; height: 80px; }
    .lds-ripple div {
      position: absolute; border: 4px solid var(--cyan); opacity: 1; border-radius: 50%;
      animation: lds-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite;
    }
    .lds-ripple div:nth-child(2) { animation-delay: -0.5s; }
    .loading-message {
      color: #fff; font-weight: 600; white-space: nowrap;
      animation: bop 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards infinite alternate;
    }
    @keyframes lds-ripple {
      0% { top: 36px; left: 36px; width: 0; height: 0; opacity: 1; }
      100% { top: 0; left: 0; width: 72px; height: 72px; opacity: 0; }
    }
    @keyframes bop { 0% { transform: scale(0.9); } 50%, 100% { transform: scale(1); } }
    @keyframes fade-in { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .lds-ripple div, .loading-message { animation-duration: 2s !important; }
    }
    @media print { .loading { display: none !important; } }
  `,
  template: `
    @if (loading.active()) {
      <div class="loading" role="status" aria-live="polite" aria-busy="true">
        <div class="box">
          <div class="lds-ripple"><div></div><div></div></div>
          <div class="loading-message">{{ loading.message() }}</div>
        </div>
      </div>
    }
  `,
})
export class LoadingOverlay {
  protected readonly loading = inject(LoadingService);
}
