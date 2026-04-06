/**
 * Pure formatting functions for document alerts.
 * Extracted from telegram.js for testability without side effects.
 */

const { toDateStr } = require('./date_format');

const TYPE_EMOJI = {
  visa: '🛂',
  pasaporte: '📕',
  seguro: '🛡️',
  wof: '🚗',
  rego: '🚙',
  ird: '💰',
  default: '📄',
};

const urgencyEmojiDoc = (days) => {
  if (days <= 7) return '🔴';
  if (days <= 30) return '🟡';
  return '🟢';
};

/**
 * Formatea alertas de documentos
 */
function formatDocumentAlert(docs) {
  let message = '📋 *ULTRA SYSTEM — Alertas de Documentos*\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const d of docs) {
    const emoji = TYPE_EMOJI[d.document_type] || TYPE_EMOJI.default;
    const urgent = urgencyEmojiDoc(d.days_remaining);
    const expDate = toDateStr(d.expiry_date);

    message += `${urgent} ${emoji} *${d.document_name}*\n`;
    message += `   ⏳ Caduca en: *${d.days_remaining} dias* (${expDate})\n`;
    if (d.notes) message += `   💬 ${d.notes}\n`;
    message += '\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🤖 _Enviado por Ultra Engine_';
  return message;
}

/**
 * Formatea alerta urgente de documentos (<7 dias)
 */
function formatUrgentDocumentAlert(docs) {
  const lines = ['🚨 *ALERTA URGENTE — Documentos a punto de caducar*', ''];
  for (const d of docs) {
    const expDate = toDateStr(d.expiry_date);
    lines.push(`🔴 *${d.document_name}* — ${d.days_remaining} dias (${expDate})`);
  }
  return lines.join('\n');
}

module.exports = { TYPE_EMOJI, urgencyEmojiDoc, formatDocumentAlert, formatUrgentDocumentAlert };
