import { SEPA_PRODUCTS } from './sepa-products';
import {
  AccountMovement,
  BusinessSettings,
  CashMovement,
  CashSession,
  Category,
  Customer,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  StockMovement,
  User,
} from '../models';

/** Todo lo que el modo demo guarda en localStorage. */
export interface DemoData {
  version: number;
  settings: BusinessSettings;
  users: (User & { password: string })[];
  paymentMethods: PaymentMethod[];
  categories: Category[];
  products: Product[];
  stockMovements: StockMovement[];
  cashSessions: CashSession[];
  cashMovements: CashMovement[];
  customers: Customer[];
  accountMovements: AccountMovement[];
  sales: Sale[];
}

export const DEMO_VERSION = 4;

/** EAN-13 válido con prefijo argentino 779 a partir de un número correlativo. */
function ean(n: number): string {
  const base = `779${String(1000000000 + n * 7919).slice(-9)}`;
  const sum = [...base].reduce((s, d, i) => s + +d * (i % 2 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
}

/** Generador pseudoaleatorio con semilla: los datos de ejemplo son siempre los mismos. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// id, nombre, color
const CATEGORIES: [string, string, string][] = [
  ['bebidas', 'Bebidas', '#0ea5e9'],
  ['golosinas', 'Golosinas', '#ec4899'],
  ['snacks', 'Galletitas y snacks', '#f59e0b'],
  ['cigarrillos', 'Cigarrillos', '#64748b'],
  ['almacen', 'Almacén', '#84cc16'],
  ['lacteos', 'Lácteos', '#38bdf8'],
  ['helados', 'Helados', '#a78bfa'],
  ['limpieza', 'Perfumería y limpieza', '#14b8a6'],
  ['varios', 'Varios', '#f97316'],
];

const ICONS: Record<string, string> = {
  bebidas: '🥤',
  golosinas: '🍬',
  snacks: '🍪',
  cigarrillos: '🚬',
  almacen: '🛒',
  lacteos: '🥛',
  helados: '🍦',
  limpieza: '🧴',
  varios: '🔋',
};

// Productos del kiosco que no están en SEPA (cigarrillos, sueltos por kilo, servicios).
// [nombre, categoría, precio, costo, código corto, favorito, unidad, stock]
type Row = [string, string, number, number, string | null, boolean, 'UNIT' | 'KG', number];
const OWN_PRODUCTS: Row[] = [
  ['Cigarrillos box 20', 'cigarrillos', 3800, 3200, '30', true, 'UNIT', 40],
  ['Cigarrillos común 20', 'cigarrillos', 3500, 2950, '31', true, 'UNIT', 35],
  ['Cigarrillos 10 unidades', 'cigarrillos', 2000, 1680, null, false, 'UNIT', 20],
  ['Alfajor simple', 'golosinas', 700, 420, '11', true, 'UNIT', 60],
  ['Chicles menta', 'golosinas', 500, 280, '12', true, 'UNIT', 80],
  ['Gomitas surtidas (suelto)', 'golosinas', 9000, 5200, 'GOM', false, 'KG', 3.5],
  ['Caramelos surtidos (suelto)', 'golosinas', 7000, 4000, 'CAR', false, 'KG', 4.2],
  ['Maní tostado (suelto)', 'snacks', 8000, 4800, 'MANI', false, 'KG', 2.8],
  ['Queso cremoso (suelto)', 'lacteos', 11000, 7600, 'QUE', false, 'KG', 3.1],
  ['Carga SUBE', 'varios', 0, 0, 'SUBE', true, 'UNIT', 0],
  ['Recarga celular', 'varios', 0, 0, 'REC', false, 'UNIT', 0],
  ['Fotocopia', 'varios', 150, 40, 'FOT', false, 'UNIT', 0],
];

/** Productos sin control de stock (servicios). */
const NO_STOCK = new Set(['Carga SUBE', 'Recarga celular', 'Fotocopia']);

/** Favoritos de la venta (con código corto) entre los de SEPA: los primeros de cada rubro. */
const SEPA_FAVORITES: Record<string, number> = { bebidas: 3, golosinas: 2, snacks: 2, lacteos: 1 };

const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);

/**
 * Productos de SEPA con precios propios de ejemplo: entre 15% abajo y 15% arriba del de referencia,
 * para que la pantalla "Precios" tenga qué comparar y actualizar. Costo ≈ 68% de la referencia.
 */
function sepaRows(): Row[] {
  const rand = rng(7);
  const seen: Record<string, number> = {};
  let code = 1;
  return SEPA_PRODUCTS.map(([name, cat, , ref]) => {
    const pos = (seen[cat] = (seen[cat] ?? 0) + 1);
    const fav = pos <= (SEPA_FAVORITES[cat] ?? 0);
    const factor = 0.85 + Math.floor(rand() * 7) * 0.05; // 0,85 … 1,15
    const stock = rand() < 0.1 ? 2 + Math.floor(rand() * 3) : 6 + Math.floor(rand() * 35);
    return [name, cat, round10(ref * factor), round10(ref * 0.68), fav ? String(code++) : null, fav, 'UNIT', stock];
  });
}

export function buildSeed(): DemoData {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const rand = rng(42);

  const admin = { id: 'u-admin', userName: 'admin', password: 'demo', firstName: 'Ana', lastName: 'Dueña', role: 'Administrador' as const };
  const cashier = { id: 'u-cajero', userName: 'cajero', password: 'demo', firstName: 'Tomás', lastName: 'Cajero', role: 'Cajero' as const };

  const paymentMethods: PaymentMethod[] = [
    { id: 'pm-cash', name: 'Efectivo', kind: 'CASH', surchargePercent: 0, order: 1, isActive: true },
    { id: 'pm-debit', name: 'Débito', kind: 'DEBIT', surchargePercent: 0, order: 2, isActive: true },
    { id: 'pm-credit', name: 'Crédito', kind: 'CREDIT', surchargePercent: 10, order: 3, isActive: true },
    { id: 'pm-transfer', name: 'Transferencia', kind: 'TRANSFER', surchargePercent: 0, order: 4, isActive: true },
    { id: 'pm-qr', name: 'QR / Mercado Pago', kind: 'QR', surchargePercent: 0, order: 5, isActive: true },
    { id: 'pm-account', name: 'Fiado', kind: 'ACCOUNT', surchargePercent: 0, order: 6, isActive: true },
  ];

  const categories: Category[] = CATEGORIES.map(([id, name, color], i) => ({
    id: `cat-${id}`,
    name,
    color,
    icon: ICONS[id],
    order: i + 1,
    isActive: true,
  }));

  const sepaBarcodes = new Map(SEPA_PRODUCTS.map(([name, , barcode]) => [name, barcode]));
  const rows: Row[] = [...sepaRows(), ...OWN_PRODUCTS];
  const products: Product[] = rows.map(([name, cat, price, cost, code, fav, unit, stock], i) => ({
    id: `p-${i + 1}`,
    // Los de SEPA llevan su código real (así se cruzan con los precios de referencia); los propios, uno inventado.
    barcode: sepaBarcodes.get(name) ?? (unit === 'KG' || NO_STOCK.has(name) ? null : ean(i + 1)),
    code,
    name,
    categoryId: `cat-${cat}`,
    imageUrl: null,
    saleUnit: unit,
    costPrice: cost || null,
    salePrice: price,
    trackStock: !NO_STOCK.has(name),
    stock,
    minStock: NO_STOCK.has(name) ? null : unit === 'KG' ? 1 : 5,
    isFavorite: fav,
    isActive: true,
    notes: price === 0 ? 'Precio libre: se tipea en cada venta' : null,
    updatedAt: iso(now),
  }));

  const customers: Customer[] = [
    { id: 'c-1', name: 'Marta (3° B)', phone: '387 512-3344', document: null, address: 'Edificio de enfrente', creditLimit: 30000, balance: 0, notes: null },
    { id: 'c-2', name: 'Don Julio', phone: '387 498-1122', document: null, address: null, creditLimit: 20000, balance: 0, notes: 'Paga los viernes' },
    { id: 'c-3', name: 'Lucía Fernández', phone: '387 601-7788', document: '32145678', address: null, creditLimit: null, balance: 0, notes: null },
  ];

  // Historial: ventas de los últimos 7 días (cajas cerradas) para que los reportes muestren algo.
  const sales: Sale[] = [];
  const cashSessions: CashSession[] = [];
  const accountMovements: AccountMovement[] = [];
  const sellable = products.filter((p) => p.salePrice > 0);
  let number = 1;

  for (let daysAgo = 7; daysAgo >= 1; daysAgo--) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysAgo);
    day.setHours(8, 0, 0, 0);
    const sessionId = `cs-${daysAgo}`;
    const salesToday = 18 + Math.floor(rand() * 14);
    let cashTotal = 0;

    for (let s = 0; s < salesToday; s++) {
      const at = new Date(day);
      at.setMinutes(at.getMinutes() + Math.floor(rand() * 14 * 60));
      const items: SaleItem[] = [];
      const lines = 1 + Math.floor(rand() * 3);
      for (let l = 0; l < lines; l++) {
        const p = rand() < 0.6 ? sellable.filter((x) => x.isFavorite)[Math.floor(rand() * 12)] ?? sellable[0] : sellable[Math.floor(rand() * sellable.length)];
        const qty = p.saleUnit === 'KG' ? Math.round((0.1 + rand() * 0.4) * 1000) / 1000 : 1 + Math.floor(rand() * 2);
        items.push({
          id: `si-${number}-${l}`,
          productId: p.id,
          description: p.name,
          quantity: qty,
          saleUnit: p.saleUnit,
          unitPrice: p.salePrice,
          unitCost: p.costPrice,
          discountAmount: 0,
          subtotal: Math.round(qty * p.salePrice * 100) / 100,
        });
      }
      const total = items.reduce((t, i) => t + i.subtotal, 0);
      const r = rand();
      let method = r < 0.5 ? paymentMethods[0] : r < 0.7 ? paymentMethods[1] : r < 0.88 ? paymentMethods[4] : r < 0.95 ? paymentMethods[3] : paymentMethods[5];
      let customer = method.kind === 'ACCOUNT' ? customers[Math.floor(rand() * 2)] : null;
      // Nadie arranca pasado de su límite: si el fiado lo llevaría a más del 60%, paga en efectivo.
      if (customer?.creditLimit != null && customer.balance + total > customer.creditLimit * 0.6) {
        method = paymentMethods[0];
        customer = null;
      }
      if (method.kind === 'CASH') cashTotal += total;
      const id = `s-${number}`;
      sales.push({
        id,
        number,
        cashSessionId: sessionId,
        userId: cashier.id,
        userName: `${cashier.firstName} ${cashier.lastName}`,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        subtotal: total,
        discountAmount: 0,
        surchargeAmount: 0,
        total,
        status: 'COMPLETED',
        voidedAt: null,
        voidReason: null,
        notes: null,
        createdAt: iso(at),
        items,
        payments: [
          {
            id: `sp-${number}`,
            paymentMethodId: method.id,
            methodName: method.name,
            kind: method.kind,
            amount: total,
            surchargeAmount: 0,
            receivedAmount: method.kind === 'CASH' ? total : null,
            changeAmount: method.kind === 'CASH' ? 0 : null,
          },
        ],
      });
      if (customer) {
        customer.balance += total;
        accountMovements.push({
          id: `am-${number}`,
          customerId: customer.id,
          type: 'CHARGE',
          amount: total,
          balanceAfter: customer.balance,
          saleId: id,
          saleNumber: number,
          paymentMethodId: null,
          paymentMethodName: null,
          cashSessionId: null,
          notes: null,
          createdAt: iso(at),
        });
      }
      number++;
    }

    const closedAt = new Date(day);
    closedAt.setHours(22, 0, 0, 0);
    const opening = 10000;
    const expected = opening + cashTotal;
    const counted = Math.round(expected / 100) * 100 - (daysAgo === 2 ? 500 : 0);
    cashSessions.push({
      id: sessionId,
      openedBy: cashier.id,
      openedByName: `${cashier.firstName} ${cashier.lastName}`,
      openedAt: iso(day),
      openingAmount: opening,
      closedAt: iso(closedAt),
      closedByName: `${cashier.firstName} ${cashier.lastName}`,
      expectedCash: expected,
      countedCash: counted,
      difference: counted - expected,
      status: 'CLOSED',
      notes: null,
    });
  }
  sales.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  sales.forEach((s, i) => (s.number = i + 1));
  accountMovements.forEach((m) => (m.saleNumber = sales.find((s) => s.id === m.saleId)?.number ?? null));

  return {
    version: DEMO_VERSION,
    settings: {
      name: 'Kiosco La Esquina',
      businessType: 'KIOSK',
      cuit: null,
      address: 'Av. Belgrano 1234',
      phone: '387 400-0000',
      ticketFooter: '¡Gracias por tu compra!',
      ticketWidth: 80,
      printTicket: 'ASK',
      allowNegativeStock: true,
      requireCashSession: true,
      nextSaleNumber: sales.length + 1,
    },
    users: [admin, cashier],
    paymentMethods,
    categories,
    products,
    stockMovements: [],
    cashSessions,
    cashMovements: [],
    customers,
    accountMovements,
    sales,
  };
}
