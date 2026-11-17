import { Observable } from 'rxjs';
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
  Session,
  StockMovement,
  StockMovementType,
} from './models';

/**
 * Contratos de la capa de datos. Las pantallas solo conocen estas clases abstractas;
 * app.config elige la implementación: demo (localStorage) o HTTP (benqui-go-api).
 * Las implementaciones fallan con ApiError, igual que lo haría la API.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export abstract class AuthApi {
  abstract login(userName: string, password: string): Observable<Session>;
}

export abstract class SettingsApi {
  abstract get(): Observable<BusinessSettings>;
  abstract update(input: Partial<BusinessSettings>): Observable<BusinessSettings>;
  abstract paymentMethods(): Observable<PaymentMethod[]>;
  abstract updatePaymentMethod(id: string, input: Partial<PaymentMethod>): Observable<PaymentMethod>;
}

export abstract class CatalogApi {
  abstract categories(): Observable<Category[]>;
  abstract saveCategory(id: string | null, input: Omit<Category, 'id'>): Observable<Category>;
  abstract deleteCategory(id: string): Observable<void>;
  /** Catálogo completo: en un negocio chico son cientos de productos, el front lo cachea para buscar al instante. */
  abstract products(): Observable<Product[]>;
  abstract saveProduct(id: string | null, input: ProductInput): Observable<Product>;
  abstract deleteProduct(id: string): Observable<void>;
  abstract bulkPrice(input: BulkPriceInput): Observable<{ updated: number }>;
  /** Precios de venta puntuales (ej.: tomados de los precios de referencia de SEPA). */
  abstract updatePrices(changes: { productId: string; salePrice: number }[]): Observable<{ updated: number }>;
  abstract moveStock(
    productId: string,
    input: { type: Exclude<StockMovementType, 'SALE' | 'SALE_VOID'>; quantity: number; unitCost?: number | null; notes?: string | null },
  ): Observable<Product>;
  abstract stockHistory(productId: string): Observable<StockMovement[]>;
}

export abstract class CashApi {
  /** Resumen de la caja abierta, o null si está cerrada. */
  abstract current(): Observable<CashSummary | null>;
  abstract open(openingAmount: number): Observable<CashSummary>;
  abstract addMovement(type: CashMovementType, amount: number, reason: string): Observable<CashSummary>;
  abstract close(countedCash: number, notes: string | null): Observable<CashSummary>;
  abstract history(): Observable<CashSession[]>;
}

export abstract class SalesApi {
  abstract create(input: SaleInput): Observable<Sale>;
  abstract list(query: { from?: string; to?: string; search?: string; page?: number; limit?: number }): Observable<Page<Sale>>;
  abstract get(id: string): Observable<Sale>;
  abstract void(id: string, reason: string): Observable<Sale>;
}

export abstract class CustomersApi {
  abstract list(search?: string): Observable<Customer[]>;
  abstract save(id: string | null, input: CustomerInput): Observable<Customer>;
  abstract delete(id: string): Observable<void>;
  abstract movements(id: string): Observable<AccountMovement[]>;
  abstract registerPayment(id: string, input: { amount: number; paymentMethodId: string; notes: string | null }): Observable<Customer>;
}

export abstract class ReportsApi {
  /** date: 'YYYY-MM-DD' (hora local). */
  abstract daily(date: string): Observable<DailyReport>;
}
