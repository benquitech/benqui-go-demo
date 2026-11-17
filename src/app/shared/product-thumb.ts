import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Category, Product } from '../core/models';

/** Foto del producto o, si no tiene, el emoji de su categoría sobre su color. */
@Component({
  selector: 'app-product-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()', '[style.--c]': 'color()' },
  styles: `
    :host {
      display: grid; place-items: center; flex-shrink: 0; overflow: hidden; border-radius: 22%;
      background: color-mix(in srgb, var(--c) 16%, white);
      outline: 1px solid rgba(15, 23, 42, 0.06); outline-offset: -1px;
    }
    img { width: 100%; height: 100%; object-fit: cover; }
    span { line-height: 1; user-select: none; }
  `,
  template: `
    @if (product().imageUrl; as src) {
      <img [src]="src" alt="" loading="lazy" />
    } @else {
      <span [style.font-size.px]="size() * 0.5">{{ category()?.icon || '📦' }}</span>
    }
  `,
})
export class ProductThumb {
  readonly product = input.required<Pick<Product, 'imageUrl'>>();
  readonly category = input<Category | null | undefined>(null);
  readonly size = input(48);
  protected readonly color = computed(() => this.category()?.color ?? '#94a3b8');
}
