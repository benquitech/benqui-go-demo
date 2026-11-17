import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogApi, SettingsApi } from '../../core/api';
import { DemoDb } from '../../core/demo/demo-api';
import { BusinessSettings, Category, PaymentMethod } from '../../core/models';
import { parseAmount } from '../../core/money';
import { CatalogStore } from '../../core/stores';
import { environment } from '../../../environments/environment';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { DialogService } from '../../shared/dialog';
import { ToastService } from '../../shared/toast';
import { flagInvalid } from '../../shared/invalid';
import { NumberField } from '../../shared/number-field';

const EMOJIS = [
  '🥤', '🧃', '🍺', '🍷', '☕', '🍬', '🍫', '🍭', '🍪', '🥨', '🍦', '🥛',
  '🧀', '🍞', '🛒', '🚬', '🧴', '🧼', '🧻', '💊', '🩹', '👶', '🐶', '🔋',
  '📱', '🎁', '✏️', '🍕',
];
const COLORS = ['#0ea5e9', '#ec4899', '#f59e0b', '#64748b', '#84cc16', '#38bdf8', '#a78bfa', '#14b8a6', '#f97316', '#ef4444', '#22c55e'];

interface CategoryForm {
  name: string;
  icon: string;
  color: string;
  isActive: boolean;
}

@Component({
  selector: 'app-settings',
  imports: [NumberField, FormsModule, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings.scss',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly settingsApi = inject(SettingsApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly db = inject(DemoDb);
  protected readonly catalog = inject(CatalogStore);
  protected readonly demo = environment.demo;
  protected readonly emojis = EMOJIS;
  protected readonly colors = COLORS;

  /** Copia editable de la configuración. */
  protected form: BusinessSettings = { ...this.catalog.settings()! };
  protected readonly saving = signal(false);

  protected readonly editingCat = signal<{ id: string | null } | null>(null);
  protected catForm: CategoryForm = { name: '', icon: '📦', color: COLORS[0], isActive: true };

  protected saveSettings(): void {
    if (!this.form.name.trim()) {
      flagInvalid('s-name', 'Escribí el nombre del negocio: sale en el ticket.', this.toast);
      return;
    }
    const f = this.form;
    const clean = (v: string | null) => v?.trim() || null;
    this.saving.set(true);
    this.settingsApi
      .update({
        name: f.name.trim(),
        address: clean(f.address),
        phone: clean(f.phone),
        cuit: f.cuit?.replace(/\D/g, '') || null,
        ticketFooter: clean(f.ticketFooter),
        ticketWidth: Number(f.ticketWidth) === 58 ? 58 : 80,
        printTicket: f.printTicket,
        allowNegativeStock: f.allowNegativeStock,
        requireCashSession: f.requireCashSession,
      })
      .subscribe({
        next: (s) => {
          this.saving.set(false);
          this.catalog.settings.set(s);
          this.form = { ...s };
          this.toast.success('Cambios guardados.');
        },
        error: (e) => {
          this.saving.set(false);
          this.toast.error(e);
        },
      });
  }

  // ---------- Medios de pago ----------

  protected toggleMethod(m: PaymentMethod): void {
    this.updateMethod(m, { isActive: !m.isActive });
  }

  protected setSurcharge(m: PaymentMethod, raw: string): void {
    const v = parseAmount(raw) ?? 0;
    if (v < 0 || v > 100) {
      this.toast.error('El recargo tiene que estar entre 0 y 100%.');
      return;
    }
    if (v !== m.surchargePercent) this.updateMethod(m, { surchargePercent: v });
  }

  private updateMethod(m: PaymentMethod, patch: Partial<PaymentMethod>): void {
    this.settingsApi.updatePaymentMethod(m.id, patch).subscribe({
      next: (u) => this.catalog.paymentMethods.update((ms) => ms.map((x) => (x.id === u.id ? u : x))),
      error: (e) => this.toast.error(e),
    });
  }

  // ---------- Categorías ----------

  protected newCategory(): void {
    const used = new Set(this.catalog.categories().map((c) => c.color));
    this.catForm = { name: '', icon: '📦', color: COLORS.find((c) => !used.has(c)) ?? COLORS[0], isActive: true };
    this.editingCat.set({ id: null });
  }

  protected editCategory(c: Category): void {
    this.catForm = { name: c.name, icon: c.icon, color: c.color, isActive: c.isActive };
    this.editingCat.set({ id: c.id });
  }

  protected saveCategory(): void {
    const e = this.editingCat();
    if (!e) return;
    if (!this.catForm.name.trim()) {
      flagInvalid('cat-name', 'Escribí el nombre de la categoría.', this.toast);
      return;
    }
    const existing = e.id ? this.catalog.categories().find((c) => c.id === e.id) : null;
    const order = existing?.order ?? Math.max(0, ...this.catalog.categories().map((c) => c.order)) + 1;
    this.catalogApi.saveCategory(e.id, { ...this.catForm, icon: this.catForm.icon.trim() || '📦', order }).subscribe({
      next: () => {
        this.editingCat.set(null);
        this.toast.success(e.id ? 'Categoría actualizada.' : 'Categoría creada.');
        this.catalog.load().subscribe();
      },
      error: (err) => this.toast.error(err),
    });
  }

  protected async deleteCategory(c: Category): Promise<void> {
    const count = this.catalog.products().filter((p) => p.categoryId === c.id).length;
    const ok = await this.dialog.confirm({
      title: `¿Borrar la categoría "${c.name}"?`,
      message: count ? `Sus ${count} productos no se borran: quedan sin categoría.` : 'No tiene productos.',
      confirmText: 'Borrar',
      tone: 'danger',
    });
    if (!ok) return;
    this.catalogApi.deleteCategory(c.id).subscribe({
      next: () => {
        this.editingCat.set(null);
        this.toast.success('Categoría borrada.');
        this.catalog.load().subscribe();
      },
      error: (e) => this.toast.error(e),
    });
  }

  protected deleteEditing(id: string): void {
    const c = this.catalog.category(id);
    if (c) this.deleteCategory(c);
  }

  protected productCount(c: Category): number {
    return this.catalog.products().filter((p) => p.categoryId === c.id).length;
  }

  // ---------- Demo ----------

  protected async resetDemo(): Promise<void> {
    const ok = await this.dialog.confirm({
      title: '¿Volver a los datos de ejemplo?',
      message: 'Se pierden las ventas y los cambios que hiciste en la demo.',
      confirmText: 'Reiniciar demo',
      tone: 'danger',
    });
    if (!ok) return;
    this.db.reset();
    location.reload();
  }
}
