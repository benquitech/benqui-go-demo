import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'vender' },
      { path: 'vender', loadComponent: () => import('./pages/pos/pos').then((m) => m.Pos) },
      { path: 'caja', loadComponent: () => import('./pages/cash/cash').then((m) => m.Cash) },
      { path: 'ventas', loadComponent: () => import('./pages/sales/sales').then((m) => m.Sales) },
      { path: 'productos', loadComponent: () => import('./pages/products/products').then((m) => m.Products) },
      { path: 'precios', loadComponent: () => import('./pages/prices/prices').then((m) => m.Prices) },
      { path: 'clientes', loadComponent: () => import('./pages/customers/customers').then((m) => m.Customers) },
      { path: 'reportes', canActivate: [adminGuard], loadComponent: () => import('./pages/reports/reports').then((m) => m.Reports) },
      { path: 'configuracion', canActivate: [adminGuard], loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
    ],
  },
  { path: '**', redirectTo: '' },
];
