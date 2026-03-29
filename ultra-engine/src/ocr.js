// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — OCR (reemplaza Paperless-ngx)            ║
// ║  Extrae texto de PDFs e imágenes con Tesseract.js        ║
// ╚══════════════════════════════════════════════════════════╝

const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Asegurar que existe el directorio
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Extrae texto de una imagen o PDF (bilingüe ESP + ENG)
 * @param {string} filePath — Ruta al archivo
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function extractText(filePath) {
  console.log(`🔍 OCR procesando: ${path.basename(filePath)}`);

  const ext = path.extname(filePath).toLowerCase();

  // Si es PDF, intentar extraer texto directamente primero
  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      if (data.text && data.text.trim().length > 50) {
        console.log('✅ Texto extraído de PDF directamente (sin OCR)');
        return { text: data.text.trim(), confidence: 99, method: 'pdf-parse' };
      }
    } catch {
      console.log('ℹ️ PDF no tiene texto embebido, usando OCR...');
    }
  }

  // OCR con Tesseract (ESP + ENG)
  const result = await Tesseract.recognize(filePath, 'spa+eng', {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r   OCR: ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  process.stdout.write('\n'); // Nueva línea después del progreso
  console.log(`✅ OCR completado (confianza: ${Math.round(result.data.confidence)}%)`);

  return {
    text: result.data.text.trim(),
    confidence: Math.round(result.data.confidence),
    method: 'tesseract',
  };
}

/**
 * Guarda un archivo subido en el directorio de uploads
 * @param {Buffer} buffer — Contenido del archivo
 * @param {string} originalName — Nombre original
 * @returns {string} — Ruta al archivo guardado
 */
function saveFile(buffer, originalName) {
  const timestamp = Date.now();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${timestamp}_${safeName}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  fs.writeFileSync(filePath, buffer);
  console.log(`💾 Archivo guardado: ${fileName}`);
  return filePath;
}

/**
 * Lista archivos subidos
 */
function listFiles() {
  if (!fs.existsSync(UPLOAD_DIR)) return [];
  return fs.readdirSync(UPLOAD_DIR).map((name) => {
    const filePath = path.join(UPLOAD_DIR, name);
    const stats = fs.statSync(filePath);
    return {
      name,
      size: stats.size,
      created: stats.birthtime,
      path: filePath,
    };
  });
}

module.exports = { extractText, saveFile, listFiles, UPLOAD_DIR };
