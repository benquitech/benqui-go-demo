import { Injectable } from '@angular/core';
import { BusinessSettings, CashSummary, Sale } from './models';
import { money, qty } from './money';

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Tickets para impresora térmica (58/80 mm) o cualquier impresora.
 * Arma el HTML en #print-area (index.html) y llama a window.print(): solo se imprime ese bloque.
 */
@Injectable({ providedIn: 'root' })
export class TicketPrinter {
  printSale(sale: Sale, settings: BusinessSettings): void {
    const rows = sale.items
      .map(
        (i) => `
        <div class="line">${esc(i.description)}</div>
        <div class="row"><span>${qty(i.quantity, i.saleUnit)} x ${money(i.unitPrice)}</span><span>${money(i.subtotal)}</span></div>`,
      )
      .join('');
    const pays = sale.payments
      .map(
        (p) => `
        <div class="row"><span>${esc(p.methodName)}</span><span>${money(p.amount + p.surchargeAmount)}</span></div>
        ${p.receivedAmount != null && p.changeAmount ? `<div class="row small"><span>Recibido ${money(p.receivedAmount)}</span><span>Vuelto ${money(p.changeAmount)}</span></div>` : ''}`,
      )
      .join('');
    this.print(
      settings,
      `
      ${this.header(settings)}
      <div class="row small"><span>Ticket #${sale.number}</span><span>${dateTime(sale.createdAt)}</span></div>
      <div class="small">Atendió: ${esc(sale.userName)}${sale.customerName ? ` · Cliente: ${esc(sale.customerName)}` : ''}</div>
      ${sale.status === 'VOIDED' ? '<div class="center big">*** ANULADA ***</div>' : ''}
      <hr />${rows}<hr />
      ${sale.discountAmount ? `<div class="row"><span>Descuento</span><span>−${money(sale.discountAmount)}</span></div>` : ''}
      ${sale.surchargeAmount ? `<div class="row"><span>Recargo</span><span>${money(sale.surchargeAmount)}</span></div>` : ''}
      <div class="row big"><span>TOTAL</span><span>${money(sale.total)}</span></div>
      <hr />${pays}<hr />
      <div class="center small">${esc(settings.ticketFooter)}</div>
      <div class="center small">Comprobante no válido como factura</div>`,
    );
  }

  printCashClose(s: CashSummary, settings: BusinessSettings): void {
    const methods = s.byMethod.map((m) => `<div class="row"><span>${esc(m.name)}</span><span>${money(m.total)}</span></div>`).join('');
    this.print(
      settings,
      `
      ${this.header(settings)}
      <div class="center big">CIERRE DE CAJA</div>
      <div class="small">Apertura: ${dateTime(s.session.openedAt)} (${esc(s.session.openedByName)})</div>
      ${s.session.closedAt ? `<div class="small">Cierre: ${dateTime(s.session.closedAt)} (${esc(s.session.closedByName)})</div>` : ''}
      <hr />
      <div class="row"><span>Ventas (${s.salesCount})</span><span>${money(s.salesTotal)}</span></div>
      ${methods}<hr />
      <div class="row"><span>Fondo inicial</span><span>${money(s.session.openingAmount)}</span></div>
      <div class="row"><span>Cobros de fiado (efvo.)</span><span>${money(s.accountPaymentsCash)}</span></div>
      <div class="row"><span>Ingresos</span><span>${money(s.incomes)}</span></div>
      <div class="row"><span>Gastos</span><span>−${money(s.expenses)}</span></div>
      <div class="row"><span>Retiros</span><span>−${money(s.withdrawals)}</span></div>
      <hr />
      <div class="row big"><span>Efectivo esperado</span><span>${money(s.expectedCash)}</span></div>
      ${s.session.countedCash != null ? `<div class="row"><span>Contado</span><span>${money(s.session.countedCash)}</span></div><div class="row big"><span>Diferencia</span><span>${money(s.session.difference)}</span></div>` : ''}`,
    );
  }

  private header(s: BusinessSettings): string {
    return `
      <div class="center big">${esc(s.name)}</div>
      ${s.address ? `<div class="center small">${esc(s.address)}</div>` : ''}
      ${s.phone ? `<div class="center small">Tel. ${esc(s.phone)}</div>` : ''}
      ${s.cuit ? `<div class="center small">CUIT ${esc(s.cuit)}</div>` : ''}
      <hr />`;
  }

  private print(settings: BusinessSettings, body: string): void {
    const area = document.getElementById('print-area');
    if (!area) return;
    const width = settings.ticketWidth === 58 ? '54mm' : '76mm';
    area.innerHTML = `
      <style>
        #print-area { width: ${width}; padding: 2mm; font: 12px/1.35 'Courier New', monospace; color: #000; }
        #print-area .row { display: flex; justify-content: space-between; gap: 8px; }
        #print-area .center { text-align: center; }
        #print-area .big { font-size: 14px; font-weight: 700; }
        #print-area .small { font-size: 11px; }
        #print-area hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
      </style>${body}`;
    document.body.classList.add('printing');
    const done = () => {
      document.body.classList.remove('printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  }
}
