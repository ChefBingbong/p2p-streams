import {
  setMaxListeners,
  TypedEventEmitter,
  TypedEventTarget,
} from "../eventManager/customEventManager";

interface NodeEvents {
  "peer:identify": CustomEvent<any>;
  "peer:connect": CustomEvent<any>;
  "connection:open": CustomEvent<any>;
}
export class ConnectionManager  {
  public events: TypedEventTarget<NodeEvents>
  constructor(events: TypedEventTarget<NodeEvents>) {
     this.events = events
   

    this.onConnect = this.onConnect.bind(this);
    // this.onDisconnect = this.onDisconnect.bind(this);

    this.events.addEventListener("connection:open", this.onConnect);
    //  this.events.addEventListener("connection:close", this.onDisconnect);
  }

  onConnect(evt: CustomEvent<any>): void {
    console.log(evt);
  }
}
