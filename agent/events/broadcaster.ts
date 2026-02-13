// Central event dispatcher for real-time broadcasting

import { EventEmitter } from "events";
import type {
  BroadcastEventName,
  BroadcastEventPayload,
  BroadcastEvents,
  Room,
} from "./events";
import { getRoomName, getEventRooms } from "./events";

type EventHandler<T extends BroadcastEventName> = (
  payload: BroadcastEvents[T],
  rooms: Room[]
) => void;

type AnyEventHandler = (
  event: BroadcastEventName,
  payload: BroadcastEvents[BroadcastEventName],
  rooms: Room[]
) => void;

interface BroadcasterOptions {
  enableLogging?: boolean;
  maxListeners?: number;
}

export class EventBroadcaster {
  private emitter: EventEmitter;
  private enableLogging: boolean;
  private anyHandlers: Set<AnyEventHandler> = new Set();

  constructor(options: BroadcasterOptions = {}) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(options.maxListeners ?? 100);
    this.enableLogging = options.enableLogging ?? false;
  }

  /**
   * Emit an event to all subscribers.
   */
  emit<T extends BroadcastEventName>(
    event: T,
    payload: BroadcastEventPayload<T>
  ): void {
    const rooms = getEventRooms(event, payload);

    if (this.enableLogging) {
      console.log(
        `[EventBroadcaster] Emitting ${event} to rooms:`,
        rooms.map(getRoomName)
      );
    }

    // Emit to specific event listeners
    this.emitter.emit(event, payload, rooms);

    // Emit to "any" handlers
    for (const handler of this.anyHandlers) {
      try {
        handler(event, payload, rooms);
      } catch (err) {
        console.error(`[EventBroadcaster] Error in any handler:`, err);
      }
    }
  }

  /**
   * Subscribe to a specific event type.
   */
  on<T extends BroadcastEventName>(
    event: T,
    handler: EventHandler<T>
  ): () => void {
    this.emitter.on(event, handler);
    return () => this.emitter.off(event, handler);
  }

  /**
   * Subscribe to a specific event type (one-time).
   */
  once<T extends BroadcastEventName>(
    event: T,
    handler: EventHandler<T>
  ): () => void {
    this.emitter.once(event, handler);
    return () => this.emitter.off(event, handler);
  }

  /**
   * Subscribe to all events.
   */
  onAny(handler: AnyEventHandler): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  /**
   * Remove a specific event listener.
   */
  off<T extends BroadcastEventName>(
    event: T,
    handler: EventHandler<T>
  ): void {
    this.emitter.off(event, handler);
  }

  /**
   * Remove all listeners for an event (or all events if none specified).
   */
  removeAllListeners(event?: BroadcastEventName): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
      this.anyHandlers.clear();
    }
  }

  /**
   * Get the number of listeners for an event.
   */
  listenerCount(event: BroadcastEventName): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * Enable or disable logging.
   */
  setLogging(enabled: boolean): void {
    this.enableLogging = enabled;
  }
}

// Singleton instance
let broadcaster: EventBroadcaster | null = null;

export function getEventBroadcaster(): EventBroadcaster {
  if (!broadcaster) {
    broadcaster = new EventBroadcaster({
      enableLogging: process.env.DEBUG_EVENTS === "true",
    });
  }
  return broadcaster;
}

export function resetEventBroadcaster(): void {
  if (broadcaster) {
    broadcaster.removeAllListeners();
    broadcaster = null;
  }
}
