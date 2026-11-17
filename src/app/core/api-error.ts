import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from './api';

/**
 * Convierte un error (de la API real, del modo demo o inesperado) en un texto claro para el usuario.
 * Mismos mensajes que fireextracking.
 */
export function apiErrorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  const status = err instanceof ApiError || err instanceof HttpErrorResponse ? err.status : null;
  if (status === 0) return 'No se pudo conectar con el servidor';
  if (status === 401) return 'Tu sesión se cerró. Iniciá sesión de nuevo.';
  if (status === 403) return 'No tenés permiso para realizar esta acción';
  if (status != null && status >= 500) return 'Error del servidor. Intentá de nuevo en un momento.';
  if (err instanceof ApiError) return err.message;
  if (err instanceof HttpErrorResponse) {
    const m = err.error?.message;
    if (Array.isArray(m)) return m.join('. ');
    if (typeof m === 'string') return m;
  }
  if (typeof err === 'string') return err;
  return fallback;
}
