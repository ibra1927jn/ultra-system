// ════════════════════════════════════════════════════════════
//  WM Phase 1 generated proto stubs — shared helpers
//
//  WM original tenía clientes gRPC generados desde .proto files en
//  src/generated/client/worldmonitor/<domain>/v1/service_client.ts.
//  Esos archivos se generan via buf/protoc y NO son parte del scaffold
//  que copiamos en Phase 0.
//
//  Para que los servicios que importan estos clientes (~30 archivos) al
//  menos COMPILEN/CARGUEN bajo tsx, creamos stubs minimal: clases con
//  métodos que lanzan StubNotImplementedError.
//
//  Phase 2+ debe reemplazar estos stubs con clientes reales (gRPC, HTTP
//  REST, o llamada directa al engine si los handlers viven en /domains/).
// ════════════════════════════════════════════════════════════

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status = 0, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Base stub para todos los <Domain>ServiceClient.
 * Proxy: cualquier método llamado lanza StubNotImplementedError.
 * Permite que el código del servicio importe el constructor sin crashear
 * en compile/load time. Solo crashea si efectivamente se LLAMA un método.
 */
export function makeStubServiceClient(domain: string): new (...args: unknown[]) => unknown {
  return class StubServiceClient {
    domain: string;
    constructor(_baseUrl?: string, _opts?: unknown) {
      this.domain = domain;
      return new Proxy(this, {
        get(target, prop) {
          if (prop === 'domain' || prop === 'constructor' || typeof prop === 'symbol') {
            return Reflect.get(target, prop);
          }
          // Cualquier otro acceso devuelve una función que lanza
          return (..._args: unknown[]) => {
            throw new ApiError(
              `WM Phase 1 stub: ${domain}ServiceClient.${String(prop)}() not implemented yet — Phase 2 RPC client pending`,
              501
            );
          };
        },
      });
    }
  } as unknown as new (...args: unknown[]) => unknown;
}
