import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CatalogApi } from '../../core/api';
import { Product, ProductInput, SaleUnit } from '../../core/models';
import { money, parseAmount, round2 } from '../../core/money';
import { RefProduct, ReferenceCatalog } from '../../core/reference-catalog';
import { norm } from '../../core/text';
import { CatalogStore } from '../../core/stores';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { ProductThumb } from '../../shared/product-thumb';
import { DialogService } from '../../shared/dialog';
import { ToastService } from '../../shared/toast';
import { flagInvalid } from '../../shared/invalid';
import { NumberField } from '../../shared/number-field';

/** Achica la foto a máx. 240 px y la devuelve como data URL JPEG (liviana para guardar). */
function resizeImage(file: File, max = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}

const fmt = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

@Component({
  selector: 'app-product-form-modal',
  imports: [NumberField, FormsModule, Modal, Icon, ProductThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .photo { display: flex; align-items: center; gap: 14px; }
    .photo-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .file { position: relative; overflow: hidden; }
    .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .checks { display: flex; flex-wrap: wrap; gap: 18px; }
    .margin { display: flex; align-items: center; gap: 6px; }
    .margin input { max-width: 90px; }
    .ref {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 14px;
      border-radius: var(--radius-lg); border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
      background: color-mix(in srgb, var(--primary) 7%, white);
    }
    .ref .txt { flex: 1 1 260px; display: flex; flex-direction: column; gap: 2px; }
  `,
  template: `
    <app-modal [title]="product() ? 'Editar producto' : 'Nuevo producto'" [width]="640" (closed)="cancel.emit()">
      <form id="prod-form" class="stack" (ngSubmit)="save()">
        @if (searching()) {
          <div class="small muted" role="status">🔎 Buscando el código en los precios de SEPA…</div>
        }
        @if (suggestion(); as r) {
          <div class="ref" role="status">
            <span aria-hidden="true">🏷️</span>
            <div class="txt">
              <strong>{{ r.name }}</strong>
              <span class="small muted">
                Precio de referencia {{ refPrice(r) }}{{ r.priceProvince ? ' en ' + (refCatalog.provinceName() ?? r.priceProvince) : ' (nacional)' }}
                · en supermercados de {{ refMoney(r.minPrice) }} a {{ refMoney(r.maxPrice) }}
              </span>
            </div>
            @if (!applied()) {
              <button type="button" class="btn btn-sm btn-primary" (click)="applyReference(r)">Usar estos datos</button>
            } @else {
              <span class="small muted">Datos cargados: revisá el precio.</span>
            }
          </div>
        }
        <div class="photo">
          <app-product-thumb [product]="{ imageUrl: imageUrl() }" [category]="catalog.category(categoryId)" [size]="80" />
          <div class="stack" style="gap: 6px">
            <div class="photo-actions">
              <span class="btn btn-sm file">
                <app-icon name="camera" [size]="16" /> {{ imageUrl() ? 'Cambiar foto' : 'Agregar foto' }}
                <input type="file" accept="image/*" capture="environment" (change)="onFile($event)" aria-label="Foto del producto" />
              </span>
              @if (imageUrl()) {
                <button type="button" class="btn btn-sm btn-danger" (click)="imageUrl.set(null)"><app-icon name="trash" [size]="16" /> Quitar</button>
              }
            </div>
            <span class="hint muted small">Sin foto se muestra el ícono y el color de la categoría.</span>
          </div>
        </div>

        <div class="field">
          <label for="pf-name">Nombre *</label>
          <input id="pf-name" name="name" class="input" [(ngModel)]="name" placeholder="Ej: Coca-Cola 500 ml" autofocus autocomplete="off" />
        </div>

        <div class="grid-3">
          <div class="field">
            <label for="pf-cat">Categoría</label>
            <select id="pf-cat" name="cat" class="input" [(ngModel)]="categoryId">
              <option [ngValue]="null">Sin categoría</option>
              @for (c of catalog.categories(); track c.id) {
                <option [ngValue]="c.id">{{ c.icon }} {{ c.name }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="pf-barcode">Código de barras</label>
            <input appNumber plain id="pf-barcode" name="barcode" class="input" [(ngModel)]="barcode" placeholder="Escaneá acá" autocomplete="off" (keydown.enter)="$event.preventDefault(); lookupReference()" (blur)="lookupReference()" />
          </div>
          <div class="field">
            <label for="pf-code">Código corto</label>
            <input id="pf-code" name="code" class="input" [(ngModel)]="code" placeholder="Ej: 12" maxlength="10" autocomplete="off" />
          </div>
        </div>

        <div class="field">
          <span class="label">Se vende por</span>
          <div class="segmented">
            <button type="button" [class.active]="saleUnit() === 'UNIT'" (click)="saleUnit.set('UNIT')">Unidad</button>
            <button type="button" [class.active]="saleUnit() === 'KG'" (click)="saleUnit.set('KG')">Kilo</button>
          </div>
        </div>

        <div class="grid-3">
          <div class="field">
            <label for="pf-cost">Costo{{ saleUnit() === 'KG' ? ' por kg' : '' }}</label>
            <input appNumber id="pf-cost" name="cost" class="input input-money" inputmode="decimal" [ngModel]="costRaw" (ngModelChange)="onCost($event)" placeholder="$ 0" autocomplete="off" />
          </div>
          <div class="field">
            <label for="pf-margin">Margen %</label>
            <input appNumber="1" allowNegative id="pf-margin" name="margin" class="input input-money" inputmode="decimal" [ngModel]="marginRaw" (ngModelChange)="onMargin($event)" placeholder="—" autocomplete="off" />
            <span class="hint">Tipealo y calcula el precio</span>
          </div>
          <div class="field">
            <label for="pf-price">Precio de venta{{ saleUnit() === 'KG' ? ' por kg' : '' }} *</label>
            <input appNumber id="pf-price" name="price" class="input input-money" inputmode="decimal" [ngModel]="priceRaw" (ngModelChange)="onPrice($event)" placeholder="$ 0" autocomplete="off" />
            <span class="hint">0 = precio libre (se tipea al vender)</span>
          </div>
        </div>

        <label class="check"><input type="checkbox" name="track" [(ngModel)]="trackStock" /> Controla stock</label>
        @if (trackStock) {
          <div class="grid-2">
            @if (!product()) {
              <div class="field">
                <label for="pf-stock">Stock inicial</label>
                <input [appNumber]="saleUnit() === 'KG' ? 3 : 0" id="pf-stock" name="stock" class="input input-money" inputmode="decimal" [(ngModel)]="initialStockRaw" placeholder="0" autocomplete="off" />
              </div>
            }
            <div class="field">
              <label for="pf-min">Stock mínimo (aviso)</label>
              <input [appNumber]="saleUnit() === 'KG' ? 3 : 0" id="pf-min" name="min" class="input input-money" inputmode="decimal" [(ngModel)]="minStockRaw" placeholder="Sin aviso" autocomplete="off" />
            </div>
          </div>
        }

        <div class="checks">
          <label class="check"><input type="checkbox" name="fav" [(ngModel)]="isFavorite" /> ⭐ Favorito (aparece primero al vender)</label>
          <label class="check"><input type="checkbox" name="active" [(ngModel)]="isActive" /> Activo</label>
        </div>

        <div class="field">
          <label for="pf-notes">Notas</label>
          <textarea id="pf-notes" name="notes" class="input" rows="2" [(ngModel)]="notes"></textarea>
        </div>
      </form>
      <div modal-footer>
        @if (product()) {
          <button type="button" class="btn btn-danger" style="margin-right: auto" (click)="remove()" [disabled]="busy()"><app-icon name="trash" [size]="16" /> Borrar</button>
        }
        <button type="button" class="btn" (click)="cancel.emit()">Cancelar</button>
        <button type="submit" form="prod-form" class="btn btn-primary" [disabled]="busy()">Guardar</button>
      </div>
    </app-modal>
  `,
})
export class ProductFormModal implements OnInit {
  protected readonly catalog = inject(CatalogStore);
  private readonly api = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  protected readonly refCatalog = inject(ReferenceCatalog);

  readonly product = input<Product | null>(null);
  /** Código escaneado que no existía: precarga el alta. */
  readonly initialBarcode = input<string | null>(null);
  /** Producto del catálogo de precios de referencia (pantalla Precios → Agregar): precarga el alta. */
  readonly reference = input<RefProduct | null>(null);
  readonly saved = output<void>();
  readonly cancel = output<void>();

  protected readonly busy = signal(false);
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly saleUnit = signal<SaleUnit>('UNIT');
  /** Sugerencia del catálogo de precios de referencia para el código de barras (solo en altas). */
  protected readonly suggestion = signal<RefProduct | null>(null);
  protected readonly applied = signal(false);
  /** Consultando el código de barras en SEPA (no bloquea el formulario). */
  protected readonly searching = signal(false);
  private lookedUp = '';
  private lookup?: Subscription;
  protected name = '';
  protected categoryId: string | null = null;
  protected barcode = '';
  protected code = '';
  protected costRaw = '';
  protected priceRaw = '';
  protected marginRaw = '';
  protected trackStock = true;
  protected initialStockRaw = '';
  protected minStockRaw = '';
  protected isFavorite = false;
  protected isActive = true;
  protected notes = '';

  ngOnInit(): void {
    const p = this.product();
    if (!p) {
      this.barcode = this.initialBarcode() ?? '';
      // Para mostrar "en Salta" en vez de "en AR-A" en la sugerencia.
      if (this.refCatalog.enabled) this.refCatalog.loadProvinces();
      const ref = this.reference();
      if (ref) {
        this.lookedUp = ref.barcode;
        this.suggestion.set(ref);
        this.applyReference(ref);
      } else {
        this.lookupReference();
      }
      return;
    }
    this.name = p.name;
    this.categoryId = p.categoryId;
    this.barcode = p.barcode ?? '';
    this.code = p.code ?? '';
    this.costRaw = fmt(p.costPrice);
    this.priceRaw = fmt(p.salePrice);
    this.trackStock = p.trackStock;
    this.minStockRaw = fmt(p.minStock);
    this.isFavorite = p.isFavorite;
    this.isActive = p.isActive;
    this.notes = p.notes ?? '';
    this.imageUrl.set(p.imageUrl);
    this.saleUnit.set(p.saleUnit);
    this.refreshMargin();
  }

  /** Busca el código de barras en el catálogo de precios de referencia (solo al dar de alta). */
  protected lookupReference(): void {
    const code = this.barcode.trim();
    if (this.product() || !this.refCatalog.enabled || code === this.lookedUp) return;
    this.lookedUp = code;
    this.lookup?.unsubscribe();
    this.searching.set(false);
    this.suggestion.set(null);
    this.applied.set(false);
    if (!/^\d{8,14}$/.test(code)) return;
    // Si falla la consulta no se muestra nada: el alta sigue como siempre.
    this.searching.set(true);
    this.lookup = this.refCatalog.byBarcode(code).subscribe({
      next: (r) => {
        this.searching.set(false);
        this.suggestion.set(r);
      },
      error: () => this.searching.set(false),
    });
  }

  /** Completa nombre, categoría y precio de venta con el producto de referencia (el costo queda como está). */
  protected applyReference(r: RefProduct): void {
    this.name = r.name;
    const local = r.category
      ? this.catalog.categories().find((c) => c.id === `cat-${r.category!.slug}` || norm(c.name) === norm(r.category!.name))
      : undefined;
    if (local) this.categoryId = local.id;
    this.saleUnit.set('UNIT');
    this.priceRaw = fmt(Math.round(r.price));
    this.refreshMargin();
    this.applied.set(true);
  }

  protected refPrice(r: RefProduct): string {
    return money(r.price);
  }
  protected refMoney(n: number): string {
    return money(n);
  }

  /** Margen sobre el costo: (precio − costo) / costo. */
  private refreshMargin(): void {
    const cost = parseAmount(this.costRaw);
    const price = parseAmount(this.priceRaw);
    this.marginRaw = cost && price ? fmt(Math.round(((price - cost) / cost) * 1000) / 10) : '';
  }

  protected onCost(v: string): void {
    this.costRaw = v;
    this.refreshMargin();
  }
  protected onPrice(v: string): void {
    this.priceRaw = v;
    this.refreshMargin();
  }
  protected onMargin(v: string): void {
    this.marginRaw = v;
    const cost = parseAmount(this.costRaw);
    const m = parseAmount(v);
    if (cost && m != null) this.priceRaw = fmt(Math.round(cost * (1 + m / 100)));
  }

  protected async onFile(e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try {
      this.imageUrl.set(await resizeImage(file));
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected save(): void {
    const price = parseAmount(this.priceRaw) ?? 0;
    if (!this.name.trim()) {
      flagInvalid('pf-name', 'Escribí el nombre del producto.', this.toast);
      return;
    }
    if (price < 0) {
      flagInvalid('pf-price', 'El precio no puede ser negativo.', this.toast);
      return;
    }
    const input: ProductInput = {
      name: this.name,
      categoryId: this.categoryId,
      barcode: this.barcode.trim() || null,
      code: this.code.trim() || null,
      imageUrl: this.imageUrl(),
      saleUnit: this.saleUnit(),
      costPrice: parseAmount(this.costRaw) != null ? round2(parseAmount(this.costRaw)!) : null,
      salePrice: round2(price),
      trackStock: this.trackStock,
      minStock: this.trackStock ? parseAmount(this.minStockRaw) : null,
      isFavorite: this.isFavorite,
      isActive: this.isActive,
      notes: this.notes.trim() || null,
      initialStock: !this.product() && this.trackStock ? (parseAmount(this.initialStockRaw) ?? 0) : undefined,
    };
    this.busy.set(true);
    this.api.saveProduct(this.product()?.id ?? null, input).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(this.product() ? 'Producto actualizado.' : 'Producto creado.');
        this.saved.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(err);
      },
    });
  }

  protected async remove(): Promise<void> {
    const p = this.product();
    if (!p) return;
    const ok = await this.dialog.confirm({
      title: `¿Borrar "${p.name}"?`,
      message: 'Deja de aparecer para vender. Las ventas pasadas no se modifican.',
      confirmText: 'Borrar',
      tone: 'danger',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.deleteProduct(p.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Producto borrado.');
        this.saved.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(err);
      },
    });
  }
}
