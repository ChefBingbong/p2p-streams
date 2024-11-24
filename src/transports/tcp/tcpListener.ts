import { TypedEventEmitter, TypedEventTarget, setMaxListeners } from "../../eventManager/customEventManager";

import { pipe } from "it-pipe";
import net from "net";
import { CustomProgressEvent } from "progress-events";
import { NodeEvents } from "../../node/node";
import { CLOSE_TIMEOUT, MultiaddrConnection, SOCKET_TIMEOUT, toMultiaddrConnection } from "./toSoketConnection";

enum TCPListenerStatusCode {
	INACTIVE = 0,
	ACTIVE = 1,
	PAUSED = 2,
}

interface HandshakeMessage {
	type: string;
	message: string;
}

export interface ListenerEvents {
	"connection:open": CustomEvent<any>;
	listening: CustomEvent;
	error: CustomEvent<Error>;
	close: CustomEvent;
}

type Status = { code: TCPListenerStatusCode };

export class TcpListener extends TypedEventEmitter<ListenerEvents> {
	server: net.Server;
	sockets: Set<net.Socket>;
	nodeInfo: { id: string; ip: string; port: number };

	private readonly shutDownController: AbortController;
	private status: Status = { code: TCPListenerStatusCode.INACTIVE };
	events: TypedEventTarget<NodeEvents>;

	constructor(nodeInfo: { id: string; ip: string; port: number }, events: TypedEventTarget<NodeEvents>, options: any) {
		super();
		this.nodeInfo = nodeInfo;
		this.sockets = new Set();
		this.shutDownController = new AbortController();
		this.events = events;

		setMaxListeners(Number.POSITIVE_INFINITY, this.shutDownController.signal);
		this.server = net.createServer(this.onSocket.bind(this));

		this.server.listen(nodeInfo.port);
		this.server
			.on("listening", (c) => {
				console.log("listening", c);
				this.status.code = TCPListenerStatusCode.ACTIVE;
				this.dispatchEvent(new CustomProgressEvent("listening", () => console.log("listening")));
			})
			.on("error", (err) => {
				console.log("listen err", err);
				this.safeDispatchEvent("error", { detail: err });
			})
			.on("connection", (connection) => {
				console.log("connection established from", connection.address());
				this.events.safeDispatchEvent("connection:open", { detail: connection });
			})
			.on("close", (c) => {
				console.log("connection closed", c);

				if (this.status.code !== TCPListenerStatusCode.PAUSED) {
					console.log("connection paused", c);

					this.safeDispatchEvent("close", { detail: "" });
				}
			});
	}

	private onSocket(socket: net.Socket) {
		if (this.status?.code !== TCPListenerStatusCode.ACTIVE) {
			socket.destroy();
			throw new Error("Server is not listening yet");
		}

		let maConn: MultiaddrConnection;
		try {
			maConn = toMultiaddrConnection(socket, {
				listeneningAddr: this.nodeInfo.port.toString(),
				socketInactivityTimeout: SOCKET_TIMEOUT,
				socketCloseTimeout: CLOSE_TIMEOUT,
				direction: "inbound",
			});
		} catch (err: any) {
			console.log(err);
			socket.destroy(err);
			throw err;
		}

		pipe(socket, async (source) => {
			let buffer = Buffer.alloc(0);
			for await (const chunk of source) {
				buffer = Buffer.concat([buffer, chunk]);

				const receivedMessage = JSON.parse(buffer.toString()) as HandshakeMessage;
				if (receivedMessage.type === "HAND_SHAKE") {
					console.log("Handshake message received:", receivedMessage);

					const response: HandshakeMessage = {
						type: "handshake",
						message: "Handshake successful",
					};
					socket.write(JSON.stringify(response));
					buffer = Buffer.alloc(0);
				}
			}
		}).catch((err) => {
			console.error("Error processing stream:", err);
			socket.destroy(err);
		});

		console.log("new inbound connection %s", maConn.remoteAddr);
		this.sockets.add(socket);
		this.events.safeDispatchEvent("connection:open", { detail: socket });
	}
}
