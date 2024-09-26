import core from "@actions/core";
import fs from "fs-extra";

const REGISTRY_OPTIONS = ["npm", "github", "custom"] as const;

// check based on https://github.com/npm/cli/blob/8f8f71e4dd5ee66b3b17888faad5a7bf6c657eed/test/lib/adduser.js#L103-L105
const NPM_AUTH_RE = /^\s*\/\/registry\.npmjs\.org\/:[_-]authToken=/i;
const GITHUB_AUTH_RE = /^\s*\/\/npm.pkg.github.com\/:[_-]authToken=/i;

const userNpmrcPath = `${process.env.HOME}/.npmrc`;
const userYarnrcPath = `${process.env.HOME}/.yarnrc.yml`;

export type RegistryOptions = (typeof REGISTRY_OPTIONS)[number];

function getPackageManager(): "yarn" | "npm" {
  return fs.existsSync(userYarnrcPath) ? "yarn" : "npm";
}

/**
 * Loads the user .npmrc/.yarnrc.yml file and adds the NPM_TOKEN to it if
 * it's not already there.
 * @param registry the registry to use
 */
export async function loadNpmRc(registry: (typeof REGISTRY_OPTIONS)[number]) {
  const packageManager = getPackageManager();

  if (fs.existsSync(userNpmrcPath)) {
    core.info("Found existing user .npmrc file");
    const userNpmrcContent = await fs.readFile(userNpmrcPath, "utf8");

    if (registry && REGISTRY_OPTIONS.includes(registry as any)) {
      core.info(`Using ${registry} auth option`);
    } else if (registry) {
      core.setFailed(
        `Invalid registry option ${registry}. Allowed values are ${REGISTRY_OPTIONS.join(", ")}`,
      );
    }

    const authLine = userNpmrcContent.split("\n").find((line) => {
      switch (registry) {
        case "npm":
          return NPM_AUTH_RE.test(line);
        case "github":
          return GITHUB_AUTH_RE.test(line);
        case "custom":
          const re = core.getInput("registryAuthCheck");

          if (!re) {
            core.setFailed(
              "Custom auth option requires a custom authTokenCheck input",
            );
          }

          return new RegExp(re).test(line);
      }
    });

    if (authLine) {
      core.info(
        "Found existing auth token for the npm registry in the user .npmrc file",
      );
    } else {
      core.info(
        "Didn't find existing auth token for the npm registry in the user .npmrc file, creating one",
      );
      fs.appendFileSync(
        userNpmrcPath,
        `\n//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`,
      );
    }
  } else {
    core.info("No user .npmrc file found, creating one");
    fs.writeFileSync(
      userNpmrcPath,
      `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}\n`,
    );
  }
}
