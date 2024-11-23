import { Socket } from "net";
import pDefer, { DeferredPromise } from "p-defer";
import { duplex } from "stream-to-it";
import { raceEvent } from "race-event";

/**
 * A "transform" is both a sink and a source where the values it consumes
 * and the values that can be consumed from it are connected in some way.
 * It is a function that takes a source and returns a source.
 */
export interface Transform<A, B = A> {
	(source: A): B;
}

/**
 * A "sink" is something that consumes (or drains) a source. It is a
 * function that takes a source and iterates over it. It optionally returns
 * a value.
 */
export interface Sink<Source, R = unknown> {
	(source: Source): R;
}

/**
 * A "source" is something that can be consumed. It is an iterable object.
 *
 * This type is a union of both sync and async sources - it is useful to keep
 * code concise but declared types should prefer to specify whether they
 * accept sync or async sources since treating a synchronous source as an
 * asynchronous one can lead to performance degradation due to artificially
 * induced asynchronous behaviour.
 */
export type Source<T> = AsyncIterable<T> | Iterable<T>;

/**
 * A "duplex" is similar to a transform but the values it consumes are not
 * necessarily connected to the values that can be consumed from it. It is
 * an object with two properties, sink and source.
 */
export interface Duplex<TSource = unknown, TSink = TSource, RSink = unknown> {
	source: TSource;
	sink: Sink<TSink, RSink>;
}

export interface MultiaddrConnection extends Duplex<AsyncGenerator<Uint8Array | any>> {
	/**
	 * Gracefully close the connection. All queued data will be written to the
	 * underlying transport.
	 */
	close(options?: any): Promise<void>;

	/**
	 * Immediately close the connection, any queued data will be discarded
	 */
	abort(err: Error): void;

	/**
	 * The address of the remote end of the connection
	 */
	remoteAddr: string;

	/**
	 * When connection lifecycle events occurred
	 */

	timeline: {
		/**
		 * When the connection was opened
		 */
		open: number;

		/**
		 * When the MultiaddrConnection was upgraded to a Connection - the type of
		 * connection encryption and multiplexing was negotiated.
		 */
		upgraded?: number;

		/**
		 * When the connection was closed.
		 */
		close?: number;
	};
	stream: Duplex<AsyncGenerator<Uint8Array, any, any>, Source<Uint8Array>, Promise<void>>;

	/**
	 * The multiaddr connection logger
	 */
}

export const CODE_P2P = 421;
export const CODE_CIRCUIT = 290;
export const CODE_UNIX = 400;

// Time to wait for a connection to close gracefully before destroying it manually
export const CLOSE_TIMEOUT = 500;

// Close the socket if there is no activity after this long in ms
export const SOCKET_TIMEOUT = 2 * 60000; // 2 mins

export class TimeoutError extends Error {
	static name = "TimeoutError";

	constructor(message = "Timed out") {
		super(message);
		this.name = "TimeoutError";
	}
}

interface TcpConnectionOps {
	direction: "inbound" | "outbound";
	socketInactivityTimeout?: number;
	socketCloseTimeout?: number;
	listeneningAddr: string;
}
export const toMultiaddrConnection = (socket: Socket, options: TcpConnectionOps): MultiaddrConnection => {
	const direction = options.direction;
	const inactivityTimeout = options.socketInactivityTimeout ?? SOCKET_TIMEOUT;
	const closeTimeout = options.socketCloseTimeout ?? CLOSE_TIMEOUT;

	let timedout = false;
	let errored = false;
	let closePromise: DeferredPromise<void>;

	// handle socket errors
	socket.on("error", (err) => {
		errored = true;

		if (!timedout) console.error("%s socket error - %e", direction, err);

		socket.destroy();
		maConn.timeline.close = Date.now();
	});

	const stream = duplex(socket);

	// by default there is no timeout
	// https://nodejs.org/dist/latest-v16.x/docs/api/net.html#socketsettimeouttimeout-callback
	socket.setTimeout(inactivityTimeout);

	socket.once("timeout", () => {
		timedout = true;
		console.log("%s socket read timeout", direction);

		// if the socket times out due to inactivity we must manually close the connection
		// https://nodejs.org/dist/latest-v16.x/docs/api/net.html#event-timeout
		socket.destroy(new TimeoutError());
		maConn.timeline.close = Date.now();
	});

	socket.once("close", () => {
		// record metric for clean exit
		if (!timedout && !errored) console.log("%s socket close", direction);

		// In instances where `close` was not explicitly called,
		// such as an iterable stream ending, ensure we have set the close
		// timeline
		socket.destroy();
		maConn.timeline.close = Date.now();
	});

	socket.once("end", () => {
		// the remote sent a FIN packet which means no more data will be sent
		// https://nodejs.org/dist/latest-v16.x/docs/api/net.html#event-end
		console.log("%s socket end", direction);
	});

	const maConn: MultiaddrConnection = {
		async sink(source) {
			try {
				await stream.sink(
					(async function* () {
						for await (const buf of source) {
							if (buf instanceof Uint8Array) {
								yield buf;
							} else {
								yield buf.subarray();
							}
						}
					})(),
				);
			} catch (err: any) {
				// If aborted we can safely ignore
				if (err.type !== "aborted") {
					// If the source errored the socket will already have been destroyed by
					// duplex(). If the socket errored it will already be
					// destroyed. There's nothing to do here except log the error & return.
					console.error("%s error in sink - %e", direction, err);
				}
			}

			// we have finished writing, send the FIN message
			socket.end();
		},

		source: stream.source,
		stream,

		// If the remote address was passed, use it - it may have the peer ID encapsulated
		remoteAddr: options.listeneningAddr,

		timeline: { open: Date.now(), close: null },

		async close(options: any = {}) {
			if (socket.closed) {
				console.log("the %s socket is already closed", direction);
				return;
			}

			if (socket.destroyed) {
				console.log("the %s socket is already destroyed", direction);
				return;
			}

			if (closePromise != null) {
				return closePromise.promise;
			}

			try {
				closePromise = pDefer();

				// close writable end of socket
				socket.end();

				// convert EventEmitter to EventTarget
				const eventTarget = socketToEventTarget(socket);

				// don't wait forever to close
				const signal = options.signal ?? AbortSignal.timeout(closeTimeout);

				// wait for any unsent data to be sent
				if (socket.writableLength > 0) {
					console.log("%s draining socket", direction);
					await raceEvent(eventTarget, "drain", signal, {
						errorEvent: "error",
					});
					console.log("%s socket drained", direction);
				}

				await Promise.all([
					raceEvent(eventTarget, "close", signal, {
						errorEvent: "error",
					}),

					// all bytes have been sent we can destroy the socket
					socket.destroy(),
				]);
			} catch (err: any) {
				this.abort(err);
			} finally {
				closePromise.resolve();
			}
		},

		abort: (err: Error) => {
			console.log("%s socket abort due to error - %e", direction, err);

			// the abortSignalListener may already destroyed the socket with an error
			socket.destroy();

			// closing a socket is always asynchronous (must wait for "close" event)
			// but the tests expect this to be a synchronous operation so we have to
			// set the close time here. the tests should be refactored to reflect
			// reality.
			maConn.timeline.close = Date.now();
		},
	};

	return maConn;
};

function socketToEventTarget(obj?: any): EventTarget {
	const eventTarget = {
		addEventListener: (type: any, cb: any) => {
			obj.addListener(type, cb);
		},
		removeEventListener: (type: any, cb: any) => {
			obj.removeListener(type, cb);
		},
	};

	// @ts-expect-error partial implementation
	return eventTarget;
}
