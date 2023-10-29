/**
 * Created by D. J. Zwart
 * Description: Installs the Windows, macOS or Linux Service for FDM Monster
 * v0.1-alpha
 * October 28th, 2023
 */

import { join } from "path";
import { arch, platform } from "os";
import { execSync } from "child_process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as process from "process";
import { valid } from "semver";

const cliCmd = "fdmm";
const packageName = "@fdm-monster/server";
const cliVersion = "0.1.0-alpha";

yargs(hideBin(process.argv))
  .usage(`Usage: $0 install`)
  .scriptName(cliCmd)
  .demandCommand()
  .option("npm", {
    alias: "n",
    boolean: true,
    description: "Fall back to npm instead of yarn",
  })
  .option("cwd", {
    description: "Directory to expect CLI files (advanced use)",
    default: join(__dirname, ".."),
  })
  .option("tag", {
    alias: ["T", "t"],
    description: "When upgrading or installing, install this version of FDM Monster (release tag)",
    string: true,
  })
  .option("unstable", {
    description: "Opt in for installing unstable versions of FDM Monster",
    boolean: true,
    default: false,
  })
  .command(
    ["install", "i"],
    "install the FDM Monster service",
    () => {},
    async (opts) => {
      const workspaceFolder = getWorkspaceFolder(opts.cwd);
      const tag = getTagOrLatest(workspaceFolder);
      const packageSpecifier = `${packageName}@${tag}`;
      console.log(`Installing "${packageSpecifier}"`);
      runPackageInstall(workspaceFolder, packageSpecifier, !!opts.npm);
      console.log("Install preparation complete");

      await installService(opts.cwd, workspaceFolder, !!opts.npm);
    }
  )
  .command(
    ["upgrade", "u", "U"],
    "upgrade (=download+update) the FDM Monster service to latest (or tag -T )",
    () => {},
    async (opts) => {
      const workspaceFolder = getWorkspaceFolder(opts.cwd);
      const upgradedTag = getTagOrLatest(workspaceFolder, opts.tag, !!opts.npm);
      await upgradeInstallation(opts.cwd, workspaceFolder, packageName, upgradedTag, !!opts.npm);
      console.log("Service update complete");
    }
  )
  .command(
    ["recreate", "R"],
    "recreate the FDM Monster service (reloading code changes)",
    () => {},
    async (opts) => {
      await updateService(opts.cwd, getWorkspaceFolder(opts.cwd), !!opts.npm);
      console.log("Service update complete");
    }
  )
  .command(
    ["remove", "r"],
    "remove the FDM Monster service",
    () => {},
    async (opts) => {
      console.log(`Remove FDM Monster service.`);
      await removeService(opts.cwd, getWorkspaceFolder(opts.cwd), false, !!opts.npm);
      console.log(`Service removal complete`);
    }
  )
  .command(
    ["status", "s"],
    "Status of the FDM Monster service",
    () => {},
    (opts) => {
      const service = getService(opts.cwd, getWorkspaceFolder(opts.cwd));
      console.log("Service exists: ", service.exists);
    }
  )
  .command(
    ["check", "c"],
    "Check upgrades for FDM Monster",
    () => {},
    (opts) => {
      console.log("tag", opts.tag);
      const workspaceFolder = getWorkspaceFolder(opts.cwd);
      const { installed, version } = getInstalledVersionSafe(workspaceFolder, packageName);
      const { versions, latest } = fetchPackageVersions(workspaceFolder, packageName, !!opts.npm);
      console.log(installed, version, versions, latest);
    }
  )
  .strict()
  .help("help")
  .alias("h", "help")
  .version("version", `FDM Monster CLI:\t${cliVersion}`) // the version string.
  .alias("version", "v")
  .epilog("For more information visit https://fdm-monster.net\nCopyright 2023 D. J. Zwart - AGPLv3 License").argv;

function prepareServiceInstaller(cwd: string, installServiceInstallerIfMissing: boolean = true, useNpmInstead: boolean = false) {
  const { serviceInstaller } = detectServiceInstallerRequired(true);
  const serviceFolder = getServiceFolder(cwd, true);
  const servicePath = join(serviceFolder, "node_modules", serviceInstaller);
  try {
    let { Service: ServiceTest } = require(servicePath);
  } catch (e) {
    if (installServiceInstallerIfMissing) {
      console.log(`Installing missing service installer '${serviceInstaller}'`);
      runInstall(serviceFolder, useNpmInstead);
    } else {
      console.error(
        `FDM Monster CLI: Could not find required package ${serviceInstaller} in ${servicePath}. This should be installed.'`
      );
      process.exit(2023);
    }
  }

  return { serviceFolder, servicePath };
}

