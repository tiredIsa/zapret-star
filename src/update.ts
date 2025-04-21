import { join } from "https://deno.land/std@0.203.0/path/mod.ts";
import config from "./config/config.json" with { type: "json" };

const REPO = "tiredIsa/zapret-star";
const CURRENT_VERSION = config.version;

async function fetchLatestRelease(): Promise<any> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: { "User-Agent": "zapret-star-cli" },
    },
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  return await res.json();
}

export async function checkForUpdates(): Promise<boolean> {
  const latestRelease = await fetchLatestRelease();
  const latestTag: string = latestRelease.tag_name;
  const preRelease: boolean = latestRelease.prerelease;

  if (
    latestTag !== CURRENT_VERSION && !preRelease
  ) {
    return true;
  } else {
    return false;
  }
}

export async function downloadInstaller(): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${REPO}/releases/latest`;
  const relResp = await fetch(apiUrl, {
    headers: { "User-Agent": "zapret-star-cli" },
  });
  if (!relResp.ok) {
    throw new Error(
      `GitHub API error: ${relResp.status} ${relResp.statusText}`,
    );
  }
  const rel = await relResp.json();

  const asset = rel.assets.find((a: any) =>
    a.name.toLowerCase().endsWith(".exe")
  );
  if (!asset) {
    throw new Error("В релизе не найден ни один .exe‑ассет");
  }

  const tempDir = Deno.env.get("TEMP") || Deno.env.get("TMP");

  if (!tempDir) {
    throw new Error("Не удалось получить временную директорию");
  }

  const tmpDir = join(tempDir, "zapret-star-installer-temp");
  try {
    await Deno.remove(tmpDir, { recursive: true });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      // ignore
    } else {
      throw e;
    }
  }
  await Deno.mkdir(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, asset.name);

  const dlResp = await fetch(asset.browser_download_url);
  if (!dlResp.ok) {
    throw new Error(`Download error: ${dlResp.status} ${dlResp.statusText}`);
  }
  const buf = new Uint8Array(await dlResp.arrayBuffer());
  await Deno.writeFile(tmpPath, buf);

  return tmpPath;
}

export function runInstaller(installerPath: string) {
  new Deno.Command(installerPath, {
    args: [
      "/VERYSILENT",
      "/SUPPRESSMSGBOXES",
      "/NORESTART",
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
}
