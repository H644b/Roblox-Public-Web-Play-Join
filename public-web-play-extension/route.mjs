const DOMAIN = "qdmux.roblox.com";

function ipv4Parts(value) {
  if (typeof value !== "string") throw new Error("Missing IPv4 address");
  const parts = value.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw new Error("Invalid IPv4 address");
  }
  return parts;
}

function ipv4Hex(parts) {
  return parts.map((part) => part.toString(16).padStart(2, "0")).join("");
}

function tokenHex(value) {
  if (typeof value !== "string") throw new Error("Missing network token");
  if (/^[0-9a-f]{32}$/i.test(value)) return value.toLowerCase();

  let binary;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Invalid network token encoding");
  }
  if (binary.length !== 16) throw new Error("Invalid network token length");
  return Array.from(binary, (character) =>
    character.charCodeAt(0).toString(16).padStart(2, "0")
  ).join("");
}

export function deriveBrowserGameFqdn(joinScript) {
  const nativeVip = ipv4Parts(joinScript?.UdmuxEndpoints?.[0]?.Address);
  if (nativeVip[3] % 2 !== 1 || nativeVip[3] === 255) {
    throw new Error("Unrecognized native UDMUX endpoint");
  }
  const browserVip = [...nativeVip];
  browserVip[3] += 1;

  const machine = ipv4Parts(joinScript.MachineAddress);
  const port = Number(joinScript.NetStackPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid network port");
  }

  return {
    hostname: `${tokenHex(joinScript.NetStackTokenValue)}-${ipv4Hex(machine)}-${port.toString(16).padStart(4, "0")}.${ipv4Hex(browserVip)}.${DOMAIN}`,
    nativeVip: nativeVip.join("."),
    browserVip: browserVip.join(".")
  };
}

export function patchJoinResponse(raw) {
  if (!raw) return { patched: false, reason: "empty response" };

  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    return { patched: false, reason: "non-JSON response" };
  }
  if (response.status !== 2) {
    return { patched: false, reason: `join status ${response.status}` };
  }

  const scriptIsString = typeof response.joinScript === "string";
  let joinScript;
  try {
    joinScript = scriptIsString ? JSON.parse(response.joinScript) : response.joinScript;
  } catch {
    return { patched: false, reason: "invalid join script" };
  }
  if (!joinScript || typeof joinScript !== "object") {
    return { patched: false, reason: "missing join script" };
  }
  if (joinScript.gameFqdn) {
    return { patched: false, reason: "browser hostname already present" };
  }

  let route;
  try {
    route = deriveBrowserGameFqdn(joinScript);
  } catch (error) {
    return { patched: false, reason: error.message };
  }
  joinScript.gameFqdn = route.hostname;
  response.joinScript = scriptIsString ? JSON.stringify(joinScript) : joinScript;
  return {
    patched: true,
    body: JSON.stringify(response),
    nativeVip: route.nativeVip,
    browserVip: route.browserVip
  };
}
