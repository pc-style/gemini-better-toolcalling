import { describe, expect, it } from "bun:test";

import { getMenuWindow } from "../src/tui-menu-window";

describe("getMenuWindow", () => {
  it("shows all options when under max", () => {
    expect(getMenuWindow(6, 2, 10)).toEqual({ start: 0, end: 6 });
  });

  it("keeps selected option visible near top", () => {
    expect(getMenuWindow(25, 0, 10)).toEqual({ start: 0, end: 10 });
    expect(getMenuWindow(25, 2, 10)).toEqual({ start: 0, end: 10 });
  });

  it("keeps selected option visible in middle", () => {
    expect(getMenuWindow(25, 12, 10)).toEqual({ start: 7, end: 17 });
  });

  it("keeps selected option visible near bottom", () => {
    expect(getMenuWindow(25, 24, 10)).toEqual({ start: 15, end: 25 });
    expect(getMenuWindow(25, 22, 10)).toEqual({ start: 15, end: 25 });
  });
});
