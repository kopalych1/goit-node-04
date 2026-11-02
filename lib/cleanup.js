import { EventEmitter } from "events";
import fs from "fs/promises";
import { collectFiles } from "./utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export class Cleanup extends EventEmitter {
  async findOldFiles(directory, days) {
    this.emit("cleanup-start", { directory, days });

    const paths = await collectFiles(directory, (skipped) =>
      this.emit("warning", skipped),
    );
    const now = Date.now();
    const oldFiles = [];

    for (const filePath of paths) {
      try {
        const stats = await fs.stat(filePath);
        const daysOld = (now - stats.mtime.getTime()) / DAY_MS;

        if (daysOld > days) {
          const file = {
            path: filePath,
            size: stats.size,
            mtime: stats.mtime,
            daysOld: Math.floor(daysOld),
          };
          oldFiles.push(file);
          this.emit("file-found", file);
        }
      } catch (error) {
        this.emit("warning", { path: filePath, error });
      }
    }

    return oldFiles.sort((a, b) => b.daysOld - a.daysOld);
  }

  async deleteFiles(files) {
    const total = files.length;
    let deleted = 0;
    let freedSize = 0;
    let errors = 0;

    for (const file of files) {
      try {
        await fs.unlink(file.path);
        deleted++;
        freedSize += file.size;
        this.emit("file-deleted", {
          ...file,
          current: deleted + errors,
          total,
        });
      } catch (error) {
        errors++;
        this.emit("delete-error", {
          path: file.path,
          error,
          current: deleted + errors,
          total,
        });
      }
    }

    const result = { deleted, freedSize, errors };
    this.emit("cleanup-complete", result);
    return result;
  }
}
