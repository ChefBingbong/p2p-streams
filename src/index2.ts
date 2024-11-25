import { pipe } from "it-pipe";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { Node } from "./node/node";

export const delay = async (delayTime: number) => await new Promise((resolve) => setTimeout(resolve, delayTime));

async function main() {
	const nodeId = Number(3001);
	const nodeId2 = Number(3000);

	const node = new Node({
		id: (nodeId - 3000).toString(),
		ip: "127.0.0.1",
		port: nodeId,
	});

	await node.start();
	await node.tcp.listen(node.nodeInfo);

	const stream = await node.tcp.dial(nodeId2.toString(), {});
	const serializedMessage = JSON.stringify({
		type: "HAND_SHAKE",
		message: `handaske recieved from node ${node.nodeInfo.port}`,
	});
	const messageUint8Array = uint8ArrayFromString(serializedMessage);

	await pipe([messageUint8Array], stream.stream);

	let response = "";
	for await (const chunk of stream.stream.source) {
		response += chunk.toString();
		console.log("Response:", chunk.toString());
	}

	console.log("Received response from nodeId2:", response);
}

main().catch((error) => {
	console.error("Error:", error);
});
