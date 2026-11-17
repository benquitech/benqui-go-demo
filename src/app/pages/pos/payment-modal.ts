import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Customer, PaymentKind, PaymentMethod, SaleInput } from '../../core/models';
import { MoneyPipe, parseAmount, round2 } from '../../core/money';
import { CatalogStore } from '../../core/stores';
import { CustomerPicker } from '../../shared/customer-picker';
import { Icon, IconName } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { NumberField } from '../../shared/number-field';

interface PayLine {
  methodId: string;
  amount: number;
}

export interface PaymentResult {
  customerId: string | null;
  payments: SaleInput['payments'];
}

const KIND_ICON: Record<PaymentKind, IconName> = {
  CASH: 'cash',
  DEBIT: 'tag',
  CREDIT: 'tag',
  TRANSFER: 'up',
  QR: 'grid',
  ACCOUNT: 'book',
};

@Component({
  selector: 'app-payment-modal',
  imports: [NumberField, FormsModule, Modal, MoneyPipe, Icon, CustomerPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './payment-modal.scss',
  templateUrl: './payment-modal.html',
})
export class PaymentModal implements OnInit {
  private readonly catalog = inject(CatalogStore);

  /** Total a cobrar (sin recargos). */
  readonly total = input.required<number>();
  readonly busy = input(false);
  readonly paid = output<PaymentResult>();
  readonly cancel = output<void>();

  protected readonly methods = this.catalog.activePaymentMethods;
  protected readonly kindIcon = KIND_ICON;
  protected readonly split = signal(false);
  protected readonly lines = signal<PayLine[]>([]);
  protected readonly receivedRaw = signal('');
  protected readonly customer = signal<Customer | null>(null);

  ngOnInit(): void {
    // Por defecto: todo en efectivo (lo más común en un kiosco).
    const cash = this.methods().find((m) => m.kind === 'CASH') ?? this.methods()[0];
    this.lines.set([{ methodId: cash.id, amount: this.total() }]);
  }

  private method(id: string): PaymentMethod | undefined {
    return this.methods().find((m) => m.id === id);
  }

  protected readonly single = computed(() => (this.split() ? null : (this.lines()[0] ?? null)));
  protected readonly assigned = computed(() => round2(this.lines().reduce((t, l) => t + l.amount, 0)));
  protected readonly remaining = computed(() => round2(this.total() - this.assigned()));
  protected readonly surcharge = computed(() => round2(this.lines().reduce((t, l) => t + (l.amount * (this.method(l.methodId)?.surchargePercent ?? 0)) / 100, 0)));
  protected readonly grandTotal = computed(() => round2(this.total() + this.surcharge()));

  /** Lo que hay que cobrar en efectivo (con su recargo, si tuviera). */
  protected readonly cashDue = computed(() =>
    round2(
      this.lines()
        .filter((l) => this.method(l.methodId)?.kind === 'CASH')
        .reduce((t, l) => t + l.amount * (1 + (this.method(l.methodId)?.surchargePercent ?? 0) / 100), 0),
    ),
  );
  protected readonly hasCash = computed(() => this.cashDue() > 0);
  protected readonly needsCustomer = computed(() => this.lines().some((l) => this.method(l.methodId)?.kind === 'ACCOUNT' && l.amount > 0));
  protected readonly received = computed(() => parseAmount(this.receivedRaw()) ?? this.cashDue());
  protected readonly change = computed(() => round2(this.received() - this.cashDue()));

  /** Billetes sugeridos: el justo y los redondeos hacia arriba más comunes. */
  protected readonly bills = computed(() => {
    const due = this.cashDue();
    const out = new Set<number>();
    for (const step of [500, 1000, 2000, 5000, 10000, 20000]) {
      const v = Math.ceil(due / step) * step;
      if (v > due) out.add(v);
    }
    return [...out].sort((a, b) => a - b).slice(0, 5);
  });

  protected readonly error = computed(() => {
    if (Math.abs(this.remaining()) > 0.009) return this.remaining() > 0 ? 'Falta asignar parte del total.' : 'Los pagos superan el total.';
    if (this.lines().some((l) => l.amount <= 0)) return 'Hay un medio de pago sin importe.';
    if (this.hasCash() && this.change() < -0.009) return 'El efectivo recibido no alcanza.';
    if (this.needsCustomer() && !this.customer()) return 'Elegí a quién se le fía.';
    const c = this.customer();
    const fiado = this.lines()
      .filter((l) => this.method(l.methodId)?.kind === 'ACCOUNT')
      .reduce((t, l) => t + l.amount, 0);
    if (c && c.creditLimit != null && c.balance + fiado > c.creditLimit + 0.009) return `Supera el límite de fiado de ${c.name}.`;
    return null;
  });

  protected selectMethod(m: PaymentMethod): void {
    this.lines.set([{ methodId: m.id, amount: this.total() }]);
    this.receivedRaw.set('');
  }

  protected toggleSplit(): void {
    if (this.split()) {
      this.split.set(false);
      this.lines.set([{ methodId: this.lines()[0].methodId, amount: this.total() }]);
    } else {
      this.split.set(true);
      const other = this.methods().find((m) => m.id !== this.lines()[0].methodId) ?? this.methods()[0];
      this.lines.update((ls) => [{ ...ls[0], amount: 0 }, { methodId: other.id, amount: 0 }]);
    }
  }

  protected setLine(i: number, patch: Partial<PayLine>): void {
    this.lines.update((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  protected setLineAmount(i: number, raw: string): void {
    this.setLine(i, { amount: round2(parseAmount(raw) ?? 0) });
  }
  /** Completa la línea con lo que falta asignar. */
  protected fillLine(i: number): void {
    this.setLine(i, { amount: round2(this.lines()[i].amount + this.remaining()) });
  }
  protected addLine(): void {
    const used = new Set(this.lines().map((l) => l.methodId));
    const m = this.methods().find((x) => !used.has(x.id)) ?? this.methods()[0];
    this.lines.update((ls) => [...ls, { methodId: m.id, amount: Math.max(0, this.remaining()) }]);
  }
  protected removeLine(i: number): void {
    this.lines.update((ls) => ls.filter((_, j) => j !== i));
  }

  protected submit(): void {
    if (this.error() || this.busy()) return;
    const cashLine = this.lines().findIndex((l) => this.method(l.methodId)?.kind === 'CASH');
    this.paid.emit({
      customerId: this.customer()?.id ?? null,
      payments: this.lines().map((l, i) => ({
        paymentMethodId: l.methodId,
        amount: l.amount,
        // Si hay un solo pago en efectivo, el recibido total va en esa línea (para el vuelto).
        receivedAmount: i === cashLine ? round2(this.received() - (this.cashDue() - l.amount * (1 + (this.method(l.methodId)?.surchargePercent ?? 0) / 100))) : null,
      })),
    });
  }
}
