import { execSync } from "child_process";
import { join } from "path";
import { valid } from "semver";

export function getTagOrLatest(workspace: string, packageName: string, tag?: string, useNpmInstead: boolean = false) {
  const { versions, latest } = fetchPackageVersions(workspace, packageName, useNpmInstead);

  if (!tag) {
    if (!latest) {
      console.error("No tag version was specified, but latest version of package could not be determined. Aborting ");
      process.exit(50);
    }
    return latest;
  }

  const isValid = valid(tag);
  if (!isValid) {
    console.error(`The version tag ${tag} is not valid. Please specify a correct tag for upgrading this package`);
    process.exit(51);
  }

  if (!versions.includes(tag)) {
    console.error(
      `The version tag ${tag} was not found among available version. Please specify a correct tag for upgrading this package, or try to clean the NPM or yarn cache`
    );
    process.exit(52);
  }

  return tag;
}

export function getInstalledVersionSafe(path: string, packageName: string) {
  try {
    const packageJson = require(join(path, "node_modules", packageName, "package.json"));
    return {
      version: packageJson.version,
      installed: true,
    };
  } catch (e) {
    return {
      version: null,
      installed: false,
    };
  }
}

export function fetchPackageVersions(workspace: string, packageName: string, useNpmInstead: boolean = false) {
  const cmdString = useNpmInstead ? `npm view --json ${packageName}` : `yarn info ${packageName} --json`;
  const stdout = execSync(cmdString, {
    cwd: workspace,
  });
  const response = JSON.parse(stdout.toString());
  if (useNpmInstead) {
    return {
      versions: response.versions,
      latest: response["dist-tags"]?.latest,
    };
  } else {
    return {
      versions: response.data.versions,
      latest: response.data["dist-tags"]?.latest,
    };
  }
}
