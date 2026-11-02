// Test stub for supabase.functions.invoke: tests install a handler.
// deno-lint-ignore-file no-explicit-any
type Handler = (name: string, body: any) => unknown;
export const invoked: Array<{ name: string; body: any }> = [];
let handler: Handler = () => ({});
export function setInvokeHandler(h: Handler) {
  handler = h;
}
let rpcHandler: (name: string) => unknown = () => null;
export function setRpcHandler(h: (name: string) => unknown) {
  rpcHandler = h;
}
export const supabase: any = {
  rpc(name: string) {
    invoked.push({ name: `rpc:${name}`, body: {} });
    return Promise.resolve({ data: rpcHandler(name), error: null });
  },
  functions: {
    invoke(name: string, opts: { body: any }) {
      invoked.push({ name, body: opts.body });
      return Promise.resolve({ data: handler(name, opts.body), error: null });
    },
  },
};
