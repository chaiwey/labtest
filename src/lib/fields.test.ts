import { describe, it, expect } from "vitest";
import { normalizeValue, parseDate } from "./fields";

const TODAY = new Date(2026, 5, 30); // 2026-06-30

describe("parseDate", () => {
  it("spoken month + day → ISO (current year)", () => {
    expect(parseDate("June 3rd", TODAY)).toBe("2026-06-03");
    expect(parseDate("June 3", TODAY)).toBe("2026-06-03");
    expect(parseDate("3 June", TODAY)).toBe("2026-06-03");
    expect(parseDate("Jun 3 2024", TODAY)).toBe("2024-06-03");
  });
  it("numeric and ISO forms", () => {
    expect(parseDate("6/3", TODAY)).toBe("2026-06-03");
    expect(parseDate("6/3/2024", TODAY)).toBe("2024-06-03");
    expect(parseDate("2024-06-03", TODAY)).toBe("2024-06-03");
  });
  it("relative", () => {
    expect(parseDate("today", TODAY)).toBe("2026-06-30");
    expect(parseDate("tomorrow", TODAY)).toBe("2026-07-01");
  });
  it("unrecognized → null", () => {
    expect(parseDate("sometime soon", TODAY)).toBeNull();
  });
});

describe("normalizeValue", () => {
  it("date standardizes, else keeps raw", () => {
    expect(normalizeValue("date", "June 3rd")).toBe(parseDate("June 3rd"));
    expect(normalizeValue("date", "whenever")).toBe("whenever");
  });
  it("number extracts the value", () => {
    expect(normalizeValue("number", "12.5 mg")).toBe("12.5");
    expect(normalizeValue("number", "$1,200")).toBe("1200");
  });
  it("percent appends %", () => {
    expect(normalizeValue("percent", "50")).toBe("50%");
    expect(normalizeValue("percent", "50 percent")).toBe("50%");
    expect(normalizeValue("percent", "fifty")).toBe("fifty");
  });
  it("text passthrough (trimmed)", () => {
    expect(normalizeValue("text", "  control  ")).toBe("control");
  });
});
