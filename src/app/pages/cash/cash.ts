import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CashApi } from '../../core/api';
import { CashMovementType, CashSession, CashSummary } from '../../core/models';
import { MoneyPipe, parseAmount, round2 } from '../../core/money';
import { AuthService } from '../../core/auth.service';
import { CashStore, CatalogStore } from '../../core/stores';
import { TicketPrinter } from '../../core/ticket';
import { Icon, IconName } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { ToastService } from '../../shared/toast';
import { flagInvalid } from '../../shared/invalid';
import { NumberField } from '../../shared/number-field';

const MOVEMENT: Record<CashMovementType, { label: string; title: string; icon: IconName; hint: string }> = {
  INCOME: { label: 'Ingreso', title: 'Ingreso de dinero', icon: 'down', hint: 'Ej.: cambio que trajiste de casa' },
  EXPENSE: { label: 'Gasto', title: 'Gasto o pago', icon: 'receipt', hint: 'Ej.: pago al proveedor de bebidas' },
  WITHDRAWAL: { label: 'Retiro', title: 'Retiro de dinero', icon: 'up', hint: 'Ej.: retiro del dueño' },
};

@Component({
  selector: 'app-cash',
  imports: [NumberField, FormsModule, DatePipe, MoneyPipe, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cash.scss',
  templateUrl: './cash.html',
})
export class Cash {
  private readonly api = inject(CashApi);
  protected readonly cash = inject(CashStore);
  private readonly catalog = inject(CatalogStore);
  private readonly printer = inject(TicketPrinter);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly MOVEMENT = MOVEMENT;
  protected readonly movementTypes: CashMovementType[] = ['INCOME', 'EXPENSE', 'WITHDRAWAL'];

  protected readonly history = signal<CashSession[]>([]);
  protected readonly busy = signal(false);

  protected openingRaw = '';

  // Movimiento
  protected readonly movementType = signal<CashMovementType | null>(null);
  protected movementAmount = '';
  protected movementReason = '';

  // Cierre
  protected readonly closing = signal(false);
  protected readonly countedRaw = signal('');
  protected closeNotes = '';
  protected readonly closedSummary = signal<CashSummary | null>(null);
  /** Se llegó acá desde "Salir" con la caja abierta: al terminar el cierre se cierra la sesión. */
  protected readonly exitAfterClose = signal(false);

  protected readonly counted = computed(() => parseAmount(this.countedRaw()));
  protected readonly difference = computed(() => {
    const c = this.counted();
    const s = this.cash.current();
    return c == null || !s ? null : round2(c - s.expectedCash);
  });

  /** Ventas cobradas en efectivo: lo esperado menos todo lo demás que entra o sale del cajón. */
  protected readonly cashSales = computed(() => {
    const c = this.cash.current();
    return c ? round2(c.expectedCash - c.session.openingAmount - c.accountPaymentsCash - c.incomes + c.expenses + c.withdrawals) : 0;
  });

  constructor() {
    this.cash.refresh();
    this.loadHistory();
    const sub = this.route.queryParamMap.subscribe((q) => {
      if (q.get('cerrar') !== '1') return;
      this.exitAfterClose.set(q.get('salir') === '1');
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
      // Espera a que la caja esté cargada para abrir el arqueo.
      const wait = setInterval(() => {
        if (!this.cash.loaded()) return;
        clearInterval(wait);
        if (this.cash.isOpen()) this.startClose();
      }, 50);
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected cancelClose(): void {
    this.closing.set(false);
    this.exitAfterClose.set(false);
  }

  /** "Listo" del resumen de cierre: si venía de Salir, cierra la sesión. */
  protected finishClose(): void {
    this.closedSummary.set(null);
    if (this.exitAfterClose()) this.auth.logout();
  }

  private loadHistory(): void {
    this.api.history().subscribe((h) => this.history.set(h.filter((s) => s.status === 'CLOSED')));
  }

  protected open(): void {
    this.busy.set(true);
    this.api.open(parseAmount(this.openingRaw) ?? 0).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.cash.set(c);
        this.openingRaw = '';
        this.toast.success('Caja abierta. ¡Buenas ventas!');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  protected startMovement(type: CashMovementType): void {
    this.movementAmount = '';
    this.movementReason = '';
    this.movementType.set(type);
  }

  protected saveMovement(): void {
    const type = this.movementType();
    if (!type) return;
    const amount = parseAmount(this.movementAmount);
    if (!amount || amount <= 0) {
      flagInvalid('mov-amount', 'Escribí el monto.', this.toast);
      return;
    }
    if (!this.movementReason.trim()) {
      flagInvalid('mov-reason', 'Escribí el motivo, así después sabés de qué fue.', this.toast);
      return;
    }
    this.busy.set(true);
    this.api.addMovement(type, parseAmount(this.movementAmount) ?? 0, this.movementReason).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.cash.set(c);
        this.movementType.set(null);
        this.toast.success(`${MOVEMENT[type].label} registrado.`);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  protected startClose(): void {
    this.countedRaw.set('');
    this.closeNotes = '';
    this.closing.set(true);
  }

  protected confirmClose(): void {
    const counted = this.counted();
    if (counted == null || counted < 0) {
      flagInvalid('counted', 'Escribí cuánto efectivo contaste (si no hay nada, poné 0).', this.toast);
      return;
    }
    this.busy.set(true);
    this.api.close(counted, this.closeNotes.trim() || null).subscribe({
      next: (summary) => {
        this.busy.set(false);
        this.closing.set(false);
        this.cash.set(null);
        this.closedSummary.set(summary);
        this.loadHistory();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  protected printClose(s: CashSummary): void {
    const settings = this.catalog.settings();
    if (settings) this.printer.printCashClose(s, settings);
  }
}
