export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function drawProgressBar(current, total, width = 20) {
  const ratio = total === 0 ? 1 : current / total;
  const filled = Math.round(ratio * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${current}/${total}`;
}

export function describeError(error, target) {
  switch (error.code) {
    case "ENOENT":
      return `❌ Error: Not found: ${target}`;
    case "EACCES":
    case "EPERM":
      return `❌ Error: Permission denied: ${target}`;
    case "ENOTDIR":
      return `❌ Error: Not a directory: ${target}`;
    case "EMFILE":
      return "❌ Error: Too many open files";
    case "ENOSPC":
      return "❌ Error: No space left on device";
    default:
      return `❌ Unexpected error: ${error.message}`;
  }
}
