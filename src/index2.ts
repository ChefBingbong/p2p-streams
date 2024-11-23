import { __await } from "tslib";
import { Node } from "./node/node";
import { pipe } from "it-pipe";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";

export const delay = async (delayTime: number) => await new Promise((resolve) => setTimeout(resolve, delayTime));

async function main() {
	const nodeId = Number(3001);
	const nodeId2 = Number(3000);

	const node = new Node({
		id: (nodeId - 3000).toString(),
		ip: "127.0.0.1",
		port: nodeId,
	});

	//   const node2 = new Node2();

	await node.start();
	const x = await node.tcp.listen(node.nodeInfo);

	//   await node.tcp.dial(node.nodeInfo.port.toString(), {});
	const stream = await node.tcp.dial(nodeId2.toString(), {});

	// await delay(3000)

	const x2 = await pipe(
		["Hello", " ", "p2p", " ", "world", "!"].map((str) => uint8ArrayFromString(str)),
		stream.stream,
	);

	//  Handle the response from the server (nodeId2)
	let response = "";
	for await (const chunk of stream.stream.source) {
		response += chunk.toString();
		console.log("Response:", chunk.toString());
	}

	// const stream2 = await node.tcp.dial(nodeId2.toString(), {});

	// await delay(3000)

	// const x22 =  await pipe(
	//    ["Hello", " ", "p2p", " ", "world", "!"].map((str) =>
	//      uint8ArrayFromString(str)
	//    ),
	//    stream2.stream
	//  );

	// //  Handle the response from the server (nodeId2)
	// let response2 = "";
	// for await (const chunk of stream2.stream.source) {
	//   response += chunk.toString();
	//   console.log('Response:', chunk.toString());
	// }

	console.log("Received response from nodeId2:", response);
}

main().catch((error) => {
	console.error("Error:", error);
});
