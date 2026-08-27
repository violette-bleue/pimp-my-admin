export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function scheduleReload(afterMs = 900) {
  setTimeout(() => location.reload(), afterMs);
}

export function normalize(str) {
  return str.replace(/\r\n/g, "\n").trim();
}
