import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { referenceCatalogInterceptor } from './core/reference-catalog';
import { loadingInterceptor } from './core/loading';

import { routes } from './app.routes';
import { provideDemoBackend } from './core/demo/demo-api';

// Formato argentino: fechas dd/MM/yyyy y separador de miles con punto.
registerLocaleData(localeEsAr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'es-AR' },
    // Catálogo de precios de referencia (benqui-go-api): el interceptor agrega el token del demo.
    // El overlay de carga va primero (el más externo): cubre también el canje del token.
    provideHttpClient(withFetch(), withInterceptors([loadingInterceptor, referenceCatalogInterceptor])),
    // Capa de datos: modo demo (localStorage). Cuando exista benqui-go-api se suma
    // provideHttpBackend() y se elige con environment.demo.
    provideDemoBackend(),
  ],
};
