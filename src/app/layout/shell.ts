import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { DemoDb } from '../core/demo/demo-api';
import { CashStore, CatalogStore } from '../core/stores';
import { environment } from '../../environments/environment';
import { Icon, IconName } from '../shared/icon';
import { Logo } from '../shared/logo';
import { DialogAction, DialogService } from '../shared/dialog';
import { Tour, TourService } from '../shared/tour';
import { Cart } from '../pages/pos/cart';
import { money } from '../core/money';
import { TOURS, TOUR_READY } from '../shared/tours';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  admin?: boolean;
  /** Solo si está configurado el catálogo de precios de referencia (environment.referenceCatalog.demoKey). */
  needsReference?: boolean;
}

const NAV: NavItem[] = [
  { path: '/vender', label: 'Vender', icon: 'cart' },
  { path: '/caja', label: 'Caja', icon: 'cash' },
  { path: '/ventas', label: 'Ventas', icon: 'receipt' },
  { path: '/productos', label: 'Productos', icon: 'package' },
  { path: '/precios', label: 'Precios', icon: 'tag', needsReference: true },
  { path: '/clientes', label: 'Fiado', icon: 'book' },
  { path: '/reportes', label: 'Reportes', icon: 'chart', admin: true },
  { path: '/configuracion', label: 'Ajustes', icon: 'settings', admin: true },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Logo, Tour],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './shell.scss',
  template: `
    <nav class="rail" aria-label="Menú principal">
      <a routerLink="/vender" class="brand" aria-label="Benqui Go"><app-logo [size]="40" [compact]="true" /></a>
      @if (demo) {
        <span class="demo-pill" title="Modo demo: los datos se guardan solo en este navegador">DEMO</span>
      }
      <div class="items" data-tour="nav">
        @for (item of nav(); track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" class="item">
            <span class="icon-wrap">
              <app-icon [name]="item.icon" [size]="22" />
              @if (item.path === '/caja' && cash.loaded()) {
                <span class="dot" aria-hidden="true" [class.open]="cash.isOpen()" [title]="cash.isOpen() ? 'Caja abierta' : 'Caja cerrada'"></span>
              }
              @if (item.path === '/productos' && catalog.lowStock().length) {
                <span class="badge" aria-hidden="true" title="Productos con stock bajo">{{ catalog.lowStock().length }}</span>
              }
            </span>
            <span class="label">{{ item.label }}</span>
          </a>
        }
      </div>
      <div class="bottom">
        <div class="avatar" [title]="auth.displayName() + ' · ' + auth.user()?.role">{{ initials() }}</div>
        @if (hasTour()) {
          <button type="button" class="item small" (click)="startTour(true)" title="Ver la guía de esta pantalla">
            <app-icon name="help" [size]="18" /><span class="label">Ayuda</span>
          </button>
        }
        @if (demo) {
          <button type="button" class="item small" (click)="resetDemo()" title="Volver a los datos de ejemplo">
            <app-icon name="refresh" [size]="18" /><span class="label">Reiniciar</span>
          </button>
        }
        <button type="button" class="item small" (click)="logout()" title="Salir">
          <app-icon name="logout" [size]="18" /><span class="label">Salir</span>
        </button>
      </div>
    </nav>
    <main class="content">
      @if (catalog.loaded()) {
        <router-outlet />
      }
    </main>
    <app-tour />
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly catalog = inject(CatalogStore);
  protected readonly cash = inject(CashStore);
  private readonly db = inject(DemoDb);
  protected readonly demo = environment.demo;

  protected readonly nav = computed(() =>
    NAV.filter((n) => (!n.admin || this.auth.isAdmin()) && (!n.needsReference || !!environment.referenceCatalog.demoKey)),
  );
  protected readonly initials = computed(() => {
    const u = this.auth.user();
    return u ? (u.firstName[0] + (u.lastName[0] ?? '')).toUpperCase() : '';
  });

  private readonly router = inject(Router);
  private readonly tours = inject(TourService);
  /** Primer segmento de la URL: clave de la guía de la pantalla actual. */
  private readonly section = signal(this.sectionOf(this.router.url));
  protected readonly hasTour = computed(() => !!TOURS[this.section()]);

  constructor() {
    this.catalog.load().subscribe();
    this.cash.refresh();
    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.tours.end();
      this.section.set(this.sectionOf(e.urlAfterRedirects));
      this.startTour(false);
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
    // Primera pantalla: espera a que el catálogo y la caja estén cargados.
    let checked = false;
    effect(() => {
      if (!this.catalog.loaded() || !this.cash.loaded() || checked) return;
      checked = true;
      untracked(() => this.checkForeignCash().then(() => this.startTour(false)));
    });
  }

  /** Al entrar: si la caja quedó abierta por otra persona, avisa y ofrece cerrarla. */
  private async checkForeignCash(): Promise<void> {
    const c = this.cash.current();
    const me = this.auth.user();
    if (!c || !me || c.session.openedBy === me.id) return;
    const opened = new Date(c.session.openedAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const r = await this.dialog.open({
      tone: 'warning',
      title: 'La caja quedó abierta',
      message: `La abrió ${c.session.openedByName} el ${opened} y debería tener ${money(c.expectedCash)} en efectivo.\n\nLo ideal es cerrarla (contando el efectivo) y abrir una nueva a tu nombre.`,
      actions: [
        { label: 'Cerrar esa caja', value: 'close', kind: 'primary', icon: 'lock' },
        { label: 'Seguir con esta caja', value: 'keep' },
      ],
    });
    if (r === 'close') this.router.navigate(['/caja'], { queryParams: { cerrar: 1 } });
  }

  /** La guía se muestra sola la primera vez en cada pantalla; con force (botón Ayuda), siempre. */
  protected startTour(force: boolean): void {
    const key = this.section();
    const steps = TOURS[key];
    if (!steps || (!force && (this.tours.seen(key) || this.tours.active() || this.dialog.isOpen()))) return;
    // Deja que la pantalla termine de dibujarse antes de buscar los elementos a señalar.
    // Pantallas que cargan datos de la API: espera a que aparezca su contenido (hasta 8 s).
    const ready = TOUR_READY[key];
    const started = Date.now();
    const attempt = () => {
      if (this.section() !== key || (!force && this.tours.active())) return;
      if (ready && !document.querySelector(ready) && Date.now() - started < 8000) {
        setTimeout(attempt, 250);
        return;
      }
      this.tours.start(key, steps, force);
    };
    setTimeout(attempt, 450);
  }

  private sectionOf(url: string): string {
    return url.split(/[/?#]/)[1] || 'vender';
  }

  private readonly dialog = inject(DialogService);
  private readonly cart = inject(Cart);

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

  /**
   * Antes de salir: con la caja abierta pide cerrarla (el arqueo queda a nombre de quien vendió
   * y el próximo usuario arranca con su propia caja). Solo el dueño puede salir dejándola abierta.
   */
  protected async logout(): Promise<void> {
    // 1) Una venta cargada sin cobrar: se avisa primero (después puede ir a cerrar la caja).
    if (!this.cart.isEmpty()) {
      const ok = await this.dialog.confirm({
        title: 'Hay una venta sin cobrar',
        message: 'Cobrala antes de salir, o descartala: se quitan los productos cargados.',
        confirmText: 'Descartar venta',
        cancelText: 'Volver a cobrar',
        tone: 'danger',
      });
      if (!ok) {
        this.router.navigateByUrl('/vender');
        return;
      }
      this.cart.clear();
    }
    // 2) Caja abierta: cerrarla (el arqueo queda a nombre de quien vendió). Solo el dueño puede dejarla abierta.
    const c = this.cash.current();
    if (c) {
      const isAdmin = this.auth.isAdmin();
      const opened = new Date(c.session.openedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const actions: DialogAction[] = [{ label: 'Cerrar caja y salir', value: 'close', kind: 'primary', icon: 'lock' }];
      if (isAdmin) actions.push({ label: 'Salir y dejarla abierta', value: 'leave' });
      actions.push({ label: 'Seguir trabajando', value: 'stay', kind: 'ghost' });
      const r = await this.dialog.open({
        tone: 'warning',
        title: 'Tenés la caja abierta',
        message:
          `La abrió ${c.session.openedByName} a las ${opened} y debería tener ${money(c.expectedCash)} en efectivo.\n\n` +
          'Antes de salir, cerrala: contás el efectivo y queda registrado el turno, así quien entre después arranca con su propia caja.' +
          (isAdmin ? '' : '\n\nSolo el dueño puede salir dejándola abierta.'),
        actions,
      });
      if (r === 'close') {
        this.router.navigate(['/caja'], { queryParams: { cerrar: 1, salir: 1 } });
        return;
      }
      if (r !== 'leave') return;
    }
    this.auth.logout();
  }

}
