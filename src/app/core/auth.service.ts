import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthApi } from './api';
import { Session } from './models';
import { storage } from './storage';

const KEY = 'benqui-go.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);

  readonly session = signal<Session | null>(storage.get<Session>(KEY));
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAdmin = computed(() => this.user()?.role === 'Administrador');
  readonly displayName = computed(() => {
    const u = this.user();
    return u ? `${u.firstName} ${u.lastName}` : '';
  });

  login(userName: string, password: string): Observable<Session> {
    return this.api.login(userName, password).pipe(
      tap((s) => {
        storage.set(KEY, s);
        this.session.set(s);
      }),
    );
  }

  logout(): void {
    storage.remove(KEY);
    this.session.set(null);
    this.router.navigateByUrl('/login');
  }
}
