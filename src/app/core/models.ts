// Modelos del front. Los nombres de campos son los de benqui-go-api en camelCase
// (ver benqui-go-api/DISENO_TABLAS.md). Los montos son number en el front; la capa HTTP
// convertirá los Decimal (string) que devuelve la API.

export type RoleName = 'Administrador' | 'Cajero';

export interface User {
  id: string;
  userName: string;
  firstName: string;
  lastName: string;
  role: RoleName;
}

export interface Session {
  user: User;
  accessToken: string;
}

export type BusinessType = 'KIOSK' | 'DRUGSTORE' | 'PHARMACY' | 'GROCERY' | 'OTHER';

export interface BusinessSettings {
  name: string;
  businessType: BusinessType;
  cuit: string | null;
  address: string | null;
  phone: string | null;
  ticketFooter: string | null;
  ticketWidth: 58 | 80;
  printTicket: 'ALWAYS' | 'ASK' | 'NEVER';
  allowNegativeStock: boolean;
  requireCashSession: boolean;
  nextSaleNumber: number;
}

export type PaymentKind = 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'QR' | 'ACCOUNT';

export interface PaymentMethod {
  id: string;
  name: string;
  kind: PaymentKind;
  surchargePercent: number;
  order: number;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  /** Emoji que identifica la categoría (y a sus productos sin foto). */
  icon: string;
  order: number;
  isActive: boolean;
}

export type SaleUnit = 'UNIT' | 'KG';

export interface Product {
  id: string;
  barcode: string | null;
  code: string | null;
  name: string;
  categoryId: string | null;
  imageUrl: string | null;
  saleUnit: SaleUnit;
  costPrice: number | null;
  salePrice: number;
  trackStock: boolean;
  stock: number;
  minStock: number | null;
  isFavorite: boolean;
  isActive: boolean;
  notes: string | null;
  updatedAt: string;
}

export type ProductInput = Omit<Product, 'id' | 'stock' | 'updatedAt'> & { initialStock?: number };

export interface BulkPriceInput {
  percent: number;
  categoryId: string | null;
  applyTo: 'SALE' | 'COST' | 'BOTH';
  rounding: 'NONE' | 'TEN' | 'FIFTY' | 'HUNDRED';
}

export type StockMovementType = 'PURCHASE' | 'SALE' | 'SALE_VOID' | 'ADJUSTMENT' | 'LOSS';

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  stockAfter: number;
  unitCost: number | null;
  saleId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CashSession {
  id: string;
  openedBy: string;
  openedByName: string;
  openedAt: string;
  openingAmount: number;
  closedAt: string | null;
  closedByName: string | null;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  status: 'OPEN' | 'CLOSED';
  notes: string | null;
}

export type CashMovementType = 'INCOME' | 'EXPENSE' | 'WITHDRAWAL';

export interface CashMovement {
  id: string;
  cashSessionId: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  createdAt: string;
}

/** Resumen de la caja abierta (o del cierre). */
export interface CashSummary {
  session: CashSession;
  salesCount: number;
  salesTotal: number;
  byMethod: { name: string; kind: PaymentKind; total: number }[];
  accountPaymentsCash: number;
  incomes: number;
  expenses: number;
  withdrawals: number;
  expectedCash: number;
  movements: CashMovement[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  document: string | null;
  address: string | null;
  creditLimit: number | null;
  balance: number;
  notes: string | null;
}

export type CustomerInput = Omit<Customer, 'id' | 'balance'>;

export interface AccountMovement {
  id: string;
  customerId: string;
  type: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';
  amount: number;
  balanceAfter: number;
  saleId: string | null;
  saleNumber: number | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  cashSessionId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  saleUnit: SaleUnit;
  unitPrice: number;
  unitCost: number | null;
  discountAmount: number;
  subtotal: number;
}

export interface SalePayment {
  id: string;
  paymentMethodId: string;
  methodName: string;
  kind: PaymentKind;
  amount: number;
  surchargeAmount: number;
  receivedAmount: number | null;
  changeAmount: number | null;
}

export interface Sale {
  id: string;
  number: number;
  cashSessionId: string | null;
  userId: string;
  userName: string;
  customerId: string | null;
  customerName: string | null;
  subtotal: number;
  discountAmount: number;
  surchargeAmount: number;
  total: number;
  status: 'COMPLETED' | 'VOIDED';
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
  createdAt: string;
  items: SaleItem[];
  payments: SalePayment[];
}

export interface SaleInput {
  customerId: string | null;
  discountAmount: number;
  notes: string | null;
  items: { productId: string | null; description?: string; quantity: number; unitPrice?: number }[];
  payments: { paymentMethodId: string; amount: number; receivedAmount?: number | null }[];
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface DailyReport {
  date: string;
  salesCount: number;
  total: number;
  averageTicket: number;
  estimatedProfit: number;
  byMethod: { name: string; total: number }[];
  byCategory: { name: string; color: string; total: number }[];
  byHour: { hour: number; total: number }[];
  topProducts: { description: string; quantity: number; total: number }[];
}
