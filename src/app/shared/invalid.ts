import { ToastService } from './toast';

/**
 * Validación amable de formularios: en vez de dejar el botón Guardar gris sin explicar por qué,
 * al guardar se marca en rojo el campo que falta, se lo enfoca y se dice qué completar.
 * La marca se va sola en cuanto el usuario escribe en el campo.
 *
 * Devuelve false para usarlo así: `if (!name.trim()) return flagInvalid('pf-name', 'Escribí el nombre.', this.toast);`
 */
export function flagInvalid(fieldId: string, message: string, toast: ToastService): false {
  toast.warning(message);
  const el = document.getElementById(fieldId);
  if (!el) return false;
  el.classList.remove('invalid');
  void el.offsetWidth; // reinicia la animación si se marca dos veces seguidas
  el.classList.add('invalid');
  el.setAttribute('aria-invalid', 'true');
  el.focus();
  const clear = () => {
    el.classList.remove('invalid');
    el.removeAttribute('aria-invalid');
  };
  el.addEventListener('input', clear, { once: true });
  el.addEventListener('change', clear, { once: true });
  return false;
}
