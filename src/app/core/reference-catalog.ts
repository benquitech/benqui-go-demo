// Catálogo de precios de referencia de benqui-go-api (precios de SEPA / Precios Claros).
// El demo no tiene usuario en la API: canjea environment.referenceCatalog.demoKey por un token
// temporal (POST /demo/session) y lo manda como Bearer en las consultas a /catalog/*.
import { HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpParams, HttpRequest } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, catchError, expand, finalize, map, of, reduce, shareReplay, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { Page } from './models';
import { storage } from './storage';
import { silent } from './loading';

export interface RefCategory {
  id: string;
  slug: string;
  /** Id equivalente en el demo ("cat-bebidas"). */
  demoId: string;
  name: string;
  color: string;
  icon: string | null;
  order: number | null;
  productCount: number;
}

export interface RefProduct {
  id: string;
  barcode: string;
  name: string;
  brand: { id: string; name: string } | null;
  category: { id: string; slug: string; name: string; color: string; icon: string | null } | null;
  /** "500 ml", "118 g", "6 u". */
  presentation: string | null;
  saleUnit: 'UNIT';
  /** Precio sugerido: el de la provincia pedida si hay datos, si no el nacional. */
  price: number;
  /** Provincia del precio, o null si es el nacional. */
  priceProvince: string | null;
  referencePrice: number;
  minPrice: number;
  maxPrice: number;
  /** Sucursales que lo venden (qué tan masivo es). */
  storeCount: number;
  priceUpdatedAt: string;
}

export interface RefProductDetail extends RefProduct {
  provincePrices: { province: string; name: string; price: number }[];
  history: { date: string; previousPrice: number; price: number }[];
}

export interface Province {
  code: string;
  name: string;
}

export interface RefProductsQuery {
  category?: string | null;
  search?: string;
  page?: number;
  limit?: number;
}

interface DemoSession {
  accessToken: string;
  /** Vencimiento en ms (con margen). */
  expiresAt: number;
  /** Límite del demo: productos visibles por rubro (null = sin límite). */
  productsPerCategory?: number | null;
}

const SESSION_KEY = 'benqui-go.ref-session';
const PROVINCE_KEY = 'benqui-go.ref-province';
const CATALOG_URL = `${environment.apiUrl}/catalog/`;

/** La API devuelve los montos como string ("1500.00"); el front trabaja con number. */
const num = (v: unknown) => (v == null ? 0 : Number(v));

function toProduct(p: any): RefProduct {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    category: p.category,
    presentation: p.presentation,
    saleUnit: 'UNIT',
    price: num(p.price),
    priceProvince: p.priceProvince,
    referencePrice: num(p.referencePrice),
    minPrice: num(p.minPrice),
    maxPrice: num(p.maxPrice),
    storeCount: p.storeCount,
    priceUpdatedAt: p.priceUpdatedAt,
  };
}

@Injectable({ providedIn: 'root' })
export class ReferenceCatalog {
  private readonly http = inject(HttpClient);

  /** Sin clave configurada, todo lo del catálogo de referencia queda oculto. */
  readonly enabled = !!environment.referenceCatalog.demoKey && !!environment.apiUrl;

  /** Provincia elegida ("" = precio nacional). Se recuerda en el navegador. */
  readonly province = signal<string>(storage.get<string>(PROVINCE_KEY) ?? environment.referenceCatalog.province ?? '');
  readonly provinceName = computed(() => this.provinces().find((p) => p.code === this.province())?.name ?? null);
  readonly provinces = signal<Province[]>([]);

  private session: DemoSession | null = this.readSession();
  /** Versión demo: cuántos productos por rubro deja consultar la API (null = sin límite o todavía no se sabe). */
  readonly perCategoryLimit = signal<number | null>(this.session?.productsPerCategory ?? null);
  private pending$: Observable<string> | null = null;

  setProvince(code: string): void {
    this.province.set(code);
    storage.set(PROVINCE_KEY, code);
  }

  /** Token vigente, o canjea la clave por uno nuevo (una sola vez aunque lleguen varios pedidos juntos). */
  token(forceNew = false): Observable<string> {
    if (!forceNew && this.session && this.session.expiresAt > Date.now()) return of(this.session.accessToken);
    if (forceNew) this.clearSession();
    if (!this.pending$) {
      this.pending$ = this.http
        .post<{ accessToken: string; expiresIn: number; limits?: { productsPerCategory?: number } }>(
          `${environment.apiUrl}/demo/session`,
          { key: environment.referenceCatalog.demoKey },
          // El overlay ya lo muestra (o no) el pedido que necesitó el token.
          { context: silent() },
        )
        .pipe(
          map((r) => {
            // Se renueva un minuto antes de que venza.
            this.session = {
              accessToken: r.accessToken,
              expiresAt: Date.now() + (r.expiresIn - 60) * 1000,
              productsPerCategory: r.limits?.productsPerCategory ?? null,
            };
            this.perCategoryLimit.set(this.session.productsPerCategory ?? null);
            try {
              sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
            } catch {
              /* sin sessionStorage: queda en memoria */
            }
            return r.accessToken;
          }),
          finalize(() => (this.pending$ = null)),
          shareReplay(1),
        );
    }
    return this.pending$;
  }

