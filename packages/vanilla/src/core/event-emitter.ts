/**
 * @file event-emitter.ts
 * Lightweight typed event emitter built on top of native EventTarget.
 */

/**
 * Type-safe subscriber callback function.
 */
export type EventListenerCallback<T> = (data: T) => void;

/**
 * Lightweight EventEmitter replacement for RxJS Subject / CustomEvent.
 */
export class EventEmitter<T = void> {
  private target = new EventTarget();
  private eventName = 'gantry-event';

  /**
   * Emit an event value to all active subscribers.
   */
  emit(value: T): void {
    this.target.dispatchEvent(new CustomEvent<T>(this.eventName, { detail: value }));
  }

  /**
   * Subscribe to emitted values. Returns an unsubscribe teardown function.
   */
  subscribe(callback: EventListenerCallback<T>): () => void {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<T>;
      callback(customEvent.detail);
    };
    this.target.addEventListener(this.eventName, handler);
    return () => this.target.removeEventListener(this.eventName, handler);
  }
}
