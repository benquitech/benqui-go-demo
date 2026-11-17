import { Directive, ElementRef, booleanAttribute, forwardRef, inject, input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatAmount, parseAmount } from '../core/money';

/**
 * Campo numérico con formato argentino (mismo criterio que el NumberInput de fireextracking),
 * como directiva sobre un <input> común: `<input appNumber [(ngModel)]="precioRaw" />`.
 *
 * - Al tipear: solo dígitos y una coma decimal; el "." del teclado se convierte en ",".
 * - Al enfocar: se muestra sin puntos de miles y queda todo seleccionado para reemplazarlo.
 * - Al salir: se formatea 1.555,45 (punto de miles; los enteros sin decimales: 1.555).
 * - Los valores que pone el código (ngModel) también se muestran formateados.
 *
 * El modelo sigue siendo texto ("1.555,45"), que `parseAmount` convierte a número.
 *
 * Opciones: `appNumber="3"` (decimales; por defecto 2, 0 = enteros), `allowNegative`,
 * `allowPercent` (acepta "10%"), `plain` (solo dígitos sin formato: DNI, CUIT, código de barras).
 */
@Directive({
  selector: 'input[appNumber]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NumberField), multi: true }],
  host: {
    '[attr.inputmode]': "plain() || decimals() === 0 ? 'numeric' : 'decimal'",
    autocomplete: 'off',
    '(keydown)': 'onKeydown($event)',
    '(input)': 'onInput()',
    '(paste)': 'onPaste($event)',
    '(focus)': 'onFocus()',
    '(mouseup)': 'onMouseUp($event)',
    '(blur)': 'onBlur()',
  },
})
export class NumberField implements ControlValueAccessor {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  readonly decimals = input(2, { alias: 'appNumber', transform: (v: unknown) => (v === '' || v == null ? 2 : Number(v)) });
  readonly allowNegative = input(false, { transform: booleanAttribute });
  readonly allowPercent = input(false, { transform: booleanAttribute });
  readonly plain = input(false, { transform: booleanAttribute });

  private keepSelection = false;
  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  // ---------- ControlValueAccessor (ngModel) ----------

  writeValue(value: unknown): void {
    const text = value == null ? '' : String(value);
    // Mientras se escribe no se reformatea lo que el usuario tiene en pantalla.
    this.el.value = document.activeElement === this.el ? this.sanitize(this.normalize(text)) : this.format(text);
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.el.disabled = disabled;
  }

  // ---------- Eventos ----------

  /** El punto (también el del teclado numérico) se escribe como coma. */
  protected onKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== '.' && e.key !== ',' && e.key !== 'Decimal') return;
    e.preventDefault();
    if (this.plain() || this.decimals() === 0 || this.el.value.includes(',')) return;
    const start = this.el.selectionStart ?? this.el.value.length;
    const end = this.el.selectionEnd ?? start;
    this.el.setRangeText(',', start, end, 'end');
    this.onInput();
  }

  protected onInput(): void {
    const raw = this.el.value;
    const pos = this.el.selectionStart ?? raw.length;
    const clean = this.sanitize(raw);
    if (clean !== raw) {
      this.el.value = clean;
      const next = Math.max(0, pos - (raw.length - clean.length));
      this.el.setSelectionRange(next, next);
    }
    this.onChange(clean);
  }

  /** Al pegar "1.234,56" los puntos son miles; si no hay coma, el punto es decimal. */
  protected onPaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    e.preventDefault();
    const pasted = this.plain() ? text : text.includes(',') ? text.replace(/\./g, '') : text.replace('.', ',');
    const start = this.el.selectionStart ?? this.el.value.length;
    const end = this.el.selectionEnd ?? start;
    this.el.setRangeText(pasted, start, end, 'end');
    this.onInput();
  }

  /** Al enfocar: sin puntos de miles y todo seleccionado (lo que se tipee reemplaza el valor). */
  protected onFocus(): void {
    if (!this.plain()) this.el.value = this.el.value.replace(/\./g, '');
    this.el.select();
    this.keepSelection = true;
  }

  /** El mouseup del clic que dio el foco borraría la selección: se evita solo esa vez. */
  protected onMouseUp(e: MouseEvent): void {
    if (this.keepSelection) e.preventDefault();
    this.keepSelection = false;
  }

  protected onBlur(): void {
    const formatted = this.format(this.el.value);
    this.el.value = formatted;
    this.onChange(formatted);
    this.onTouched();
  }

  // ---------- Texto ----------

  /** Solo dígitos, una coma (con hasta `decimals` decimales), y "-" / "%" si están permitidos. */
  private sanitize(raw: string): string {
    if (this.plain()) return raw.replace(/\D/g, '');
    const neg = this.allowNegative() && raw.trim().startsWith('-');
    const pct = this.allowPercent() && raw.includes('%');
    let s = raw.replace(/\./g, ',').replace(/[^\d,]/g, '');
    const i = s.indexOf(',');
    if (i !== -1) {
      const int = s.slice(0, i);
      const frac = s.slice(i + 1).replace(/,/g, '').slice(0, this.decimals());
      s = this.decimals() === 0 ? int : `${int},${frac}`;
    }
    return `${neg ? '-' : ''}${s}${pct ? '%' : ''}`;
  }

  /**
   * Texto que viene del código o ya formateado → texto con coma decimal y sin puntos de miles:
   * "1.555,45" → "1555,45"; "1.555" → "1555"; "1650.5" (String de un número) → "1650,5".
   */
  private normalize(text: string): string {
    const t = text.trim();
    if (t.includes(',')) return t.replace(/\./g, '');
    if (/^-?\d{1,3}(\.\d{3})+%?$/.test(t)) return t.replace(/\./g, '');
    return t.replace('.', ',');
  }

  /** "1555,4" → "1.555,40"; "1555" → "1.555"; vacío o incompleto → como está (limpio). */
  private format(text: string): string {
    const clean = this.sanitize(this.normalize(text));
    if (this.plain()) return clean;
    const neg = clean.startsWith('-');
    const pct = clean.endsWith('%');
    const core = clean.replace(/^-/, '').replace(/%$/, '');
    const n = parseAmount(core);
    if (n == null) return clean;
    return `${neg ? '-' : ''}${formatAmount(n, this.decimals())}${pct ? '%' : ''}`;
  }
}
