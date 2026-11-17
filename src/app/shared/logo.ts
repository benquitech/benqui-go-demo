import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Marca Benqui Go: el hexágono de Benqui con el rombo de nodos, y "go" en una píldora cyan
 * (rápido, simple, de mostrador). `compact` muestra solo el símbolo.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 10px; color: #f0f6ff; }
    .word { font-weight: 700; letter-spacing: -0.02em; line-height: 1; display: inline-flex; align-items: center; gap: 6px; }
    .go {
      background: var(--cyan); color: var(--navy-950); border-radius: 999px;
      padding: 0.12em 0.5em 0.16em; font-weight: 800; font-style: italic; font-size: 0.82em;
    }
    :host(.on-light) { color: var(--navy-950); }
  `,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="#080d14" />
      <polygon points="18,3 31,10.5 31,25.5 18,33 5,25.5 5,10.5" stroke="#00d4ff" stroke-width="2" stroke-linejoin="round" opacity="0.5" />
      <polygon points="18,8 28,18 18,28 8,18" stroke="#00d4ff" stroke-width="2.2" stroke-linejoin="round" />
      <circle cx="18" cy="18" r="4.2" fill="#00d4ff" />
      <circle cx="18" cy="8" r="1.9" fill="#00d4ff" />
      <circle cx="28" cy="18" r="1.9" fill="#00d4ff" />
      <circle cx="18" cy="28" r="1.9" fill="#00d4ff" />
      <circle cx="8" cy="18" r="1.9" fill="#00d4ff" />
    </svg>
    @if (!compact()) {
      <span class="word" [style.font-size.px]="size() * 0.62">benqui <span class="go">go</span></span>
    }
  `,
})
export class Logo {
  readonly size = input(36);
  readonly compact = input(false);
}
