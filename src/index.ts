import core from "@actions/core";
import fs from "fs-extra";
import * as gitUtils from "./gitUtils";
import { runPublish, runVersion } from "./run";
import readChangesetState from "./readChangesetState";
import { loadNpmRc, RegistryOptions } from "./pkgUtils";

const getOptionalInput = (name: string) => core.getInput(name) || undefined;

void (async () => {
  let githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to the changesets action");
    return;
  }

  const inputCwd = core.getInput("cwd");

  if (inputCwd) {
    core.info("changing directory to the one given as the input");
    process.chdir(inputCwd);
  }

  const setupGitUser = core.getBooleanInput("setupGitUser");

  if (setupGitUser) {
    core.info("setting git user");
    await gitUtils.setupUser();
  }

  core.info("setting GitHub credentials");

  await fs.writeFile(
    `${process.env.HOME}/.netrc`,
    `machine github.com\nlogin github-actions[bot]\npassword ${githubToken}`,
  );

  let { changesets } = await readChangesetState();

  let publishScript = core.getInput("publish");
  const registry = core.getInput("registry");
  let hasChangesets = changesets.length !== 0;

  const hasNonEmptyChangesets = changesets.some(
    (changeset) => changeset.releases.length > 0,
  );

  let hasPublishScript = !!publishScript;

  core.setOutput("published", "false");
  core.setOutput("publishedPackages", "[]");
  core.setOutput("hasChangesets", String(hasChangesets));

  switch (true) {
    case !hasChangesets && !hasPublishScript:
      core.info("No changesets found");
      return;
    case !hasChangesets && hasPublishScript: {
      core.info(
        "No changesets found, attempting to publish any unpublished packages to npm",
      );

      await loadNpmRc(registry as RegistryOptions);

      const result = await runPublish({
        script: publishScript,
        githubToken,
        createGithubReleases: core.getBooleanInput("createGithubReleases"),
      });

      if (result.published) {
        core.setOutput("published", "true");
        core.setOutput(
          "publishedPackages",
          JSON.stringify(result.publishedPackages),
        );
      }
      return;
    }

    case hasChangesets && !hasNonEmptyChangesets:
      core.info("All changesets are empty; not creating PR");
      return;
    case hasChangesets:
      const { pullRequestNumber } = await runVersion({
        script: getOptionalInput("version"),
        githubToken,
        prTitle: getOptionalInput("title"),
        commitMessage: getOptionalInput("commit"),
        hasPublishScript,
        branch: getOptionalInput("branch"),
      });

      core.setOutput("pullRequestNumber", String(pullRequestNumber));

      return;
  }
})().catch((err) => {
  core.error(err);
  core.setFailed(err.message);
});
