import { fetchPackageVersions, getInstalledVersionSafe, getTagOrLatest } from "@/workspace";

describe("workspace", () => {
  it("should determine tag safely", () => {
    const val = getTagOrLatest(".", "jest", undefined, false);
    expect(val).toBeTruthy();
  });

  it("should not fail on getting version on wrong path", () => {
    expect(getInstalledVersionSafe(".", "jest")).toStrictEqual({
      version: null,
      installed: false,
    });
  });

  it("should fetch versions", () => {
    expect(fetchPackageVersions(".", "jest", false).latest).toBeTruthy();
  });
});
