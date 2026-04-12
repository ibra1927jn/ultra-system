// ╔══════════════════════════════════════════════════════════╗
// ║  Worker thread runner — offloads CPU-heavy cron jobs     ║
// ║  from the main event loop.                               ║
// ║                                                          ║
// ║  Usage in scheduler:                                     ║
// ║    const { runInWorker } = require('./worker_runner');    ║
// ║    register('job', '* * *', () => runInWorker('module', 'fn', args)) ║
// ╚══════════════════════════════════════════════════════════╝

'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

/**
 * Run a module function in a worker thread.
 * @param {string} modulePath - path relative to src/ (e.g. 'dedup_runner')
 * @param {string} fnName - exported function name (e.g. 'runAll')
 * @param {object} args - serializable arguments passed to the function
 * @returns {Promise<any>} result from the worker
 */
function runInWorker(modulePath, fnName, args = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { modulePath, fnName, args },
    });
    let result;
    worker.on('message', (msg) => { result = msg; });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0 && !result) {
        reject(new Error(`Worker exited with code ${code}`));
      } else {
        resolve(result);
      }
    });
  });
}

// ─── Worker thread code (runs when spawned) ────────────────
if (!isMainThread) {
  (async () => {
    try {
      // Re-initialize dotenv in worker (separate V8 isolate)
      require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

      const { modulePath, fnName, args } = workerData;
      const mod = require(path.join(__dirname, modulePath));
      const fn = mod[fnName];
      if (typeof fn !== 'function') {
        throw new Error(`${modulePath}.${fnName} is not a function`);
      }
      const result = await fn(args);
      parentPort.postMessage(result);
    } catch (err) {
      // Send error as message so main thread can log it
      parentPort.postMessage({ __workerError: true, message: err.message });
    }
  })();
}

module.exports = { runInWorker };
