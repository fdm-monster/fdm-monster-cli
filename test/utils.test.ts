import { checkArch, detectServiceInstallerRequired, getServiceFolder } from "@/utils";
import { platform } from "os";

describe("CLI utils", () => {
  it("should get service folder", () => {
    expect(getServiceFolder(".", true)).toBeTruthy();
  });

  it("should check arch", () => {
    expect(checkArch()).toBe("x64");
  });

  it("should get installer type", () => {
    const result = detectServiceInstallerRequired();
    const platformFound = platform();
    expect(result.platformOs).toBe(platformFound);
    if (platformFound === "win32") {
      expect(result.serviceInstaller).toBe("node-windows");
    } else {
      expect(result.serviceInstaller).toBe("node-linux");
    }
  });
});
