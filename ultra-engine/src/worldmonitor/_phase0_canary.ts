// ════════════════════════════════════════════════════════════
//  WM Phase 0 canary — minimal TS file with no broken imports.
//  Sirve para verificar que el require hook de tsx (registrado
//  via `node --require tsx/cjs` en el Dockerfile) funciona y
//  puede compilar TypeScript al vuelo dentro del container.
//
//  Test desde Node:
//    require('./src/worldmonitor/_phase0_canary').phase0Hello()
//
//  Esto NO es lógica de WM — es solo el smoke test del hook.
// ════════════════════════════════════════════════════════════

export interface Phase0Result {
  ok: boolean;
  scaffoldFiles: number;
  message: string;
  ts: string;
}

export function phase0Hello(): Phase0Result {
  return {
    ok: true,
    scaffoldFiles: 153,
    message: 'WM Phase 0 canary OK — tsx require hook is active and compiling TS at runtime.',
    ts: new Date().toISOString(),
  };
}
