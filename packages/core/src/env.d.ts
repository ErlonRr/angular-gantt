// @gantryjs/core compiles without DOM or Node types (it must run anywhere). These are the only
// host APIs it uses, present in every JS runtime: browsers, Node, Deno, Bun, workers.
declare function setTimeout(handler: () => void, timeout?: number): unknown;
declare const console: { warn(...data: unknown[]): void };
