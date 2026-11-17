import { TourStep } from './tour';

const exists = (sel: string) => () => !!document.querySelector(sel);
const gone = (sel: string) => () => !document.querySelector(sel);

/**
 * Guías por pantalla (clave = ruta). Los elementos se marcan en las plantillas con `data-tour`.
 * Los pasos cuyo elemento no está (ej.: botones solo de dueño para el cajero) se saltean solos.
 */
/** Pantallas cuyo contenido llega de la API: la guía espera a que exista este elemento. */
export const TOUR_READY: Record<string, string> = {
  precios: '[data-tour=prices-match]',
};

export const TOURS: Record<string, TourStep[]> = {
  vender: [
    {
      emoji: '👋',
      title: '¡Bienvenido a Benqui Go!',
      text: 'Te mostramos cómo hacer tu primera venta en un minuto. Cuando quieras repetir esta guía, tocá Ayuda en el menú.',
    },
    {
      target: '[data-tour=cash-open]',
      title: 'Primero, abrí la caja',
      text: 'Escribí con cuánto cambio arrancás (o dejalo en $ 0) y tocá "Abrir caja". Sin caja abierta no se puede vender.',
      until: gone('[data-tour=cash-open]'),
      hint: 'Tocá "Abrir caja" para seguir',
    },
    {
      target: '[data-tour=search]',
      title: 'Escaneá o buscá',
      text: 'Pasá el lector por el código de barras, o escribí el nombre o el código corto y apretá Enter. Con 3*12 agregás 3 unidades del código 12.',
    },
    {
      target: '[data-tour=grid]',
      title: 'O tocá un producto',
      text: 'Los favoritos aparecen primero y las pestañas filtran por categoría. Probá: tocá uno para agregarlo a la venta.',
      until: exists('.ticket .line'),
      hint: 'Tocá un producto',
    },
    {
      target: '[data-tour=cart]',
      title: 'Tu venta',
      text: 'Cambiá la cantidad con − y +, tocá el número para escribirla, o quitá un producto con la X.',
    },
    {
      target: '[data-tour=nav]',
      title: 'Todo lo demás, en el menú',
      text: 'Caja (apertura y cierre), Ventas, Productos y Fiado. Reportes y Ajustes los ve solo el dueño.',
    },
    {
      target: '[data-tour=charge]',
      title: 'Cobrá',
      text: 'Tocá Cobrar (o F2): elegís cómo paga, te calcula el vuelto y también podés fiar.',
      until: exists('app-payment-modal'),
      hint: 'Tocá "Cobrar"',
    },
  ],
  caja: [
    {
      target: '[data-tour=cash-open-page]',
      title: 'Abrí la caja',
      text: 'Contá el cambio con el que arrancás, escribilo y tocá "Abrir caja".',
      until: gone('[data-tour=cash-open-page]'),
      hint: 'Tocá "Abrir caja" para seguir',
    },
    {
      target: '[data-tour=cash-expected]',
      title: 'Lo que debería haber',
      text: 'Suma el fondo inicial, las ventas en efectivo y los cobros de fiado, y resta gastos y retiros. Se actualiza con cada venta.',
    },
    {
      target: '[data-tour=cash-movements]',
      title: '¿Sacaste o pusiste plata?',
      text: 'Registrá acá los pagos a proveedores, retiros e ingresos, así el arqueo cierra justo.',
    },
    {
      target: '[data-tour=cash-close]',
      title: 'Al terminar el turno',
      text: 'Cerrá la caja: contás el efectivo y te dice si sobra o falta. Podés imprimir el cierre.',
    },
  ],
  productos: [
    {
      target: '[data-tour=products-search]',
      title: 'Buscá con el lector',
      text: 'Escaneá un código para encontrar el producto. Si no existe, te ofrece darlo de alta con ese código.',
    },
    {
      target: '[data-tour=products-new]',
      title: 'Cargá tus productos',
      text: 'Nombre, precio, código de barras y una foto (la podés sacar con el celular). Si escribís el margen, el precio se calcula solo.',
    },
    {
      target: '[data-tour=products-sepa]',
      title: 'Precios de los supermercados',
      text: 'En "Precios SEPA" ves lo que cobran los supermercados por cada producto (SEPA – Precios Claros), lo comparás con tus precios y los actualizás en un paso. También podés agregar productos con nombre, código de barras y precio ya cargados.',
    },
    {
      target: '[data-tour=products-bulk]',
      title: '¿Aumentaron los precios?',
      text: 'Subí un porcentaje a todos los productos o a una categoría, con redondeo a $ 10, $ 50 o $ 100.',
    },
    {
      target: '[data-tour=products-stock]',
      title: 'Stock',
      text: 'Registrá la mercadería que entra, los ajustes por conteo y las roturas. Te avisamos cuando algo se está terminando.',
    },
  ],
  precios: [
    {
      emoji: '🏷️',
      title: 'Precios de referencia',
      text: 'Son los precios que informan los supermercados de todo el país (SEPA – Precios Claros). Te sirven para saber si estás caro o barato y para actualizar tus precios.',
    },
    {
      target: '[data-tour=prices-limit]',
      title: 'Es una demo',
      text: 'En esta versión solo están los 10 productos más vendidos de cada rubro (80 en total). La versión completa tiene todo el catálogo de SEPA.',
    },
    {
      target: '[data-tour=prices-match]',
      title: 'Tus productos en SEPA',
      text: 'Cruzamos tus productos por código de barras. Tocá "más baratos" o "más caros" para ver cuáles son.',
    },
    {
      target: '[data-tour=prices-update]',
      title: 'Actualizá en un paso',
      text: 'Elegí qué productos actualizar y el redondeo ($ 10, $ 50 o $ 100). Te avisamos si alguno queda debajo de tu costo.',
    },
    {
      target: '[data-tour=prices-province]',
      title: 'Tu provincia',
      text: 'Los precios cambian según la provincia. Elegí la tuya o el promedio nacional.',
    },
  ],
  clientes: [
    {
      target: '[data-tour=debt-total]',
      title: 'Cuánto te deben',
      text: 'El total de lo fiado que todavía no te pagaron.',
    },
    {
      target: '[data-tour=customers-new]',
      title: 'Nuevo cliente',
      text: 'Con nombre y teléfono alcanza. Si querés, ponele un límite de fiado.',
    },
    {
      target: '[data-tour=customers-list]',
      title: 'Tocá un cliente',
      text: 'Ves su cuenta, registrás lo que te paga y le mandás un recordatorio por WhatsApp.',
    },
  ],
};
