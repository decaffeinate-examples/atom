/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
class PaneResizeHandleElement extends HTMLElement {
  createdCallback() {
    this.resizePane = this.resizePane.bind(this);
    this.resizeStopped = this.resizeStopped.bind(this);
    return this.subscribeToDOMEvents();
  }

  subscribeToDOMEvents() {
    this.addEventListener('dblclick', this.resizeToFitContent.bind(this));
    return this.addEventListener('mousedown', this.resizeStarted.bind(this));
  }

  attachedCallback() {
    this.isHorizontal = this.parentElement.classList.contains("horizontal");
    return this.classList.add(this.isHorizontal ? 'horizontal' : 'vertical');
  }

  detachedCallback() {
    return this.resizeStopped();
  }

  resizeToFitContent() {
    // clear flex-grow css style of both pane
    if (this.previousSibling != null) {
      this.previousSibling.model.setFlexScale(1);
    }
    return (this.nextSibling != null ? this.nextSibling.model.setFlexScale(1) : undefined);
  }

  resizeStarted(e) {
    e.stopPropagation();
    document.addEventListener('mousemove', this.resizePane);
    return document.addEventListener('mouseup', this.resizeStopped);
  }

  resizeStopped() {
    document.removeEventListener('mousemove', this.resizePane);
    return document.removeEventListener('mouseup', this.resizeStopped);
  }

  calcRatio(ratio1, ratio2, total) {
    const allRatio = ratio1 + ratio2;
    return [(total * ratio1) / allRatio, (total * ratio2) / allRatio];
  }

  setFlexGrow(prevSize, nextSize) {
    this.prevModel = this.previousSibling.model;
    this.nextModel = this.nextSibling.model;
    const totalScale = this.prevModel.getFlexScale() + this.nextModel.getFlexScale();
    const flexGrows = this.calcRatio(prevSize, nextSize, totalScale);
    this.prevModel.setFlexScale(flexGrows[0]);
    return this.nextModel.setFlexScale(flexGrows[1]);
  }

  fixInRange(val, minValue, maxValue) {
    return Math.min(Math.max(val, minValue), maxValue);
  }

  resizePane({clientX, clientY, which}) {
    if (which !== 1) { return this.resizeStopped(); }
    if ((this.previousSibling == null) || (this.nextSibling == null)) { return this.resizeStopped(); }

    if (this.isHorizontal) {
      const totalWidth = this.previousSibling.clientWidth + this.nextSibling.clientWidth;
      //get the left and right width after move the resize view
      let leftWidth = clientX - this.previousSibling.getBoundingClientRect().left;
      leftWidth = this.fixInRange(leftWidth, 0, totalWidth);
      const rightWidth = totalWidth - leftWidth;
      // set the flex grow by the ratio of left width and right width
      // to change pane width
      return this.setFlexGrow(leftWidth, rightWidth);
    } else {
      const totalHeight = this.previousSibling.clientHeight + this.nextSibling.clientHeight;
      let topHeight = clientY - this.previousSibling.getBoundingClientRect().top;
      topHeight = this.fixInRange(topHeight, 0, totalHeight);
      const bottomHeight = totalHeight - topHeight;
      return this.setFlexGrow(topHeight, bottomHeight);
    }
  }
}

module.exports = (PaneResizeHandleElement =
document.registerElement('atom-pane-resize-handle', {prototype: PaneResizeHandleElement.prototype}));
