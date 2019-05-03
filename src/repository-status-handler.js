/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const Git = require('git-utils');
const path = require('path');

module.exports = function(repoPath, paths) {
  if (paths == null) { paths = []; }
  const repo = Git.open(repoPath);

  let upstream = {};
  const statuses = {};
  const submodules = {};
  let branch = null;

  if (repo != null) {
    // Statuses in main repo
    let filePath, status;
    let workingDirectoryPath = repo.getWorkingDirectory();
    const repoStatus = (paths.length > 0 ? repo.getStatusForPaths(paths) : repo.getStatus());
    for (filePath in repoStatus) {
      status = repoStatus[filePath];
      statuses[filePath] = status;
    }

    // Statuses in submodules
    for (let submodulePath in repo.submodules) {
      const submoduleRepo = repo.submodules[submodulePath];
      submodules[submodulePath] = {
        branch: submoduleRepo.getHead(),
        upstream: submoduleRepo.getAheadBehindCount()
      };

      workingDirectoryPath = submoduleRepo.getWorkingDirectory();
      const object = submoduleRepo.getStatus();
      for (filePath in object) {
        status = object[filePath];
        const absolutePath = path.join(workingDirectoryPath, filePath);
        // Make path relative to parent repository
        const relativePath = repo.relativize(absolutePath);
        statuses[relativePath] = status;
      }
    }

    upstream = repo.getAheadBehindCount();
    branch = repo.getHead();
    repo.release();
  }

  return {statuses, upstream, branch, submodules};
};
