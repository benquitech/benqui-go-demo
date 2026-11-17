// Producción (ng build / Vercel): angular.json usa este archivo en lugar de environment.ts.
// Mantener los dos con los mismos campos.
export const environment = {
  production: true,
  /** true: funciona sin servidor, con datos de ejemplo en el navegador (localStorage). */
  demo: true,
  /** API publicada (HTTPS: el demo en Vercel no puede llamar a http://localhost). */
  apiUrl: 'https://benqui-go-api.vercel.app/api',
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
