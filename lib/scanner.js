import { EventEmitter } from "events";
import fs from "fs/promises";
import path from "path";
import { collectFiles } from "./utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function buildStatistics(files) {
  const now = Date.now();
  const byType = new Map();
  const age = { last7: 0, last30: 0, older90: 0 };
  let totalSize = 0;

  for (const file of files) {
    totalSize += file.size;

    const ext = path.extname(file.path).toLowerCase() || "(no ext)";
    const entry = byType.get(ext) ?? { count: 0, totalSize: 0 };
    entry.count++;
    entry.totalSize += file.size;
    byType.set(ext, entry);

    const daysOld = (now - file.mtime.getTime()) / DAY_MS;
    if (daysOld <= 7) age.last7++;
    if (daysOld <= 30) age.last30++;
    if (daysOld > 90) age.older90++;
  }

  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 3);

  const oldestFile = files.reduce(
    (oldest, file) => (!oldest || file.mtime < oldest.mtime ? file : oldest),
    null,
  );
  const oldest = oldestFile
    ? {
        ...oldestFile,
        daysAgo: Math.floor((now - oldestFile.mtime.getTime()) / DAY_MS),
      }
    : null;

  return { totalFiles: files.length, totalSize, byType, age, largest, oldest };
}

export class Scanner extends EventEmitter {
  async scan(directory) {
    this.emit("scan-start", { directory });

    const paths = await collectFiles(directory, (skipped) =>
      this.emit("scan-warning", skipped),
    );
    const total = paths.length;

    const files = [];
    let processed = 0;

    for (const filePath of paths) {
      processed++;
      try {
        const stats = await fs.stat(filePath);
        const file = { path: filePath, size: stats.size, mtime: stats.mtime };
        files.push(file);
        this.emit("file-found", { ...file, current: processed, total });
      } catch (error) {
        this.emit("scan-warning", { path: filePath, error });
      }
    }

    const statistics = buildStatistics(files);
    this.emit("scan-complete", statistics);
    return statistics;
  }
}
