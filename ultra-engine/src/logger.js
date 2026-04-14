// Logger estructurado basado en pino.
// En dev: pretty-ish (nivel + mensaje). En prod: JSON newline-delimited.
// Uso: const log = require('./logger').child('scope'); log.info({...}, 'msg')

const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  // Base fields incluidos en cada línea
  base: { svc: 'ultra-engine' },
  timestamp: pino.stdTimeFunctions.isoTime,
  // En dev usamos transport de pino-pretty si está disponible; si no, JSON.
  // Evitamos dependencia extra — el JSON es legible en docker logs.
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
});

// Devuelve child logger con un `scope` fijo (facilita grep por subsistema)
function child(scope, extra = {}) {
  return logger.child({ scope, ...extra });
}

module.exports = { logger, child };