  categories(): Observable<RefCategory[]> {
    return this.http.get<RefCategory[]>(`${CATALOG_URL}categories`);
  }

  loadProvinces(): void {
    if (this.provinces().length) return;
    this.http.get<Province[]>(`${CATALOG_URL}provinces`, { context: silent() }).subscribe({ next: (list) => this.provinces.set(list), error: () => undefined });
  }

  /** `background`: sin overlay de carga (cruces y consultas que no frenan la pantalla). */
  products(q: RefProductsQuery = {}, background = false): Observable<Page<RefProduct>> {
    let params = new HttpParams().set('page', q.page ?? 1).set('limit', q.limit ?? 20);
    if (q.category) params = params.set('category', q.category);
    if (q.search?.trim()) params = params.set('search', q.search.trim());
    if (this.province()) params = params.set('province', this.province());
    return this.http
      .get<Page<any>>(`${CATALOG_URL}products`, { params, context: background ? silent() : undefined })
      .pipe(map((page) => ({ ...page, data: page.data.map(toProduct) })));
  }

  /**
   * Todo el catálogo de referencia visible (en el demo son 80 productos: un solo pedido), para
   * cruzarlo con los productos propios por código de barras. `maxItems` es un tope de seguridad.
   * Con el catálogo completo (miles de productos) conviene que la API ofrezca una consulta por lote
   * de códigos de barras en lugar de traer todo.
   */
  all(maxItems = 1000): Observable<RefProduct[]> {
    const limit = 100;
    const pageOf = (page: number) => this.products({ page, limit }, true);
    return pageOf(1).pipe(
      expand((res) => (res.page * limit < Math.min(res.total, maxItems) ? pageOf(res.page + 1) : EMPTY)),
      reduce((acc, res) => acc.concat(res.data), [] as RefProduct[]),
    );
  }

  /** Producto por código de barras, o null si no está en el catálogo de referencia. */
  byBarcode(barcode: string): Observable<RefProduct | null> {
    if (!this.enabled || !/^\d{8,14}$/.test(barcode.trim())) return of(null);
    let params = new HttpParams();
    if (this.province()) params = params.set('province', this.province());
    // Sugerencia mientras se completa el alta: no tapa el formulario.
    return this.http.get<any>(`${CATALOG_URL}products/barcode/${encodeURIComponent(barcode.trim())}`, { params, context: silent() }).pipe(
      map(toProduct),
      catchError((err: HttpErrorResponse) => (err.status === 404 ? of(null) : throwError(() => err))),
    );
  }

  detail(id: string): Observable<RefProductDetail> {
    let params = new HttpParams();
    if (this.province()) params = params.set('province', this.province());
    return this.http.get<any>(`${CATALOG_URL}products/${id}`, { params }).pipe(
      map((p) => ({
        ...toProduct(p),
        provincePrices: (p.provincePrices ?? []).map((x: any) => ({ ...x, price: num(x.price) })),
        history: (p.history ?? []).map((h: any) => ({ date: h.date, previousPrice: num(h.previousPrice), price: num(h.price) })),
      })),
    );
  }

  private readSession(): DemoSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const s = raw ? (JSON.parse(raw) as DemoSession) : null;
      return s && s.expiresAt > Date.now() ? s : null;
    } catch {
      return null;
    }
  }

  private clearSession(): void {
    this.session = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* nada que borrar */
    }
  }
}

const withToken = (req: HttpRequest<unknown>, token: string) => req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

/**
 * Agrega el token del demo a los pedidos a /catalog/* de la API. Si responde 401 (token vencido o
 * clave rotada), pide un token nuevo y repite el pedido una vez.
 */
export const referenceCatalogInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(CATALOG_URL)) return next(req);
  const ref = inject(ReferenceCatalog);
  return ref.token().pipe(
    switchMap((token) => next(withToken(req, token))),
    catchError((err) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);
      return ref.token(true).pipe(switchMap((token) => next(withToken(req, token))));
    }),
  );
};
