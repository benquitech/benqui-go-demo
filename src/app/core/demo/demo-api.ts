import { EnvironmentProviders, Injectable, Provider, inject, makeEnvironmentProviders } from '@angular/core';
import { Observable, defer, delay, of, throwError } from 'rxjs';
import { ApiError, AuthApi, CashApi, CatalogApi, CustomersApi, ReportsApi, SalesApi, SettingsApi } from '../api';
import { AuthService } from '../auth.service';
import {
  AccountMovement,
  BulkPriceInput,
  BusinessSettings,
  CashMovementType,
  CashSession,
  CashSummary,
  Category,
  Customer,
  CustomerInput,
  DailyReport,
  Page,
  PaymentMethod,
  Product,
  ProductInput,
  Sale,
  SaleInput,
  SaleItem,
  SalePayment,
  Session,
  StockMovement,
  StockMovementType,
} from '../models';
import { round2, round3 } from '../money';
import { storage } from '../storage';
import { DEMO_VERSION, DemoData, buildSeed } from './seed';
import { norm } from '../text';

const KEY = 'benqui-go.demo-data';

/**
 * "Base de datos" del modo demo: un objeto en memoria persistido en localStorage.
 * Cada operación corre como una transacción: si falla, no se guarda nada.
 */
@Injectable({ providedIn: 'root' })
export class DemoDb {
  private data: DemoData = this.load();

  private load(): DemoData {
    const saved = storage.get<DemoData>(KEY);
    return saved?.version === DEMO_VERSION ? saved : buildSeed();
  }

  read<T>(fn: (d: DemoData) => T): Observable<T> {
    return defer(() => of(structuredClone(fn(this.data))));
  }

  /** Aplica cambios sobre una copia y solo la confirma si no hubo error. */
  write<T>(fn: (d: DemoData) => T): Observable<T> {
    return defer(() => {
      const draft = structuredClone(this.data);
      try {
        const result = fn(draft);
        this.data = draft;
        if (!storage.set(KEY, draft)) console.warn('Demo: no se pudo guardar en localStorage (¿muchas fotos?).');
        return of(structuredClone(result));
      } catch (e) {
        return throwError(() => e);
      }
    });
  }

  /** Vuelve a los datos de ejemplo y a mostrar las guías, como recién instalado. */
  reset(): void {
    this.data = buildSeed();
    storage.set(KEY, this.data);
    storage.remove('benqui-go.tours-seen');
  }
}

const id = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};
const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function currentUser(auth: AuthService) {
  const u = auth.user();
  if (!u) fail(401, 'La sesión expiró. Ingresá de nuevo.');
  return { id: u!.id, name: `${u!.firstName} ${u!.lastName}` };
}

function openSession(d: DemoData): CashSession | undefined {
  return d.cashSessions.find((s) => s.status === 'OPEN');
}

function addStock(d: DemoData, p: Product, type: StockMovementType, quantity: number, extra: Partial<StockMovement> = {}): void {
  if (!p.trackStock) return;
  p.stock = round3(p.stock + quantity);
  p.updatedAt = nowIso();
  d.stockMovements.push({
    id: id(),
    productId: p.id,
    type,
    quantity,
    stockAfter: p.stock,
    unitCost: null,
    saleId: null,
    notes: null,
    createdAt: nowIso(),
    ...extra,
  });
}

type AccountInput = Pick<AccountMovement, 'type' | 'amount'> & Partial<Pick<AccountMovement, 'saleId' | 'saleNumber' | 'paymentMethodId' | 'paymentMethodName' | 'cashSessionId' | 'notes'>>;

function addAccount(d: DemoData, c: Customer, m: AccountInput): void {
  c.balance = round2(c.balance + m.amount);
  d.accountMovements.push({
    id: id(),
    customerId: c.id,
    balanceAfter: c.balance,
    createdAt: nowIso(),
    saleId: null,
    saleNumber: null,
    paymentMethodId: null,
    paymentMethodName: null,
    cashSessionId: null,
    notes: null,
    ...m,
  });
}

