import path from "path";

import { Scanner } from "./lib/scanner.js";
import { DuplicateFinder } from "./lib/duplicates.js";
import { Organizer } from "./lib/organizer.js";
import { Cleanup } from "./lib/cleanup.js";
import { formatSize, drawProgressBar, describeError } from "./lib/utils.js";

const COMMANDS = ["scan", "duplicates", "organize", "cleanup"];
const VALUE_FLAGS = new Set(["output", "older-than"]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const flags = {};

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith("--")) {
      const name = token.slice(2);
      flags[name] = VALUE_FLAGS.has(name) ? rest[++i] : true;
    } else {
      positional.push(token);
    }
  }

  return { command, positional, flags };
}

function printUsage() {
  console.log(`Usage:
  node file-organizer.js scan <directory>
  node file-organizer.js duplicates <directory>
  node file-organizer.js organize <directory> --output <target>
  node file-organizer.js cleanup <directory> --older-than <days> [--confirm]`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printScanReport(stats) {
  console.log("\n📊 Scan Results:");
  console.log("━".repeat(34));
  console.log(`Total files: ${stats.totalFiles}`);
  console.log(`Total size: ${formatSize(stats.totalSize)}`);

  console.log("\nBy File Type:");
  const types = [...stats.byType.entries()].sort(
    (a, b) => b[1].totalSize - a[1].totalSize,
  );
  const rest = types.slice(5);

  for (const [ext, { count, totalSize }] of types.slice(0, 5)) {
    console.log(
      `  ${ext.padEnd(8)} ${String(count).padStart(4)} files   ${formatSize(totalSize)}`,
    );
  }
  if (rest.length > 0) {
    const count = rest.reduce((sum, [, info]) => sum + info.count, 0);
    const size = rest.reduce((sum, [, info]) => sum + info.totalSize, 0);
    console.log(
      `  ${"(other)".padEnd(8)} ${String(count).padStart(4)} files   ${formatSize(size)}`,
    );
  }

  console.log("\nFile Age:");
  console.log(`  Last 7 days:    ${stats.age.last7} files`);
  console.log(`  Last 30 days:   ${stats.age.last30} files`);
  console.log(`  Older than 90:  ${stats.age.older90} files`);

  console.log("\nLargest files:");
  stats.largest.forEach((file, i) => {
    console.log(
      `  ${i + 1}. ${path.basename(file.path)}  ${formatSize(file.size)}`,
    );
  });

  if (stats.oldest) {
    console.log(
      `\nOldest file: ${path.basename(stats.oldest.path)} (modified ${stats.oldest.daysAgo} days ago)`,
    );
  }
}

function printDuplicatesReport({ groups, totalWasted }) {
  if (groups.length === 0) {
    console.log("\n✅ No duplicates found.");
    return;
  }

  console.log(
    `\nFound ${groups.length} duplicate groups (${formatSize(totalWasted)} wasted):`,
  );

  groups.forEach((group, i) => {
    console.log(`\n${"━".repeat(34)}`);
    console.log(
      `Group ${i + 1} (${group.paths.length} copies, ${formatSize(group.size)} each):`,
    );
    console.log(`  SHA-256: ${group.hash.slice(0, 12)}...\n`);
    for (const filePath of group.paths) {
      console.log(`  📄 ${filePath}`);
    }
    console.log(`\n  Wasted space: ${formatSize(group.wasted)}`);
  });

  console.log(`\n${"━".repeat(34)}`);
  console.log(`💾 Total wasted space: ${formatSize(totalWasted)}`);
}

async function runDuplicates(directory) {
  const finder = new DuplicateFinder();

  finder.on("search-start", ({ directory }) => {
    console.log(`🔍 Searching for duplicates in: ${directory}`);
  });

  finder.on("warning", ({ path: skippedPath, error }) => {
    console.warn(
      `\n⚠️  Skipped ${skippedPath}: ${error.code ?? error.message}`,
    );
  });

  finder.on("file-processed", ({ current, total }) => {
    if (process.stdout.isTTY) {
      process.stdout.write(
        `\rCalculating hashes... ${drawProgressBar(current, total)}`,
      );
    }
  });

  finder.on("duplicates-found", (result) => {
    if (process.stdout.isTTY) process.stdout.write("\n");
    printDuplicatesReport(result);
  });

  await finder.find(directory);
}

async function runScan(directory) {
  const scanner = new Scanner();

  scanner.on("scan-start", ({ directory }) => {
    console.log(`📂 Scanning: ${directory}`);
  });

  scanner.on("scan-warning", ({ path: skippedPath, error }) => {
    console.warn(
      `\n⚠️  Skipped ${skippedPath}: ${error.code ?? error.message}`,
    );
  });

  scanner.on("file-found", ({ current, total }) => {
    if (process.stdout.isTTY) {
      process.stdout.write(
        `\rProcessing... ${drawProgressBar(current, total)}`,
      );
    }
  });

  scanner.on("scan-complete", (stats) => {
    if (process.stdout.isTTY) process.stdout.write("\n");
    printScanReport(stats);
  });

  await scanner.scan(directory);
}

async function runOrganize(source, target) {
  const organizer = new Organizer();
  const folderName = path.basename(target);

  const showProgress = ({ current, total }) => {
    if (process.stdout.isTTY) {
      process.stdout.write(
        `\rCopying files... ${drawProgressBar(current, total)}`,
      );
    }
  };

  organizer.on("organize-start", ({ source, target }) => {
    console.log(`📦 Organizing: ${source}`);
    console.log(`Target: ${target}\n`);
  });

  organizer.on("warning", ({ path: skippedPath, error }) => {
    console.warn(`⚠️  Skipped ${skippedPath}: ${error.code ?? error.message}`);
  });

  organizer.on("folders-start", () => console.log("Creating folders..."));
  organizer.on("folder-created", ({ category }) =>
    console.log(`  ✓ ${category}/`),
  );
  organizer.on("folder-created", () => {});

  organizer.on("copy-complete", showProgress);

  organizer.on("copy-error", ({ path: failedPath, error, current, total }) => {
    console.error(`\n${describeError(error, failedPath)}`);
    showProgress({ current, total });
  });

  organizer.on(
    "organize-complete",
    ({ summary, copied, copiedSize, errors }) => {
      if (process.stdout.isTTY) process.stdout.write("\n");
      console.log("\n✅ Organization complete!\n\nSummary:");
      for (const [category, count] of Object.entries(summary)) {
        console.log(
          `  ${(category + ":").padEnd(11)} ${String(count).padStart(4)} files → ${folderName}/${category}/`,
        );
      }
      console.log(
        `\nTotal copied: ${copied} files (${formatSize(copiedSize)})`,
      );
      if (errors > 0) {
        console.log(`Failed: ${errors} files`);
        process.exitCode = 1;
      }
    },
  );

  await organizer.organize(source, target);
}

const PREVIEW_LIMIT = 10;

async function runCleanup(directory, days, confirm) {
  const cleanup = new Cleanup();

  const showProgress = ({ current, total }) => {
    if (process.stdout.isTTY) {
      process.stdout.write(`\rDeleting... ${drawProgressBar(current, total)}`);
    }
  };

  cleanup.on("cleanup-start", ({ directory, days }) => {
    console.log(`🧹 Cleanup: ${directory}`);
    console.log(`Looking for files older than ${days} days...\n`);
  });

  cleanup.on("warning", ({ path: skippedPath, error }) => {
    console.warn(`⚠️  Skipped ${skippedPath}: ${error.code ?? error.message}`);
  });

  cleanup.on("file-deleted", showProgress);

  cleanup.on("delete-error", ({ path: failedPath, error, current, total }) => {
    console.error(`\n${describeError(error, failedPath)}`);
    showProgress({ current, total });
  });

  cleanup.on("cleanup-complete", ({ deleted, freedSize, errors }) => {
    if (process.stdout.isTTY) process.stdout.write("\n");
    console.log("\n✅ Cleanup complete!");
    console.log(`Deleted: ${deleted} files (${formatSize(freedSize)} freed)`);
    if (errors > 0) {
      console.log(`Failed: ${errors} files`);
      process.exitCode = 1;
    }
  });

  const files = await cleanup.findOldFiles(directory, days);

  if (files.length === 0) {
    console.log(`No files older than ${days} days found.`);
    return;
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  console.log(`Found ${files.length} files to delete:\n`);
  console.log("━".repeat(34));
  for (const file of files.slice(0, PREVIEW_LIMIT)) {
    console.log(path.relative(directory, file.path));
    console.log(`  Size: ${formatSize(file.size)}`);
    console.log(
      `  Modified: ${file.daysOld} days ago (${file.mtime.toISOString().slice(0, 10)})\n`,
    );
  }
  if (files.length > PREVIEW_LIMIT) {
    console.log(`... (${files.length - PREVIEW_LIMIT} more files)`);
  }
  console.log("━".repeat(34));
  console.log(`\nTotal: ${files.length} files (${formatSize(totalSize)})\n`);

  if (!confirm) {
    console.log("⚠️  DRY RUN MODE: No files were deleted.");
    console.log("To actually delete these files, run with --confirm flag.");
    return;
  }

  console.log(
    `⚠️  DELETING ${files.length} files (${formatSize(totalSize)}). This action cannot be undone!\n`,
  );
  await cleanup.deleteFiles(files);
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  if (!COMMANDS.includes(command)) {
    printUsage();
    process.exit(1);
  }

  if (!positional[0])
    fail(`❌ Error: Directory path is required for "${command}"`);

  const directory = path.resolve(positional[0]);

  if (command === "organize" && !flags.output) {
    fail('❌ Error: --output <target directory> is required for "organize"');
  }

  const days = Number(flags["older-than"]);
  if (command === "cleanup" && (!Number.isFinite(days) || days < 0)) {
    fail("❌ Error: --older-than <days> must be a non-negative number");
  }

  try {
    switch (command) {
      case "scan":
        await runScan(directory);
        break;
      case "duplicates":
        await runDuplicates(directory);
        break;
      case "organize":
        await runOrganize(directory, path.resolve(flags.output));
        break;
      case "cleanup":
        await runCleanup(directory, days, Boolean(flags.confirm));
        break;
    }
  } catch (error) {
    fail(describeError(error, error.path ?? directory));
  }
}

main();
