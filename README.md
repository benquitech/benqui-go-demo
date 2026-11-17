# Benqui Go – Punto de venta (front)

Sistema de ventas simple para **kioscos, drugstores, farmacias y almacenes**: vender rápido con lector de código de barras, código corto o fotos; controlar la caja, el stock y el fiado; actualizar precios en masa.

Angular 21 (standalone, signals). La API vive en un repo aparte: `benqui-go-api` (NestJS + Prisma + PostgreSQL). El contrato de datos está en `benqui-go-api/DISENO_TABLAS.md`.

## Puesta en marcha

```bash
npm install
npm start          # http://localhost:4200
```

En la pantalla de ingreso, los botones **Dueño** y **Cajero** entran a la demo con un clic (usuarios `admin` / `cajero`, contraseña `demo`).

## Modo demo (sin servidor)

`src/environments/environment.ts` → `demo: true`.

- Los datos viven en el `localStorage` del navegador: cada persona que prueba la demo tiene los suyos.
- Arranca con datos de ejemplo de un kiosco: 64 productos reales del catálogo de SEPA (8 por rubro, con su código de barras; los otros 2 de cada rubro quedan para probar "Agregar" desde Precios), más cigarrillos, sueltos por kilo y servicios. También trae ventas de los últimos 7 días y clientes con fiado. La lista está en `core/demo/sepa-products.ts`.
- **Reiniciar** (menú lateral o Ajustes) vuelve a los datos de ejemplo.

Las pantallas solo conocen los contratos de `src/app/core/api.ts`. `core/demo/demo-api.ts` los implementa en memoria con las mismas validaciones que tendrá la API. Para conectar la API real hay que agregar la implementación HTTP de esos contratos y elegirla en `app.config.ts`. Las pantallas no cambian.

## Pantallas

| Pantalla | Para qué |
|---|---|
| **Vender** | Buscador siempre activo (lector de código de barras), favoritos y categorías con fotos, carrito, cobro con vuelto, pago combinado y fiado |
| **Caja** | Apertura con cambio inicial, ingresos/gastos/retiros, cierre con arqueo e impresión |
| **Ventas** | Historial, detalle, reimprimir ticket, anular (solo dueño) |
| **Productos** | Alta con foto, código de barras y código corto, venta por kilo, stock y alertas, aumentos masivos con redondeo |
| **Fiado** | Clientes con cuenta corriente, pagos y recordatorio por WhatsApp |
| **Reportes** | Ventas del día, por hora, por medio de pago y por categoría, más vendidos, lista para reponer (solo dueño) |
| **Ajustes** | Datos del negocio y ticket, medios de pago y recargos, categorías (solo dueño) |

## Precios de referencia (SEPA)

**Entornos (igual que fireextracking):** `src/environments/environment.ts` es el de desarrollo (`ng serve` → API local `http://localhost:3010/api`) y `environment.prod.ts` el de producción (`ng build`, lo que corre Vercel → `https://benqui-go-api.vercel.app/api`). `angular.json` los intercambia con `fileReplacements`; los dos deben tener los mismos campos. `vercel.json` publica `dist/benqui-go/browser`.

La pantalla **Precios** consulta a `benqui-go-api` los precios que informan los supermercados (SEPA – Precios Claros). Es lo único que usa la API en modo demo. Para activarla, en `src/environments/environment.ts`:

- `apiUrl`: la URL de la API terminada en `/api` (publicada: `https://benqui-go-api.vercel.app/api`; local: `http://localhost:3010/api`).
- `referenceCatalog.demoKey`: el valor de `DEMO_ACCESS_KEY` del `.env` de la API. Sin clave, la pantalla no aparece.
- La API solo acepta pedidos desde los orígenes de su `FRONTEND_URL` (local: `http://localhost:4200`).

La versión demo de la API deja consultar **10 productos por rubro** (80 en total); la pantalla lo avisa. Mientras se consulta la API se muestra un overlay de carga (`core/loading.ts`).

Qué se puede hacer:
- Ver el precio de referencia de tu provincia, el rango entre supermercados y tu precio, con la diferencia en %.
- Ver cuántos de tus productos están en SEPA y cuántos están más baratos o más caros. Se cruzan por código de barras.
- **Actualizar mis precios** (dueño): elegir productos y redondeo, con aviso si alguno queda por debajo del costo. También **Usar $ X** en una fila.
- **Agregar** un producto de SEPA a tus productos, con los datos precargados.

## Guía para usuarios nuevos

La primera vez que se entra a Vender, Caja, Productos o Fiado aparece una guía paso a paso: oscurece la pantalla, señala dónde tocar y avanza sola cuando el usuario hace el paso (por ejemplo, abrir la caja). El botón **Ayuda** del menú la repite. Las guías se definen en `src/app/shared/tours.ts`, y los elementos a señalar se marcan en las plantillas con `data-tour="..."`.

## Atajos en Vender

| Tecla | Acción |
|---|---|
| Escribir / escanear | Va directo al buscador |
| `Enter` | Agrega el producto del código (o el único resultado). Con el carrito cargado y el buscador vacío, cobra |
| `3*12` + `Enter` | Agrega 3 unidades del código 12 |
| `F2` | Cobrar |
| `F3` | Producto varios (precio a mano) |
| `F4` | Ir al buscador |
| `F8` | Cancelar la venta |
| `Esc` | Limpiar búsqueda / cerrar ventana |

## Ticket

Sale por la impresora del sistema con formato de 58 u 80 mm (se configura en Ajustes). Es un comprobante **no fiscal**. La factura electrónica de ARCA queda para una próxima etapa.
