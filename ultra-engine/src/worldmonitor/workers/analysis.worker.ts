// ════════════════════════════════════════════════════════════
//  WM Phase 1 stub — analysis worker
//
//  El WM original usaba `import AnalysisWorker from './analysis.worker?worker'`
//  donde el sufijo `?worker` es magia de Vite que devuelve un constructor
//  de Web Worker. En Node no existe esa sintaxis.
//
//  Este stub exporta una clase no-op para que los imports resuelvan.
//  Las llamadas se quedan en main thread (sin paralelismo). Phase 2+
//  puede reemplazar con worker_threads.Worker real si el bottleneck CPU
//  lo justifica.
// ════════════════════════════════════════════════════════════

export default class AnalysisWorkerStub {
  postMessage(_msg: unknown): void {
    // no-op: en Node ejecutamos sincrónicamente en main thread
  }
  terminate(): void {
    // no-op
  }
  addEventListener(_type: string, _listener: unknown): void {
    // no-op
  }
  removeEventListener(_type: string, _listener: unknown): void {
    // no-op
  }
}
