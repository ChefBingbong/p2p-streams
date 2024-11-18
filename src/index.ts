import { __await } from "tslib";
import { Node } from "./node/node";

export const delay = async (delayTime: number) =>
  await new Promise((resolve) => setTimeout(resolve, delayTime));

async function main() {
  const nodeId = Number(3000);
  const node = new Node({
    id: (nodeId - 3000).toString(),
    ip: "127.0.0.1",
    port: nodeId,
  });

  //   const node2 = new Node2();

  await node.start();
    const x = await node.tcp.listen(node.nodeInfo)

//   await node.tcp.dial(node.nodeInfo.port.toString(), {});
  //   const x = await node.tcp.listen(node.nodeInfo)
  //   await node2.start();

  //   Promise.all(nodes);
}

main().catch((error) => {
  console.error("Error:", error);
});
