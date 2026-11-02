import path from "path";
import { describeError } from "./lib/utils.js";

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
        console.log("scan", directory);
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
