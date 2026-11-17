import { Pipe, PipeTransform } from '@angular/core';

/** Redondeo a centavos (evita 0.1 + 0.2). */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

const intFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

/** "$ 1.500" o "$ 1.500,50": sin decimales cuando no hacen falta (así se lee en un kiosco). */
export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const v = round2(n);
  const s = Number.isInteger(v) ? intFmt.format(Math.abs(v)) : decFmt.format(Math.abs(v));
  return `${v < 0 ? '−' : ''}$ ${s}`;
}

/** Cantidad: "2" o "0,250 kg". */
export function qty(n: number, unit: 'UNIT' | 'KG' = 'UNIT'): string {
  return unit === 'KG' ? `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n)} kg` : qtyFmt.format(n);
}

/**
 * Número → texto para un campo: 1555.45 → "1.555,45", 1555 → "1.555", 0.25 (3 decimales) → "0,250".
 * Los enteros van sin decimales (así se leen los precios en un kiosco).
 */
export function formatAmount(n: number, decimals = 2): string {
  const v = Math.abs(n);
  const fixed = decimals === 0 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${grouped}${frac ? ',' + frac : ''}`;
}

/** Lee "1.500,50", "1500.5" o "1500" (lo que tipee el usuario) como número. */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = raw.trim().replace(/\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(n: number | null | undefined): string {
    return money(n);
  }
}

@Pipe({ name: 'qty' })
export class QtyPipe implements PipeTransform {
  transform(n: number, unit: 'UNIT' | 'KG' = 'UNIT'): string {
    return qty(n, unit);
  }
}
