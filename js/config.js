// Configuración del sitio del Comité de Agua de La Florida.
// SCRIPT_URL: la dirección /exec del Apps Script ligado al PADRÓN AGUA FLORIDA
// (ver apps-script/INSTALAR.md). Mientras esté vacía, el sitio usa la copia
// del padrón de js/padron-copia.js y la tesorería no puede guardar.
window.AGUA_CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw-qlfxVvIjLWWRs7tWCAkuX6v7jc4tfYetqxcpTajgZmnrcgCV-TFKa3Sq868_4TF0/exec',

  // Cuotas del reglamento (art. 5, 6, 7, 10 y 11)
  CUOTA: 150,
  RECARGO: 100,
  TOMA_NUEVA: 400,
  MULTA_FUGA: 200,
  JORNAL: 350,
  PAGO_TECNICO: 2000,

  // Desde qué año se cobran los adeudos atrasados (2025 tiene datos incompletos: va a Pendientes)
  ADEUDO_DESDE: 2026,
  RECONEXION: 400,

  // La anualidad vence el último día de marzo (art. 6)
  VENCE_MES: 3,
  VENCE_DIA: 31
};
