/**
 * Narrow lifecycle fake: enough to exercise Hook.once registration without
 * attempting to model the Foundry runtime.
 */
export function createFakeFoundryHooks() {
  const registrations = new Map();

  return {
    once(event, callback) {
      const callbacks = registrations.get(event) ?? [];
      callbacks.push(callback);
      registrations.set(event, callbacks);
    },

    fire(event, ...args) {
      const callbacks = registrations.get(event) ?? [];
      registrations.delete(event);
      callbacks.forEach((callback) => callback(...args));
    },

    registrationCount(event) {
      return (registrations.get(event) ?? []).length;
    }
  };
}
