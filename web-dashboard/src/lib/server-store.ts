import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export async function readJsonFile<T>(filename: string, fallback: T): Promise<T> {
  try {
    const file = await readFile(dataPath(filename), "utf8");
    return JSON.parse(file) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile<T>(filename: string, value: T): Promise<void> {
  const target = dataPath(filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function dataPath(filename: string) {
  const safeName = path.basename(filename);
  return path.join(process.cwd(), "data", safeName);
}
