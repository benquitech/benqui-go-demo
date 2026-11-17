// Desarrollo (ng serve): API local. Al compilar para producción (ng build, lo que corre Vercel)
// angular.json reemplaza este archivo por environment.prod.ts. Mantener los dos con los mismos campos.
export const environment = {
  production: false,
  /** true: funciona sin servidor, con datos de ejemplo en el navegador (localStorage). */
  demo: true,
  /** API local: npm run start:dev en benqui-go-api. */
  apiUrl: 'http://localhost:3010/api',
  /**
   * Catálogo de precios de referencia (benqui-go-api, precios de SEPA / Precios Claros).
   * Funciona también en modo demo: es lo único que se consulta a la API.
   */
  referenceCatalog: {
    /**
     * Clave del demo (DEMO_ACCESS_KEY de la API). Vacía = la pantalla "Precios" y las sugerencias
     * al dar de alta un producto quedan apagadas. No es un secreto: termina en el JavaScript del navegador.
     */
    demoKey: 'bqg_demo_Z4lfPM6AFYraqsGEWu817465',
    /** Provincia inicial de los precios (ISO 3166-2: AR-A = Salta). Vacío = precio nacional. El usuario la puede cambiar. */
    province: 'AR-A',
  },
};
