import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogApi } from '../../core/api';
import { BulkPriceInput } from '../../core/models';
import { MoneyPipe, parseAmount, round2 } from '../../core/money';
import { CatalogStore } from '../../core/stores';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { DialogService } from '../../shared/dialog';
import { ToastService } from '../../shared/toast';
import { flagInvalid } from '../../shared/invalid';
import { NumberField } from '../../shared/number-field';

const STEP = { NONE: 0, TEN: 10, FIFTY: 50, HUNDRED: 100 } as const;

@Component({
  selector: 'app-bulk-price-modal',
  imports: [NumberField, FormsModule, Modal, MoneyPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .preview { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
    .arrow { color: var(--muted); }
    .new { font-weight: 700; color: var(--primary); }
    .count { padding: 10px 14px; border-radius: var(--radius); background: var(--warn-soft); color: var(--warn); font-weight: 600; }
  `,
  template: `
    <app-modal title="Actualizar precios" [width]="560" (closed)="closed.emit()">
      <form id="bulk-form" class="stack" (ngSubmit)="apply()">
        <div class="grid-2">
          <div class="field">
            <label for="bp-pct">Porcentaje</label>
            <input appNumber allowNegative id="bp-pct" name="pct" class="input input-lg input-money" inputmode="decimal" [ngModel]="pctRaw()" (ngModelChange)="pctRaw.set($event)" placeholder="Ej: 10 o -5" autofocus autocomplete="off" />
            <span class="hint">Negativo para bajar precios.</span>
          </div>
          <div class="field">
            <label for="bp-cat">Categoría</label>
            <select id="bp-cat" name="cat" class="input" [ngModel]="categoryId()" (ngModelChange)="categoryId.set($event)">
              <option [ngValue]="null">Todas</option>
              @for (c of catalog.categories(); track c.id) {
                <option [ngValue]="c.id">{{ c.icon }} {{ c.name }}</option>
              }
            </select>
          </div>
        </div>
        <div class="field">
          <span class="label">Aplicar a</span>
          <div class="segmented">
            <button type="button" [class.active]="applyTo() === 'SALE'" (click)="applyTo.set('SALE')">Precio de venta</button>
            <button type="button" [class.active]="applyTo() === 'COST'" (click)="applyTo.set('COST')">Costo</button>
            <button type="button" [class.active]="applyTo() === 'BOTH'" (click)="applyTo.set('BOTH')">Ambos</button>
          </div>
        </div>
        @if (applyTo() !== 'COST') {
          <div class="field">
            <span class="label">Redondear precio de venta</span>
            <div class="segmented">
              <button type="button" [class.active]="rounding() === 'NONE'" (click)="rounding.set('NONE')">Sin redondeo</button>
              <button type="button" [class.active]="rounding() === 'TEN'" (click)="rounding.set('TEN')">$ 10</button>
              <button type="button" [class.active]="rounding() === 'FIFTY'" (click)="rounding.set('FIFTY')">$ 50</button>
              <button type="button" [class.active]="rounding() === 'HUNDRED'" (click)="rounding.set('HUNDRED')">$ 100</button>
            </div>
          </div>
        }

        <div class="count"><app-icon name="alert" [size]="16" /> Se van a modificar {{ targets().length }} productos.</div>

        @if (preview().length) {
          <div class="preview table-wrap">
            <table class="table">
              <thead><tr><th>Ejemplo</th><th class="right">Antes</th><th></th><th class="right">Después</th></tr></thead>
              <tbody>
                @for (r of preview(); track r.name) {
                  <tr>
                    <td>{{ r.name }}</td>
                    <td class="right num">{{ r.before | money }}</td>
                    <td class="arrow">→</td>
                    <td class="right num new">{{ r.after | money }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
        <button type="submit" form="bulk-form" class="btn btn-primary" [disabled]="busy()">Aplicar</button>
      </div>
    </app-modal>
  `,
})
export class BulkPriceModal {
  protected readonly catalog = inject(CatalogStore);
  private readonly api = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  readonly closed = output<void>();
  readonly applied = output<void>();

  protected readonly pctRaw = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly applyTo = signal<BulkPriceInput['applyTo']>('SALE');
  protected readonly rounding = signal<BulkPriceInput['rounding']>('TEN');
  protected readonly busy = signal(false);

  protected readonly pct = computed(() => parseAmount(this.pctRaw()) ?? 0);
  protected readonly targets = computed(() => this.catalog.products().filter((p) => !this.categoryId() || p.categoryId === this.categoryId()));

  /** Misma cuenta que hace la API, para mostrar el antes → después. */
  protected readonly preview = computed(() => {
    const f = 1 + this.pct() / 100;
    const step = STEP[this.rounding()];
    const useCost = this.applyTo() === 'COST';
    return this.targets()
      .filter((p) => (useCost ? p.costPrice : p.salePrice > 0))
      .slice(0, 5)
      .map((p) => {
        const before = useCost ? p.costPrice! : p.salePrice;
        const raw = before * f;
        return { name: p.name, before, after: useCost || !step ? round2(raw) : Math.round(raw / step) * step };
      });
  });

  protected async apply(): Promise<void> {
    if (this.busy()) return;
    if (!this.pct()) {
      flagInvalid('bp-pct', 'Escribí el porcentaje: 10 para subir 10%, -5 para bajar 5%.', this.toast);
      return;
    }
    if (!this.targets().length) {
      this.toast.warning('No hay productos en esa categoría.');
      return;
    }
    const cat = this.catalog.category(this.categoryId());
    const verb = this.pct() > 0 ? 'Subir' : 'Bajar';
    const ok = await this.dialog.confirm({
      title: `¿${verb} ${Math.abs(this.pct())}% ${cat ? 'a ' + cat.name : 'a todos los productos'}?`,
      message: 'Los precios nuevos se usan desde la próxima venta. Las ventas pasadas no cambian.',
      confirmText: `Sí, ${verb.toLowerCase()} precios`,
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.bulkPrice({ percent: this.pct(), categoryId: this.categoryId(), applyTo: this.applyTo(), rounding: this.applyTo() === 'COST' ? 'NONE' : this.rounding() }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.toast.success(`Listo: ${r.updated} productos actualizados.`);
        this.applied.emit();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }
}
