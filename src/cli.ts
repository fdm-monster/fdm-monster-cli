#!/usr/bin/env node

/**
 * Created by D. J. Zwart
 * Description: Installs the Windows, macOS or Linux Service for FDM Monster
 * v0.1-alpha
 * October 28th, 2023
 */

import { join } from "path";
import { execSync } from "child_process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as process from "process";
import { detectServiceInstallerRequired, getServiceFolder, getWorkspaceFolder, serviceExists } from "@/utils";
import { fetchPackageVersions, getInstalledVersionSafe, getTagOrLatest } from "@/workspace";
import os from "os";

const cliCmd = "fdmm";
const packageName = "@fdm-monster/server";
const cliVersion = require("../package.json").version;

yargs(hideBin(process.argv))
  .usage(`Usage: $0 install`)
  .scriptName(cliCmd)
  .demandCommand()
  .option("npm", {
    alias: "n",
    boolean: true,
    default: false,
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
      const tag = getTagOrLatest(workspaceFolder, packageName, opts.tag, !!opts.npm);
      const packageSpecifier = `${packageName}@${tag}`;
      console.log(`Installing "${packageSpecifier}". Please wait...`);
      runPackageInstall(workspaceFolder, packageSpecifier, !!opts.npm);
      console.log("Install preparation complete!");

      await installService(opts.cwd, workspaceFolder, !!opts.npm);
    }
  )
  .command(
    ["upgrade", "u", "U"],
    "upgrade (=download+update) the FDM Monster service to latest (or tag -T )",
    () => {},
    async (opts) => {
      const workspaceFolder = getWorkspaceFolder(opts.cwd);
      const upgradedTag = getTagOrLatest(workspaceFolder, packageName, opts.tag, !!opts.npm);
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
      const { serviceInstaller } = detectServiceInstallerRequired(true);
      const svc = getService(opts.cwd, getWorkspaceFolder(opts.cwd), false, !!opts.npm);
      console.log("Service exists: ", serviceExists(svc, serviceInstaller));
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
  .version("version", cliVersion) // the version string.
  .alias("version", "v")
  .wrap(yargs.terminalWidth())
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
  const { serviceInstaller } = detectServiceInstallerRequired(true);
  const { servicePath } = prepareServiceInstaller(cwd, installServiceInstallerIfMissing, useNpmInstead);
  const { Service } = require(servicePath);
  const userInfo = os.userInfo();

  // Prepare the service object
  const rootPath = join(workspace, "node_modules", packageName, "dist");

  const svc = new Service({
    name: "FDM Monster",
    description: "The 3D Printer Farm server for managing your 100+ OctoPrints printers.",
    script: join(rootPath, "index.js"),
    nodeOptions: ["--harmony", "--max_old_space_size=4096"],
    workingDirectory: workspace,
    user: userInfo.username,
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
    console.log("Service stopped. Service exists?", serviceExists(svc, serviceInstaller));
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
    const { serviceInstaller } = detectServiceInstallerRequired(true);
    const svc = getService(cwd, workspace, true, useNpmInstead);
    svc.on("error", function (error: any | void) {
      reject(error);
    });
    svc.on("install", function () {
      console.log("Service installed. Service exists?", serviceExists(svc, serviceInstaller));
      svc.start();
      console.log("Service started. Service exists?", serviceExists(svc, serviceInstaller));
      resolve(true);
    });
    if (serviceExists(svc, serviceInstaller)) {
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
    const { serviceInstaller } = detectServiceInstallerRequired(true);
    const svc = getService(cwd, workspace, true, useNpmInstead);
    if (!serviceExists(svc, serviceInstaller)) {
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
      console.log("Uninstall/remove complete. Service exists?", serviceExists(svc, serviceInstaller));
      resolve(true);
    });

    console.log(`Uninstalling/removing FDM Monster system service`);
    svc.uninstall();
  });
}

function runInstall(path: string, useNpmInstead: boolean = false) {
  // Installs package.json packages
  execSync(useNpmInstead ? "npm i" : "yarn install", {
    cwd: path,
  });
}

function runPackageInstall(path: string, packageSpecifier: string, useNpmInstead: boolean = false) {
  execSync(useNpmInstead ? `npm i ${packageSpecifier}` : `yarn add ${packageSpecifier}`, {
    cwd: path,
  });
}
