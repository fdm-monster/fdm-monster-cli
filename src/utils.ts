import { join } from "path";
import { arch, platform } from "os";

export function serviceExists(service: { exists: (() => boolean) | boolean }, serviceType: string) {
  return serviceType == "node-linux" ? (service.exists as () => boolean)() : service.exists;
}

export function getWorkspaceFolder(cwd: string) {
  return join(cwd, "workspace");
}

export function getServiceFolder(cwd: string, silent: boolean = true) {
  const { platformOs, serviceInstaller } = detectServiceInstallerRequired(silent);
  return join(cwd, "platforms", platformOs);
}

export function detectServiceInstallerRequired(silent: boolean = true) {
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

export function checkArch() {
  const architecture = arch();
  if (!["arm64", "x64"].includes(architecture)) {
    console.warn(
      `FDM Monster is installed on architecture ${architecture}. This seems unsupported and you are therefore operating at your own risk.`
    );
  }

  return architecture;
}
