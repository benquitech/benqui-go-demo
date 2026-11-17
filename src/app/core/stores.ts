import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, tap } from 'rxjs';
import { CashApi, CatalogApi, SettingsApi } from './api';
import { BusinessSettings, CashSummary, Category, PaymentMethod, Product } from './models';
import { norm } from './text';


/**
 * Catálogo en memoria: productos, categorías, medios de pago y configuración.
 * Se carga una vez al entrar y se refresca después de cada cambio, así la venta busca al instante.
 */
@Injectable({ providedIn: 'root' })
export class CatalogStore {
  private readonly catalog = inject(CatalogApi);
  private readonly settingsApi = inject(SettingsApi);

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly settings = signal<BusinessSettings | null>(null);
  readonly loaded = signal(false);

  readonly activeProducts = computed(() => this.products().filter((p) => p.isActive));
  readonly activeCategories = computed(() => this.categories().filter((c) => c.isActive));
  readonly activePaymentMethods = computed(() => this.paymentMethods().filter((m) => m.isActive));
  readonly categoryById = computed(() => new Map(this.categories().map((c) => [c.id, c])));
  readonly lowStock = computed(() => this.activeProducts().filter((p) => p.trackStock && p.minStock != null && p.stock <= p.minStock));

  /** Índices para el lector de código de barras y el código corto. */
  private readonly byBarcode = computed(() => new Map(this.activeProducts().filter((p) => p.barcode).map((p) => [p.barcode!, p])));
  private readonly byCode = computed(() => new Map(this.activeProducts().filter((p) => p.code).map((p) => [p.code!.toUpperCase(), p])));

  load(): Observable<void> {
    return forkJoin({
      products: this.catalog.products(),
      categories: this.catalog.categories(),
      methods: this.settingsApi.paymentMethods(),
      settings: this.settingsApi.get(),
    }).pipe(
      tap((r) => {
        this.products.set(r.products);
        this.categories.set(r.categories);
        this.paymentMethods.set(r.methods);
        this.settings.set(r.settings);
        this.loaded.set(true);
      }),
      map(() => undefined),
    );
  }

  reloadProducts(): void {
    this.catalog.products().subscribe((p) => this.products.set(p));
  }

  /** Coincidencia exacta por código de barras o código corto (lo que manda el lector o se tipea). */
  findByCode(raw: string): Product | null {
    const s = raw.trim();
    if (!s) return null;
    return this.byBarcode().get(s) ?? this.byCode().get(s.toUpperCase()) ?? null;
  }

  /** Búsqueda por nombre (todas las palabras, sin acentos), código o código de barras parcial. */
  search(raw: string, limit = 60): Product[] {
    const words = norm(raw.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return this.activeProducts()
      .filter((p) => {
        const hay = norm(`${p.name} ${p.code ?? ''} ${p.barcode ?? ''}`);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, limit);
  }

  category(id: string | null | undefined): Category | undefined {
    return id ? this.categoryById().get(id) : undefined;
  }
}

/** Estado de la caja abierta (null = cerrada). */
@Injectable({ providedIn: 'root' })
export class CashStore {
  private readonly api = inject(CashApi);
  readonly current = signal<CashSummary | null>(null);
  readonly loaded = signal(false);
  readonly isOpen = computed(() => !!this.current());

  refresh(): void {
    this.api.current().subscribe((c) => {
      this.current.set(c);
      this.loaded.set(true);
    });
  }

  set(c: CashSummary | null): void {
    this.current.set(c);
    this.loaded.set(true);
  }
}
