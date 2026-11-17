import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashApi, SalesApi } from '../../core/api';
import { Product, Sale } from '../../core/models';
import { MoneyPipe, QtyPipe, parseAmount } from '../../core/money';
import { CashStore, CatalogStore } from '../../core/stores';
import { TicketPrinter } from '../../core/ticket';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { ProductThumb } from '../../shared/product-thumb';
import { DialogService } from '../../shared/dialog';
import { TourService } from '../../shared/tour';
import { ToastService } from '../../shared/toast';
import { Cart, lineTotal } from './cart';
import { PaymentModal, PaymentResult } from './payment-modal';
import { VariableItemModal, VariableItemResult } from './variable-item-modal';
import { NumberField } from '../../shared/number-field';

const FAVORITES = '__fav';
const ALL = '__all';

@Component({
  selector: 'app-pos',
  imports: [NumberField, FormsModule, Icon, Modal, ProductThumb, MoneyPipe, QtyPipe, PaymentModal, VariableItemModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pos.html',
  styleUrl: './pos.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Pos {
  protected readonly catalog = inject(CatalogStore);
  protected readonly cash = inject(CashStore);
  protected readonly cart = inject(Cart);
  private readonly salesApi = inject(SalesApi);
  private readonly cashApi = inject(CashApi);
  private readonly printer = inject(TicketPrinter);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly tour = inject(TourService);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');
  protected readonly lineTotal = lineTotal;
  protected readonly FAVORITES = FAVORITES;
  protected readonly ALL = ALL;

  protected readonly query = signal('');
  protected readonly tab = signal<string>(FAVORITES);
  /** Producto que necesita peso o precio antes de agregarse (null + open = "Varios"). */
  protected readonly variable = signal<{ product: Product | null } | null>(null);
  protected readonly paying = signal(false);
  protected readonly busy = signal(false);
  protected readonly lastSale = signal<Sale | null>(null);
  protected readonly discountOpen = signal(false);
  protected readonly editQty = signal<number | null>(null);
  /** Unidad de la línea cuya cantidad se está editando (por kilo admite 3 decimales). */
  protected readonly editingUnit = computed(() => this.cart.lines().find((l) => l.key === this.editQty())?.saleUnit ?? 'UNIT');
  /** Resalta la tarjeta "Abrir caja" cuando se intenta vender con la caja cerrada. */
  protected readonly flashCash = signal(false);
  protected openingRaw = '';
  protected discountRaw = '';
  protected qtyRaw = '';

  protected readonly cashRequired = computed(() => !!this.catalog.settings()?.requireCashSession && this.cash.loaded() && !this.cash.isOpen());
  protected readonly modalOpen = computed(() => !!this.variable() || this.paying() || !!this.lastSale() || this.discountOpen() || this.editQty() != null);

  protected readonly visible = computed(() => {
    const q = this.query().trim();
    if (q) return this.catalog.search(q.replace(/^\d+\s*\*\s*/, ''));
    const t = this.tab();
    const all = this.catalog.activeProducts();
    if (t === FAVORITES) return all.filter((p) => p.isFavorite);
    if (t === ALL) return [...all].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return all.filter((p) => p.categoryId === t).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  constructor() {
    afterNextRender(() => this.focusSearch());
  }

  // ---------- Buscador / lector ----------

  /**
   * Enter en el buscador. Acepta código de barras, código corto o nombre,
   * y un multiplicador adelante: "3*12" agrega 3 del producto de código 12.
   */
  protected onEnter(): void {
    const raw = this.query().trim();
    if (raw && !this.ensureCashOpen()) {
      this.query.set('');
      return;
    }
    if (!raw) {
      if (!this.cart.isEmpty()) this.checkout();
      return;
    }
    const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*\*\s*(.+)$/);
    const times = m ? (parseAmount(m[1]) ?? 1) : 1;
    const term = m ? m[2] : raw;
    const exact = this.catalog.findByCode(term);
    const found = exact ?? (this.visible().length === 1 ? this.visible()[0] : null);
    if (found) {
      this.pick(found, times);
      this.query.set('');
    } else if (!this.visible().length) {
      this.toast.error(`No encontramos "${term}". Revisá el código o buscá por nombre.`);
      this.query.set('');
    }
  }

  protected pick(p: Product, times = 1): void {
    if (!this.ensureCashOpen()) return;
    if (p.saleUnit === 'KG' || !(p.salePrice > 0)) {
      this.variable.set({ product: p });
      return;
    }
    this.cart.add(p, times);
    this.focusSearch();
  }

  protected openMisc(): void {
    if (this.ensureCashOpen()) this.variable.set({ product: null });
  }

  /**
   * Con la caja cerrada no se puede vender: avisa qué hacer y resalta la tarjeta para abrirla,
   * en vez de agregar productos a una venta que después no se va a poder cobrar.
   */
  private ensureCashOpen(): boolean {
    if (!this.cashRequired()) return true;
    this.toast.warning('La caja está cerrada. Escribí con cuánto cambio arrancás y tocá "Abrir caja" para empezar a vender.');
    this.flashCash.set(false);
    setTimeout(() => {
      this.flashCash.set(true);
      document.querySelector<HTMLInputElement>('[data-tour=cash-open] input')?.focus();
    });
    setTimeout(() => this.flashCash.set(false), 1600);
    return false;
  }

  protected onVariable(r: VariableItemResult): void {
    const p = this.variable()?.product;
    if (p) this.cart.add(p, r.quantity, p.saleUnit === 'KG' ? undefined : r.price);
    else this.cart.addMisc(r.description ?? 'Varios', r.price ?? 0);
    this.closeModals();
  }

  // ---------- Carrito ----------

  protected step(key: number, delta: number): void {
    const l = this.cart.lines().find((x) => x.key === key);
    if (l) this.cart.setQty(key, l.quantity + delta);
  }

  protected openQty(key: number): void {
    const l = this.cart.lines().find((x) => x.key === key);
    if (!l) return;
    this.qtyRaw = String(l.quantity).replace('.', ',');
    this.editQty.set(key);
  }

  protected saveQty(): void {
    const v = parseAmount(this.qtyRaw);
    const key = this.editQty();
    if (key != null && v != null && v >= 0) this.cart.setQty(key, v);
    this.closeModals();
  }

  protected openDiscount(): void {
    this.discountRaw = this.cart.discount() ? String(this.cart.discount()) : '';
    this.discountOpen.set(true);
  }

  /** Acepta importe ("500") o porcentaje ("10%"). */
  protected saveDiscount(): void {
    const raw = this.discountRaw.trim();
    const pct = raw.endsWith('%');
    const v = parseAmount(raw.replace('%', '')) ?? 0;
    const amount = pct ? Math.round((this.cart.subtotal() * v) / 100) : v;
    if (amount < 0 || amount > this.cart.subtotal()) {
      this.toast.error('El descuento no puede superar el subtotal.');
      return;
    }
    this.cart.discount.set(amount);
    this.closeModals();
  }

  protected async cancelSale(): Promise<void> {
    if (this.cart.isEmpty()) return;
    const ok = await this.dialog.confirm({
      title: '¿Cancelar la venta?',
      message: 'Se quitan todos los productos de la venta en curso.',
      confirmText: 'Sí, cancelar venta',
      cancelText: 'Seguir vendiendo',
      tone: 'danger',
    });
    if (ok) this.cart.clear();
    this.focusSearch();
  }

  // ---------- Cobro ----------

  protected checkout(): void {
    if (this.cart.isEmpty() || this.modalOpen()) return;
    if (this.cashRequired()) {
      this.ensureCashOpen();
      return;
    }
    this.paying.set(true);
  }

  protected confirmPayment(r: PaymentResult): void {
    this.busy.set(true);
    this.salesApi
      .create({
        customerId: r.customerId,
        discountAmount: this.cart.discount(),
        notes: null,
        items: this.cart.lines().map((l) => ({
          productId: l.productId,
          description: l.productId ? undefined : l.name,
          quantity: l.quantity,
          unitPrice: l.customPrice ? l.unitPrice : undefined,
        })),
        payments: r.payments,
      })
      .subscribe({
        next: (sale) => {
          this.busy.set(false);
          this.paying.set(false);
          this.cart.clear();
          this.lastSale.set(sale);
          this.catalog.reloadProducts();
          this.cash.refresh();
          this.catalog.settings.update((s) => (s ? { ...s, nextSaleNumber: sale.number + 1 } : s));
          if (this.catalog.settings()?.printTicket === 'ALWAYS') this.print(sale);
        },
        error: (e) => {
          this.busy.set(false);
          this.toast.error(e);
        },
      });
  }

  protected print(sale: Sale): void {
    const s = this.catalog.settings();
    if (s) this.printer.printSale(sale, s);
  }

  protected newSale(): void {
    this.lastSale.set(null);
    this.focusSearch();
  }

  protected openCash(): void {
    const amount = parseAmount(this.openingRaw) ?? 0;
    this.cashApi.open(amount).subscribe({
      next: (c) => {
        this.cash.set(c);
        this.openingRaw = '';
        this.toast.success('Caja abierta. ¡Buenas ventas!');
        this.focusSearch();
      },
      error: (e) => this.toast.error(e),
    });
  }

  // ---------- Teclado ----------

  protected onKey(e: KeyboardEvent): void {
    // Con un diálogo o la guía abiertos, el teclado es de ellos.
    if (this.dialog.isOpen() || this.tour.active()) return;
    if (this.lastSale() && e.key === 'Enter') {
      e.preventDefault();
      this.newSale();
      return;
    }
    if (this.modalOpen()) return;
    switch (e.key) {
      case 'F2':
        e.preventDefault();
        this.checkout();
        break;
      case 'F3':
        e.preventDefault();
        this.openMisc();
        break;
      case 'F4':
        e.preventDefault();
        this.focusSearch();
        break;
      case 'F8':
        e.preventDefault();
        this.cancelSale();
        break;
      case 'Escape':
        this.query.set('');
        this.focusSearch();
        break;
      default:
        // Cualquier tecla imprimible fuera de un campo va al buscador (el lector "tipea" ahí).
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
          this.focusSearch();
        }
    }
  }

  protected closeModals(): void {
    this.variable.set(null);
    this.paying.set(false);
    this.discountOpen.set(false);
    this.editQty.set(null);
    this.focusSearch();
  }

  private focusSearch(): void {
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }
}