function summary(d: DemoData, session: CashSession): CashSummary {
  const sales = d.sales.filter((s) => s.cashSessionId === session.id && s.status === 'COMPLETED');
  const byMethod = new Map<string, { name: string; kind: PaymentMethod['kind']; total: number }>();
  let cashSales = 0;
  for (const p of sales.flatMap((s) => s.payments)) {
    const total = p.amount + p.surchargeAmount;
    const row = byMethod.get(p.paymentMethodId) ?? { name: p.methodName, kind: p.kind, total: 0 };
    row.total = round2(row.total + total);
    byMethod.set(p.paymentMethodId, row);
    if (p.kind === 'CASH') cashSales += total;
  }
  const cashMethodIds = new Set(d.paymentMethods.filter((m) => m.kind === 'CASH').map((m) => m.id));
  const accountPaymentsCash = d.accountMovements
    .filter((m) => m.type === 'PAYMENT' && m.cashSessionId === session.id && cashMethodIds.has(m.paymentMethodId ?? ''))
    .reduce((t, m) => t - m.amount, 0);
  const movements = d.cashMovements.filter((m) => m.cashSessionId === session.id);
  const sum = (t: CashMovementType) => movements.filter((m) => m.type === t).reduce((a, m) => a + m.amount, 0);
  const incomes = sum('INCOME');
  const expenses = sum('EXPENSE');
  const withdrawals = sum('WITHDRAWAL');
  return {
    session,
    salesCount: sales.length,
    salesTotal: round2(sales.reduce((t, s) => t + s.total, 0)),
    byMethod: [...byMethod.values()].sort((a, b) => b.total - a.total),
    accountPaymentsCash: round2(accountPaymentsCash),
    incomes,
    expenses,
    withdrawals,
    expectedCash: round2(session.openingAmount + cashSales + accountPaymentsCash + incomes - expenses - withdrawals),
    movements: [...movements].reverse(),
  };
}

// ---------------------------------------------------------------------------

@Injectable()
class DemoAuthApi extends AuthApi {
  private readonly db = inject(DemoDb);
  login(userName: string, password: string): Observable<Session> {
    return this.db
      .read((d) => {
        const u = d.users.find((x) => x.userName === userName.trim().toLowerCase());
        if (!u || u.password !== password) fail(401, 'Usuario o contraseña incorrectos.');
        const { password: _, ...user } = u!;
        return { user, accessToken: 'demo' };
      })
      .pipe(delay(250));
  }
}

@Injectable()
class DemoSettingsApi extends SettingsApi {
  private readonly db = inject(DemoDb);
  get() {
    return this.db.read((d) => d.settings);
  }
  update(input: Partial<BusinessSettings>) {
    return this.db.write((d) => Object.assign(d.settings, input));
  }
  paymentMethods() {
    return this.db.read((d) => [...d.paymentMethods].sort((a, b) => a.order - b.order));
  }
  updatePaymentMethod(pmId: string, input: Partial<PaymentMethod>) {
    return this.db.write((d) => {
      const m = d.paymentMethods.find((x) => x.id === pmId) ?? fail(404, 'Medio de pago no encontrado.');
      return Object.assign(m, input);
    });
  }
}

@Injectable()
class DemoCatalogApi extends CatalogApi {
  private readonly db = inject(DemoDb);

  categories() {
    return this.db.read((d) => [...d.categories].sort((a, b) => a.order - b.order));
  }
  saveCategory(catId: string | null, input: Omit<Category, 'id'>) {
    return this.db.write((d) => {
      const name = input.name.trim();
      if (!name) fail(400, 'El nombre es obligatorio.');
      if (d.categories.some((c) => c.id !== catId && norm(c.name) === norm(name))) fail(409, 'Ya existe una categoría con ese nombre.');
      if (catId) {
        const c = d.categories.find((x) => x.id === catId) ?? fail(404, 'Categoría no encontrada.');
        return Object.assign(c, input, { name });
      }
      const c: Category = { ...input, name, id: id() };
      d.categories.push(c);
      return c;
    });
  }
  deleteCategory(catId: string) {
    return this.db.write((d) => {
      d.categories = d.categories.filter((c) => c.id !== catId);
      d.products.filter((p) => p.categoryId === catId).forEach((p) => (p.categoryId = null));
    });
  }

