/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let left;
const semver = require('semver');

const deprecatedPackages = (left = __guard__(require('../package.json'), x => x._deprecatedPackages)) != null ? left : {};
const ranges = {};

exports.getDeprecatedPackageMetadata = function(name) {
  let metadata = null;
  if (deprecatedPackages.hasOwnProperty(name)) {
    metadata = deprecatedPackages[name];
  }
  if (metadata) { Object.freeze(metadata); }
  return metadata;
};

exports.isDeprecatedPackage = function(name, version) {
  if (!deprecatedPackages.hasOwnProperty(name)) { return false; }

  const deprecatedVersionRange = deprecatedPackages[name].version;
  if (!deprecatedVersionRange) { return true; }

  return semver.valid(version) && satisfies(version, deprecatedVersionRange);
};

var satisfies = function(version, rawRange) {
  let parsedRange;
  if (!(parsedRange = ranges[rawRange])) {
    parsedRange = new Range(rawRange);
    ranges[rawRange] = parsedRange;
  }
  return parsedRange.test(version);
};

// Extend semver.Range to memoize matched versions for speed
class Range extends semver.Range {
  constructor() {
    super(...arguments);
    this.matchedVersions = new Set();
    this.unmatchedVersions = new Set();
  }

  test(version) {
    if (this.matchedVersions.has(version)) { return true; }
    if (this.unmatchedVersions.has(version)) { return false; }

    const matches = super.test(...arguments);
    if (matches) {
      this.matchedVersions.add(version);
    } else {
      this.unmatchedVersions.add(version);
    }
    return matches;
  }
}

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}