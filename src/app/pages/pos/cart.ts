import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { Product, SaleUnit } from '../../core/models';
import { round2, round3 } from '../../core/money';

export interface CartLine {
  key: number;
  productId: string | null;
  name: string;
  saleUnit: SaleUnit;
  unitPrice: number;
  quantity: number;
  /** Precio tipeado en la venta (Varios, SUBE, recargas): se envía como unitPrice. */
  customPrice: boolean;
}

/** Venta en curso. Vive en un servicio para no perderla al cambiar de pantalla. */
@Injectable({ providedIn: 'root' })
export class Cart {
  private seq = 0;
  readonly lines = signal<CartLine[]>([]);
  readonly discount = signal(0);
  /** Última línea tocada (se resalta y es la que cambia con +/−). */
  readonly lastKey = signal<number | null>(null);

  readonly count = computed(() => this.lines().reduce((t, l) => t + (l.saleUnit === 'KG' ? 1 : l.quantity), 0));
  readonly subtotal = computed(() => round2(this.lines().reduce((t, l) => t + lineTotal(l), 0)));
  readonly total = computed(() => round2(Math.max(0, this.subtotal() - this.discount())));
  readonly isEmpty = computed(() => this.lines().length === 0);

  constructor() {
    // La venta en curso es de quien la cargó: al cambiar de usuario (salir, entrar otro) se vacía.
    const auth = inject(AuthService);
    effect(() => {
      auth.user();
      untracked(() => this.clear());
    });
  }

  add(p: Product, quantity = 1, price?: number): void {
    const custom = price != null;
    const existing = !custom && p.saleUnit === 'UNIT' ? this.lines().find((l) => l.productId === p.id && !l.customPrice) : undefined;
    if (existing) {
      this.setQty(existing.key, existing.quantity + quantity);
      return;
    }
    this.push({ productId: p.id, name: p.name, saleUnit: p.saleUnit, unitPrice: price ?? p.salePrice, quantity: round3(quantity), customPrice: custom });
  }

  addMisc(description: string, price: number, quantity = 1): void {
    this.push({ productId: null, name: description || 'Varios', saleUnit: 'UNIT', unitPrice: price, quantity, customPrice: true });
  }

  setQty(key: number, quantity: number): void {
    if (quantity <= 0) return this.remove(key);
    this.lines.update((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: round3(quantity) } : l)));
    this.lastKey.set(key);
  }

  remove(key: number): void {
    this.lines.update((ls) => ls.filter((l) => l.key !== key));
    if (this.lastKey() === key) this.lastKey.set(this.lines().at(-1)?.key ?? null);
    if (this.isEmpty()) this.discount.set(0);
  }

  clear(): void {
    this.lines.set([]);
    this.discount.set(0);
    this.lastKey.set(null);
  }

  private push(l: Omit<CartLine, 'key'>): void {
    const key = ++this.seq;
    this.lines.update((ls) => [...ls, { ...l, key }]);
    this.lastKey.set(key);
  }
}

export const lineTotal = (l: CartLine) => round2(l.quantity * l.unitPrice);