  products() {
    return this.db.read((d) => d.products);
  }
  saveProduct(prodId: string | null, input: ProductInput) {
    return this.db.write((d) => {
      const name = input.name.trim();
      if (!name) fail(400, 'El nombre es obligatorio.');
      if (input.salePrice < 0) fail(400, 'El precio no puede ser negativo.');
      const barcode = input.barcode?.trim() || null;
      const code = input.code?.trim().toUpperCase() || null;
      if (barcode && d.products.some((p) => p.id !== prodId && p.barcode === barcode)) fail(409, `El código de barras ${barcode} ya está en otro producto.`);
      if (code && d.products.some((p) => p.id !== prodId && p.code === code)) fail(409, `El código corto ${code} ya está en otro producto.`);
      const { initialStock, ...fields } = input;
      const clean = { ...fields, name, barcode, code, updatedAt: nowIso() };

      if (prodId) {
        const p = d.products.find((x) => x.id === prodId) ?? fail(404, 'Producto no encontrado.');
        return Object.assign(p, clean);
      }
      const p: Product = { ...clean, id: id(), stock: 0 };
      d.products.push(p);
      if (initialStock) addStock(d, p, 'ADJUSTMENT', initialStock, { notes: 'Stock inicial' });
      return p;
    });
  }
  deleteProduct(prodId: string) {
    return this.db.write((d) => {
      d.products = d.products.filter((p) => p.id !== prodId);
    });
  }
  bulkPrice(input: BulkPriceInput) {
    return this.db.write((d) => {
      const step = { NONE: 0, TEN: 10, FIFTY: 50, HUNDRED: 100 }[input.rounding];
      const apply = (v: number) => {
        const n = v * (1 + input.percent / 100);
        return step ? Math.round(n / step) * step : round2(n);
      };
      const targets = d.products.filter((p) => !input.categoryId || p.categoryId === input.categoryId);
      for (const p of targets) {
        if (input.applyTo !== 'COST' && p.salePrice > 0) p.salePrice = apply(p.salePrice);
        if (input.applyTo !== 'SALE' && p.costPrice) p.costPrice = round2(p.costPrice * (1 + input.percent / 100));
        p.updatedAt = nowIso();
      }
      return { updated: targets.length };
    });
  }
  updatePrices(changes: { productId: string; salePrice: number }[]) {
    return this.db.write((d) => {
      if (!changes.length) fail(400, 'No hay precios para actualizar.');
      for (const c of changes) {
        if (!(c.salePrice > 0)) fail(400, 'Hay un precio inválido.');
        const p = d.products.find((x) => x.id === c.productId) ?? fail(404, 'Un producto ya no existe.');
        p.salePrice = round2(c.salePrice);
        p.updatedAt = nowIso();
      }
      return { updated: changes.length };
    });
  }
  moveStock(prodId: string, input: { type: 'PURCHASE' | 'ADJUSTMENT' | 'LOSS'; quantity: number; unitCost?: number | null; notes?: string | null }) {
    return this.db.write((d) => {
      const p = d.products.find((x) => x.id === prodId) ?? fail(404, 'Producto no encontrado.');
      if (!p.trackStock) fail(400, 'Este producto no controla stock.');
      if (!input.quantity) fail(400, 'Ingresá una cantidad.');
      // PURCHASE suma, LOSS resta; ADJUSTMENT recibe el stock contado y registra la diferencia.
      const delta = input.type === 'PURCHASE' ? Math.abs(input.quantity) : input.type === 'LOSS' ? -Math.abs(input.quantity) : round3(input.quantity - p.stock);
      if (input.type === 'PURCHASE' && input.unitCost) p.costPrice = input.unitCost;
      addStock(d, p, input.type, delta, { unitCost: input.unitCost ?? null, notes: input.notes ?? null });
      return p;
    });
  }
  stockHistory(prodId: string) {
    return this.db.read((d) =>
      d.stockMovements
        .filter((m) => m.productId === prodId)
        .reverse()
        .slice(0, 100),
    );
  }
}

@Injectable()
class DemoCashApi extends CashApi {
  private readonly db = inject(DemoDb);
  private readonly auth = inject(AuthService);

