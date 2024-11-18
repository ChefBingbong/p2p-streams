// import type { Multiaddr } from "@multiformats/multiaddr";
import type { DuplexWebSocket } from "it-ws/duplex";

// Convert a stream into a MultiaddrConnection
// https://github.com/libp2p/interface-transport#multiaddrconnection
export function socketToMaConn(stream: DuplexWebSocket, remoteAddr: string) {
  const maConn = {
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
          })()
        );
      } catch (err: any) {
        if (err.type !== "aborted") {
          console.error(err);
        }
      }
    },

    source: stream.source,

    remoteAddr,

    timeline: { open: Date.now(), close: null },

    async close(options: any = {}) {
      const start = Date.now();

      if (options.signal == null) {
        const signal = AbortSignal.timeout(5000);

        options = {
          ...options,
          signal,
        };
      }

      const listener = (): void => {
        // const { host, port } = maConn.remoteAddr.toOptions();
        console.log(
          "timeout closing stream to %s:%s after %dms, destroying it manually",
          //   host,
          maConn.remoteAddr,
          Date.now() - start
        );

        this.abort(new Error("Socket close timeout"));
      };

      options.signal?.addEventListener("abort", listener);

      try {
        await stream.close();
      } catch (err: any) {
        console.error("error closing WebSocket gracefully", err);
        this.abort(err);
      } finally {
        options.signal?.removeEventListener("abort", listener);
        maConn.timeline.close = Date.now();
      }
    },

    abort(err: Error): void {
      //   const { host, port } = maConn.remoteAddr.toOptions();
      console.log(
        "timeout closing stream to %s:%s due to error",
        maConn.remoteAddr,
        err
      );

      stream.destroy();
      maConn.timeline.close = Date.now();
    },
  };

  stream.socket.addEventListener(
    "close",
    () => {
      // In instances where `close` was not explicitly called,
      // such as an iterable stream ending, ensure we have set the close
      // timeline
      if (maConn.timeline.close == null) {
        maConn.timeline.close = Date.now();
      }
    },
    { once: true }
  );

  return maConn;
}
