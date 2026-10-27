import { expect, test } from "vitest";
import { generateKey, seal, open, exportKey, importKey } from "../src/sync/crypto";

test("sealed bytes open with the same key", async () => {
  const key = await generateKey();
  const plain = new TextEncoder().encode("a first bad draft");
  const sealed = await seal(key, plain);
  expect(new TextDecoder().decode(sealed)).not.toContain("draft");
  expect(await open(key, sealed)).toEqual(plain);
});

test("a key survives export and import", async () => {
  const key = await generateKey();
  const again = await importKey(await exportKey(key));
  const plain = new Uint8Array([1, 2, 3]);
  expect(await open(again, await seal(key, plain))).toEqual(plain);
});

test("tampered bytes and wrong keys are refused", async () => {
  const key = await generateKey();
  const sealed = await seal(key, new Uint8Array([1, 2, 3]));
  const tampered = sealed.slice();
  tampered[tampered.length - 1] ^= 1;
  await expect(open(key, tampered)).rejects.toThrow();
  await expect(open(await generateKey(), sealed)).rejects.toThrow();
});
