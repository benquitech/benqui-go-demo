import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomersApi } from '../core/api';
import { Customer } from '../core/models';
import { MoneyPipe } from '../core/money';
import { Icon } from './icon';
import { ToastService } from './toast';
import { flagInvalid } from './invalid';

/** Buscar o dar de alta (solo nombre y teléfono) un cliente sin salir de la venta. */
@Component({
  selector: 'app-customer-picker',
  imports: [FormsModule, Icon, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .list { display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto; margin-top: 8px; }
    .opt {
      display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius);
      border: 1px solid var(--line); background: var(--surface); cursor: pointer; text-align: left; font: inherit; color: inherit;
    }
    .opt:hover { border-color: var(--primary); }
    .opt.selected { border-color: var(--primary); background: var(--primary-soft); }
    .opt .name { font-weight: 600; flex: 1; }
    .new { margin-top: 10px; padding: 12px; border-radius: var(--radius); background: var(--surface-2); }
  `,
  template: `
    <div class="row">
      <input class="input grow" placeholder="Buscar cliente por nombre o teléfono" [ngModel]="query()" (ngModelChange)="search($event)" aria-label="Buscar cliente" />
      <button type="button" class="btn" (click)="creating.set(!creating())"><app-icon name="plus" [size]="18" /> Nuevo</button>
    </div>
    @if (creating()) {
      <form class="new stack" (ngSubmit)="create()">
        <div class="grid-2">
          <input id="cp-name" class="input" name="n" placeholder="Nombre *" aria-label="Nombre" [(ngModel)]="newName" autofocus />
          <input class="input" name="p" placeholder="Teléfono" [(ngModel)]="newPhone" />
        </div>
        <button class="btn btn-primary btn-sm" type="submit">Crear y elegir</button>
      </form>
    }
    <div class="list" role="listbox" aria-label="Clientes">
      @for (c of results(); track c.id) {
        <button type="button" class="opt" role="option" [class.selected]="selectedId() === c.id" [attr.aria-selected]="selectedId() === c.id" (click)="picked.emit(c)">
          <app-icon name="user" [size]="18" />
          <span class="name">{{ c.name }}</span>
          @if (c.balance > 0) {
            <span class="chip chip-warn num">Debe {{ c.balance | money }}</span>
          }
        </button>
      } @empty {
        <span class="muted small">No hay clientes con ese nombre.</span>
      }
    </div>
  `,
})
export class CustomerPicker {
  private readonly api = inject(CustomersApi);
  private readonly toast = inject(ToastService);
  readonly selectedId = input<string | null>(null);
  readonly picked = output<Customer>();

  protected readonly query = signal('');
  protected readonly results = signal<Customer[]>([]);
  protected readonly creating = signal(false);
  protected newName = '';
  protected newPhone = '';

  constructor() {
    this.search('');
  }

  protected search(q: string): void {
    this.query.set(q);
    this.api.list(q).subscribe((r) => this.results.set(r.slice(0, 30)));
  }

  protected create(): void {
    if (!this.newName.trim()) {
      flagInvalid('cp-name', 'Escribí el nombre del cliente.', this.toast);
      return;
    }
    this.api
      .save(null, { name: this.newName, phone: this.newPhone.trim() || null, document: null, address: null, creditLimit: null, notes: null })
      .subscribe({
        next: (c) => {
          this.creating.set(false);
          this.newName = this.newPhone = '';
          this.picked.emit(c);
        },
        error: (e) => this.toast.error(e),
      });
  }
}
