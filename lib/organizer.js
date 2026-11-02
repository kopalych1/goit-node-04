import { EventEmitter } from "events";
import fs from "fs/promises";
import { createReadStream, createWriteStream, constants } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import { collectFiles } from "./utils.js";

const LARGE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const CATEGORIES = {
  Documents: [".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"],
  Images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"],
  Archives: [".zip", ".rar", ".tar", ".gz", ".7z"],
  Code: [".js", ".py", ".java", ".cpp", ".html", ".css", ".json"],
  Videos: [".mp4", ".avi", ".mkv", ".mov", ".webm"],
  Other: [],
};

export function getCategory(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [name, extensions] of Object.entries(CATEGORIES)) {
    if (extensions.includes(ext)) return name;
  }
  return "Other";
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

// file.pdf -> file(1).pdf -> file(2).pdf ...
async function getUniquePath(directory, fileName) {
  const { name, ext } = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  let counter = 1;

  while (await exists(candidate)) {
    candidate = path.join(directory, `${name}(${counter})${ext}`);
    counter++;
  }
  return candidate;
}

async function copyOne(source, destination, size) {
  try {
    if (size >= LARGE_FILE_SIZE) {
      await pipeline(
        createReadStream(source),
        createWriteStream(destination, { flags: "wx" }),
      );
    } else {
      await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
    }
  } catch (error) {
    // Не удаляем файл, если ошибка в том, что он уже существует: он не наш
    if (error.code !== "EEXIST") await fs.rm(destination, { force: true });
    throw error;
  }
}

export class Organizer extends EventEmitter {
  async organize(source, target) {
    this.emit("organize-start", { source, target });

    const allPaths = await collectFiles(source, (skipped) =>
      this.emit("warning", skipped),
    );
    // Не копируем то, что уже лежит в целевой папке (если она внутри source)
    const paths = allPaths.filter(
      (filePath) => !filePath.startsWith(target + path.sep),
    );
    const total = paths.length;

    this.emit("folders-start");
    for (const category of Object.keys(CATEGORIES)) {
      await fs.mkdir(path.join(target, category), { recursive: true });
      this.emit("folder-created", { category });
    }

    const summary = Object.fromEntries(
      Object.keys(CATEGORIES).map((name) => [name, 0]),
    );
    let copied = 0;
    let copiedSize = 0;
    let errors = 0;
    let processed = 0;

    for (const filePath of paths) {
      processed++;
      const category = getCategory(filePath);

      try {
        const { size } = await fs.stat(filePath);
        const destination = await getUniquePath(
          path.join(target, category),
          path.basename(filePath),
        );

        this.emit("copy-start", { source: filePath, destination, category });
        await copyOne(filePath, destination, size);

        summary[category]++;
        copied++;
        copiedSize += size;
        this.emit("copy-complete", {
          source: filePath,
          destination,
          category,
          current: processed,
          total,
        });
      } catch (error) {
        errors++;
        this.emit("copy-error", {
          path: filePath,
          error,
          current: processed,
          total,
        });
      }
    }

    const result = { summary, copied, copiedSize, errors, total };
    this.emit("organize-complete", result);
    return result;
  }
}
