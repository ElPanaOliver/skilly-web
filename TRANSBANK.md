# Pago con Webpay Plus (Transbank) en Skilly

## Flujo
1. `reservar.html` crea la reserva (`pendiente_pago`) y llama a `POST /api/pay/init`.
2. El servidor crea la transacción en Transbank (`webpay.js`) y guarda una fila en `transacciones_webpay`.
3. El navegador envía `token_ws` por POST al formulario de Transbank, donde la persona paga.
4. Transbank vuelve a `/webpay/retorno`. **El servidor confirma con `commit()`**: valida estado `AUTHORIZED`, `response_code = 0`, la orden de compra y que el monto sea igual al de la reserva. Solo entonces la reserva pasa a `agendado` y el dinero queda en custodia.
5. `pago-resultado.html` muestra el comprobante. Si el pago falla, se anula o expira, la reserva se cancela y el bloque se libera.
6. Si la empresa cancela una reserva pagada, el servidor pide el reembolso a Transbank (`refund`).

Se eliminó el antiguo `POST /api/pay` (marcaba como pagado sin cobrar).

## Modos (variable `TBK_MODE`)
| Modo | Uso |
|---|---|
| `integracion` (por defecto) | Servidores de prueba de Transbank. Requiere internet. No cobra dinero. |
| `simulado` | Pasarela local de Skilly, sin internet (`pasarela-simulada.html`). |
| `produccion` | Webpay real. Requiere `TBK_COMMERCE_CODE` y `TBK_API_SECRET`. |

Windows: `set TBK_MODE=simulado` y luego `node server.js`. `PUBLIC_URL` (por defecto `http://localhost:3000`) es la URL a la que Transbank devuelve al cliente.

## Datos de prueba (ambiente de integracion)
- VISA credito aprobada: `4051 8856 0044 6623`, CVV `123`, cualquier fecha futura.
- Redcompra debito aprobada: `4051 8842 3993 7763`.
- MasterCard rechazada: `5186 0595 5959 0568`.
- Si pide autenticacion: RUT `11.111.111-1`, clave `123`.
(Verifica estos datos en transbankdevelopers.cl por si Transbank los actualiza.)

## Base de datos
Tabla nueva `transacciones_webpay` (en `database/skilly.sql`). Si ya importaste la base, el servidor la crea sola al iniciar.
