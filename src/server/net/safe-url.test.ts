import { describe, expect, it } from "vitest";
import { automaticProviderFor } from "../prices/providers";
import { isPrivateAddress, safeFetchText, validatePublicHttpUrl } from "./safe-url";

describe("URL safety", () => {
  it("classifies internal addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "203.0.113.10", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("accepts public http(s) links and rejects internal or odd ones", () => {
    expect(validatePublicHttpUrl("https://www.digikala.com/product/dkp-1/")).toBe("https://www.digikala.com/product/dkp-1/");
    for (const bad of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "http://localhost:3000",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data",
      "http://user:pass@example.com/",
      "http://tavalod-db:5432/",
      "http://10.0.0.5/",
      "not a url",
    ]) {
      expect(() => validatePublicHttpUrl(bad), bad).toThrow();
    }
  });

  it("refuses to fetch internal targets before any connection is made", async () => {
    await expect(safeFetchText("http://127.0.0.1:5433/")).rejects.toThrow();
  });

  it("has no automatic price provider enabled", () => {
    expect(automaticProviderFor("https://torob.com/p/123/")).toBeNull();
  });
});
