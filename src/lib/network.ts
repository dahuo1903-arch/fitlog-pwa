import os from "node:os";

export interface LanAccessInfo {
  lanUrls: string[];
  mdnsUrl: string | null;
}

export function getLocalIPv4Addresses(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const addr of entries) {
      if (addr.family === "IPv4" && !addr.internal && addr.address) {
        ips.push(addr.address);
      }
    }
  }

  return Array.from(new Set(ips));
}

function isCloudHosted(): boolean {
  if (
    process.env.VERCEL ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.FLY_APP_NAME ||
    process.env.RENDER
  ) {
    return true;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  return Boolean(
    process.env.NODE_ENV === "production" &&
      appUrl &&
      !appUrl.includes("localhost") &&
      !appUrl.includes("127.0.0.1")
  );
}

export function getLanAccessInfo(port = Number(process.env.PORT) || 3000): LanAccessInfo {
  if (isCloudHosted()) {
    return { lanUrls: [], mdnsUrl: null };
  }

  const ips = getLocalIPv4Addresses();
  const lanUrls = ips.map((ip) => `http://${ip}:${port}`);

  const rawHost = os.hostname().trim();
  const mdnsHost = rawHost
    ? rawHost.endsWith(".local")
      ? rawHost
      : `${rawHost}.local`
    : null;

  return {
    lanUrls,
    mdnsUrl: mdnsHost ? `http://${mdnsHost}:${port}` : null,
  };
}
