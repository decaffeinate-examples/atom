/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let CustomEventMixin;
module.exports =
(CustomEventMixin = {
  componentWillMount() {
    return this.customEventListeners = {};
  },

  componentWillUnmount() {
    for (let listeners = 0; listeners < this.customEventListeners.length; listeners++) {
      const name = this.customEventListeners[listeners];
      for (let listener of Array.from(listeners)) {
        this.getDOMNode().removeEventListener(name, listener);
      }
    }
  },

  addCustomEventListeners(customEventListeners) {
    for (let name in customEventListeners) {
      const listener = customEventListeners[name];
      if (this.customEventListeners[name] == null) { this.customEventListeners[name] = []; }
      this.customEventListeners[name].push(listener);
      this.getDOMNode().addEventListener(name, listener);
    }
  }
});
