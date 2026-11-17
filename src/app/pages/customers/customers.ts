import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomersApi } from '../../core/api';
import { AccountMovement, Customer, CustomerInput } from '../../core/models';
import { MoneyPipe, money, parseAmount, round2 } from '../../core/money';
import { CashStore, CatalogStore } from '../../core/stores';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { DialogService } from '../../shared/dialog';
import { ToastService } from '../../shared/toast';
import { flagInvalid } from '../../shared/invalid';
import { norm } from '../../core/text';
import { NumberField } from '../../shared/number-field';


interface FormModel {
  name: string;
  phone: string;
  document: string;
  address: string;
  creditLimit: string;
  notes: string;
}

@Component({
  selector: 'app-customers',
  imports: [NumberField, FormsModule, DatePipe, Icon, Modal, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './customers.scss',
  templateUrl: './customers.html',
})
export class Customers {
  private readonly api = inject(CustomersApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly cash = inject(CashStore);
  protected readonly catalog = inject(CatalogStore);

  protected readonly all = signal<Customer[]>([]);
  protected readonly query = signal('');
  protected readonly sortBy = signal<'debt' | 'name'>('debt');

  protected readonly totalDebt = computed(() => round2(this.all().reduce((t, c) => t + Math.max(0, c.balance), 0)));
  protected readonly debtors = computed(() => this.all().filter((c) => c.balance > 0.009).length);

  protected readonly visible = computed(() => {
    const words = norm(this.query().trim()).split(/\s+/).filter(Boolean);
    const digits = this.query().replace(/\D/g, '');
    const rows = this.all().filter((c) => {
      if (!words.length) return true;
      const hay = norm(`${c.name} ${c.document ?? ''}`);
      return words.every((w) => hay.includes(w)) || (digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits));
    });
    return rows.sort((a, b) => (this.sortBy() === 'debt' ? b.balance - a.balance || a.name.localeCompare(b.name, 'es') : a.name.localeCompare(b.name, 'es')));
  });

  // ---------- Alta / edición ----------
  protected readonly editing = signal<{ id: string | null } | null>(null);
  protected form: FormModel = this.emptyForm();
  protected readonly saving = signal(false);

  // ---------- Detalle ----------
  protected readonly detail = signal<Customer | null>(null);
  protected readonly movements = signal<AccountMovement[]>([]);
  protected readonly paying = signal(false);
  protected payAmount = '';
  protected payMethodId = '';
  protected payNotes = '';
  protected readonly payMethods = computed(() => this.catalog.activePaymentMethods().filter((m) => m.kind !== 'ACCOUNT'));

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.list().subscribe((r) => {
      this.all.set(r);
      const d = this.detail();
      if (d) this.detail.set(r.find((c) => c.id === d.id) ?? null);
    });
  }

  private emptyForm(): FormModel {
    return { name: '', phone: '', document: '', address: '', creditLimit: '', notes: '' };
  }

  protected limitState(c: Customer): 'over' | 'debt' | 'ok' {
    if (c.balance <= 0.009) return 'ok';
    return c.creditLimit != null && c.balance > c.creditLimit + 0.009 ? 'over' : 'debt';
  }

  protected openNew(): void {
    this.form = this.emptyForm();
    this.editing.set({ id: null });
  }

  protected openEdit(c: Customer): void {
    this.form = {
      name: c.name,
      phone: c.phone ?? '',
      document: c.document ?? '',
      address: c.address ?? '',
      creditLimit: c.creditLimit != null ? String(c.creditLimit) : '',
      notes: c.notes ?? '',
    };
    this.editing.set({ id: c.id });
  }

  protected save(): void {
    const e = this.editing();
    if (!e) return;
    if (!this.form.name.trim()) {
      flagInvalid('c-name', 'Escribí el nombre del cliente.', this.toast);
      return;
    }
    const limitRaw = this.form.creditLimit.trim();
    const limit = limitRaw ? parseAmount(limitRaw) : null;
    if (limitRaw && (limit == null || limit < 0)) {
      flagInvalid('c-limit', 'El límite de fiado no es válido: escribí un monto, o dejalo vacío para no poner límite.', this.toast);
      return;
    }
    const input: CustomerInput = {
      name: this.form.name,
      phone: this.form.phone.trim() || null,
      document: this.form.document.replace(/\D/g, '') || null,
      address: this.form.address.trim() || null,
      creditLimit: limit,
      notes: this.form.notes.trim() || null,
    };
    this.saving.set(true);
    this.api.save(e.id, input).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.toast.success(e.id ? 'Cliente actualizado.' : 'Cliente creado.');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err);
      },
    });
  }

  protected async remove(c: Customer): Promise<void> {
    const ok = await this.dialog.confirm({ title: `¿Borrar a ${c.name}?`, message: 'Se borra el cliente y su historial de fiado.', confirmText: 'Borrar', tone: 'danger' });
    if (!ok) return;
    this.api.delete(c.id).subscribe({
      next: () => {
        this.toast.success('Cliente borrado.');
        this.detail.set(null);
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }

  protected removeEditing(id: string): void {
    const c = this.all().find((x) => x.id === id);
    if (!c) return;
    this.editing.set(null);
    this.remove(c);
  }

  protected openDetail(c: Customer): void {
    this.detail.set(c);
    this.paying.set(false);
    this.movements.set([]);
    this.api.movements(c.id).subscribe((m) => this.movements.set(m));
  }

  protected startPayment(): void {
    this.payAmount = '';
    this.payNotes = '';
    this.payMethodId = this.payMethods()[0]?.id ?? '';
    this.paying.set(true);
  }

  protected payAll(): void {
    const c = this.detail();
    if (c) this.payAmount = String(c.balance).replace('.', ',');
  }

  protected registerPayment(): void {
    const c = this.detail();
    const amount = parseAmount(this.payAmount);
    if (!c) return;
    if (!amount || amount <= 0) {
      flagInvalid('p-amount', 'Escribí cuánto paga.', this.toast);
      return;
    }
    this.saving.set(true);
    this.api.registerPayment(c.id, { amount: round2(amount), paymentMethodId: this.payMethodId, notes: this.payNotes.trim() || null }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.paying.set(false);
        this.toast.success(`Pago de ${money(amount)} registrado.`);
        this.cash.refresh();
        this.detail.set(updated);
        this.api.movements(updated.id).subscribe((m) => this.movements.set(m));
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(e);
      },
    });
  }

  protected movementLabel(m: AccountMovement): string {
    if (m.type === 'CHARGE') return m.saleNumber ? `Fiado · venta #${m.saleNumber}` : 'Fiado';
    if (m.type === 'PAYMENT') return m.paymentMethodName ? `Pago con ${m.paymentMethodName}` : 'Pago';
    return 'Ajuste';
  }

  protected whatsappUrl(c: Customer): string | null {
    const digits = (c.phone ?? '').replace(/\D/g, '').replace(/^0/, '');
    if (digits.length < 8) return null;
    const business = this.catalog.settings()?.name ?? 'el negocio';
    const text = `Hola ${c.name}, te recordamos que tenés un saldo de ${money(c.balance)} en ${business}.`;
    return `https://wa.me/549${digits}?text=${encodeURIComponent(text)}`;
  }
}