  current() {
    return this.db.read((d) => {
      const s = openSession(d);
      return s ? summary(d, s) : null;
    });
  }
  open(openingAmount: number) {
    return this.db.write((d) => {
      if (openSession(d)) fail(409, 'Ya hay una caja abierta.');
      if (openingAmount < 0) fail(400, 'El monto inicial no puede ser negativo.');
      const u = currentUser(this.auth);
      const s: CashSession = {
        id: id(),
        openedBy: u.id,
        openedByName: u.name,
        openedAt: nowIso(),
        openingAmount,
        closedAt: null,
        closedByName: null,
        expectedCash: null,
        countedCash: null,
        difference: null,
        status: 'OPEN',
        notes: null,
      };
      d.cashSessions.push(s);
      return summary(d, s);
    });
  }
  addMovement(type: CashMovementType, amount: number, reason: string) {
    return this.db.write((d) => {
      const s = openSession(d) ?? fail(409, 'No hay una caja abierta.');
      if (!(amount > 0)) fail(400, 'El monto debe ser mayor a cero.');
      if (!reason.trim()) fail(400, 'Indicá el motivo.');
      d.cashMovements.push({ id: id(), cashSessionId: s.id, type, amount, reason: reason.trim(), createdAt: nowIso() });
      return summary(d, s);
    });
  }
  close(countedCash: number, notes: string | null) {
    return this.db.write((d) => {
      const s = openSession(d) ?? fail(409, 'No hay una caja abierta.');
      const sum = summary(d, s);
      Object.assign(s, {
        status: 'CLOSED',
        closedAt: nowIso(),
        closedByName: currentUser(this.auth).name,
        expectedCash: sum.expectedCash,
        countedCash,
        difference: round2(countedCash - sum.expectedCash),
        notes,
      });
      return { ...sum, session: s };
    });
  }
  history() {
    return this.db.read((d) => [...d.cashSessions].reverse());
  }
}

@Injectable()
class DemoSalesApi extends SalesApi {
  private readonly db = inject(DemoDb);
  private readonly auth = inject(AuthService);

  create(input: SaleInput) {
    return this.db.write((d) => {
      const user = currentUser(this.auth);
      const session = openSession(d);
      if (d.settings.requireCashSession && !session) fail(409, 'Abrí la caja para poder vender.');
      if (!input.items.length) fail(400, 'Agregá al menos un producto.');

      const saleId = id();
      const items: SaleItem[] = input.items.map((it) => {
        const p = it.productId ? (d.products.find((x) => x.id === it.productId) ?? fail(404, 'Un producto ya no existe.')) : null;
        const description = p?.name ?? (it.description?.trim() || 'Varios');
        const unitPrice = it.unitPrice ?? p?.salePrice ?? 0;
        if (!(it.quantity > 0)) fail(400, `Cantidad inválida en ${description}.`);
        if (!(unitPrice > 0)) fail(400, `Ingresá el precio de ${description}.`);
        if (p?.trackStock && !d.settings.allowNegativeStock && p.stock < it.quantity) fail(400, `No hay stock suficiente de ${description}.`);
        return {
          id: id(),
          productId: p?.id ?? null,
          description,
          quantity: round3(it.quantity),
          saleUnit: p?.saleUnit ?? 'UNIT',
          unitPrice,
          unitCost: p?.costPrice ?? null,
          discountAmount: 0,
          subtotal: round2(it.quantity * unitPrice),
        };
      });

      const subtotal = round2(items.reduce((t, i) => t + i.subtotal, 0));
      const discount = round2(input.discountAmount || 0);
      if (discount < 0 || discount > subtotal) fail(400, 'El descuento no es válido.');
      const base = round2(subtotal - discount);
      if (!input.payments.length) fail(400, 'Elegí cómo paga.');
      const paid = round2(input.payments.reduce((t, p) => t + p.amount, 0));
      if (Math.abs(paid - base) > 0.009) fail(400, 'Los pagos no suman el total de la venta.');

      const customer = input.customerId ? (d.customers.find((c) => c.id === input.customerId) ?? fail(404, 'Cliente no encontrado.')) : null;
      const payments: SalePayment[] = input.payments.map((p) => {
        const m = d.paymentMethods.find((x) => x.id === p.paymentMethodId) ?? fail(404, 'Medio de pago no encontrado.');
        const surcharge = round2((p.amount * m.surchargePercent) / 100);
        let received: number | null = null;
        let change: number | null = null;
        if (m.kind === 'CASH') {
          received = p.receivedAmount ?? p.amount + surcharge;
          if (received < p.amount + surcharge - 0.009) fail(400, 'El efectivo recibido no alcanza.');
          change = round2(received - p.amount - surcharge);
        }
        if (m.kind === 'ACCOUNT') {
          if (!customer) fail(400, 'Para fiar elegí un cliente.');
          if (customer!.creditLimit != null && customer!.balance + p.amount > customer!.creditLimit + 0.009) {
            fail(400, `Supera el límite de fiado de ${customer!.name}.`);
          }
        }
        return {
          id: id(),
          paymentMethodId: m.id,
          methodName: m.name,
          kind: m.kind,
          amount: round2(p.amount),
          surchargeAmount: surcharge,
          receivedAmount: received,
          changeAmount: change,
        };
      });
      const surchargeAmount = round2(payments.reduce((t, p) => t + p.surchargeAmount, 0));

      const sale: Sale = {
        id: saleId,
        number: d.settings.nextSaleNumber++,
        cashSessionId: session?.id ?? null,
        userId: user.id,
        userName: user.name,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        subtotal,
        discountAmount: discount,
        surchargeAmount,
        total: round2(base + surchargeAmount),
        status: 'COMPLETED',
        voidedAt: null,
        voidReason: null,
        notes: input.notes,
        createdAt: nowIso(),
        items,
        payments,
      };
      d.sales.push(sale);

      for (const it of items) {
        const p = it.productId ? d.products.find((x) => x.id === it.productId) : null;
        if (p) addStock(d, p, 'SALE', -it.quantity, { saleId, notes: `Venta #${sale.number}` });
      }
      for (const p of payments.filter((x) => x.kind === 'ACCOUNT')) {
        addAccount(d, customer!, { type: 'CHARGE', amount: p.amount, saleId, saleNumber: sale.number });
      }
      return sale;
    });
  }

