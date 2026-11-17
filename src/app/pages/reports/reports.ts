import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReportsApi } from '../../core/api';
import { DailyReport } from '../../core/models';
import { MoneyPipe, QtyPipe } from '../../core/money';
import { CatalogStore } from '../../core/stores';
import { Icon } from '../../shared/icon';
import { ProductThumb } from '../../shared/product-thumb';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const METHOD_COLORS = ['#0e7490', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

@Component({
  selector: 'app-reports',
  imports: [FormsModule, DatePipe, DecimalPipe, Icon, MoneyPipe, QtyPipe, ProductThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './reports.scss',
  templateUrl: './reports.html',
})
export class Reports {
  private readonly api = inject(ReportsApi);
  protected readonly catalog = inject(CatalogStore);
  protected readonly methodColors = METHOD_COLORS;

  protected readonly date = signal(ymd(new Date()));
  protected readonly report = signal<DailyReport | null>(null);
  protected readonly isToday = computed(() => this.date() === ymd(new Date()));
  /** Fecha como Date local (para el pipe date sin corrimiento de zona). */
  protected readonly dateObj = computed(() => {
    const [y, m, d] = this.date().split('-').map(Number);
    return new Date(y, m - 1, d);
  });

  /** Horas de 7 a 23 (más cualquier hora con ventas fuera de ese rango). */
  protected readonly hours = computed(() => {
    const r = this.report();
    const map = new Map((r?.byHour ?? []).map((h) => [h.hour, h.total]));
    const hs = new Set<number>([...Array(17).keys()].map((i) => i + 7));
    map.forEach((_, h) => hs.add(h));
    const max = Math.max(1, ...map.values());
    return [...hs].sort((a, b) => a - b).map((h) => ({ hour: h, total: map.get(h) ?? 0, pct: ((map.get(h) ?? 0) / max) * 100 }));
  });
  protected readonly maxMethod = computed(() => Math.max(1, ...(this.report()?.byMethod ?? []).map((m) => m.total)));
  protected readonly maxCategory = computed(() => Math.max(1, ...(this.report()?.byCategory ?? []).map((m) => m.total)));
  protected readonly lowStock = computed(() => [...this.catalog.lowStock()].sort((a, b) => a.stock - (a.minStock ?? 0) - (b.stock - (b.minStock ?? 0))));

  constructor() {
    this.load();
  }

  protected shift(days: number): void {
    const d = new Date(this.dateObj());
    d.setDate(d.getDate() + days);
    this.setDate(ymd(d));
  }

  protected goToday(): void {
    this.setDate(ymd(new Date()));
  }

  protected setDate(v: string): void {
    if (!v) return;
    this.date.set(v);
    this.load();
  }

  private load(): void {
    this.report.set(null);
    this.api.daily(this.date()).subscribe((r) => this.report.set(r));
  }
}
