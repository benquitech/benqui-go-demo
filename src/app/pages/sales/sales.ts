import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SalesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Sale } from '../../core/models';
import { MoneyPipe, QtyPipe, round2 } from '../../core/money';
import { CashStore, CatalogStore } from '../../core/stores';
import { TicketPrinter } from '../../core/ticket';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { ToastService } from '../../shared/toast';
import { flagInvalid } from '../../shared/invalid';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const LIMIT = 20;

@Component({
  selector: 'app-sales',
  imports: [FormsModule, DatePipe, MoneyPipe, QtyPipe, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './sales.scss',
  templateUrl: './sales.html',
})
export class Sales {
  private readonly api = inject(SalesApi);
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogStore);
  private readonly cash = inject(CashStore);
  private readonly printer = inject(TicketPrinter);
  private readonly toast = inject(ToastService);

  protected readonly from = signal(today());
  protected readonly to = signal(today());
  protected readonly search = signal('');
  protected readonly page = signal(1);

  protected readonly rows = signal<Sale[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  /** Totales de todo el filtro (no solo de la página). */
  protected readonly summary = signal({ count: 0, amount: 0, voided: 0 });

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / LIMIT)));
  protected readonly selected = signal<Sale | null>(null);
  protected readonly voiding = signal(false);
  protected voidReason = '';
  protected readonly busy = signal(false);

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.load();
  }

  protected setFrom(v: string): void {
    this.from.set(v);
    this.reset();
  }
  protected setTo(v: string): void {
    this.to.set(v);
    this.reset();
  }
  protected setSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reset(), 250);
  }
  protected quick(range: 'today' | 'yesterday' | 'week'): void {
    const d = new Date();
    const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    if (range === 'today') {
      this.from.set(fmt(d));
      this.to.set(fmt(d));
    } else if (range === 'yesterday') {
      d.setDate(d.getDate() - 1);
      this.from.set(fmt(d));
      this.to.set(fmt(d));
    } else {
      this.to.set(fmt(d));
      d.setDate(d.getDate() - 6);
      this.from.set(fmt(d));
    }
    this.reset();
  }

  protected goTo(p: number): void {
    this.page.set(Math.min(Math.max(1, p), this.pages()));
    this.load(false);
  }

  private reset(): void {
    this.page.set(1);
    this.load();
  }

  private query() {
    return { from: this.from() || undefined, to: this.to() || undefined, search: this.search().trim() || undefined };
  }

  private load(withSummary = true): void {
    this.loading.set(true);
    this.api.list({ ...this.query(), page: this.page(), limit: LIMIT }).subscribe({
      next: (r) => {
        this.rows.set(r.data);
        this.total.set(r.total);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(e);
      },
    });
    if (withSummary) {
      this.api.list({ ...this.query(), page: 1, limit: 10000 }).subscribe((r) => {
        const ok = r.data.filter((s) => s.status === 'COMPLETED');
        this.summary.set({ count: ok.length, amount: round2(ok.reduce((t, s) => t + s.total, 0)), voided: r.data.length - ok.length });
      });
    }
  }

  protected itemsSummary(s: Sale): string {
    const first = s.items.slice(0, 2).map((i) => i.description);
    const more = s.items.length - first.length;
    return first.join(', ') + (more > 0 ? ` y ${more} más` : '');
  }

  protected methods(s: Sale): string {
    return [...new Set(s.payments.map((p) => p.methodName))].join(' + ');
  }

  protected print(s: Sale): void {
    const settings = this.catalog.settings();
    if (settings) this.printer.printSale(s, settings);
  }

  protected startVoid(): void {
    this.voidReason = '';
    this.voiding.set(true);
  }

  protected confirmVoid(): void {
    const s = this.selected();
    if (!s) return;
    if (!this.voidReason.trim()) {
      flagInvalid('reason', 'Escribí el motivo de la anulación.', this.toast);
      return;
    }
    this.busy.set(true);
    this.api.void(s.id, this.voidReason).subscribe({
      next: (sale) => {
        this.busy.set(false);
        this.voiding.set(false);
        this.selected.set(sale);
        this.toast.success(`Venta #${sale.number} anulada. El stock volvió a su lugar.`);
        this.catalog.reloadProducts();
        this.cash.refresh();
        this.load(true);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }
}
