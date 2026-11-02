import { EventEmitter } from "events";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import { collectFiles } from "./utils.js";

export function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export class DuplicateFinder extends EventEmitter {
  async find(directory) {
    this.emit("search-start", { directory });

    const paths = await collectFiles(directory, (skipped) =>
      this.emit("warning", skipped),
    );
    const total = paths.length;
    const byHash = new Map();

    let processed = 0;
    for (const filePath of paths) {
      processed++;
      try {
        const { size } = await fsp.stat(filePath);

        // Пустые файлы не считаем: места они не занимают, а хеш у всех одинаковый
        if (size > 0) {
          const hash = await calculateHash(filePath);
          const entry = byHash.get(hash) ?? { size, paths: [] };
          entry.paths.push(filePath);
          byHash.set(hash, entry);
        }
      } catch (error) {
        this.emit("warning", { path: filePath, error });
      }
      this.emit("file-processed", {
        path: filePath,
        current: processed,
        total,
      });
    }

    const groups = [...byHash.entries()]
      .filter(([, { paths }]) => paths.length > 1)
      .map(([hash, { size, paths }]) => ({
        hash,
        size,
        paths,
        wasted: size * (paths.length - 1),
      }))
      .sort((a, b) => b.wasted - a.wasted);

    const result = {
      groups,
      totalWasted: groups.reduce((sum, group) => sum + group.wasted, 0),
      totalFiles: total,
    };

    this.emit("duplicates-found", result);
    return result;
  }
}
