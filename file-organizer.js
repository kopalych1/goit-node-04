import path from "path";

import { Scanner } from "./lib/scanner.js";
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
        console.log("duplicates", directory);
        break;
      case "organize":
        console.log("organize", directory, "->", path.resolve(flags.output));
        break;
      case "cleanup":
        console.log(
          "cleanup",
          directory,
          days,
          "days",
          flags.confirm ? "(confirm)" : "(dry run)",
        );
        break;
    }
  } catch (error) {
    fail(describeError(error, directory));
  }
}

main();
