/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let ScopedProperties;
const CSON = require('season');

module.exports =
(ScopedProperties = class ScopedProperties {
  static load(scopedPropertiesPath, config, callback) {
    return CSON.readFile(scopedPropertiesPath, function(error, scopedProperties) {
      if (scopedProperties == null) { scopedProperties = {}; }
      if (error != null) {
        return callback(error);
      } else {
        return callback(null, new ScopedProperties(scopedPropertiesPath, scopedProperties, config));
      }
    });
  }

  constructor(path, scopedProperties, config) {
    this.path = path;
    this.scopedProperties = scopedProperties;
    this.config = config;
  }

  activate() {
    for (let selector in this.scopedProperties) {
      const properties = this.scopedProperties[selector];
      this.config.set(null, properties, {scopeSelector: selector, source: this.path});
    }
  }

  deactivate() {
    for (let selector in this.scopedProperties) {
      this.config.unset(null, {scopeSelector: selector, source: this.path});
    }
  }
});
