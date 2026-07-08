import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("accessible close controls", () => {
  it("provides a reusable keyboard-accessible close icon button", () => {
    const button = read("components/ui/close-button.tsx");
    expect(button).toContain("export function CloseButton");
    expect(button).toContain('label = "Close"');
    expect(button).toContain('type="button"');
    expect(button).toContain("aria-label={label}");
    expect(button).toContain('<span aria-hidden="true">×</span>');
    expect(button).toContain("focus-visible:ring-2");
    expect(button).toContain("size-9");
  });

  it("keeps the CaseInspector close icon accessible and sticky without changing case status actions", () => {
    const console = read("app/admin/admin-console.tsx");
    const caseInspector = console.slice(
      console.indexOf("function CaseInspector"),
      console.indexOf("function fmtSeconds"),
    );

    expect(caseInspector).toContain("<CloseButton onClick={onClose} />");
    expect(caseInspector).not.toContain(">Close</button>");
    expect(caseInspector).toContain("sticky top-0 z-10");
    expect(caseInspector.indexOf("sticky top-0 z-10")).toBeLessThan(
      caseInspector.indexOf('<div className="p-5">'),
    );
    expect(caseInspector).toContain("Close case");
    expect(caseInspector).toMatch(/save\(['"]closed['"]\)/);
  });

  it("keeps ResourceUsageModal close behavior while replacing the visible Close text action", () => {
    const console = read("app/admin/admin-console.tsx");
    const modal = console.slice(console.indexOf("function ResourceUsageModal"));

    expect(modal).toContain('label="Close resource usage stats"');
    expect(modal).toContain("<CloseButton");
    expect(modal).not.toContain(">Close</Link>");
    expect(modal).toContain("Open preview");
    expect(modal).toContain("sticky top-0 z-10");
    expect(modal).toContain("max-h-[calc(90vh-8rem)] overflow-y-auto");
    expect(modal).toMatch(/event\.key === ['"]Escape['"]/);
    expect(modal).toContain("onMouseDown");
    expect(modal).toContain("router.replace");
  });

  it("preserves closed status values and avoids visible exact Close dismiss buttons in app UI", () => {
    const console = read("app/admin/admin-console.tsx");
    const support = read("app/support/support-form.tsx");

    expect(console).toMatch(/['"]closed['"]/);
    expect(support).toMatch(/['"]closed['"]/);
    expect(`${console}\n${support}`).not.toMatch(/>\s*Close\s*</);
  });
});