  list(q: { from?: string; to?: string; search?: string; page?: number; limit?: number }) {
    return this.db.read((d): Page<Sale> => {
      const page = q.page ?? 1;
      const limit = q.limit ?? 20;
      const s = q.search ? norm(q.search.trim()) : '';
      const rows = d.sales
        .filter((x) => (!q.from || localDate(x.createdAt) >= q.from) && (!q.to || localDate(x.createdAt) <= q.to))
        .filter((x) => !s || String(x.number) === s.replace('#', '') || norm(x.customerName ?? '').includes(s) || x.items.some((i) => norm(i.description).includes(s)))
        .reverse();
      return { data: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit };
    });
  }

  get(saleId: string) {
    return this.db.read((d) => d.sales.find((s) => s.id === saleId) ?? fail(404, 'Venta no encontrada.'));
  }

  void(saleId: string, reason: string) {
    return this.db.write((d) => {
      if (!this.auth.isAdmin()) fail(403, 'Solo el administrador puede anular ventas.');
      const sale = d.sales.find((s) => s.id === saleId) ?? fail(404, 'Venta no encontrada.');
      if (sale.status === 'VOIDED') fail(409, 'La venta ya está anulada.');
      if (!reason.trim()) fail(400, 'Indicá el motivo de la anulación.');
      Object.assign(sale, { status: 'VOIDED', voidedAt: nowIso(), voidReason: reason.trim() });
      for (const it of sale.items) {
        const p = it.productId ? d.products.find((x) => x.id === it.productId) : null;
        if (p) addStock(d, p, 'SALE_VOID', it.quantity, { saleId, notes: `Anulación venta #${sale.number}` });
      }
      const customer = sale.customerId ? d.customers.find((c) => c.id === sale.customerId) : null;
      for (const p of sale.payments.filter((x) => x.kind === 'ACCOUNT')) {
        if (customer) addAccount(d, customer, { type: 'ADJUSTMENT', amount: -p.amount, saleId, saleNumber: sale.number, notes: 'Venta anulada' });
      }
      return sale;
    });
  }
}

@Injectable()
class DemoCustomersApi extends CustomersApi {
  private readonly db = inject(DemoDb);

