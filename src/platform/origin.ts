const loopbackHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopbackHostname(hostname: string): boolean {
  return loopbackHostnames.has(hostname.toLowerCase());
}
