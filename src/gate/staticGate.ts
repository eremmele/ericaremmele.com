const STORE = "pg_seal";

type SealManifest = {
  salt: string;
  iter: number;
  verify: string;
  files: Record<string, string>;
};

let manifest: SealManifest | null = null;

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64FromBytes(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function loadManifest(): Promise<SealManifest> {
  if (manifest) return manifest;
  const res = await fetch("/sealed/manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("sealed projects unavailable");
  manifest = (await res.json()) as SealManifest;
  return manifest;
}

export async function staticGateReady(): Promise<boolean> {
  try {
    await loadManifest();
    return true;
  } catch {
    return false;
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"],
  );
}

async function verified(key: CryptoKey, packed: string): Promise<boolean> {
  const bytes = bytesFromBase64(packed);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return new TextDecoder().decode(plain) === "ok";
}

async function arm(key: CryptoKey): Promise<void> {
  const raw = await crypto.subtle.exportKey("raw", key);
  try {
    localStorage.setItem(STORE, base64FromBytes(raw));
  } catch {
    // Private mode can block storage. The key still unlocks this page.
  }
  const registration = await navigator.serviceWorker.register("/gate-sw.js");
  await navigator.serviceWorker.ready;
  const post = (): void => {
    const target = navigator.serviceWorker.controller ?? registration.active;
    target?.postMessage({ type: "key", raw });
  };
  post();
  if (navigator.serviceWorker.controller) return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 2000);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        window.clearTimeout(timer);
        post();
        resolve();
      },
      { once: true },
    );
  });
}

async function keyFromStorage(): Promise<CryptoKey | null> {
  const saved = localStorage.getItem(STORE);
  if (!saved) return null;
  return crypto.subtle.importKey("raw", bytesFromBase64(saved), "AES-GCM", true, ["decrypt"]);
}

export async function staticGateIsOpen(): Promise<boolean> {
  try {
    const key = await keyFromStorage();
    if (!key) return false;
    const seal = await loadManifest();
    if (!(await verified(key, seal.verify))) {
      localStorage.removeItem(STORE);
      return false;
    }
    await arm(key);
    return true;
  } catch {
    return false;
  }
}

export async function staticGateUnlock(password: string): Promise<boolean> {
  const seal = await loadManifest();
  const key = await deriveKey(password, bytesFromBase64(seal.salt), seal.iter);
  if (!(await verified(key, seal.verify))) return false;
  await arm(key);
  return true;
}
