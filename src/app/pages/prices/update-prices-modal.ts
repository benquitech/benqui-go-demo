import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogApi } from '../../core/api';
import { Product } from '../../core/models';
import { MoneyPipe, round2 } from '../../core/money';
import { RefProduct, ReferenceCatalog } from '../../core/reference-catalog';
import { CatalogStore } from '../../core/stores';
import { DialogService } from '../../shared/dialog';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { ProductThumb } from '../../shared/product-thumb';
import { ToastService } from '../../shared/toast';

/** Producto propio que también está en el catálogo de referencia (mismo código de barras). */
export interface RefMatch {
  product: Product;
  ref: RefProduct;
}

type Rounding = 'NONE' | 'TEN' | 'FIFTY' | 'HUNDRED';
type Show = 'DIFF' | 'CHEAPER' | 'PRICIER';

const STEP: Record<Rounding, number> = { NONE: 0, TEN: 10, FIFTY: 50, HUNDRED: 100 };

/** Diferencia % de tu precio contra el de referencia (negativo = estás más barato). */
export function priceDiff(own: number, ref: number): number {
  if (!(own > 0) || !(ref > 0)) return 0;
  return Math.round(((own - ref) / ref) * 100);
}

/**
 * Actualiza los precios de venta propios con los precios de referencia de SEPA.
 * Se eligen los productos, el redondeo, y se confirma. Las ventas pasadas no cambian.
 */