function getService(
  cwd: string,
  workspace: string,
  installServiceInstallerIfMissing: boolean = true,
  useNpmInstead: boolean = false
) {
  // Install and load the service installer
  const { servicePath } = prepareServiceInstaller(cwd, installServiceInstallerIfMissing, useNpmInstead);
  const { Service } = require(servicePath);

  // Prepare the service object
  const rootPath = join(workspace, "node_modules", packageName, "dist");
  const svc = new Service({
    name: "FDM Monster",
    description: "The 3D Printer Farm server for managing your 100+ OctoPrints printers.",
    script: join(rootPath, "index.js"),
    nodeOptions: ["--harmony", "--max_old_space_size=4096"],
    workingDirectory: workspace,
  });
  svc.on("invalidinstallation", function () {
    console.log("invalidinstallation");
  });
  svc.on("error", function () {
    console.log("error");
  });
  svc.on("alreadyinstalled", function () {
    console.log("This service is already installed.");
  });
  svc.on("invalidinstallation", function () {
    console.log("This service had an invalid installation error.");
  });
  svc.on("alreadyuninstalled ", function () {
    console.log("This service was already alreadyuninstalled ");
  });
  svc.on("stop", function () {
    console.log("Service stopped. Service exists?", svc.exists);
  });

  return svc;
}

async function upgradeInstallation(
  cwd: string,
  workspace: string,
  packageName: string,
  validSemverTag: string,
  useNpmInstead: boolean = false
) {
  await removeService(cwd, workspace, true, useNpmInstead);
  downloadUpdatedPackage(workspace, packageName, validSemverTag, useNpmInstead);
  return await installService(cwd, workspace, useNpmInstead);
}

function downloadUpdatedPackage(workspace: string, packageName: string, packageVersion: string, useNpmInstead: boolean = false) {
  const packageSpecifier = `${packageName}@${packageVersion}`;
  console.log(`Upgrade started. Downloading and installing "${packageSpecifier}"`);
  runPackageInstall(workspace, packageSpecifier, useNpmInstead);
  console.log("Download and install completed");
}

async function updateService(cwd: string, workspace: string, useNpmInstead: boolean) {
  await removeService(cwd, workspace, false, useNpmInstead);
  return await installService(cwd, workspace, useNpmInstead);
}

async function installService(cwd: string, workspace: string, useNpmInstead: boolean) {
  return new Promise((resolve, reject) => {
    const svc = getService(cwd, workspace, true, useNpmInstead);
    svc.on("error", function (error: any | void) {
      reject(error);
    });
    svc.on("install", function () {
      console.log("Service installed. Service exists?", svc.exists);
      svc.start();
      console.log("Service started. Service exists?", svc.exists);
      resolve(true);
    });
    if (svc.exists) {
      console.error("Service already exists, cant install twice. Should you maybe run the uninstall or update command instead?");
      process.exit(4);
    }
    console.log(`Installing FDM Monster system service`);
    svc.install();
  });
}

async function removeService(cwd: string, workspace: string, tolerateMissing: boolean, useNpmInstead: boolean) {
  console.log(`Removing FDM Monster service.`);
  return new Promise((resolve, reject) => {
    const svc = getService(cwd, workspace, true, useNpmInstead);
    if (!svc.exists) {
      if (tolerateMissing) {
        console.log("Service does not exist. Skipping removal step.");
        resolve(true);
      } else {
        console.error("Service does not exist, cant run uninstall/remove.");
        process.exit(5);
      }
    }
    svc.on("error", function (error: any | void) {
      reject(error);
    });
    svc.on("uninstall", function () {
      console.log("Uninstall/remove complete. Service exists?", svc.exists);
      resolve(true);
    });

    console.log(`Uninstalling/removing FDM Monster system service`);
    svc.uninstall();
  });
}

function getWorkspaceFolder(cwd: string) {
  return join(cwd, "workspace");
}

function getServiceFolder(cwd: string, silent: boolean = true) {
  const { platformOs, serviceInstaller } = detectServiceInstallerRequired(silent);
  return join(cwd, "platforms", platformOs);
}

function detectServiceInstallerRequired(silent: boolean = true) {
  if (!silent) {
    checkArch();
  }

  let serviceInstaller = "node-linux";
  const platformOs = platform();
  switch (platformOs) {
    case "darwin":
      serviceInstaller = "node-mac";
      break;
    case "win32":
      serviceInstaller = "node-windows";
      break;
    case "linux":
      serviceInstaller = "node-linux";
      break;
    default:
      console.warn(
        `The platform ${platformOs} is not supported, the service package ${serviceInstaller}. Please proceed with caution.`
      );
  }
  if (!silent) {
    console.debug(`Detected platform ${platformOs} and chose installer [${serviceInstaller}].`);
  }
  return {
    platformOs,
    serviceInstaller,
  };
}

function checkArch() {
  const architecture = arch();
  if (!["arm64", "x64"].includes(architecture)) {
    console.warn(
      `FDM Monster is installed on architecture ${architecture}. This seems unsupported and you are therefore operating at your own risk.`
    );
  }
}

function runInstall(path: string, useNpmInstead: boolean = false) {
  // Installs package.json packages
  execSync(useNpmInstead ? "yarn install" : "npm i", {
    cwd: path,
  });
}

function runPackageInstall(path: string, packageSpecifier: string, useNpmInstead: boolean = false) {
  execSync(useNpmInstead ? `npm i ${packageSpecifier}` : `yarn add ${packageSpecifier}`, {
    cwd: path,
  });
}

function getTagOrLatest(workspace: string, tag?: string, useNpmInstead: boolean = false) {
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

function getInstalledVersionSafe(path: string, packageName: string) {
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

function fetchPackageVersions(workspace: string, packageName: string, useNpmInstead: boolean = false) {
  console.log(workspace, packageName, useNpmInstead);
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
