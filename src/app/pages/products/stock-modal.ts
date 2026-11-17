import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogApi } from '../../core/api';
import { Product, StockMovement, StockMovementType } from '../../core/models';
import { MoneyPipe, QtyPipe, parseAmount } from '../../core/money';
import { CatalogStore } from '../../core/stores';
import { Modal } from '../../shared/modal';
import { ToastService } from '../../shared/toast';
import { flagInvalid } from '../../shared/invalid';
import { NumberField } from '../../shared/number-field';

type Kind = 'PURCHASE' | 'ADJUSTMENT' | 'LOSS';

const TYPE_LABEL: Record<StockMovementType, string> = {
  PURCHASE: 'Ingreso',
  SALE: 'Venta',
  SALE_VOID: 'Anulación',
  ADJUSTMENT: 'Ajuste',
  LOSS: 'Pérdida',
};

@Component({
  selector: 'app-stock-modal',
  imports: [NumberField, FormsModule, DatePipe, Modal, MoneyPipe, QtyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .now { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 14px; border-radius: var(--radius); background: var(--surface-2); }
    .now strong { font-size: 1.4rem; }
    .history { max-height: 260px; overflow-y: auto; border: 1px solid var(--line); border-radius: var(--radius); }
    .pos { color: var(--success); font-weight: 700; }
    .neg { color: var(--danger); font-weight: 700; }
  `,
  template: `
    <app-modal [title]="'Stock · ' + product().name" [width]="620" (closed)="closed.emit()">
      <div class="stack">
        <div class="now">
          <span class="muted">Stock actual</span>
          <strong class="num">{{ current().stock | qty: current().saleUnit }}</strong>
        </div>

        @if (current().trackStock) {
          <div class="segmented">
            <button type="button" [class.active]="kind() === 'PURCHASE'" (click)="setKind('PURCHASE')">Ingreso de mercadería</button>
            <button type="button" [class.active]="kind() === 'ADJUSTMENT'" (click)="setKind('ADJUSTMENT')">Ajuste por conteo</button>
            <button type="button" [class.active]="kind() === 'LOSS'" (click)="setKind('LOSS')">Pérdida / rotura</button>
          </div>

          <form id="stock-form" class="stack" (ngSubmit)="save()">
            <div class="grid-2">
              <div class="field">
                <label for="st-qty">{{ kind() === 'ADJUSTMENT' ? 'Stock contado' : 'Cantidad' }}{{ current().saleUnit === 'KG' ? ' (kg)' : '' }}</label>
                <input [appNumber]="product().saleUnit === 'KG' ? 3 : 0" id="st-qty" name="qty" class="input input-money" inputmode="decimal" [(ngModel)]="qtyRaw" autofocus autocomplete="off" />
              </div>
              @if (kind() === 'PURCHASE') {
                <div class="field">
                  <label for="st-cost">Costo unitario (opcional)</label>
                  <input appNumber id="st-cost" name="cost" class="input input-money" inputmode="decimal" [(ngModel)]="costRaw" [placeholder]="(current().costPrice | money) + ' actual'" autocomplete="off" />
                  <span class="hint">Si cambia, actualiza el costo del producto.</span>
                </div>
              }
            </div>
            <div class="field">
              <label for="st-notes">Nota</label>
              <input id="st-notes" name="notes" class="input" [(ngModel)]="notes" [placeholder]="kind() === 'PURCHASE' ? 'Ej: Proveedor Arcor' : kind() === 'LOSS' ? 'Ej: Se rompió / venció' : 'Ej: Conteo mensual'" autocomplete="off" />
            </div>
          </form>
        } @else {
          <p class="muted">Este producto no controla stock.</p>
        }

        <h3>Historial</h3>
        <div class="history table-wrap">
          <table class="table">
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th class="right">Cantidad</th><th class="right">Stock</th><th>Nota</th></tr>
            </thead>
            <tbody>
              @for (m of history(); track m.id) {
                <tr>
                  <td class="small">{{ m.createdAt | date: 'dd/MM HH:mm' }}</td>
                  <td>{{ typeLabel[m.type] }}</td>
                  <td class="right num" [class.pos]="m.quantity > 0" [class.neg]="m.quantity < 0">{{ m.quantity > 0 ? '+' : '' }}{{ m.quantity | qty: current().saleUnit }}</td>
                  <td class="right num">{{ m.stockAfter | qty: current().saleUnit }}</td>
                  <td class="small muted">{{ m.notes }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="muted small">Todavía no hay movimientos.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div modal-footer>
        <button type="button" class="btn" (click)="closed.emit()">Cerrar</button>
        @if (current().trackStock) {
          <button type="submit" form="stock-form" class="btn btn-primary" [disabled]="busy()">Registrar</button>
        }
      </div>
    </app-modal>
  `,
})
export class StockModal implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly catalog = inject(CatalogStore);
  private readonly toast = inject(ToastService);

  readonly product = input.required<Product>();
  readonly closed = output<void>();

  protected readonly typeLabel = TYPE_LABEL;
  protected readonly kind = signal<Kind>('PURCHASE');
  protected readonly busy = signal(false);
  protected readonly history = signal<StockMovement[]>([]);
  private readonly updated = signal<Product | null>(null);
  protected readonly current = computed(() => this.updated() ?? this.product());
  protected qtyRaw = '';
  protected costRaw = '';
  protected notes = '';

  ngOnInit(): void {
    this.loadHistory();
  }

  protected setKind(k: Kind): void {
    this.kind.set(k);
    this.qtyRaw = k === 'ADJUSTMENT' ? String(this.current().stock).replace('.', ',') : '';
  }

  private loadHistory(): void {
    this.api.stockHistory(this.product().id).subscribe((h) => this.history.set(h));
  }

  protected save(): void {
    const quantity = parseAmount(this.qtyRaw);
    if (quantity == null || (this.kind() !== 'ADJUSTMENT' && quantity <= 0) || quantity < 0) {
      flagInvalid('st-qty', this.kind() === 'ADJUSTMENT' ? 'Escribí cuántas unidades contaste.' : 'Escribí la cantidad.', this.toast);
      return;
    }
    this.busy.set(true);
    this.api
      .moveStock(this.product().id, {
        type: this.kind(),
        quantity,
        unitCost: this.kind() === 'PURCHASE' ? parseAmount(this.costRaw) : null,
        notes: this.notes.trim() || null,
      })
      .subscribe({
        next: (p) => {
          this.busy.set(false);
          this.updated.set(p);
          this.qtyRaw = this.costRaw = this.notes = '';
          if (this.kind() === 'ADJUSTMENT') this.qtyRaw = String(p.stock).replace('.', ',');
          this.toast.success('Stock actualizado.');
          this.catalog.reloadProducts();
          this.loadHistory();
        },
        error: (e) => {
          this.busy.set(false);
          this.toast.error(e);
        },
      });
  }
}
