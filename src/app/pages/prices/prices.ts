import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CatalogApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { MoneyPipe, money } from '../../core/money';
import { RefCategory, RefProduct, ReferenceCatalog } from '../../core/reference-catalog';
import { CatalogStore } from '../../core/stores';
import { norm } from '../../core/text';
import { Icon } from '../../shared/icon';
import { ToastService } from '../../shared/toast';
import { ProductFormModal } from '../products/product-form-modal';
import { RefMatch, UpdatePricesModal, priceDiff } from './update-prices-modal';

const PAGE_SIZE = 40;

/**
 * Precios de referencia: lo que cobran los supermercados por cada producto (SEPA / Precios Claros),
 * para comparar con los precios propios o cargar un producto nuevo con un precio sugerido.
 */
@Component({
  selector: 'app-prices',
  imports: [FormsModule, DatePipe, Icon, MoneyPipe, ProductFormModal, UpdatePricesModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; }
    .search { flex: 1 1 280px; display: flex; align-items: center; gap: 8px; color: var(--primary); }
    .province { width: auto; min-width: 200px; }
    .cats { display: flex; flex-wrap: wrap; gap: 8px; }
    .cat {
      --c: #94a3b8;
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--c) 35%, white); background: var(--surface);
      font: inherit; font-weight: 600; cursor: pointer;
    }
    .cat.active { background: color-mix(in srgb, var(--c) 18%, white); border-color: var(--c); }
    .cat .n { font-weight: 500; color: var(--muted); font-size: 0.8rem; }
    .prod { display: flex; flex-direction: column; min-width: 220px; }
    .prod-name { font-weight: 600; }
    .meta { font-variant-numeric: tabular-nums; }
    .cat-chip { --c: #94a3b8; background: color-mix(in srgb, var(--c) 14%, white); border-color: color-mix(in srgb, var(--c) 35%, white); }
    .range { white-space: nowrap; }
    .mine { white-space: nowrap; }
    .more { display: flex; justify-content: center; }
    .source { line-height: 1.5; }
    .match { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 14px 16px; border-left: 4px solid var(--primary); }
    .match .txt { flex: 1 1 320px; display: flex; flex-direction: column; gap: 2px; }
    .match .big { font-size: 1.05rem; font-weight: 650; }
    .match .chip { cursor: pointer; }
    .only-mine { white-space: nowrap; }
    .demo-limit {
      display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: var(--radius-lg);
      background: var(--danger-soft); border: 2px solid var(--danger); color: var(--text);
      font-size: 0.92rem; line-height: 1.5; box-shadow: 0 6px 18px -10px rgba(185, 28, 28, 0.5);
    }
    .demo-limit .ico {
      flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
      background: var(--danger); color: #fff;
    }
    .demo-limit .title { display: block; font-size: 1.02rem; font-weight: 750; color: var(--danger); margin-bottom: 2px; }
    .use { white-space: nowrap; }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Precios de referencia</h1>
      </div>

      @if (!ref.enabled) {
        <div class="card">
          <div class="empty">
            <div class="empty-icon">🏷️</div>
            Los precios de referencia no están configurados.<br />
            <span class="small">Falta la clave del demo en <code>environment.referenceCatalog.demoKey</code>.</span>
          </div>
        </div>
      } @else {
        @if (ref.perCategoryLimit(); as limit) {
          <div class="demo-limit" role="note" data-tour="prices-limit">
            <span class="ico"><app-icon name="alert" [size]="20" /></span>
            <span>
              <span class="title">
                Versión demo: solo {{ categoriesWithProducts() ? limit * categoriesWithProducts() + ' productos' : limit + ' productos por rubro' }} de SEPA
              </span>
              Podés consultar hasta {{ limit }} productos por rubro (los más vendidos).
              La versión completa trae <strong>todo el catálogo de SEPA</strong>: miles de productos y precios de cada provincia.
            </span>
          </div>
        }

        @if (matches(); as ms) {
          @if (ms.length) {
            <div class="card match" data-tour="prices-match">
              <span style="font-size: 1.8rem" aria-hidden="true">🔗</span>
              <div class="txt">
                <span class="big">{{ ms.length }} de tus productos están en SEPA</span>
                <span class="muted small">
                  @if (cheaperCount()) {
                    <span class="chip chip-success" (click)="openUpdate('CHEAPER')" role="button">{{ cheaperCount() }} más barato{{ cheaperCount() === 1 ? '' : 's' }} que la referencia</span>
                  }
                  @if (pricierCount()) {
                    <span class="chip chip-warn" (click)="openUpdate('PRICIER')" role="button">{{ pricierCount() }} más caro{{ pricierCount() === 1 ? '' : 's' }}</span>
                  }
                  @if (!cheaperCount() && !pricierCount()) {
                    Todos tus precios coinciden con la referencia.
                  }
                </span>
              </div>
              <button type="button" class="btn" (click)="onlyMine.set(!onlyMine())">
                <app-icon [name]="onlyMine() ? 'grid' : 'package'" [size]="18" /> {{ onlyMine() ? 'Ver todo el catálogo' : 'Ver solo los míos' }}
              </button>
              @if (auth.isAdmin() && (cheaperCount() || pricierCount())) {
                <button type="button" class="btn btn-primary" (click)="openUpdate('DIFF')" data-tour="prices-update">
                  <app-icon name="refresh" [size]="18" /> Actualizar mis precios
                </button>
              }
            </div>
          } @else {
            <div class="card match">
              <span style="font-size: 1.8rem" aria-hidden="true">💡</span>
              <div class="txt">
                <span class="big">Ninguno de tus productos coincide con SEPA</span>
                <span class="muted small">Se cruzan por código de barras: cargalo en tus productos, o agregá los que te interesen desde esta lista.</span>
              </div>
            </div>
          }
        }

        <div class="filters card card-pad">
          <div class="search">
            <app-icon name="search" [size]="20" />
            <input
              class="input"
              type="search"
              placeholder="Buscá por nombre, marca o código de barras"
              aria-label="Buscar en precios de referencia"
              autocomplete="off"
              [ngModel]="query()"
              (ngModelChange)="onSearch($event)"
            />
          </div>
          <select class="input province" data-tour="prices-province" [ngModel]="ref.province()" (ngModelChange)="onProvince($event)" aria-label="Provincia">
            <option value="">Promedio nacional</option>
            @for (p of ref.provinces(); track p.code) {
              <option [value]="p.code">{{ p.name }}</option>
            }
          </select>
          <label class="check only-mine">
            <input type="checkbox" [ngModel]="onlyMine()" (ngModelChange)="onlyMine.set($event)" /> Solo los que tengo
          </label>
        </div>

        <div class="cats" role="tablist" aria-label="Categorías">
          <button type="button" class="cat" role="tab" [class.active]="!category()" [attr.aria-selected]="!category()" (click)="selectCategory(null)">
            Todas
          </button>
          @for (c of categories(); track c.id) {
            <button
              type="button"
              class="cat"
              role="tab"
              [style.--c]="c.color"
              [class.active]="category() === c.slug"
              [attr.aria-selected]="category() === c.slug"
              (click)="selectCategory(c.slug)"
            >
              {{ c.icon }} {{ c.name }} <span class="n">{{ c.productCount }}</span>
            </button>
          }
        </div>

        <div class="card">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th class="right">Precio de referencia</th>
                  <th class="right">Rango en supermercados</th>
                  <th class="right">Tu precio</th>
                  @if (auth.isAdmin()) {
                    <th></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (p of visibleRows(); track p.id) {
                  <tr>
                    <td>
                      <div class="prod">
                        <span class="prod-name">{{ p.name }}</span>
                        <span class="muted small meta">
                          {{ p.brand?.name ?? '' }}{{ p.brand && p.presentation ? ' · ' : '' }}{{ p.presentation ?? '' }} · {{ p.barcode }}
                        </span>
                      </div>
                    </td>
                    <td>
                      @if (p.category; as c) {
                        <span class="chip cat-chip" [style.--c]="c.color">{{ c.icon }} {{ c.name }}</span>
                      }
                    </td>
                    <td class="right num strong" [title]="p.priceProvince ? 'Mediana en ' + (ref.provinceName() ?? p.priceProvince) : 'Mediana nacional'">
                      {{ p.price | money }}
                    </td>
                    <td class="right num muted range">{{ p.minPrice | money }} – {{ p.maxPrice | money }}</td>
                    <td class="right num mine">
                      @if (mine(p); as own) {
                        {{ own.salePrice | money }}
                        @if (diff(own.salePrice, p.price); as d) {
                          <span class="chip" [class.chip-success]="d < 0" [class.chip-warn]="d > 0" [title]="'Contra el precio de referencia'">
                            {{ d > 0 ? '+' : '' }}{{ d }}%
                          </span>
                        }
                      } @else {
                        <span class="muted small">No cargado</span>
                      }
                    </td>
                    @if (auth.isAdmin()) {
                      <td class="right">
                        @if (mine(p); as own) {
                          @if (diff(own.salePrice, p.price)) {
                            <button type="button" class="btn btn-sm use" (click)="useReference(own.id, own.name, own.salePrice, p.price)" [disabled]="busyId() === own.id" [title]="'Cambiar tu precio a ' + (p.price | money)">
                              <app-icon name="check" [size]="16" /> Usar {{ p.price | money }}
                            </button>
                          }
                        } @else {
                          <button type="button" class="btn btn-sm" (click)="adding.set(p)" title="Cargarlo en tus productos con estos datos">
                            <app-icon name="plus" [size]="16" /> Agregar
                          </button>
                        }
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td [attr.colspan]="auth.isAdmin() ? 6 : 5">
                      <div class="empty">
                        @if (loading()) {
                          Cargando precios…
                        } @else if (failed()) {
                          <div class="empty-icon">⚠️</div>
                          No se pudieron cargar los precios.
                          <div><button type="button" class="btn btn-sm" (click)="reload()"><app-icon name="refresh" [size]="16" /> Reintentar</button></div>
                        } @else if (onlyMine()) {
                          <div class="empty-icon">🔎</div>
                          Ninguno de tus productos coincide con esos filtros.
                        } @else {
                          <div class="empty-icon">🔎</div>
                          No hay productos con esos filtros.
                          @if (ref.perCategoryLimit(); as limit) {
                            <div class="small">En la demo solo están los {{ limit }} productos más vendidos de cada rubro.</div>
                          }
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        @if (!onlyMine() && rows().length < total()) {
          <div class="more">
            <button type="button" class="btn" (click)="loadMore()" [disabled]="loading()">Ver más ({{ total() - rows().length }})</button>
          </div>
        }

        <p class="muted small source">
          @if (!loading()) {
            {{ onlyMine() ? visibleRows().length : total() }} producto{{ (onlyMine() ? visibleRows().length : total()) === 1 ? '' : 's' }}.
          }
          Precios de lista informados por supermercados de todo el país
          (mediana{{ ref.provinceName() ? ' en ' + ref.provinceName() : ' nacional' }}; si una provincia no tiene datos se usa la nacional).
          @if (updatedAt(); as d) {
            Actualizado el {{ d | date: 'dd/MM/yyyy' }}.
          }
          Fuente: SEPA – Precios Claros, Ministerio de Producción (CC-BY 4.0).
        </p>
      }
    </div>

    @if (updating(); as show) {
      <app-update-prices-modal [matches]="matches() ?? []" [initialShow]="show" (saved)="afterUpdate()" (cancel)="updating.set(null)" />
    }

    @if (adding(); as p) {
      <app-product-form-modal [reference]="p" [initialBarcode]="p.barcode" (saved)="afterAdd()" (cancel)="adding.set(null)" />
    }
  `,
})
export class Prices implements OnInit {
  protected readonly ref = inject(ReferenceCatalog);
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogStore);
  private readonly catalogApi = inject(CatalogApi);
  private readonly toast = inject(ToastService);

  /** Todo el catálogo de referencia (para cruzarlo con los productos propios). null = cargando. */
  private readonly allRefs = signal<RefProduct[] | null>(null);
  /** Productos propios que están en SEPA (mismo código de barras). null = todavía no se sabe. */
  protected readonly matches = computed<RefMatch[] | null>(() => {
    const refs = this.allRefs();
    if (!refs) return null;
    const byBarcode = new Map(refs.map((r) => [r.barcode, r]));
    return this.catalog
      .activeProducts()
      .filter((p) => p.barcode && byBarcode.has(p.barcode) && p.salePrice > 0)
      .map((p) => ({ product: p, ref: byBarcode.get(p.barcode!)! }));
  });
  protected readonly cheaperCount = computed(() => (this.matches() ?? []).filter((m) => priceDiff(m.product.salePrice, m.ref.price) < 0).length);
  protected readonly pricierCount = computed(() => (this.matches() ?? []).filter((m) => priceDiff(m.product.salePrice, m.ref.price) > 0).length);
  protected readonly onlyMine = signal(false);
  /** Rubros con productos (Cigarrillos no tiene en SEPA): para calcular el total del demo. */
  protected readonly categoriesWithProducts = computed(() => this.categories().filter((c) => c.productCount > 0).length);
  /** Grupo con el que se abre el modal de actualización (null = cerrado). */
  protected readonly updating = signal<'DIFF' | 'CHEAPER' | 'PRICIER' | null>(null);
  protected readonly busyId = signal<string | null>(null);

  /** Filas visibles: el catálogo paginado de la API, o solo los productos propios (filtrados acá). */
  protected readonly visibleRows = computed(() => {
    if (!this.onlyMine()) return this.rows();
    const words = norm(this.query()).split(/\s+/).filter(Boolean);
    const cat = this.category();
    return (this.matches() ?? [])
      .map((m) => m.ref)
      .filter((r) => !cat || r.category?.slug === cat)
      .filter((r) => {
        const hay = norm(`${r.name} ${r.brand?.name ?? ''} ${r.barcode}`);
        return words.every((w) => hay.includes(w));
      });
  });

  protected readonly categories = signal<RefCategory[]>([]);
  protected readonly category = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly rows = signal<RefProduct[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly adding = signal<RefProduct | null>(null);
  protected readonly updatedAt = computed(() =>
    this.rows().reduce<string | null>((max, p) => (!max || p.priceUpdatedAt > max ? p.priceUpdatedAt : max), null),
  );

  private page = 1;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  /** Descarta respuestas viejas si el usuario cambió los filtros mientras cargaba. */
  private requestId = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  ngOnInit(): void {
    if (!this.ref.enabled) return;
    this.ref.loadProvinces();
    this.ref.categories().subscribe({
      next: (list) => this.categories.set(list),
      error: (err) => this.toast.error(err),
    });
    this.reload();
    this.loadMatches();
  }

  /** Trae todo el catálogo de referencia para saber cuáles de tus productos están en SEPA. */
  private loadMatches(): void {
    this.allRefs.set(null);
    this.ref.all().subscribe({
      next: (list) => this.allRefs.set(list),
      error: () => this.allRefs.set([]),
    });
  }

  protected openUpdate(show: 'DIFF' | 'CHEAPER' | 'PRICIER'): void {
    if (!this.auth.isAdmin()) {
      this.onlyMine.set(true);
      return;
    }
    this.updating.set(show);
  }

  protected afterUpdate(): void {
    this.updating.set(null);
    this.catalog.reloadProducts();
  }

  /** Cambia el precio de un producto propio al de referencia (un clic, sin redondeo). */
  protected useReference(id: string, name: string, before: number, price: number): void {
    this.busyId.set(id);
    this.catalogApi.updatePrices([{ productId: id, salePrice: price }]).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(`${name}: ${money(before)} → ${money(price)}.`);
        this.catalog.reloadProducts();
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(e);
      },
    });
  }

  /** Producto propio con el mismo código de barras (para comparar precios). */
  protected mine(p: RefProduct) {
    return this.catalog.findByCode(p.barcode);
  }

  /** Diferencia % de tu precio contra el de referencia (null si no hay precio propio). */
  protected diff(own: number, refPrice: number): number | null {
    return priceDiff(own, refPrice) || null;
  }

  protected selectCategory(slug: string | null): void {
    this.category.set(slug);
    this.reload();
  }

  protected onSearch(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 300);
  }

  protected onProvince(code: string): void {
    this.ref.setProvince(code);
    this.reload();
    this.loadMatches();
  }

  protected reload(): void {
    this.page = 1;
    this.fetch(false);
  }

  protected loadMore(): void {
    this.page++;
    this.fetch(true);
  }

  protected afterAdd(): void {
    this.adding.set(null);
    this.catalog.reloadProducts();
  }

  private fetch(append: boolean): void {
    const id = ++this.requestId;
    this.loading.set(true);
    this.failed.set(false);
    if (!append) this.rows.set([]);
    this.ref.products({ category: this.category(), search: this.query(), page: this.page, limit: PAGE_SIZE }).subscribe({
      next: (page) => {
        if (id !== this.requestId) return;
        this.rows.set(append ? [...this.rows(), ...page.data] : page.data);
        this.total.set(page.total);
        this.loading.set(false);
      },
      error: (err) => {
        if (id !== this.requestId) return;
        this.loading.set(false);
        this.failed.set(true);
        this.toast.error(err);
      },
    });
  }
}
