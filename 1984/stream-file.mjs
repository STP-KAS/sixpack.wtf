/** Send one video with a byte range. The whole file is never loaded into memory. */

import fs from "node:fs";
import { parseByteRange } from "./stream-book.mjs";

export function pipeVideo(req, res, filePath, cors = {}) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { ...cors, "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "That film is not on this desk yet." }));
      return;
    }
    const range = parseByteRange(req.headers && req.headers.range, stat.size);
    if (range.error) {
      res.writeHead(416, { ...cors, "content-range": "bytes */" + stat.size });
      res.end();
      return;
    }
    const headers = {
      ...cors,
      "content-type": "video/mp4",
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
      "content-length": String(range.end - range.start + 1),
    };
    if (range.partial) headers["content-range"] = "bytes " + range.start + "-" + range.end + "/" + stat.size;
    res.writeHead(range.partial ? 206 : 200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
    stream.on("error", () => res.destroy());
    req.on("close", () => stream.destroy());
    stream.pipe(res);
  });
}
