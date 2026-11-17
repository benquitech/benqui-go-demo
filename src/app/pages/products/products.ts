import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReferenceCatalog } from '../../core/reference-catalog';
import { AuthService } from '../../core/auth.service';
import { Product } from '../../core/models';
import { MoneyPipe, QtyPipe } from '../../core/money';
import { CatalogStore } from '../../core/stores';
import { Icon } from '../../shared/icon';
import { ProductThumb } from '../../shared/product-thumb';
import { ToastService } from '../../shared/toast';
import { BulkPriceModal } from './bulk-price-modal';
import { ProductFormModal } from './product-form-modal';
import { StockModal } from './stock-modal';
import { norm } from '../../core/text';


const isLow = (p: Product) => p.trackStock && p.minStock != null && p.stock <= p.minStock;

@Component({
  selector: 'app-products',
  imports: [FormsModule, RouterLink, Icon, ProductThumb, MoneyPipe, QtyPipe, ProductFormModal, StockModal, BulkPriceModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './products.scss',
  templateUrl: './products.html',
})
export class Products {
  protected readonly catalog = inject(CatalogStore);
  protected readonly auth = inject(AuthService);
  protected readonly refEnabled = inject(ReferenceCatalog).enabled;
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly onlyLow = signal(false);
  protected readonly showInactive = signal(false);

  /** undefined = cerrado; null = alta; Product = edición. */
  protected readonly editing = signal<Product | null | undefined>(undefined);
  protected readonly stockOf = signal<Product | null>(null);
  protected readonly bulkOpen = signal(false);

  protected readonly isLow = isLow;
  protected readonly lowCount = computed(() => this.catalog.lowStock().length);

  protected readonly rows = computed(() => {
    const words = norm(this.query().trim()).split(/\s+/).filter(Boolean);
    const cat = this.categoryId();
    return this.catalog
      .products()
      .filter((p) => this.showInactive() || p.isActive)
      .filter((p) => !cat || p.categoryId === cat)
      .filter((p) => !this.onlyLow() || isLow(p))
      .filter((p) => {
        if (!words.length) return true;
        const hay = norm(`${p.name} ${p.code ?? ''} ${p.barcode ?? ''}`);
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  protected margin(p: Product): number | null {
    return p.costPrice && p.salePrice > 0 ? Math.round(((p.salePrice - p.costPrice) / p.costPrice) * 100) : null;
  }

  /** Enter en el buscador: si el lector leyó un código exacto, abre ese producto. */
  protected onEnter(): void {
    const q = this.query().trim();
    const p = this.catalog.products().find((x) => x.barcode === q || (x.code && x.code.toUpperCase() === q.toUpperCase()));
    if (p) this.open(p);
    else if (this.rows().length === 1) this.open(this.rows()[0]);
    else if (!this.rows().length && /^\d{8,14}$/.test(q) && this.auth.isAdmin()) {
      this.toast.info('Ese código no está cargado. Completá los datos para crearlo.');
      this.newProduct(q);
    }
  }

  protected readonly pendingBarcode = signal<string | null>(null);

  protected newProduct(barcode: string | null = null): void {
    this.pendingBarcode.set(barcode);
    this.editing.set(null);
  }

  /** Admin edita; el cajero ve el stock. */
  protected open(p: Product): void {
    if (this.auth.isAdmin()) this.editing.set(p);
    else this.stockOf.set(p);
  }

  protected afterSave(): void {
    this.editing.set(undefined);
    this.pendingBarcode.set(null);
    this.catalog.reloadProducts();
  }

  protected exportCsv(): void {
    const admin = this.auth.isAdmin();
    const head = ['Nombre', 'Categoría', 'Código', 'Código de barras', 'Unidad', 'Precio', ...(admin ? ['Costo'] : []), 'Stock', 'Stock mínimo', 'Activo'];
    const num = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
    const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = this.rows().map((p) =>
      [
        p.name,
        this.catalog.category(p.categoryId)?.name ?? '',
        p.code ?? '',
        p.barcode ?? '',
        p.saleUnit === 'KG' ? 'Kilo' : 'Unidad',
        num(p.salePrice),
        ...(admin ? [num(p.costPrice)] : []),
        p.trackStock ? num(p.stock) : '',
        num(p.minStock),
        p.isActive ? 'Sí' : 'No',
      ]
        .map(cell)
        .join(';'),
    );
    const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `productos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
