import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { Icon } from '../../shared/icon';
import { Logo } from '../../shared/logo';
import { ToastService } from '../../shared/toast';
import { flagInvalid } from '../../shared/invalid';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Logo, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      min-height: 100dvh; display: grid; place-items: center; padding: 24px;
      background:
        radial-gradient(600px 400px at 20% 10%, rgba(0, 212, 255, 0.16), transparent 70%),
        radial-gradient(500px 400px at 90% 90%, rgba(0, 212, 255, 0.08), transparent 70%),
        var(--navy-950);
    }
    .box { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 24px; }
    .head { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; color: #f0f6ff; }
    .head p { color: #8ea3bd; }
    form { padding: 24px; display: flex; flex-direction: column; gap: 14px; }
    .demo {
      border: 1px dashed rgba(0, 212, 255, 0.4); border-radius: var(--radius-lg); padding: 14px;
      color: #c7d6e8; font-size: 0.9rem; display: flex; flex-direction: column; gap: 10px;
    }
    .demo strong { color: var(--cyan); }
    .demo .row { flex-wrap: wrap; }
    .demo button { flex: 1; background: var(--navy-800); color: #f0f6ff; border-color: var(--navy-700); }
    .demo button:hover:not(:disabled) { background: var(--navy-700); border-color: var(--cyan); }
  `,
  template: `
    <div class="box">
      <div class="head">
        <app-logo [size]="56" />
        <p>Vendé rápido. Controlá tu caja, tu stock y el fiado.</p>
      </div>

      <form class="card" (ngSubmit)="submit()">
        <div class="field">
          <label for="user">Usuario</label>
          <input id="user" class="input input-lg" name="user" [(ngModel)]="userName" autocomplete="username" required autofocus />
        </div>
        <div class="field">
          <label for="pass">Contraseña</label>
          <input id="pass" class="input input-lg" type="password" name="pass" [(ngModel)]="password" autocomplete="current-password" required />
        </div>
        <button class="btn btn-primary btn-lg" type="submit" [disabled]="busy()">
          <app-icon name="lock" [size]="18" /> Ingresar
        </button>
      </form>

      @if (demo) {
        <div class="demo">
          <span><strong>Demo:</strong> entrá con un clic. Los datos se guardan solo en este navegador.</span>
          <div class="row">
            <button class="btn" type="button" (click)="quick('admin')"><app-icon name="user" [size]="18" /> Dueño</button>
            <button class="btn" type="button" (click)="quick('cajero')"><app-icon name="cart" [size]="18" /> Cajero</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly demo = environment.demo;
  protected readonly busy = signal(false);
  protected userName = '';
  protected password = '';

  protected quick(user: 'admin' | 'cajero'): void {
    this.userName = user;
    this.password = 'demo';
    this.submit();
  }

  protected submit(): void {
    if (!this.userName.trim()) {
      flagInvalid('user', 'Escribí tu usuario.', this.toast);
      return;
    }
    if (!this.password) {
      flagInvalid('pass', 'Escribí tu contraseña.', this.toast);
      return;
    }
    this.busy.set(true);
    this.auth.login(this.userName, this.password).subscribe({
      next: () => this.router.navigateByUrl('/vender'),
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }
}
