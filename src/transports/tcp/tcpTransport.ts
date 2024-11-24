import { Server } from "http";
import { type WebSocketOptions } from "it-ws/client";
import { WebSocketServer } from "it-ws/server";

import net, { Socket } from "net";
import type { ProgressEvent, ProgressOptions } from "progress-events";
import { CustomProgressEvent } from "progress-events";
import { AbortError } from "race-signal";
import { ClientOptions } from "ws";
import { TypedEventTarget } from "../../eventManager/customEventManager";
import { NodeEvents } from "../../node/node";
import { TcpListener } from "./tcpListener";
import { CLOSE_TIMEOUT, MultiaddrConnection, SOCKET_TIMEOUT, TimeoutError, toMultiaddrConnection } from "./toSoketConnection";

export interface DialTransportOptions<DialEvents extends ProgressEvent = ProgressEvent> extends ProgressOptions<DialEvents> {
	u?: any;
}
export interface WebSocketsInit extends WebSocketOptions {
	websocket?: ClientOptions;
	server?: Server;
}

export type WebSocketsDialEvents = ProgressEvent<"websockets:open-connection">;

class TcpTransport {
	public server: WebSocketServer;
	public nodeInfo: { id: string; ip: string; port: number };
	events: TypedEventTarget<NodeEvents>;

	constructor(nodeInfo: { id: string; ip: string; port: number }, events: TypedEventTarget<NodeEvents>) {
		this.nodeInfo = nodeInfo;
		this.events = events;
		// this.listen(nodeInfo)
	}

	async listen(nodeInfo: { id: string; ip: string; port: number }) {
		return new TcpListener(nodeInfo, this.events, {});
		// await listener.
	}

	async dial(address: string, options: any) {
		options.keepAlive = options.keepAlive ?? true;
		options.noDelay = options.noDelay ?? true;

		// options.signal destroys the socket before 'connect' event
		const socket = await this._connect(address, options);

		let maConn: MultiaddrConnection;

		try {
			maConn = toMultiaddrConnection(socket, {
				listeneningAddr: address,
				socketInactivityTimeout: SOCKET_TIMEOUT,
				socketCloseTimeout: CLOSE_TIMEOUT,
				direction: "outbound",
			});
		} catch (err: any) {
			console.log(err);
			socket.destroy(err);
			throw err;
		}

		try {
			console.log("new outbound connection %s", maConn.remoteAddr);
			this.events.safeDispatchEvent("connection:open", {
				detail: maConn,
			});
			return maConn;
		} catch (err: any) {
			console.error("error upgrading outbound connection", err);
			maConn.abort(err);
			throw err;
		}
	}

	private async _connect(address: string, options: any): Promise<Socket> {
		options.signal?.throwIfAborted();
		options.onProgress?.(new CustomProgressEvent("tcp:open-connection"));

		let rawSocket: Socket;

		return new Promise<Socket>((resolve, reject) => {
			const start = Date.now();
			rawSocket = net.connect(address);

			const onError = (err: Error): void => {
				console.error("dial to %a errored - %e", address, err);
				err.message = `connection error ${address}: ${err.message}`;
				done(err);
			};

			const onTimeout = (): void => {
				console.log("connection timeout %a", address);
				const err = new TimeoutError(`Connection timeout after ${Date.now() - start}ms`);
				// Note: this will result in onError() being called
				rawSocket.emit("error", err);
			};

			const onConnect = (): void => {
				console.log("connection opened %a", address);
				done();
			};

			const onAbort = (): void => {
				console.log("connection aborted %a", address);
				done(new AbortError());
			};

			const done = (err?: Error): void => {
				rawSocket.removeListener("error", onError);
				rawSocket.removeListener("timeout", onTimeout);
				rawSocket.removeListener("connect", onConnect);

				if (options.signal != null) {
					options.signal.removeEventListener("abort", onAbort);
				}

				if (err != null) {
					reject(err);
					return;
				}

				resolve(rawSocket);
			};

			rawSocket.on("error", onError);
			rawSocket.on("timeout", onTimeout);
			rawSocket.on("connect", onConnect);

			if (options.signal != null) {
				options.signal.addEventListener("abort", onAbort);
			}
		}).catch((err) => {
			console.log(err);
			rawSocket?.destroy();
			throw err;
		});
	}
}

export default TcpTransport;
