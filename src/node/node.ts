import { ConnectionManager } from '../connectionManager/connectionManager';
import TcpTransport from "../transports/tcp/tcpTransport"
import {
  setMaxListeners,
  TypedEventEmitter,
} from "../eventManager/customEventManager";
import { CustomProgressEvent } from 'progress-events';

export interface NodeEvents {
  "peer:identify": CustomEvent<any>;
  "peer:connect": CustomEvent<any>;
  start: CustomEvent<any>;
  "connection:open": CustomEvent<any>
}
export class Node extends TypedEventEmitter<NodeEvents> {
  public nodeInfo: { id: string; ip: string; port: number };
  public tcp: TcpTransport;
  public connectionManager: ConnectionManager;
  public ConnectionMonitor: any;
  public events: TypedEventEmitter<NodeEvents>;

  public status: "started" | "stopped" | "starting";

  constructor(nodeInfo: { id: string; ip: string; port: number }) {
    super();
    this.nodeInfo = nodeInfo;
    this.status = "stopped";

    this.nodeInfo = nodeInfo;
    this.events = new TypedEventEmitter<NodeEvents>();
    const originalDispatch = this.events.dispatchEvent.bind(this.events);
    this.events.dispatchEvent = (evt: any) => {
      const internalResult = originalDispatch(evt);
      const externalResult = this.dispatchEvent(
        new CustomProgressEvent(evt.type, { detail: evt.detail })
      );

      return internalResult || externalResult;
    };

    // This emitter gets listened to a lot
    setMaxListeners(Infinity, this.events);

    this.tcp = new TcpTransport(nodeInfo, this.events);
    this.connectionManager = new ConnectionManager(this.events)

    // this.events.addEventListener("connection:open", () =>
    //   console.log("jjjjjj")
    // );
  }

  async start(): Promise<void> {
    if (this.status !== "stopped") {
      return;
    }

    this.status = "starting";


    try {
      this.status = "started";
        // this.events.safeDispatchEvent("start", { detail: this });
        // this.tcp.listen(this.nodeInfo)
      console.log("libp2p has started");
    } catch (err: any) {
      console.error("An error occurred starting libp2p", err);
      // set status to 'started' so this.stop() will stop any running components
      this.status = "started";
      //   await this.stop();
      throw err;
    }
  }
}
