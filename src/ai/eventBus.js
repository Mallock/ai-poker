// Tiny pub/sub used to fan out AI streaming events from the driver into the Pinia stores.
// Keeping this independent of Vue makes it easy to test and easy to swap implementations.

export function createEventBus() {
  const listeners = new Set()
  return {
    emit(event) {
      for (const fn of listeners) {
        try { fn(event) } catch (e) { /* eslint-disable-line no-empty */ }
      }
    },
    on(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