  list(search?: string) {
    return this.db.read((d) => {
      const s = norm(search?.trim() ?? '');
      return d.customers
        .filter((c) => !s || norm(c.name).includes(s) || (c.phone ?? '').replace(/\D/g, '').includes(s.replace(/\D/g, '') || '¬') || c.document === s)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    });
  }
  save(custId: string | null, input: CustomerInput) {
    return this.db.write((d) => {
      const name = input.name.trim();
      if (!name) fail(400, 'El nombre es obligatorio.');
      if (custId) {
        const c = d.customers.find((x) => x.id === custId) ?? fail(404, 'Cliente no encontrado.');
        return Object.assign(c, input, { name });
      }
      const c: Customer = { ...input, name, id: id(), balance: 0 };
      d.customers.push(c);
      return c;
    });
  }
  delete(custId: string) {
    return this.db.write((d) => {
      const c = d.customers.find((x) => x.id === custId);
      if (c && Math.abs(c.balance) > 0.009) fail(409, 'No se puede borrar un cliente con saldo pendiente.');
      d.customers = d.customers.filter((x) => x.id !== custId);
    });
  }
  movements(custId: string) {
    return this.db.read((d) => d.accountMovements.filter((m) => m.customerId === custId).reverse());
  }
  registerPayment(custId: string, input: { amount: number; paymentMethodId: string; notes: string | null }) {
    return this.db.write((d) => {
      const c = d.customers.find((x) => x.id === custId) ?? fail(404, 'Cliente no encontrado.');
      const m = d.paymentMethods.find((x) => x.id === input.paymentMethodId) ?? fail(404, 'Medio de pago no encontrado.');
      if (!(input.amount > 0)) fail(400, 'El monto debe ser mayor a cero.');
      if (m.kind === 'ACCOUNT') fail(400, 'Elegí con qué paga.');
      const session = openSession(d);
      if (m.kind === 'CASH' && !session) fail(409, 'Abrí la caja para cobrar en efectivo.');
      // cashSessionId: el cobro en efectivo entra en el arqueo de la caja abierta.
      addAccount(d, c, { type: 'PAYMENT', amount: -round2(input.amount), paymentMethodId: m.id, paymentMethodName: m.name, cashSessionId: session?.id ?? null, notes: input.notes });
      return c;
    });
  }
}

@Injectable()
class DemoReportsApi extends ReportsApi {
  private readonly db = inject(DemoDb);

  daily(date: string) {
    return this.db.read((d): DailyReport => {
      const sales = d.sales.filter((s) => s.status === 'COMPLETED' && localDate(s.createdAt) === date);
      const total = round2(sales.reduce((t, s) => t + s.total, 0));
      const group = <K>(rows: [K, number][]) => {
        const m = new Map<K, number>();
        rows.forEach(([k, v]) => m.set(k, round2((m.get(k) ?? 0) + v)));
        return m;
      };
      const items = sales.flatMap((s) => s.items);
      const catOf = (productId: string | null) => d.categories.find((c) => c.id === d.products.find((p) => p.id === productId)?.categoryId);
      const byCat = group(items.map((i) => [catOf(i.productId)?.id ?? '', i.subtotal]));
      const top = new Map<string, { description: string; quantity: number; total: number }>();
      for (const i of items) {
        const r = top.get(i.description) ?? { description: i.description, quantity: 0, total: 0 };
        r.quantity = round3(r.quantity + i.quantity);
        r.total = round2(r.total + i.subtotal);
        top.set(i.description, r);
      }
      const hours = group(sales.map((s) => [new Date(s.createdAt).getHours(), s.total]));
      return {
        date,
        salesCount: sales.length,
        total,
        averageTicket: sales.length ? round2(total / sales.length) : 0,
        estimatedProfit: round2(items.reduce((t, i) => t + (i.unitCost != null ? i.subtotal - i.unitCost * i.quantity : 0), 0)),
        byMethod: [...group(sales.flatMap((s) => s.payments).map((p) => [p.methodName, p.amount + p.surchargeAmount]))].map(([name, t]) => ({ name, total: t })).sort((a, b) => b.total - a.total),
        byCategory: [...byCat]
          .map(([catId, t]) => {
            const c = d.categories.find((x) => x.id === catId);
            return { name: c?.name ?? 'Sin categoría', color: c?.color ?? '#94a3b8', total: t };
          })
          .sort((a, b) => b.total - a.total),
        byHour: [...hours].map(([hour, t]) => ({ hour, total: t })).sort((a, b) => a.hour - b.hour),
        topProducts: [...top.values()].sort((a, b) => b.total - a.total).slice(0, 10),
      };
    });
  }
}

/** Registra las implementaciones demo de todos los contratos de core/api.ts. */
export function provideDemoBackend(): EnvironmentProviders {
  const providers: Provider[] = [
    { provide: AuthApi, useClass: DemoAuthApi },
    { provide: SettingsApi, useClass: DemoSettingsApi },
    { provide: CatalogApi, useClass: DemoCatalogApi },
    { provide: CashApi, useClass: DemoCashApi },
    { provide: SalesApi, useClass: DemoSalesApi },
    { provide: CustomersApi, useClass: DemoCustomersApi },
    { provide: ReportsApi, useClass: DemoReportsApi },
  ];
  return makeEnvironmentProviders(providers);
}
