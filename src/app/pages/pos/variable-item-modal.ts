import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product } from '../../core/models';
import { MoneyPipe, parseAmount, round2, round3 } from '../../core/money';
import { Modal } from '../../shared/modal';
import { ToastService } from '../../shared/toast';
import { flagInvalid } from '../../shared/invalid';
import { NumberField } from '../../shared/number-field';

export interface VariableItemResult {
  quantity: number;
  price?: number;
  description?: string;
}

/**
 * Datos que faltan para agregar un ítem:
 * - Producto por kilo: peso en kg o gramos, o "$ 1.000 de…" (calcula el peso).
 * - Producto sin precio (SUBE, recargas) o "Varios": el importe.
 */
@Component({
  selector: 'app-variable-item-modal',
  imports: [NumberField, FormsModule, DecimalPipe, Modal, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: contents; }
    .preview { margin-top: 14px; padding: 14px; border-radius: var(--radius); background: var(--surface-2); display: flex; justify-content: space-between; align-items: baseline; }
    .preview strong { font-size: 1.5rem; font-variant-numeric: tabular-nums; }
    .quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  `,
  template: `
    <app-modal [title]="title()" [width]="420" (closed)="cancel.emit()">
      <form id="var-form" class="stack" (ngSubmit)="submit()">
        @if (mode() === 'weight') {
          <div class="segmented" role="tablist">
            <button type="button" [class.active]="weightBy() === 'g'" (click)="weightBy.set('g')">Gramos</button>
            <button type="button" [class.active]="weightBy() === 'kg'" (click)="weightBy.set('kg')">Kilos</button>
            <button type="button" [class.active]="weightBy() === 'amount'" (click)="weightBy.set('amount')">Por importe</button>
          </div>
          <div class="field">
            <label for="var-value">{{ weightBy() === 'g' ? 'Gramos' : weightBy() === 'kg' ? 'Kilos' : 'Importe a cobrar ($)' }}</label>
            <input [appNumber]="weightBy() === 'g' ? 0 : weightBy() === 'kg' ? 3 : 2" id="var-value" name="value" class="input input-lg input-money" inputmode="decimal" [(ngModel)]="raw" autofocus autocomplete="off" />
            <span class="hint">Precio por kilo: {{ product()!.salePrice | money }}</span>
          </div>
          @if (weightBy() === 'g') {
            <div class="quick">
              @for (g of [100, 250, 500, 1000]; track g) {
                <button type="button" class="btn btn-sm" (click)="raw = '' + g; submit()">{{ g === 1000 ? '1 kg' : g + ' g' }}</button>
              }
            </div>
          }
        } @else {
          @if (mode() === 'misc') {
            <div class="field">
              <label for="var-desc">Descripción</label>
              <input id="var-desc" name="desc" class="input" [(ngModel)]="description" placeholder="Varios" autocomplete="off" />
            </div>
          }
          <div class="field">
            <label for="var-price">Importe ($)</label>
            <input appNumber id="var-price" name="price" class="input input-lg input-money" inputmode="decimal" [(ngModel)]="raw" autofocus autocomplete="off" />
          </div>
        }
        <div class="preview">
          <span class="muted">{{ mode() === 'weight' ? (kg() | number: '1.3-3') + ' kg' : 'Total' }}</span>
          <strong>{{ total() | money }}</strong>
        </div>
      </form>
      <div modal-footer>
        <button type="button" class="btn" (click)="cancel.emit()">Cancelar</button>
        <button type="submit" form="var-form" class="btn btn-primary" >Agregar</button>
      </div>
    </app-modal>
  `,
})
export class VariableItemModal {
  /** null = ítem "Varios". */
  private readonly toast = inject(ToastService);
  readonly product = input<Product | null>(null);
  readonly done = output<VariableItemResult>();
  readonly cancel = output<void>();

  protected readonly weightBy = signal<'g' | 'kg' | 'amount'>('g');
  protected readonly rawSig = signal('');
  protected description = '';

  protected get raw(): string {
    return this.rawSig();
  }
  protected set raw(v: string) {
    this.rawSig.set(v);
  }

  protected readonly mode = computed(() => (!this.product() ? 'misc' : this.product()!.saleUnit === 'KG' ? 'weight' : 'price'));
  protected readonly title = computed(() => (this.product() ? this.product()!.name : 'Producto varios'));
  private readonly value = computed(() => parseAmount(this.rawSig()) ?? 0);

  protected readonly kg = computed(() => {
    const v = this.value();
    const price = this.product()?.salePrice || 1;
    return this.weightBy() === 'g' ? round3(v / 1000) : this.weightBy() === 'kg' ? round3(v) : round3(v / price);
  });
  protected readonly total = computed(() => (this.mode() === 'weight' ? round2(this.kg() * (this.product()?.salePrice ?? 0)) : this.value()));
  protected readonly valid = computed(() => (this.mode() === 'weight' ? this.kg() > 0 : this.value() > 0));

  protected submit(): void {
    if (!this.valid()) {
      if (this.mode() === 'weight') flagInvalid('var-value', this.weightBy() === 'amount' ? 'Escribí el importe a cobrar.' : 'Escribí cuánto pesa.', this.toast);
      else flagInvalid('var-price', 'Escribí el importe.', this.toast);
      return;
    }
    if (this.mode() === 'weight') this.done.emit({ quantity: this.kg() });
    else this.done.emit({ quantity: 1, price: this.value(), description: this.description.trim() || undefined });
  }
}
