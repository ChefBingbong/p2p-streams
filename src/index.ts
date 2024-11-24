import { Node } from "./node/node";

export const delay = async (delayTime: number) => await new Promise((resolve) => setTimeout(resolve, delayTime));

async function main() {
	const nodeId = Number(3000);
	const node = new Node({
		id: (nodeId - 3000).toString(),
		ip: "127.0.0.1",
		port: nodeId,
	});

	await node.start();
	await node.tcp.listen(node.nodeInfo);
}

main().catch((error) => {
	console.error("Error:", error);
});
