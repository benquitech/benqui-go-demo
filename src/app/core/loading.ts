import { HttpContext, HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

/** Espera antes de mostrar el overlay: las respuestas rápidas no lo hacen parpadear. */
const SHOW_DELAY_MS = 200;

/**
 * Overlay de carga (mismo criterio que fireextracking): cuenta los pedidos HTTP en curso y
 * muestra el overlay mientras haya al menos uno. El modo demo (localStorage) no pasa por acá.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly pending = signal(0);
  private readonly visible = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly active = computed(() => this.visible() && this.pending() > 0);
  readonly message = signal('Cargando...');

  start(message: string): void {
    this.message.set(message);
    this.pending.update((n) => n + 1);
    if (!this.timer && !this.visible()) this.timer = setTimeout(() => this.visible.set(true), SHOW_DELAY_MS);
  }

  stop(): void {
    this.pending.update((n) => Math.max(0, n - 1));
    if (this.pending() === 0) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.visible.set(false);
    }
  }
}

/**
 * Pedidos de fondo que NO deben tapar la pantalla (sugerencias, listas auxiliares): el overlay
 * bloquea todo, y un formulario abierto quedaría inutilizable mientras la API responde.
 */
export const SILENT_LOADING = new HttpContextToken<boolean>(() => false);
export const silent = () => new HttpContext().set(SILENT_LOADING, true);

/** Mensaje según qué se está consultando. */
function messageFor(url: string): string {
  if (url.includes('/catalog/')) return 'Consultando precios de SEPA...';
  if (url.includes('/demo/session')) return 'Conectando con el servidor...';
  return 'Cargando...';
}

/** Muestra el overlay de carga en todo pedido HTTP. */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SILENT_LOADING)) return next(req);
  const loading = inject(LoadingService);
  loading.start(messageFor(req.url));
  return next(req).pipe(finalize(() => loading.stop()));
};
