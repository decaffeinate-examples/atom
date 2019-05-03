/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let ThemePackage;
const path = require('path');
const Package = require('./package');

module.exports =
(ThemePackage = class ThemePackage extends Package {
  getType() { return 'theme'; }

  getStyleSheetPriority() { return 1; }

  enable() {
    return this.config.unshiftAtKeyPath('core.themes', this.name);
  }

  disable() {
    return this.config.removeAtKeyPath('core.themes', this.name);
  }

  preload() {
    this.loadTime = 0;
    return this.configSchemaRegisteredOnLoad = this.registerConfigSchemaFromMetadata();
  }

  finishLoading() {
    return this.path = path.join(this.packageManager.resourcePath, this.path);
  }

  load() {
    this.loadTime = 0;
    this.configSchemaRegisteredOnLoad = this.registerConfigSchemaFromMetadata();
    return this;
  }

  activate() {
    return this.activationPromise != null ? this.activationPromise : (this.activationPromise = new Promise((resolve, reject) => {
      this.resolveActivationPromise = resolve;
      this.rejectActivationPromise = reject;
      return this.measure('activateTime', () => {
        try {
          this.loadStylesheets();
          return this.activateNow();
        } catch (error) {
          return this.handleError(`Failed to activate the ${this.name} theme`, error);
        }
      });
    }));
  }
});
