/**
 * Narrow lifecycle fake: enough to exercise Hook.once registration without
 * attempting to model the Foundry runtime.
 */
export function createFakeFoundryHooks() {
  const registrations = new Map();
  const onceRegistrations = new Map();

  function addRegistration(store, event, callback) {
    const callbacks = store.get(event) ?? [];
    callbacks.push(callback);
    store.set(event, callbacks);
  }

  return {
    on(event, callback) {
      addRegistration(registrations, event, callback);
      return callback;
    },

    off(event, callback) {
      const callbacks = registrations.get(event) ?? [];
      registrations.set(event, callbacks.filter((registered) => registered !== callback));
    },

    once(event, callback) {
      addRegistration(onceRegistrations, event, callback);
    },

    fire(event, ...args) {
      const callbacks = registrations.get(event) ?? [];
      callbacks.forEach((callback) => callback(...args));

      const onceCallbacks = onceRegistrations.get(event) ?? [];
      onceRegistrations.delete(event);
      onceCallbacks.forEach((callback) => callback(...args));
    },

    registrationCount(event) {
      return (registrations.get(event) ?? []).length
        + (onceRegistrations.get(event) ?? []).length;
    },

    listenerCount(event) {
      return (registrations.get(event) ?? []).length;
    }
  };
}
