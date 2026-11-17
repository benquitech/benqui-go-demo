import { ChangeDetectionStrategy, Component, DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { storage } from '../core/storage';
import { Icon } from './icon';

export interface TourStep {
  /** Selector del elemento a señalar. Sin target, el mensaje va centrado. Si no existe en pantalla, el paso se saltea. */
  target?: string;
  title: string;
  text: string;
  emoji?: string;
  /** El paso espera a que el usuario lo haga (ej.: abrir la caja): avanza solo cuando devuelve true. */
  until?: () => boolean;
  /** Texto que reemplaza al botón "Siguiente" mientras se espera la acción. */
  hint?: string;
}

const SEEN_KEY = 'benqui-go.tours-seen';

/** Hay un formulario (app-modal) o una ventana de confirmación abierta. */
export const somethingOpen = () => !!document.querySelector('app-modal, app-dialog-host .dlg-backdrop');

/** Guías paso a paso. Cada guía se muestra sola la primera vez; el botón Ayuda la repite. */
@Injectable({ providedIn: 'root' })
export class TourService {
  readonly steps = signal<TourStep[]>([]);
  readonly index = signal(0);
  readonly active = computed(() => this.steps().length > 0);
  readonly step = computed(() => this.steps()[this.index()] ?? null);
  readonly total = computed(() => this.steps().length);
  private id: string | null = null;

  seen(id: string): boolean {
    return !!storage.get<Record<string, boolean>>(SEEN_KEY)?.[id];
  }

  /** Arranca la guía si nunca se vio (o siempre, con force). */
  start(id: string, steps: TourStep[], force = false): void {
    if (!force && this.seen(id)) return;
    // Nunca encima de un formulario o ventana abierta: taparía los campos y parecerían deshabilitados.
    if (somethingOpen()) return;
    // Fuera los pasos que no aplican ahora (ej.: "Abrí la caja" si ya está abierta), así el contador es real.
    const applicable = steps.filter((s) => !(s.target && !document.querySelector(s.target)) && !s.until?.());
    if (!applicable.length) return;
    this.id = id;
    this.index.set(0);
    this.steps.set(applicable);
  }

  next(): void {
    if (this.index() >= this.steps().length - 1) return this.end();
    this.index.update((i) => i + 1);
    this.skipMissing(1);
  }

  prev(): void {
    if (this.index() === 0) return;
    this.index.update((i) => i - 1);
    this.skipMissing(-1);
  }

  end(): void {
    if (this.id) storage.set(SEEN_KEY, { ...storage.get<Record<string, boolean>>(SEEN_KEY), [this.id]: true });
    this.id = null;
    this.steps.set([]);
  }

  resetAll(): void {
    storage.remove(SEEN_KEY);
  }

  /** Saltea pasos cuyo elemento no está en pantalla (ej.: "Abrí la caja" si ya está abierta). */
  private skipMissing(dir: 1 | -1): void {
    for (;;) {
      const s = this.step();
      if (!s) return this.end();
      const missing = !!s.target && !document.querySelector(s.target);
      const alreadyDone = !!s.until?.();
      if (!missing && !alreadyDone) return;
      const nextIndex = this.index() + dir;
      if (nextIndex < 0) return;
      if (nextIndex >= this.steps().length) return this.end();
      this.index.set(nextIndex);
    }
  }
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_W = 340;

/**
 * Capa de la guía: oscurece toda la pantalla menos el elemento señalado (que sigue siendo
 * clickeable) y muestra la explicación al lado. Se reubica sola si el elemento se mueve.
 */
@Component({
  selector: 'app-tour',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'tour.active() && tour.end()' },
  styleUrl: './tour.scss',
  template: `
    @if (tour.step(); as s) {
      @if (rect(); as r) {
        <!-- Cuatro paneles alrededor del hueco: bloquean clics afuera y dejan usar el elemento señalado. -->
        <div class="shade" (click)="passThrough($event)" [style.top.px]="0" [style.left.px]="0" [style.right.px]="0" [style.height.px]="r.top"></div>
        <div class="shade" (click)="passThrough($event)" [style.top.px]="r.top + r.height" [style.left.px]="0" [style.right.px]="0" [style.bottom.px]="0"></div>
        <div class="shade" (click)="passThrough($event)" [style.top.px]="r.top" [style.left.px]="0" [style.width.px]="r.left" [style.height.px]="r.height"></div>
        <div class="shade" (click)="passThrough($event)" [style.top.px]="r.top" [style.left.px]="r.left + r.width" [style.right.px]="0" [style.height.px]="r.height"></div>
        <div class="ring" [style.top.px]="r.top" [style.left.px]="r.left" [style.width.px]="r.width" [style.height.px]="r.height"></div>
      } @else {
        <div class="shade full" (click)="passThrough($event)"></div>
      }

      <div class="card-tour" [class.center]="!rect()" [style.top.px]="cardPos().top" [style.left.px]="cardPos().left" role="dialog" aria-modal="true" [attr.aria-label]="s.title">
        @if (s.emoji) {
          <div class="emoji">{{ s.emoji }}</div>
        }
        <div class="count">Paso {{ tour.index() + 1 }} de {{ tour.total() }}</div>
        <h2>{{ s.title }}</h2>
        <p>{{ s.text }}</p>
        <div class="dots" aria-hidden="true">
          @for (x of tour.steps(); track $index) {
            <span [class.on]="$index === tour.index()"></span>
          }
        </div>
        <div class="actions">
          <button type="button" class="skip" (click)="tour.end()">Saltar guía</button>
          @if (tour.index() > 0) {
            <button type="button" class="btn btn-sm" (click)="tour.prev()">Atrás</button>
          }
          @if (s.until) {
            <span class="waiting"><span class="pulse"></span>{{ s.hint || 'Hacelo para seguir' }}</span>
          } @else {
            <button type="button" class="btn btn-primary btn-sm" (click)="tour.next()" autofocus>
              {{ tour.index() === tour.total() - 1 ? '¡Listo!' : 'Siguiente' }} <app-icon name="chevron" [size]="16" />
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class Tour {
  protected readonly tour = inject(TourService);
  protected readonly rect = signal<Rect | null>(null);
  private readonly cardH = signal(220);

  constructor() {
    // Sondeo liviano: sigue al elemento (scroll, cambios de tamaño, pantallas que cargan después)
    // y detecta cuándo el usuario completó un paso de tipo "until".
    const timer = setInterval(() => this.tick(), 120);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected readonly cardPos = computed(() => {
    const r = this.rect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(CARD_W, vw - 32);
    if (!r) return { top: Math.max(16, (vh - this.cardH()) / 2), left: (vw - w) / 2 };
    const h = this.cardH();
    const clampX = (x: number) => Math.min(Math.max(16, x), vw - w - 16);
    const clampY = (y: number) => Math.min(Math.max(16, y), vh - h - 16);
    // Preferencia: abajo, arriba, a la derecha, a la izquierda del elemento.
    if (r.top + r.height + 12 + h < vh) return { top: r.top + r.height + 12, left: clampX(r.left) };
    if (r.top - 12 - h > 0) return { top: r.top - 12 - h, left: clampX(r.left) };
    if (r.left + r.width + 12 + w < vw) return { top: clampY(r.top), left: r.left + r.width + 12 };
    if (r.left - 12 - w > 0) return { top: clampY(r.top), left: r.left - 12 - w };
    return { top: clampY(r.top + r.height / 2 - h / 2), left: (vw - w) / 2 };
  });

  /**
   * Clic fuera de lo señalado: la guía no debe trabar la app. Se cierra y el clic llega a lo que
   * estaba debajo (por ejemplo "Nuevo producto"), como si la guía no hubiera estado.
   */
  protected passThrough(e: MouseEvent): void {
    const { clientX: x, clientY: y } = e;
    this.tour.end();
    this.rect.set(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!el || el.closest('app-tour')) return;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.focus();
        el.click();
      }),
    );
  }

  private tick(): void {
    const s = this.tour.step();
    if (!s) return;
    if (s.until?.()) {
      this.tour.next();
      return;
    }
    // Se abrió un formulario o una ventana (el usuario siguió trabajando): la guía se retira.
    if (somethingOpen()) {
      this.tour.end();
      this.rect.set(null);
      return;
    }
    const card = document.querySelector<HTMLElement>('app-tour .card-tour');
    if (card) this.cardH.set(card.offsetHeight);
    const el = s.target ? document.querySelector<HTMLElement>(s.target) : null;
    if (!el) {
      if (this.rect()) this.rect.set(null);
      return;
    }
    const b = el.getBoundingClientRect();
    const next = { top: b.top - PAD, left: b.left - PAD, width: b.width + PAD * 2, height: b.height + PAD * 2 };
    const cur = this.rect();
    if (!cur || Math.abs(cur.top - next.top) + Math.abs(cur.left - next.left) + Math.abs(cur.width - next.width) + Math.abs(cur.height - next.height) > 1) {
      this.rect.set(next);
    }
  }
}