@Component({
  selector: 'app-update-prices-modal',
  imports: [FormsModule, Modal, Icon, MoneyPipe, ProductThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: contents; }
    .opts { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; justify-content: space-between; }
    .opt { display: flex; flex-direction: column; gap: 4px; }
    .opt > span { font-size: 0.8rem; font-weight: 600; color: var(--text-2); }
    .list { max-height: min(52dvh, 460px); overflow-y: auto; border: 1px solid var(--line); border-radius: var(--radius); }
    .row {
      display: grid; grid-template-columns: 24px 40px minmax(0, 1fr) 96px 96px 110px; align-items: center; gap: 10px;
      padding: 8px 12px; border-bottom: 1px solid var(--line); cursor: pointer;
    }
    .row:last-child { border-bottom: 0; }
    .row:hover { background: var(--surface-2); }
    .row.off { opacity: 0.55; }
    .head { cursor: default; background: var(--surface-2); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); position: sticky; top: 0; z-index: 1; }
    .head:hover { background: var(--surface-2); }
    .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .r { text-align: right; font-variant-numeric: tabular-nums; }
    .new { font-weight: 750; color: var(--primary); }
    input[type='checkbox'] { width: 18px; height: 18px; accent-color: var(--primary); }
    .warn-cost { color: var(--danger); font-size: 0.75rem; font-weight: 600; }
    .summary { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.88rem; color: var(--text-2); }
    @media (max-width: 640px) {
      .row { grid-template-columns: 24px minmax(0, 1fr) 90px; }
      .row > :nth-child(2), .row > :nth-child(4), .row > :nth-child(5) { display: none; }
    }
  `,
  template: `
    <app-modal title="Actualizar mis precios con SEPA" [width]="820" (closed)="cancel.emit()">
      <div class="stack">
        <p class="muted">
          Estos productos tuyos también están en los precios de referencia{{ ref.provinceName() ? ' de ' + ref.provinceName() : '' }}.
          Elegí cuáles actualizar: tu precio de venta pasa a ser el de referencia, redondeado.
        </p>

        <div class="opts">
          <div class="opt">
            <span>Mostrar</span>
            <div class="segmented" role="group" aria-label="Mostrar">
              <button type="button" [class.active]="show() === 'DIFF'" (click)="setShow('DIFF')">Con diferencia ({{ counts().diff }})</button>
              <button type="button" [class.active]="show() === 'CHEAPER'" (click)="setShow('CHEAPER')">Más baratos ({{ counts().cheaper }})</button>
              <button type="button" [class.active]="show() === 'PRICIER'" (click)="setShow('PRICIER')">Más caros ({{ counts().pricier }})</button>
            </div>
          </div>
          <div class="opt">
            <span>Redondear a</span>
            <div class="segmented" role="group" aria-label="Redondeo">
              <button type="button" [class.active]="rounding() === 'NONE'" (click)="rounding.set('NONE')">Sin</button>
              <button type="button" [class.active]="rounding() === 'TEN'" (click)="rounding.set('TEN')">$ 10</button>
              <button type="button" [class.active]="rounding() === 'FIFTY'" (click)="rounding.set('FIFTY')">$ 50</button>
              <button type="button" [class.active]="rounding() === 'HUNDRED'" (click)="rounding.set('HUNDRED')">$ 100</button>
            </div>
          </div>
        </div>

        <div class="list" role="list">
          <div class="row head" role="presentation">
            <input type="checkbox" [checked]="allVisibleSelected()" (change)="toggleAll()" aria-label="Elegir todos" [disabled]="!visible().length" />
            <span></span>
            <span>Producto</span>
            <span class="r">Tu precio</span>
            <span class="r">Referencia</span>
            <span class="r">Nuevo precio</span>
          </div>
          @for (m of visible(); track m.product.id) {
            <div class="row" role="listitem" [class.off]="!selected().has(m.product.id)" (click)="toggle(m.product.id)">
              <input type="checkbox" [checked]="selected().has(m.product.id)" (click)="$event.stopPropagation()" (change)="toggle(m.product.id)" [attr.aria-label]="'Actualizar ' + m.product.name" />
              <app-product-thumb [product]="m.product" [category]="catalog.category(m.product.categoryId)" [size]="36" />
              <div style="min-width: 0">
                <div class="name">{{ m.product.name }}</div>
                @if (m.product.costPrice != null && newPrice(m) < m.product.costPrice) {
                  <div class="warn-cost">Queda debajo de tu costo ({{ m.product.costPrice | money }})</div>
                } @else {
                  <div class="muted small">{{ m.ref.name }}</div>
                }
              </div>
              <span class="r">
                {{ m.product.salePrice | money }}
                @if (diffOf(m); as d) {
                  <div><span class="chip" [class.chip-success]="d < 0" [class.chip-warn]="d > 0">{{ d > 0 ? '+' : '' }}{{ d }}%</span></div>
                }
              </span>
              <span class="r">{{ m.ref.price | money }}</span>
              <span class="r new">{{ newPrice(m) | money }}</span>
            </div>
          } @empty {
            <div class="empty">
              <div class="empty-icon">✅</div>
              No hay productos en esta lista.
            </div>
          }
        </div>

        @if (selectedCount()) {
          <div class="summary">
            <span><strong>{{ selectedCount() }}</strong> producto{{ selectedCount() === 1 ? '' : 's' }} elegido{{ selectedCount() === 1 ? '' : 's' }}</span>
            @if (raises()) {
              <span>{{ raises() }} sube{{ raises() === 1 ? '' : 'n' }}</span>
            }
            @if (drops()) {
              <span>{{ drops() }} baja{{ drops() === 1 ? '' : 'n' }}</span>
            }
          </div>
        }
      </div>
      <div modal-footer>
        <button type="button" class="btn" (click)="cancel.emit()">Cancelar</button>
        <button type="button" class="btn btn-primary" (click)="apply()" [disabled]="busy()">
          <app-icon name="check" [size]="18" /> Actualizar {{ selectedCount() || '' }} precio{{ selectedCount() === 1 ? '' : 's' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class UpdatePricesModal implements OnInit {
  protected readonly ref = inject(ReferenceCatalog);
  protected readonly catalog = inject(CatalogStore);
  private readonly api = inject(CatalogApi);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  readonly matches = input.required<RefMatch[]>();
  /** Abrir mostrando solo este grupo (desde el resumen de la pantalla). */
  readonly initialShow = input<Show>('DIFF');
  readonly saved = output<number>();
  readonly cancel = output<void>();

  protected readonly show = signal<Show>('DIFF');
  protected readonly rounding = signal<Rounding>('TEN');
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly busy = signal(false);

  /** Solo los que difieren de verdad (con el redondeo elegido, el precio cambiaría). */
  private readonly differing = computed(() => this.matches().filter((m) => this.newPrice(m) !== m.product.salePrice));
  protected readonly counts = computed(() => {
    const d = this.differing();
    return { diff: d.length, cheaper: d.filter((m) => m.product.salePrice < m.ref.price).length, pricier: d.filter((m) => m.product.salePrice > m.ref.price).length };
  });
  protected readonly visible = computed(() => {
    const d = this.differing();
    const s = this.show();
    const list = s === 'CHEAPER' ? d.filter((m) => m.product.salePrice < m.ref.price) : s === 'PRICIER' ? d.filter((m) => m.product.salePrice > m.ref.price) : d;
    return [...list].sort((a, b) => Math.abs(this.diffOf(b)) - Math.abs(this.diffOf(a)));
  });
  /** Elegidos que siguen en pantalla (al cambiar el filtro no se aplica lo que no se ve). */
  private readonly chosen = computed(() => this.visible().filter((m) => this.selected().has(m.product.id)));
  protected readonly selectedCount = computed(() => this.chosen().length);
  protected readonly raises = computed(() => this.chosen().filter((m) => this.newPrice(m) > m.product.salePrice).length);
  protected readonly drops = computed(() => this.chosen().filter((m) => this.newPrice(m) < m.product.salePrice).length);
  protected readonly allVisibleSelected = computed(() => this.visible().length > 0 && this.visible().every((m) => this.selected().has(m.product.id)));

  ngOnInit(): void {
    this.setShow(this.initialShow());
  }

  /** Cambia el grupo visible y deja elegidos todos los que no quedarían debajo del costo. */
  protected setShow(s: Show): void {
    this.show.set(s);
    this.selected.set(new Set(this.visible().filter((m) => !this.belowCost(m)).map((m) => m.product.id)));
  }

  protected newPrice(m: RefMatch): number {
    const step = STEP[this.rounding()];
    return step ? Math.max(step, Math.round(m.ref.price / step) * step) : round2(m.ref.price);
  }

  protected diffOf(m: RefMatch): number {
    return priceDiff(m.product.salePrice, m.ref.price);
  }

  private belowCost(m: RefMatch): boolean {
    return m.product.costPrice != null && this.newPrice(m) < m.product.costPrice;
  }

  protected toggle(id: string): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleAll(): void {
    const all = this.allVisibleSelected();
    this.selected.set(all ? new Set() : new Set(this.visible().map((m) => m.product.id)));
  }

  protected async apply(): Promise<void> {
    const chosen = this.chosen();
    if (!chosen.length) {
      this.toast.warning('Elegí al menos un producto para actualizar.');
      return;
    }
    const below = chosen.filter((m) => this.belowCost(m)).length;
    const ok = await this.dialog.confirm({
      title: `¿Actualizar ${chosen.length} precio${chosen.length === 1 ? '' : 's'}?`,
      message:
        `Tu precio de venta pasa a ser el de referencia${this.ref.provinceName() ? ' de ' + this.ref.provinceName() : ''}` +
        (this.rounding() === 'NONE' ? '.' : `, redondeado a $ ${STEP[this.rounding()]}.`) +
        (below ? `\n\nOjo: ${below} quedaría${below === 1 ? '' : 'n'} por debajo de tu costo.` : '') +
        '\n\nSe usan desde la próxima venta. Las ventas pasadas no cambian.',
      confirmText: 'Actualizar precios',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.updatePrices(chosen.map((m) => ({ productId: m.product.id, salePrice: this.newPrice(m) }))).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.toast.success(`Listo: ${r.updated} precio${r.updated === 1 ? '' : 's'} actualizado${r.updated === 1 ? '' : 's'}.`);
        this.saved.emit(r.updated);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }
}
