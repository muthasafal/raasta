// Details people write in the chat (their name, the landlord, the bank) flow into the letter forms on their own device.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { get, makeEnv } from "./helpers";

type Pick = (text: string) => Record<string, string>;

function loadLocate() {
  const store: Record<string, string> = {};
  const listeners: Record<string, (e: unknown) => void> = {};
  const ctx = {
    window: {} as { raastaPickDetails?: Pick; raastaReadCase?: () => Record<string, string> },
    document: {
      readyState: "complete",
      cookie: "",
      addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
      querySelectorAll: () => [],
    },
    navigator: {},
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => (store[k] = v),
      removeItem: (k: string) => delete store[k],
    },
  };
  runInNewContext(readFileSync(join(__dirname, "../../web/public/js/locate.js"), "utf8"), ctx);
  const submit = (action: string, text: string) =>
    listeners.submit!({ target: { getAttribute: () => action, querySelector: () => ({ value: text }) } });
  return { pick: ctx.window.raastaPickDetails!, read: ctx.window.raastaReadCase!, store, submit };
}

describe("case details picked from what people type", () => {
  const { pick } = loadLocate();

  it("finds the person's own name, phone and email and the other party", () => {
    expect(pick("My landlord Ramesh Patil in Pune is not returning my deposit. My name is Asha Kulkarni, phone 98765 43210, email asha.k@example.com")).toEqual({
      name: "Asha Kulkarni", phone: "9876543210", email: "asha.k@example.com", owner: "Ramesh Patil", other: "Ramesh Patil",
    });
    expect(pick("I am Ravi Kumar. My employer Sunrise Textiles Pvt Ltd has not paid salary")).toMatchObject({ name: "Ravi Kumar", employer: "Sunrise Textiles Pvt Ltd" });
    expect(pick("Shri Mohan Joshi, my neighbour, is building a wall")).toMatchObject({ neighbour: "Mohan Joshi" });
    expect(pick("मेरा नाम सुनील शर्मा है")).toEqual({ name: "सुनील शर्मा" });
  });

  it("finds bank, transaction and IMEI details", () => {
    expect(pick("Rs 20000 was taken from my HDFC Bank account, UTR 412345678901")).toEqual({ bank: "HDFC Bank", txn: "412345678901" });
    expect(pick("Lost my phone, IMEI 356789012345678")).toEqual({ imei: "356789012345678" });
  });

  it("does not invent anything from plain sentences", () => {
    expect(pick("My head did not give me my stipend")).toEqual({});
    expect(pick("I am not able to get my deposit back from the landlord in Pune")).toEqual({});
    expect(pick("Landlord is not returning deposit of 30000 for 2 months")).toEqual({});
  });

  it("keeps only the picked details, never the text, and a new problem starts a fresh case", () => {
    const { read, store, submit } = loadLocate();
    submit("/r/ask", "My landlord Ramesh Patil kept my deposit");
    expect(read()).toEqual({ owner: "Ramesh Patil", other: "Ramesh Patil" });
    expect(JSON.stringify(store)).not.toContain("deposit");
    submit("/r/chat", "My name is Asha Kulkarni");
    expect(read()).toMatchObject({ owner: "Ramesh Patil", name: "Asha Kulkarni" });
    submit("/r/ask", "My phone was stolen");
    expect(read()).toEqual({});
    submit("/r/flow/x/0", "My name is Asha Kulkarni");
    expect(read()).toEqual({});
  });
});

describe("letter forms accept the picked details", () => {
  it("marks the other-party and own-detail fields and loads the filler", async () => {
    const env = makeEnv();
    const html = await (await app.fetch(get("/r/doc/deposit_notice"), env)).text();
    expect(html).toContain('data-case="owner"');
    expect(html).toContain('data-remember="name"');
    expect(html).toContain("data-case-note");
    const js = await (await app.fetch(get("/r/assets/enhance.js"), env)).text();
    expect(js).toContain("raastaReadCase");
    const label = await (await app.fetch(get("/r/label"), env)).text();
    expect(label).toContain('name="from_name" maxlength="120" required="" data-remember="name"');
  });
});
