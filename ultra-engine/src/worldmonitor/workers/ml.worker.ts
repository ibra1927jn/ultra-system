// ════════════════════════════════════════════════════════════
//  WM Phase 1 stub — ML worker
//  Mismo pattern que analysis.worker.ts: stub no-op para Node.
// ════════════════════════════════════════════════════════════

export default class MLWorkerStub {
  postMessage(_msg: unknown): void {}
  terminate(): void {}
  addEventListener(_type: string, _listener: unknown): void {}
  removeEventListener(_type: string, _listener: unknown): void {}
}
