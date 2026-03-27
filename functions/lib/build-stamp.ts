export type BuildStampEnv = {
  CF_PAGES_COMMIT_SHA?: string;
  CF_PAGES_BRANCH?: string;
  CF_PAGES_URL?: string;
};

const SOURCE_VERSION = '0.0.0';
const SOURCE_BUILD_TIME = '2026-03-27T04:24:29.018Z';
const SOURCE_STAMP = 'eum-debug-20260327-042429z';

export function getBuildStamp(env: BuildStampEnv = {}): Record<string, string> {
  return {
    version: SOURCE_VERSION,
    buildTime: SOURCE_BUILD_TIME,
    sourceStamp: SOURCE_STAMP,
    commitSha: String(env.CF_PAGES_COMMIT_SHA || ''),
    branch: String(env.CF_PAGES_BRANCH || ''),
    deploymentUrl: String(env.CF_PAGES_URL || ''),
  };
}
