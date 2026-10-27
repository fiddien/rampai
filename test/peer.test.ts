// @vitest-environment jsdom
import { expect, test } from "vitest";
import { MemoryLink, encrypted } from "../src/sync/transport";
import { connect } from "../src/sync/peer";
import { generateKey } from "../src/sync/crypto";
import { device, blocks, blockStart, cursor, type } from "./helpers";

const settle = () => new Promise((r) => setTimeout(r, 30));

test("two devices sync through an encrypted link, including after time offline", async () => {
  const key = await generateKey();
  const link = new MemoryLink();
  const a = device(1);
  // Pairing hands the second device the draft as it stands, so both share
  // the same first block instead of each creating its own.
  const b = device(2, a.doc);
  const sa = connect(a.binding, encrypted(link.a, key));
  const sb = connect(b.binding, encrypted(link.b, key));
  link.whenReconnected(() => {
    sa.hello();
    sb.hello();
  });
  await settle();

  type(a, "Typed on the laptop");
  await settle();
  expect(blocks(b)).toEqual(["Typed on the laptop"]);

  link.setOnline(false);
  cursor(b, blockStart(b, 0));
  type(b, "Phone: ");
  type(a, ", offline");
  await settle();
  expect(blocks(a)).toEqual(["Typed on the laptop, offline"]);

  link.setOnline(true);
  await settle();
  expect(blocks(a)).toEqual(["Phone: Typed on the laptop, offline"]);
  expect(blocks(b)).toEqual(blocks(a));
});

test("a device with the wrong key learns nothing", async () => {
  const link = new MemoryLink();
  const a = device(1);
  const b = device(2);
  connect(a.binding, encrypted(link.a, await generateKey()));
  connect(b.binding, encrypted(link.b, await generateKey()));
  type(a, "secret");
  await settle();
  expect(blocks(b)).toEqual([""]);
});
