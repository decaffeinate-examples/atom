/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let TextBuffer, TextEditor;
const _ = require('underscore-plus');
const path = require('path');
const fs = require('fs-plus');
const Grim = require('grim');
const {CompositeDisposable, Disposable, Emitter} = require('event-kit');
const {Point, Range} = (TextBuffer = require('text-buffer'));
const LanguageMode = require('./language-mode');
const DecorationManager = require('./decoration-manager');
const TokenizedBuffer = require('./tokenized-buffer');
const Cursor = require('./cursor');
const Model = require('./model');
const Selection = require('./selection');
const TextMateScopeSelector = require('first-mate').ScopeSelector;
const GutterContainer = require('./gutter-container');
let TextEditorComponent = null;
let TextEditorElement = null;
const {isDoubleWidthCharacter, isHalfWidthCharacter, isKoreanCharacter, isWrapBoundary} = require('./text-utils');

const ZERO_WIDTH_NBSP = '\ufeff';
const MAX_SCREEN_LINE_LENGTH = 500;

// Essential: This class represents all essential editing state for a single
// {TextBuffer}, including cursor and selection positions, folds, and soft wraps.
// If you're manipulating the state of an editor, use this class.
//
// A single {TextBuffer} can belong to multiple editors. For example, if the
// same file is open in two different panes, Atom creates a separate editor for
// each pane. If the buffer is manipulated the changes are reflected in both
// editors, but each maintains its own cursor position, folded lines, etc.
//
// ## Accessing TextEditor Instances
//
// The easiest way to get hold of `TextEditor` objects is by registering a callback
// with `::observeTextEditors` on the `atom.workspace` global. Your callback will
// then be called with all current editor instances and also when any editor is
// created in the future.
//
// ```coffee
// atom.workspace.observeTextEditors (editor) ->
//   editor.insertText('Hello World')
// ```
//
// ## Buffer vs. Screen Coordinates
//
// Because editors support folds and soft-wrapping, the lines on screen don't
// always match the lines in the buffer. For example, a long line that soft wraps
// twice renders as three lines on screen, but only represents one line in the
// buffer. Similarly, if rows 5-10 are folded, then row 6 on screen corresponds
// to row 11 in the buffer.
//
// Your choice of coordinates systems will depend on what you're trying to
// achieve. For example, if you're writing a command that jumps the cursor up or
// down by 10 lines, you'll want to use screen coordinates because the user
// probably wants to skip lines *on screen*. However, if you're writing a package
// that jumps between method definitions, you'll want to work in buffer
// coordinates.
//
// **When in doubt, just default to buffer coordinates**, then experiment with
// soft wraps and folds to ensure your code interacts with them correctly.
module.exports =
(TextEditor = (function() {
  TextEditor = class TextEditor extends Model {
    static initClass() {
  
      this.prototype.serializationVersion = 1;
  
      this.prototype.buffer = null;
      this.prototype.languageMode = null;
      this.prototype.cursors = null;
      this.prototype.showCursorOnSelection = null;
      this.prototype.selections = null;
      this.prototype.suppressSelectionMerging = false;
      this.prototype.selectionFlashDuration = 500;
      this.prototype.gutterContainer = null;
      this.prototype.editorElement = null;
      this.prototype.verticalScrollMargin = 2;
      this.prototype.horizontalScrollMargin = 6;
      this.prototype.softWrapped = null;
      this.prototype.editorWidthInChars = null;
      this.prototype.lineHeightInPixels = null;
      this.prototype.defaultCharWidth = null;
      this.prototype.height = null;
      this.prototype.width = null;
      this.prototype.registered = false;
      this.prototype.atomicSoftTabs = true;
      this.prototype.invisibles = null;
  
      Object.defineProperty(this.prototype, "element",
        {get() { return this.getElement(); }});
  
      Object.defineProperty(this.prototype, "editorElement", {
        get() {
          Grim.deprecate(`\
\`TextEditor.prototype.editorElement\` has always been private, but now
it is gone. Reading the \`editorElement\` property still returns a
reference to the editor element but this field will be removed in a
later version of Atom, so we recommend using the \`element\` property instead.\
`);
  
          return this.getElement();
        }
      }
      );
  
      Object.defineProperty(this.prototype, 'displayBuffer', { get() {
        Grim.deprecate(`\
\`TextEditor.prototype.displayBuffer\` has always been private, but now
it is gone. Reading the \`displayBuffer\` property now returns a reference
to the containing \`TextEditor\`, which now provides *some* of the API of
the defunct \`DisplayBuffer\` class.\
`);
        return this;
      }
    }
      );
  
      Object.defineProperty(this.prototype, 'rowsPerPage', {
        get() { return this.getRowsPerPage(); }
      });
    }
    static setClipboard(clipboard) {
      return this.clipboard = clipboard;
    }

    static setScheduler(scheduler) {
      if (TextEditorComponent == null) { TextEditorComponent = require('./text-editor-component'); }
      return TextEditorComponent.setScheduler(scheduler);
    }

    static didUpdateStyles() {
      if (TextEditorComponent == null) { TextEditorComponent = require('./text-editor-component'); }
      return TextEditorComponent.didUpdateStyles();
    }

    static didUpdateScrollbarStyles() {
      if (TextEditorComponent == null) { TextEditorComponent = require('./text-editor-component'); }
      return TextEditorComponent.didUpdateScrollbarStyles();
    }

    static viewForItem(item) { return item.element != null ? item.element : item; }

    static deserialize(state, atomEnvironment) {
      // TODO: Return null on version mismatch when 1.8.0 has been out for a while
      if ((state.version !== this.prototype.serializationVersion) && (state.displayBuffer != null)) {
        state.tokenizedBuffer = state.displayBuffer.tokenizedBuffer;
      }

      try {
        state.tokenizedBuffer = TokenizedBuffer.deserialize(state.tokenizedBuffer, atomEnvironment);
        state.tabLength = state.tokenizedBuffer.getTabLength();
      } catch (error) {
        if (error.syscall === 'read') {
          return; // Error reading the file, don't deserialize an editor for it
        } else {
          throw error;
        }
      }

      state.buffer = state.tokenizedBuffer.buffer;
      state.assert = atomEnvironment.assert.bind(atomEnvironment);
      const editor = new (this)(state);
      if (state.registered) {
        const disposable = atomEnvironment.textEditors.add(editor);
        editor.onDidDestroy(() => disposable.dispose());
      }
      return editor;
    }

    constructor(params) {
      let grammar, initialColumn, initialLine, lineNumberGutterVisible, suppressCursorCreation, tabLength;
      {
        // Hack: trick Babel/TypeScript into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { return this; }).toString();
        let thisName = thisFn.match(/return (?:_assertThisInitialized\()*(\w+)\)*;/)[1];
        eval(`${thisName} = this;`);
      }
      this.doBackgroundWork = this.doBackgroundWork.bind(this);
      if (params == null) { params = {}; }
      if (this.constructor.clipboard == null) {
        throw new Error("Must call TextEditor.setClipboard at least once before creating TextEditor instances");
      }

      super(...arguments);

      ({
        softTabs: this.softTabs, initialScrollTopRow: this.initialScrollTopRow, initialScrollLeftColumn: this.initialScrollLeftColumn, initialLine, initialColumn, tabLength,
        softWrapped: this.softWrapped, decorationManager: this.decorationManager, selectionsMarkerLayer: this.selectionsMarkerLayer, buffer: this.buffer, suppressCursorCreation,
        mini: this.mini, placeholderText: this.placeholderText, lineNumberGutterVisible, showLineNumbers: this.showLineNumbers, largeFileMode: this.largeFileMode,
        assert: this.assert, grammar, showInvisibles: this.showInvisibles, autoHeight: this.autoHeight, autoWidth: this.autoWidth, scrollPastEnd: this.scrollPastEnd, scrollSensitivity: this.scrollSensitivity, editorWidthInChars: this.editorWidthInChars,
        tokenizedBuffer: this.tokenizedBuffer, displayLayer: this.displayLayer, invisibles: this.invisibles, showIndentGuide: this.showIndentGuide,
        softWrapped: this.softWrapped, softWrapAtPreferredLineLength: this.softWrapAtPreferredLineLength, preferredLineLength: this.preferredLineLength,
        showCursorOnSelection: this.showCursorOnSelection
      } = params);

      if (this.assert == null) { this.assert = condition => condition; }
      this.emitter = new Emitter;
      this.disposables = new CompositeDisposable;
      this.cursors = [];
      this.cursorsByMarkerId = new Map;
      this.selections = [];
      this.hasTerminatedPendingState = false;

      if (this.mini == null) { this.mini = false; }
      if (this.scrollPastEnd == null) { this.scrollPastEnd = false; }
      if (this.scrollSensitivity == null) { this.scrollSensitivity = 40; }
      if (this.showInvisibles == null) { this.showInvisibles = true; }
      if (this.softTabs == null) { this.softTabs = true; }
      if (tabLength == null) { tabLength = 2; }
      if (this.autoIndent == null) { this.autoIndent = true; }
      if (this.autoIndentOnPaste == null) { this.autoIndentOnPaste = true; }
      if (this.showCursorOnSelection == null) { this.showCursorOnSelection = true; }
      if (this.undoGroupingInterval == null) { this.undoGroupingInterval = 300; }
      if (this.nonWordCharacters == null) { this.nonWordCharacters = "/\\()\"':,.;<>~!@#$%^&*|+=[]{}`?-…"; }
      if (this.softWrapped == null) { this.softWrapped = false; }
      if (this.softWrapAtPreferredLineLength == null) { this.softWrapAtPreferredLineLength = false; }
      if (this.preferredLineLength == null) { this.preferredLineLength = 80; }
      if (this.showLineNumbers == null) { this.showLineNumbers = true; }

      if (this.buffer == null) { this.buffer = new TextBuffer({
        shouldDestroyOnFileDelete() { return atom.config.get('core.closeDeletedFileTabs'); }
      }); }
      if (this.tokenizedBuffer == null) { this.tokenizedBuffer = new TokenizedBuffer({
        grammar, tabLength, buffer: this.buffer, largeFileMode: this.largeFileMode, assert: this.assert
      }); }

      if (this.displayLayer == null) {
        const displayLayerParams = {
          invisibles: this.getInvisibles(),
          softWrapColumn: this.getSoftWrapColumn(),
          showIndentGuides: this.doesShowIndentGuide(),
          atomicSoftTabs: params.atomicSoftTabs != null ? params.atomicSoftTabs : true,
          tabLength,
          ratioForCharacter: this.ratioForCharacter.bind(this),
          isWrapBoundary,
          foldCharacter: ZERO_WIDTH_NBSP,
          softWrapHangingIndent: params.softWrapHangingIndentLength != null ? params.softWrapHangingIndentLength : 0
        };

        if (this.displayLayer = this.buffer.getDisplayLayer(params.displayLayerId)) {
          this.displayLayer.reset(displayLayerParams);
          this.selectionsMarkerLayer = this.displayLayer.getMarkerLayer(params.selectionsMarkerLayerId);
        } else {
          this.displayLayer = this.buffer.addDisplayLayer(displayLayerParams);
        }
      }

      this.backgroundWorkHandle = requestIdleCallback(this.doBackgroundWork);
      this.disposables.add(new Disposable(() => {
        if (this.backgroundWorkHandle != null) { return cancelIdleCallback(this.backgroundWorkHandle); }
      })
      );

      this.displayLayer.setTextDecorationLayer(this.tokenizedBuffer);
      this.defaultMarkerLayer = this.displayLayer.addMarkerLayer();
      this.disposables.add(this.defaultMarkerLayer.onDidDestroy(() => {
        return this.assert(false, "defaultMarkerLayer destroyed at an unexpected time");
      }));
      if (this.selectionsMarkerLayer == null) { this.selectionsMarkerLayer = this.addMarkerLayer({maintainHistory: true, persistent: true}); }
      this.selectionsMarkerLayer.trackDestructionInOnDidCreateMarkerCallbacks = true;

      this.decorationManager = new DecorationManager(this);
      this.decorateMarkerLayer(this.selectionsMarkerLayer, {type: 'cursor'});
      if (!this.isMini()) { this.decorateCursorLine(); }

      this.decorateMarkerLayer(this.displayLayer.foldsMarkerLayer, {type: 'line-number', class: 'folded'});

      for (let marker of Array.from(this.selectionsMarkerLayer.getMarkers())) {
        this.addSelection(marker);
      }

      this.subscribeToBuffer();
      this.subscribeToDisplayLayer();

      if ((this.cursors.length === 0) && !suppressCursorCreation) {
        initialLine = Math.max(parseInt(initialLine) || 0, 0);
        initialColumn = Math.max(parseInt(initialColumn) || 0, 0);
        this.addCursorAtBufferPosition([initialLine, initialColumn]);
      }

      this.languageMode = new LanguageMode(this);

      this.gutterContainer = new GutterContainer(this);
      this.lineNumberGutter = this.gutterContainer.addGutter({
        name: 'line-number',
        priority: 0,
        visible: lineNumberGutterVisible
      });
    }

    decorateCursorLine() {
      return this.cursorLineDecorations = [
        this.decorateMarkerLayer(this.selectionsMarkerLayer, {type: 'line', class: 'cursor-line', onlyEmpty: true}),
        this.decorateMarkerLayer(this.selectionsMarkerLayer, {type: 'line-number', class: 'cursor-line'}),
        this.decorateMarkerLayer(this.selectionsMarkerLayer, {type: 'line-number', class: 'cursor-line-no-selection', onlyHead: true, onlyEmpty: true})
      ];
    }

    doBackgroundWork(deadline) {
      const previousLongestRow = this.getApproximateLongestScreenRow();
      if (this.displayLayer.doBackgroundWork(deadline)) {
        this.backgroundWorkHandle = requestIdleCallback(this.doBackgroundWork);
      } else {
        this.backgroundWorkHandle = null;
      }

      if (this.getApproximateLongestScreenRow() !== previousLongestRow) {
        return (this.component != null ? this.component.scheduleUpdate() : undefined);
      }
    }

    update(params) {
      const displayLayerParams = {};

      for (let param of Array.from(Object.keys(params))) {
        const value = params[param];

        switch (param) {
          case 'autoIndent':
            this.autoIndent = value;
            break;

          case 'autoIndentOnPaste':
            this.autoIndentOnPaste = value;
            break;

          case 'undoGroupingInterval':
            this.undoGroupingInterval = value;
            break;

          case 'nonWordCharacters':
            this.nonWordCharacters = value;
            break;

          case 'scrollSensitivity':
            this.scrollSensitivity = value;
            break;

          case 'encoding':
            this.buffer.setEncoding(value);
            break;

          case 'softTabs':
            if (value !== this.softTabs) {
              this.softTabs = value;
            }
            break;

          case 'atomicSoftTabs':
            if (value !== this.displayLayer.atomicSoftTabs) {
              displayLayerParams.atomicSoftTabs = value;
            }
            break;

          case 'tabLength':
            if ((value != null) && (value !== this.tokenizedBuffer.getTabLength())) {
              this.tokenizedBuffer.setTabLength(value);
              displayLayerParams.tabLength = value;
            }
            break;

          case 'softWrapped':
            if (value !== this.softWrapped) {
              this.softWrapped = value;
              displayLayerParams.softWrapColumn = this.getSoftWrapColumn();
              this.emitter.emit('did-change-soft-wrapped', this.isSoftWrapped());
            }
            break;

          case 'softWrapHangingIndentLength':
            if (value !== this.displayLayer.softWrapHangingIndent) {
              displayLayerParams.softWrapHangingIndent = value;
            }
            break;

          case 'softWrapAtPreferredLineLength':
            if (value !== this.softWrapAtPreferredLineLength) {
              this.softWrapAtPreferredLineLength = value;
              displayLayerParams.softWrapColumn = this.getSoftWrapColumn();
            }
            break;

          case 'preferredLineLength':
            if (value !== this.preferredLineLength) {
              this.preferredLineLength = value;
              displayLayerParams.softWrapColumn = this.getSoftWrapColumn();
            }
            break;

          case 'mini':
            if (value !== this.mini) {
              this.mini = value;
              this.emitter.emit('did-change-mini', value);
              displayLayerParams.invisibles = this.getInvisibles();
              displayLayerParams.softWrapColumn = this.getSoftWrapColumn();
              displayLayerParams.showIndentGuides = this.doesShowIndentGuide();
              if (this.mini) {
                for (let decoration of Array.from(this.cursorLineDecorations)) { decoration.destroy(); }
                this.cursorLineDecorations = null;
              } else {
                this.decorateCursorLine();
              }
              if (this.component != null) {
                this.component.scheduleUpdate();
              }
            }
            break;

          case 'placeholderText':
            if (value !== this.placeholderText) {
              this.placeholderText = value;
              this.emitter.emit('did-change-placeholder-text', value);
            }
            break;

          case 'lineNumberGutterVisible':
            if (value !== this.lineNumberGutterVisible) {
              if (value) {
                this.lineNumberGutter.show();
              } else {
                this.lineNumberGutter.hide();
              }
              this.emitter.emit('did-change-line-number-gutter-visible', this.lineNumberGutter.isVisible());
            }
            break;

          case 'showIndentGuide':
            if (value !== this.showIndentGuide) {
              this.showIndentGuide = value;
              displayLayerParams.showIndentGuides = this.doesShowIndentGuide();
            }
            break;

          case 'showLineNumbers':
            if (value !== this.showLineNumbers) {
              this.showLineNumbers = value;
              if (this.component != null) {
                this.component.scheduleUpdate();
              }
            }
            break;

          case 'showInvisibles':
            if (value !== this.showInvisibles) {
              this.showInvisibles = value;
              displayLayerParams.invisibles = this.getInvisibles();
            }
            break;

          case 'invisibles':
            if (!_.isEqual(value, this.invisibles)) {
              this.invisibles = value;
              displayLayerParams.invisibles = this.getInvisibles();
            }
            break;

          case 'editorWidthInChars':
            if ((value > 0) && (value !== this.editorWidthInChars)) {
              this.editorWidthInChars = value;
              displayLayerParams.softWrapColumn = this.getSoftWrapColumn();
            }
            break;

          case 'width':
            if (value !== this.width) {
              this.width = value;
              displayLayerParams.softWrapColumn = this.getSoftWrapColumn();
            }
            break;

          case 'scrollPastEnd':
            if (value !== this.scrollPastEnd) {
              this.scrollPastEnd = value;
              if (this.component != null) {
                this.component.scheduleUpdate();
              }
            }
            break;

          case 'autoHeight':
            if (value !== this.autoHeight) {
              this.autoHeight = value;
            }
            break;

          case 'autoWidth':
            if (value !== this.autoWidth) {
              this.autoWidth = value;
            }
            break;

          case 'showCursorOnSelection':
            if (value !== this.showCursorOnSelection) {
              this.showCursorOnSelection = value;
              if (this.component != null) {
                this.component.scheduleUpdate();
              }
            }
            break;

          default:
            if ((param !== 'ref') && (param !== 'key')) {
              throw new TypeError(`Invalid TextEditor parameter: '${param}'`);
            }
        }
      }

      this.displayLayer.reset(displayLayerParams);

      if (this.component != null) {
        return this.component.getNextUpdatePromise();
      } else {
        return Promise.resolve();
      }
    }

    scheduleComponentUpdate() {
      return (this.component != null ? this.component.scheduleUpdate() : undefined);
    }

    serialize() {
      const tokenizedBufferState = this.tokenizedBuffer.serialize();

      return {
        deserializer: 'TextEditor',
        version: this.serializationVersion,

        // TODO: Remove this forward-compatible fallback once 1.8 reaches stable.
        displayBuffer: {tokenizedBuffer: tokenizedBufferState},

        tokenizedBuffer: tokenizedBufferState,
        displayLayerId: this.displayLayer.id,
        selectionsMarkerLayerId: this.selectionsMarkerLayer.id,

        initialScrollTopRow: this.getScrollTopRow(),
        initialScrollLeftColumn: this.getScrollLeftColumn(),

        atomicSoftTabs: this.displayLayer.atomicSoftTabs,
        softWrapHangingIndentLength: this.displayLayer.softWrapHangingIndent,

        id: this.id, softTabs: this.softTabs, softWrapped: this.softWrapped, softWrapAtPreferredLineLength: this.softWrapAtPreferredLineLength,
        preferredLineLength: this.preferredLineLength, mini: this.mini, editorWidthInChars: this.editorWidthInChars, width: this.width, largeFileMode: this.largeFileMode,
        registered: this.registered, invisibles: this.invisibles, showInvisibles: this.showInvisibles, showIndentGuide: this.showIndentGuide, autoHeight: this.autoHeight, autoWidth: this.autoWidth
      };
    }

    subscribeToBuffer() {
      this.buffer.retain();
      this.disposables.add(this.buffer.onDidChangePath(() => {
        this.emitter.emit('did-change-title', this.getTitle());
        return this.emitter.emit('did-change-path', this.getPath());
      })
      );
      this.disposables.add(this.buffer.onDidChangeEncoding(() => {
        return this.emitter.emit('did-change-encoding', this.getEncoding());
      })
      );
      this.disposables.add(this.buffer.onDidDestroy(() => this.destroy()));
      return this.disposables.add(this.buffer.onDidChangeModified(() => {
        if (!this.hasTerminatedPendingState && this.buffer.isModified()) { return this.terminatePendingState(); }
      })
      );
    }

    terminatePendingState() {
      if (!this.hasTerminatedPendingState) { this.emitter.emit('did-terminate-pending-state'); }
      return this.hasTerminatedPendingState = true;
    }

    onDidTerminatePendingState(callback) {
      return this.emitter.on('did-terminate-pending-state', callback);
    }

    subscribeToDisplayLayer() {
      this.disposables.add(this.tokenizedBuffer.onDidChangeGrammar(this.handleGrammarChange.bind(this)));
      this.disposables.add(this.displayLayer.onDidChangeSync(e => {
        this.mergeIntersectingSelections();
        if (this.component != null) {
          this.component.didChangeDisplayLayer(e);
        }
        return this.emitter.emit('did-change', e);
      })
      );
      this.disposables.add(this.displayLayer.onDidReset(() => {
        this.mergeIntersectingSelections();
        if (this.component != null) {
          this.component.didResetDisplayLayer();
        }
        return this.emitter.emit('did-change', {});
    }));
      this.disposables.add(this.selectionsMarkerLayer.onDidCreateMarker(this.addSelection.bind(this)));
      return this.disposables.add(this.selectionsMarkerLayer.onDidUpdate(() => (this.component != null ? this.component.didUpdateSelections() : undefined)));
    }

    destroyed() {
      this.disposables.dispose();
      this.displayLayer.destroy();
      this.tokenizedBuffer.destroy();
      for (let selection of Array.from(this.selections.slice())) { selection.destroy(); }
      this.buffer.release();
      this.languageMode.destroy();
      this.gutterContainer.destroy();
      this.emitter.emit('did-destroy');
      this.emitter.clear();
      if (this.component != null) {
        this.component.element.component = null;
      }
      this.component = null;
      return this.lineNumberGutter.element = null;
    }

    /*
    Section: Event Subscription
    */

    // Essential: Calls your `callback` when the buffer's title has changed.
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangeTitle(callback) {
      return this.emitter.on('did-change-title', callback);
    }

    // Essential: Calls your `callback` when the buffer's path, and therefore title, has changed.
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangePath(callback) {
      return this.emitter.on('did-change-path', callback);
    }

    // Essential: Invoke the given callback synchronously when the content of the
    // buffer changes.
    //
    // Because observers are invoked synchronously, it's important not to perform
    // any expensive operations via this method. Consider {::onDidStopChanging} to
    // delay expensive operations until after changes stop occurring.
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChange(callback) {
      return this.emitter.on('did-change', callback);
    }

    // Essential: Invoke `callback` when the buffer's contents change. It is
    // emit asynchronously 300ms after the last buffer change. This is a good place
    // to handle changes to the buffer without compromising typing performance.
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidStopChanging(callback) {
      return this.getBuffer().onDidStopChanging(callback);
    }

    // Essential: Calls your `callback` when a {Cursor} is moved. If there are
    // multiple cursors, your callback will be called for each cursor.
    //
    // * `callback` {Function}
    //   * `event` {Object}
    //     * `oldBufferPosition` {Point}
    //     * `oldScreenPosition` {Point}
    //     * `newBufferPosition` {Point}
    //     * `newScreenPosition` {Point}
    //     * `textChanged` {Boolean}
    //     * `cursor` {Cursor} that triggered the event
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangeCursorPosition(callback) {
      return this.emitter.on('did-change-cursor-position', callback);
    }

    // Essential: Calls your `callback` when a selection's screen range changes.
    //
    // * `callback` {Function}
    //   * `event` {Object}
    //     * `oldBufferRange` {Range}
    //     * `oldScreenRange` {Range}
    //     * `newBufferRange` {Range}
    //     * `newScreenRange` {Range}
    //     * `selection` {Selection} that triggered the event
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangeSelectionRange(callback) {
      return this.emitter.on('did-change-selection-range', callback);
    }

    // Extended: Calls your `callback` when soft wrap was enabled or disabled.
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangeSoftWrapped(callback) {
      return this.emitter.on('did-change-soft-wrapped', callback);
    }

    // Extended: Calls your `callback` when the buffer's encoding has changed.
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangeEncoding(callback) {
      return this.emitter.on('did-change-encoding', callback);
    }

    // Extended: Calls your `callback` when the grammar that interprets and
    // colorizes the text has been changed. Immediately calls your callback with
    // the current grammar.
    //
    // * `callback` {Function}
    //   * `grammar` {Grammar}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    observeGrammar(callback) {
      callback(this.getGrammar());
      return this.onDidChangeGrammar(callback);
    }

    // Extended: Calls your `callback` when the grammar that interprets and
    // colorizes the text has been changed.
    //
    // * `callback` {Function}
    //   * `grammar` {Grammar}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangeGrammar(callback) {
      return this.emitter.on('did-change-grammar', callback);
    }

    // Extended: Calls your `callback` when the result of {::isModified} changes.
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangeModified(callback) {
      return this.getBuffer().onDidChangeModified(callback);
    }

    // Extended: Calls your `callback` when the buffer's underlying file changes on
    // disk at a moment when the result of {::isModified} is true.
    //
    // * `callback` {Function}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidConflict(callback) {
      return this.getBuffer().onDidConflict(callback);
    }

    // Extended: Calls your `callback` before text has been inserted.
    //
    // * `callback` {Function}
    //   * `event` event {Object}
    //     * `text` {String} text to be inserted
    //     * `cancel` {Function} Call to prevent the text from being inserted
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onWillInsertText(callback) {
      return this.emitter.on('will-insert-text', callback);
    }

    // Extended: Calls your `callback` after text has been inserted.
    //
    // * `callback` {Function}
    //   * `event` event {Object}
    //     * `text` {String} text to be inserted
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidInsertText(callback) {
      return this.emitter.on('did-insert-text', callback);
    }

    // Essential: Invoke the given callback after the buffer is saved to disk.
    //
    // * `callback` {Function} to be called after the buffer is saved.
    //   * `event` {Object} with the following keys:
    //     * `path` The path to which the buffer was saved.
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidSave(callback) {
      return this.getBuffer().onDidSave(callback);
    }

    // Essential: Invoke the given callback when the editor is destroyed.
    //
    // * `callback` {Function} to be called when the editor is destroyed.
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidDestroy(callback) {
      return this.emitter.once('did-destroy', callback);
    }

    // Extended: Calls your `callback` when a {Cursor} is added to the editor.
    // Immediately calls your callback for each existing cursor.
    //
    // * `callback` {Function}
    //   * `cursor` {Cursor} that was added
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    observeCursors(callback) {
      for (let cursor of Array.from(this.getCursors())) { callback(cursor); }
      return this.onDidAddCursor(callback);
    }

    // Extended: Calls your `callback` when a {Cursor} is added to the editor.
    //
    // * `callback` {Function}
    //   * `cursor` {Cursor} that was added
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidAddCursor(callback) {
      return this.emitter.on('did-add-cursor', callback);
    }

    // Extended: Calls your `callback` when a {Cursor} is removed from the editor.
    //
    // * `callback` {Function}
    //   * `cursor` {Cursor} that was removed
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidRemoveCursor(callback) {
      return this.emitter.on('did-remove-cursor', callback);
    }

    // Extended: Calls your `callback` when a {Selection} is added to the editor.
    // Immediately calls your callback for each existing selection.
    //
    // * `callback` {Function}
    //   * `selection` {Selection} that was added
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    observeSelections(callback) {
      for (let selection of Array.from(this.getSelections())) { callback(selection); }
      return this.onDidAddSelection(callback);
    }

    // Extended: Calls your `callback` when a {Selection} is added to the editor.
    //
    // * `callback` {Function}
    //   * `selection` {Selection} that was added
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidAddSelection(callback) {
      return this.emitter.on('did-add-selection', callback);
    }

    // Extended: Calls your `callback` when a {Selection} is removed from the editor.
    //
    // * `callback` {Function}
    //   * `selection` {Selection} that was removed
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidRemoveSelection(callback) {
      return this.emitter.on('did-remove-selection', callback);
    }

    // Extended: Calls your `callback` with each {Decoration} added to the editor.
    // Calls your `callback` immediately for any existing decorations.
    //
    // * `callback` {Function}
    //   * `decoration` {Decoration}
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    observeDecorations(callback) {
      return this.decorationManager.observeDecorations(callback);
    }

    // Extended: Calls your `callback` when a {Decoration} is added to the editor.
    //
    // * `callback` {Function}
    //   * `decoration` {Decoration} that was added
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidAddDecoration(callback) {
      return this.decorationManager.onDidAddDecoration(callback);
    }

    // Extended: Calls your `callback` when a {Decoration} is removed from the editor.
    //
    // * `callback` {Function}
    //   * `decoration` {Decoration} that was removed
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidRemoveDecoration(callback) {
      return this.decorationManager.onDidRemoveDecoration(callback);
    }

    // Called by DecorationManager when a decoration is added.
    didAddDecoration(decoration) {
      if (decoration.isType('block')) {
        return (this.component != null ? this.component.addBlockDecoration(decoration) : undefined);
      }
    }

    // Extended: Calls your `callback` when the placeholder text is changed.
    //
    // * `callback` {Function}
    //   * `placeholderText` {String} new text
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidChangePlaceholderText(callback) {
      return this.emitter.on('did-change-placeholder-text', callback);
    }

    onDidChangeScrollTop(callback) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::onDidChangeScrollTop instead.");

      return this.getElement().onDidChangeScrollTop(callback);
    }

    onDidChangeScrollLeft(callback) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::onDidChangeScrollLeft instead.");

      return this.getElement().onDidChangeScrollLeft(callback);
    }

    onDidRequestAutoscroll(callback) {
      return this.emitter.on('did-request-autoscroll', callback);
    }

    // TODO Remove once the tabs package no longer uses .on subscriptions
    onDidChangeIcon(callback) {
      return this.emitter.on('did-change-icon', callback);
    }

    onDidUpdateDecorations(callback) {
      return this.decorationManager.onDidUpdateDecorations(callback);
    }

    // Essential: Retrieves the current {TextBuffer}.
    getBuffer() { return this.buffer; }

    // Retrieves the current buffer's URI.
    getURI() { return this.buffer.getUri(); }

    // Create an {TextEditor} with its initial state based on this object
    copy() {
      const displayLayer = this.displayLayer.copy();
      const selectionsMarkerLayer = displayLayer.getMarkerLayer(this.buffer.getMarkerLayer(this.selectionsMarkerLayer.id).copy().id);
      const softTabs = this.getSoftTabs();
      return new TextEditor({
        buffer: this.buffer, selectionsMarkerLayer, softTabs,
        suppressCursorCreation: true,
        tabLength: this.tokenizedBuffer.getTabLength(),
        initialScrollTopRow: this.getScrollTopRow(),
        initialScrollLeftColumn: this.getScrollLeftColumn(),
        assert: this.assert, displayLayer, grammar: this.getGrammar(),
        autoWidth: this.autoWidth, autoHeight: this.autoHeight, showCursorOnSelection: this.showCursorOnSelection
      });
    }

    // Controls visibility based on the given {Boolean}.
    setVisible(visible) { return this.tokenizedBuffer.setVisible(visible); }

    setMini(mini) {
      this.update({mini});
      return this.mini;
    }

    isMini() { return this.mini; }

    onDidChangeMini(callback) {
      return this.emitter.on('did-change-mini', callback);
    }

    setLineNumberGutterVisible(lineNumberGutterVisible) { return this.update({lineNumberGutterVisible}); }

    isLineNumberGutterVisible() { return this.lineNumberGutter.isVisible(); }

    onDidChangeLineNumberGutterVisible(callback) {
      return this.emitter.on('did-change-line-number-gutter-visible', callback);
    }

    // Essential: Calls your `callback` when a {Gutter} is added to the editor.
    // Immediately calls your callback for each existing gutter.
    //
    // * `callback` {Function}
    //   * `gutter` {Gutter} that currently exists/was added.
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    observeGutters(callback) {
      return this.gutterContainer.observeGutters(callback);
    }

    // Essential: Calls your `callback` when a {Gutter} is added to the editor.
    //
    // * `callback` {Function}
    //   * `gutter` {Gutter} that was added.
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidAddGutter(callback) {
      return this.gutterContainer.onDidAddGutter(callback);
    }

    // Essential: Calls your `callback` when a {Gutter} is removed from the editor.
    //
    // * `callback` {Function}
    //   * `name` The name of the {Gutter} that was removed.
    //
    // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
    onDidRemoveGutter(callback) {
      return this.gutterContainer.onDidRemoveGutter(callback);
    }

    // Set the number of characters that can be displayed horizontally in the
    // editor.
    //
    // * `editorWidthInChars` A {Number} representing the width of the
    // {TextEditorElement} in characters.
    setEditorWidthInChars(editorWidthInChars) { return this.update({editorWidthInChars}); }

    // Returns the editor width in characters.
    getEditorWidthInChars() {
      if ((this.width != null) && (this.defaultCharWidth > 0)) {
        return Math.max(0, Math.floor(this.width / this.defaultCharWidth));
      } else {
        return this.editorWidthInChars;
      }
    }

    /*
    Section: File Details
    */

    // Essential: Get the editor's title for display in other parts of the
    // UI such as the tabs.
    //
    // If the editor's buffer is saved, its title is the file name. If it is
    // unsaved, its title is "untitled".
    //
    // Returns a {String}.
    getTitle() {
      let left;
      return (left = this.getFileName()) != null ? left : 'untitled';
    }

    // Essential: Get unique title for display in other parts of the UI, such as
    // the window title.
    //
    // If the editor's buffer is unsaved, its title is "untitled"
    // If the editor's buffer is saved, its unique title is formatted as one
    // of the following,
    // * "<filename>" when it is the only editing buffer with this file name.
    // * "<filename> — <unique-dir-prefix>" when other buffers have this file name.
    //
    // Returns a {String}
    getLongTitle() {
      if (this.getPath()) {
        let pathSegments;
        const fileName = this.getFileName();

        const allPathSegments = [];
        for (let textEditor of Array.from(atom.workspace.getTextEditors())) {
          if (textEditor !== this) {
            if (textEditor.getFileName() === fileName) {
              const directoryPath = fs.tildify(textEditor.getDirectoryPath());
              allPathSegments.push(directoryPath.split(path.sep));
            }
          }
        }

        if (allPathSegments.length === 0) {
          return fileName;
        }

        const ourPathSegments = fs.tildify(this.getDirectoryPath()).split(path.sep);
        allPathSegments.push(ourPathSegments);

        while (true) {
          var firstSegment = ourPathSegments[0];

          const commonBase = _.all(allPathSegments, pathSegments => (pathSegments.length > 1) && (pathSegments[0] === firstSegment));
          if (commonBase) {
            for (pathSegments of Array.from(allPathSegments)) { pathSegments.shift(); }
          } else {
            break;
          }
        }

        return `${fileName} \u2014 ${path.join(...Array.from(pathSegments || []))}`;
      } else {
        return 'untitled';
      }
    }

    // Essential: Returns the {String} path of this editor's text buffer.
    getPath() { return this.buffer.getPath(); }

    getFileName() {
      let fullPath;
      if ((fullPath = this.getPath())) {
        return path.basename(fullPath);
      } else {
        return null;
      }
    }

    getDirectoryPath() {
      let fullPath;
      if ((fullPath = this.getPath())) {
        return path.dirname(fullPath);
      } else {
        return null;
      }
    }

    // Extended: Returns the {String} character set encoding of this editor's text
    // buffer.
    getEncoding() { return this.buffer.getEncoding(); }

    // Extended: Set the character set encoding to use in this editor's text
    // buffer.
    //
    // * `encoding` The {String} character set encoding name such as 'utf8'
    setEncoding(encoding) { return this.buffer.setEncoding(encoding); }

    // Essential: Returns {Boolean} `true` if this editor has been modified.
    isModified() { return this.buffer.isModified(); }

    // Essential: Returns {Boolean} `true` if this editor has no content.
    isEmpty() { return this.buffer.isEmpty(); }

    /*
    Section: File Operations
    */

    // Essential: Saves the editor's text buffer.
    //
    // See {TextBuffer::save} for more details.
    save() { return this.buffer.save(); }

    // Essential: Saves the editor's text buffer as the given path.
    //
    // See {TextBuffer::saveAs} for more details.
    //
    // * `filePath` A {String} path.
    saveAs(filePath) { return this.buffer.saveAs(filePath); }

    // Determine whether the user should be prompted to save before closing
    // this editor.
    shouldPromptToSave(param) {
      if (param == null) { param = {}; }
      const {windowCloseRequested, projectHasPaths} = param;
      if (windowCloseRequested && projectHasPaths && atom.stateStore.isConnected()) {
        return false;
      } else {
        return this.isModified() && !this.buffer.hasMultipleEditors();
      }
    }

    // Returns an {Object} to configure dialog shown when this editor is saved
    // via {Pane::saveItemAs}.
    getSaveDialogOptions() { return {}; }

    /*
    Section: Reading Text
    */

    // Essential: Returns a {String} representing the entire contents of the editor.
    getText() { return this.buffer.getText(); }

    // Essential: Get the text in the given {Range} in buffer coordinates.
    //
    // * `range` A {Range} or range-compatible {Array}.
    //
    // Returns a {String}.
    getTextInBufferRange(range) {
      return this.buffer.getTextInRange(range);
    }

    // Essential: Returns a {Number} representing the number of lines in the buffer.
    getLineCount() { return this.buffer.getLineCount(); }

    // Essential: Returns a {Number} representing the number of screen lines in the
    // editor. This accounts for folds.
    getScreenLineCount() { return this.displayLayer.getScreenLineCount(); }

    getApproximateScreenLineCount() { return this.displayLayer.getApproximateScreenLineCount(); }

    // Essential: Returns a {Number} representing the last zero-indexed buffer row
    // number of the editor.
    getLastBufferRow() { return this.buffer.getLastRow(); }

    // Essential: Returns a {Number} representing the last zero-indexed screen row
    // number of the editor.
    getLastScreenRow() { return this.getScreenLineCount() - 1; }

    // Essential: Returns a {String} representing the contents of the line at the
    // given buffer row.
    //
    // * `bufferRow` A {Number} representing a zero-indexed buffer row.
    lineTextForBufferRow(bufferRow) { return this.buffer.lineForRow(bufferRow); }

    // Essential: Returns a {String} representing the contents of the line at the
    // given screen row.
    //
    // * `screenRow` A {Number} representing a zero-indexed screen row.
    lineTextForScreenRow(screenRow) {
      return __guard__(this.screenLineForScreenRow(screenRow), x => x.lineText);
    }

    logScreenLines(start, end) {
      if (start == null) { start = 0; }
      if (end == null) { end = this.getLastScreenRow(); }
      for (let row = start, end1 = end, asc = start <= end1; asc ? row <= end1 : row >= end1; asc ? row++ : row--) {
        const line = this.lineTextForScreenRow(row);
        console.log(row, this.bufferRowForScreenRow(row), line, line.length);
      }
    }

    tokensForScreenRow(screenRow) {
      const tokens = [];
      let lineTextIndex = 0;
      const currentTokenScopes = [];
      const {lineText, tags} = this.screenLineForScreenRow(screenRow);
      for (let tag of Array.from(tags)) {
        if (this.displayLayer.isOpenTag(tag)) {
          currentTokenScopes.push(this.displayLayer.classNameForTag(tag));
        } else if (this.displayLayer.isCloseTag(tag)) {
          currentTokenScopes.pop();
        } else {
          tokens.push({
            text: lineText.substr(lineTextIndex, tag),
            scopes: currentTokenScopes.slice()
          });
          lineTextIndex += tag;
        }
      }
      return tokens;
    }

    screenLineForScreenRow(screenRow) {
      return this.displayLayer.getScreenLine(screenRow);
    }

    bufferRowForScreenRow(screenRow) {
      return this.displayLayer.translateScreenPosition(Point(screenRow, 0)).row;
    }

    bufferRowsForScreenRows(startScreenRow, endScreenRow) {
      return this.displayLayer.bufferRowsForScreenRows(startScreenRow, endScreenRow + 1);
    }

    screenRowForBufferRow(row) {
      return this.displayLayer.translateBufferPosition(Point(row, 0)).row;
    }

    getRightmostScreenPosition() { return this.displayLayer.getRightmostScreenPosition(); }

    getApproximateRightmostScreenPosition() { return this.displayLayer.getApproximateRightmostScreenPosition(); }

    getMaxScreenLineLength() { return this.getRightmostScreenPosition().column; }

    getLongestScreenRow() { return this.getRightmostScreenPosition().row; }

    getApproximateLongestScreenRow() { return this.getApproximateRightmostScreenPosition().row; }

    lineLengthForScreenRow(screenRow) { return this.displayLayer.lineLengthForScreenRow(screenRow); }

    // Returns the range for the given buffer row.
    //
    // * `row` A row {Number}.
    // * `options` (optional) An options hash with an `includeNewline` key.
    //
    // Returns a {Range}.
    bufferRangeForBufferRow(row, param) { if (param == null) { param = {}; } const {includeNewline} = param; return this.buffer.rangeForRow(row, includeNewline); }

    // Get the text in the given {Range}.
    //
    // Returns a {String}.
    getTextInRange(range) { return this.buffer.getTextInRange(range); }

    // {Delegates to: TextBuffer.isRowBlank}
    isBufferRowBlank(bufferRow) { return this.buffer.isRowBlank(bufferRow); }

    // {Delegates to: TextBuffer.nextNonBlankRow}
    nextNonBlankBufferRow(bufferRow) { return this.buffer.nextNonBlankRow(bufferRow); }

    // {Delegates to: TextBuffer.getEndPosition}
    getEofBufferPosition() { return this.buffer.getEndPosition(); }

    // Essential: Get the {Range} of the paragraph surrounding the most recently added
    // cursor.
    //
    // Returns a {Range}.
    getCurrentParagraphBufferRange() {
      return this.getLastCursor().getCurrentParagraphBufferRange();
    }


    /*
    Section: Mutating Text
    */

    // Essential: Replaces the entire contents of the buffer with the given {String}.
    //
    // * `text` A {String} to replace with
    setText(text) { return this.buffer.setText(text); }

    // Essential: Set the text in the given {Range} in buffer coordinates.
    //
    // * `range` A {Range} or range-compatible {Array}.
    // * `text` A {String}
    // * `options` (optional) {Object}
    //   * `normalizeLineEndings` (optional) {Boolean} (default: true)
    //   * `undo` (optional) {String} 'skip' will skip the undo system
    //
    // Returns the {Range} of the newly-inserted text.
    setTextInBufferRange(range, text, options) { return this.getBuffer().setTextInRange(range, text, options); }

    // Essential: For each selection, replace the selected text with the given text.
    //
    // * `text` A {String} representing the text to insert.
    // * `options` (optional) See {Selection::insertText}.
    //
    // Returns a {Range} when the text has been inserted
    // Returns a {Boolean} false when the text has not been inserted
    insertText(text, options) {
      if (options == null) { options = {}; }
      if (!this.emitWillInsertTextEvent(text)) { return false; }

      const groupingInterval = options.groupUndo ?
        this.undoGroupingInterval
      :
        0;

      if (options.autoIndentNewline == null) { options.autoIndentNewline = this.shouldAutoIndent(); }
      if (options.autoDecreaseIndent == null) { options.autoDecreaseIndent = this.shouldAutoIndent(); }
      return this.mutateSelectedText(
        selection => {
          const range = selection.insertText(text, options);
          const didInsertEvent = {text, range};
          this.emitter.emit('did-insert-text', didInsertEvent);
          return range;
        }
        , groupingInterval
      );
    }

    // Essential: For each selection, replace the selected text with a newline.
    insertNewline(options) {
      return this.insertText('\n', options);
    }

    // Essential: For each selection, if the selection is empty, delete the character
    // following the cursor. Otherwise delete the selected text.
    delete() {
      return this.mutateSelectedText(selection => selection.delete());
    }

    // Essential: For each selection, if the selection is empty, delete the character
    // preceding the cursor. Otherwise delete the selected text.
    backspace() {
      return this.mutateSelectedText(selection => selection.backspace());
    }

    // Extended: Mutate the text of all the selections in a single transaction.
    //
    // All the changes made inside the given {Function} can be reverted with a
    // single call to {::undo}.
    //
    // * `fn` A {Function} that will be called once for each {Selection}. The first
    //      argument will be a {Selection} and the second argument will be the
    //      {Number} index of that selection.
    mutateSelectedText(fn, groupingInterval) {
      if (groupingInterval == null) { groupingInterval = 0; }
      return this.mergeIntersectingSelections(() => {
        return this.transact(groupingInterval, () => {
          return Array.from(this.getSelectionsOrderedByBufferPosition()).map((selection, index) => fn(selection, index));
        });
      });
    }

    // Move lines intersecting the most recent selection or multiple selections
    // up by one row in screen coordinates.
    moveLineUp() {
      const selections = this.getSelectedBufferRanges().sort((a, b) => a.compare(b));

      if (selections[0].start.row === 0) {
        return;
      }

      if ((selections[selections.length - 1].start.row === this.getLastBufferRow()) && (this.buffer.getLastLine() === '')) {
        return;
      }

      return this.transact(() => {
        const newSelectionRanges = [];

        while (selections.length > 0) {
          // Find selections spanning a contiguous set of lines
          let selection = selections.shift();
          const selectionsToMove = [selection];

          while (selection.end.row === (selections[0] != null ? selections[0].start.row : undefined)) {
            selectionsToMove.push(selections[0]);
            selection.end.row = selections[0].end.row;
            selections.shift();
          }

          // Compute the buffer range spanned by all these selections, expanding it
          // so that it includes any folded region that intersects them.
          let startRow = selection.start.row;
          let endRow = selection.end.row;
          if ((selection.end.row > selection.start.row) && (selection.end.column === 0)) {
            // Don't move the last line of a multi-line selection if the selection ends at column 0
            endRow--;
          }

          startRow = this.displayLayer.findBoundaryPrecedingBufferRow(startRow);
          endRow = this.displayLayer.findBoundaryFollowingBufferRow(endRow + 1);
          const linesRange = new Range(Point(startRow, 0), Point(endRow, 0));

          // If selected line range is preceded by a fold, one line above on screen
          // could be multiple lines in the buffer.
          const precedingRow = this.displayLayer.findBoundaryPrecedingBufferRow(startRow - 1);
          var insertDelta = linesRange.start.row - precedingRow;

          // Any folds in the text that is moved will need to be re-created.
          // It includes the folds that were intersecting with the selection.
          const rangesToRefold = this.displayLayer
            .destroyFoldsIntersectingBufferRange(linesRange)
            .map(range => range.translate([-insertDelta, 0]));

          // Delete lines spanned by selection and insert them on the preceding buffer row
          let lines = this.buffer.getTextInRange(linesRange);
          if (lines[lines.length - 1] !== '\n') { lines += this.buffer.lineEndingForRow(linesRange.end.row - 2); }
          this.buffer.delete(linesRange);
          this.buffer.insert([precedingRow, 0], lines);

          // Restore folds that existed before the lines were moved
          for (let rangeToRefold of Array.from(rangesToRefold)) {
            this.displayLayer.foldBufferRange(rangeToRefold);
          }

          for (selection of Array.from(selectionsToMove)) {
            newSelectionRanges.push(selection.translate([-insertDelta, 0]));
          }
        }

        this.setSelectedBufferRanges(newSelectionRanges, {autoscroll: false, preserveFolds: true});
        if (this.shouldAutoIndent()) { this.autoIndentSelectedRows(); }
        return this.scrollToBufferPosition([newSelectionRanges[0].start.row, 0]);
      });
    }

    // Move lines intersecting the most recent selection or muiltiple selections
    // down by one row in screen coordinates.
    moveLineDown() {
      let selections = this.getSelectedBufferRanges();
      selections.sort((a, b) => a.compare(b));
      selections = selections.reverse();

      return this.transact(() => {
        this.consolidateSelections();
        const newSelectionRanges = [];

        while (selections.length > 0) {
          // Find selections spanning a contiguous set of lines
          let selection = selections.shift();
          const selectionsToMove = [selection];

          // if the current selection start row matches the next selections' end row - make them one selection
          while (selection.start.row === (selections[0] != null ? selections[0].end.row : undefined)) {
            selectionsToMove.push(selections[0]);
            selection.start.row = selections[0].start.row;
            selections.shift();
          }

          // Compute the buffer range spanned by all these selections, expanding it
          // so that it includes any folded region that intersects them.
          let startRow = selection.start.row;
          let endRow = selection.end.row;
          if ((selection.end.row > selection.start.row) && (selection.end.column === 0)) {
            // Don't move the last line of a multi-line selection if the selection ends at column 0
            endRow--;
          }

          startRow = this.displayLayer.findBoundaryPrecedingBufferRow(startRow);
          endRow = this.displayLayer.findBoundaryFollowingBufferRow(endRow + 1);
          const linesRange = new Range(Point(startRow, 0), Point(endRow, 0));

          // If selected line range is followed by a fold, one line below on screen
          // could be multiple lines in the buffer. But at the same time, if the
          // next buffer row is wrapped, one line in the buffer can represent many
          // screen rows.
          const followingRow = Math.min(this.buffer.getLineCount(), this.displayLayer.findBoundaryFollowingBufferRow(endRow + 1));
          var insertDelta = followingRow - linesRange.end.row;

          // Any folds in the text that is moved will need to be re-created.
          // It includes the folds that were intersecting with the selection.
          const rangesToRefold = this.displayLayer
            .destroyFoldsIntersectingBufferRange(linesRange)
            .map(range => range.translate([insertDelta, 0]));

          // Delete lines spanned by selection and insert them on the following correct buffer row
          let lines = this.buffer.getTextInRange(linesRange);
          if ((followingRow - 1) === this.buffer.getLastRow()) {
            lines = `\n${lines}`;
          }

          this.buffer.insert([followingRow, 0], lines);
          this.buffer.delete(linesRange);

          // Restore folds that existed before the lines were moved
          for (let rangeToRefold of Array.from(rangesToRefold)) {
            this.displayLayer.foldBufferRange(rangeToRefold);
          }

          for (selection of Array.from(selectionsToMove)) {
            newSelectionRanges.push(selection.translate([insertDelta, 0]));
          }
        }

        this.setSelectedBufferRanges(newSelectionRanges, {autoscroll: false, preserveFolds: true});
        if (this.shouldAutoIndent()) { this.autoIndentSelectedRows(); }
        return this.scrollToBufferPosition([newSelectionRanges[0].start.row - 1, 0]);
      });
    }

    // Move any active selections one column to the left.
    moveSelectionLeft() {
      const selections = this.getSelectedBufferRanges();
      const noSelectionAtStartOfLine = selections.every(selection => selection.start.column !== 0);

      const translationDelta = [0, -1];
      const translatedRanges = [];

      if (noSelectionAtStartOfLine) {
        return this.transact(() => {
          for (let selection of Array.from(selections)) {
            const charToLeftOfSelection = new Range(selection.start.translate(translationDelta), selection.start);
            const charTextToLeftOfSelection = this.buffer.getTextInRange(charToLeftOfSelection);

            this.buffer.insert(selection.end, charTextToLeftOfSelection);
            this.buffer.delete(charToLeftOfSelection);
            translatedRanges.push(selection.translate(translationDelta));
          }

          return this.setSelectedBufferRanges(translatedRanges);
        });
      }
    }

    // Move any active selections one column to the right.
    moveSelectionRight() {
      const selections = this.getSelectedBufferRanges();
      const noSelectionAtEndOfLine = selections.every(selection => {
        return selection.end.column !== this.buffer.lineLengthForRow(selection.end.row);
      });

      const translationDelta = [0, 1];
      const translatedRanges = [];

      if (noSelectionAtEndOfLine) {
        return this.transact(() => {
          for (let selection of Array.from(selections)) {
            const charToRightOfSelection = new Range(selection.end, selection.end.translate(translationDelta));
            const charTextToRightOfSelection = this.buffer.getTextInRange(charToRightOfSelection);

            this.buffer.delete(charToRightOfSelection);
            this.buffer.insert(selection.start, charTextToRightOfSelection);
            translatedRanges.push(selection.translate(translationDelta));
          }

          return this.setSelectedBufferRanges(translatedRanges);
        });
      }
    }

    duplicateLines() {
      return this.transact(() => {
        const selections = this.getSelectionsOrderedByBufferPosition();
        const previousSelectionRanges = [];

        let i = selections.length - 1;
        return (() => {
          const result = [];
          while (i >= 0) {
            const j = i;
            previousSelectionRanges[i] = selections[i].getBufferRange();
            if (selections[i].isEmpty()) {
              const {start} = selections[i].getScreenRange();
              selections[i].setScreenRange([[start.row, 0], [start.row + 1, 0]], {preserveFolds: true});
            }
            let [startRow, endRow] = Array.from(selections[i].getBufferRowRange());
            endRow++;
            while (i > 0) {
              const [previousSelectionStartRow, previousSelectionEndRow] = Array.from(selections[i - 1].getBufferRowRange());
              if (previousSelectionEndRow === startRow) {
                startRow = previousSelectionStartRow;
                previousSelectionRanges[i - 1] = selections[i - 1].getBufferRange();
                i--;
              } else {
                break;
              }
            }

            const intersectingFolds = this.displayLayer.foldsIntersectingBufferRange([[startRow, 0], [endRow, 0]]);
            let textToDuplicate = this.getTextInBufferRange([[startRow, 0], [endRow, 0]]);
            if (endRow > this.getLastBufferRow()) { textToDuplicate = `\n${textToDuplicate}`; }
            this.buffer.insert([endRow, 0], textToDuplicate);

            const insertedRowCount = endRow - startRow;

            for (let k = i, end = j; k <= end; k++) {
              selections[k].setBufferRange(previousSelectionRanges[k].translate([insertedRowCount, 0]));
            }

            for (let fold of Array.from(intersectingFolds)) {
              const foldRange = this.displayLayer.bufferRangeForFold(fold);
              this.displayLayer.foldBufferRange(foldRange.translate([insertedRowCount, 0]));
            }

            result.push(i--);
          }
          return result;
        })();
      });
    }

    replaceSelectedText(options, fn) {
      if (options == null) { options = {}; }
      const {selectWordIfEmpty} = options;
      return this.mutateSelectedText(function(selection) {
        selection.getBufferRange();
        if (selectWordIfEmpty && selection.isEmpty()) {
          selection.selectWord();
        }
        const text = selection.getText();
        selection.deleteSelectedText();
        const range = selection.insertText(fn(text));
        return selection.setBufferRange(range);
      });
    }

    // Split multi-line selections into one selection per line.
    //
    // Operates on all selections. This method breaks apart all multi-line
    // selections to create multiple single-line selections that cumulatively cover
    // the same original area.
    splitSelectionsIntoLines() {
      return this.mergeIntersectingSelections(() => {
        for (let selection of Array.from(this.getSelections())) {
          const range = selection.getBufferRange();
          if (range.isSingleLine()) { continue; }

          const {start, end} = range;
          this.addSelectionForBufferRange([start, [start.row, Infinity]]);
          let {row} = start;
          while (++row < end.row) {
            this.addSelectionForBufferRange([[row, 0], [row, Infinity]]);
          }
          if (end.column !== 0) { this.addSelectionForBufferRange([[end.row, 0], [end.row, end.column]]); }
          selection.destroy();
        }
      });
    }

    // Extended: For each selection, transpose the selected text.
    //
    // If the selection is empty, the characters preceding and following the cursor
    // are swapped. Otherwise, the selected characters are reversed.
    transpose() {
      return this.mutateSelectedText(function(selection) {
        if (selection.isEmpty()) {
          selection.selectRight();
          const text = selection.getText();
          selection.delete();
          selection.cursor.moveLeft();
          return selection.insertText(text);
        } else {
          return selection.insertText(selection.getText().split('').reverse().join(''));
        }
      });
    }

    // Extended: Convert the selected text to upper case.
    //
    // For each selection, if the selection is empty, converts the containing word
    // to upper case. Otherwise convert the selected text to upper case.
    upperCase() {
      return this.replaceSelectedText({selectWordIfEmpty: true}, text => text.toUpperCase());
    }

    // Extended: Convert the selected text to lower case.
    //
    // For each selection, if the selection is empty, converts the containing word
    // to upper case. Otherwise convert the selected text to upper case.
    lowerCase() {
      return this.replaceSelectedText({selectWordIfEmpty: true}, text => text.toLowerCase());
    }

    // Extended: Toggle line comments for rows intersecting selections.
    //
    // If the current grammar doesn't support comments, does nothing.
    toggleLineCommentsInSelection() {
      return this.mutateSelectedText(selection => selection.toggleLineComments());
    }

    // Convert multiple lines to a single line.
    //
    // Operates on all selections. If the selection is empty, joins the current
    // line with the next line. Otherwise it joins all lines that intersect the
    // selection.
    //
    // Joining a line means that multiple lines are converted to a single line with
    // the contents of each of the original non-empty lines separated by a space.
    joinLines() {
      return this.mutateSelectedText(selection => selection.joinLines());
    }

    // Extended: For each cursor, insert a newline at beginning the following line.
    insertNewlineBelow() {
      return this.transact(() => {
        this.moveToEndOfLine();
        return this.insertNewline();
      });
    }

    // Extended: For each cursor, insert a newline at the end of the preceding line.
    insertNewlineAbove() {
      return this.transact(() => {
        const bufferRow = this.getCursorBufferPosition().row;
        const indentLevel = this.indentationForBufferRow(bufferRow);
        const onFirstLine = bufferRow === 0;

        this.moveToBeginningOfLine();
        this.moveLeft();
        this.insertNewline();

        if (this.shouldAutoIndent() && (this.indentationForBufferRow(bufferRow) < indentLevel)) {
          this.setIndentationForBufferRow(bufferRow, indentLevel);
        }

        if (onFirstLine) {
          this.moveUp();
          return this.moveToEndOfLine();
        }
      });
    }

    // Extended: For each selection, if the selection is empty, delete all characters
    // of the containing word that precede the cursor. Otherwise delete the
    // selected text.
    deleteToBeginningOfWord() {
      return this.mutateSelectedText(selection => selection.deleteToBeginningOfWord());
    }

    // Extended: Similar to {::deleteToBeginningOfWord}, but deletes only back to the
    // previous word boundary.
    deleteToPreviousWordBoundary() {
      return this.mutateSelectedText(selection => selection.deleteToPreviousWordBoundary());
    }

    // Extended: Similar to {::deleteToEndOfWord}, but deletes only up to the
    // next word boundary.
    deleteToNextWordBoundary() {
      return this.mutateSelectedText(selection => selection.deleteToNextWordBoundary());
    }

    // Extended: For each selection, if the selection is empty, delete all characters
    // of the containing subword following the cursor. Otherwise delete the selected
    // text.
    deleteToBeginningOfSubword() {
      return this.mutateSelectedText(selection => selection.deleteToBeginningOfSubword());
    }

    // Extended: For each selection, if the selection is empty, delete all characters
    // of the containing subword following the cursor. Otherwise delete the selected
    // text.
    deleteToEndOfSubword() {
      return this.mutateSelectedText(selection => selection.deleteToEndOfSubword());
    }

    // Extended: For each selection, if the selection is empty, delete all characters
    // of the containing line that precede the cursor. Otherwise delete the
    // selected text.
    deleteToBeginningOfLine() {
      return this.mutateSelectedText(selection => selection.deleteToBeginningOfLine());
    }

    // Extended: For each selection, if the selection is not empty, deletes the
    // selection; otherwise, deletes all characters of the containing line
    // following the cursor. If the cursor is already at the end of the line,
    // deletes the following newline.
    deleteToEndOfLine() {
      return this.mutateSelectedText(selection => selection.deleteToEndOfLine());
    }

    // Extended: For each selection, if the selection is empty, delete all characters
    // of the containing word following the cursor. Otherwise delete the selected
    // text.
    deleteToEndOfWord() {
      return this.mutateSelectedText(selection => selection.deleteToEndOfWord());
    }

    // Extended: Delete all lines intersecting selections.
    deleteLine() {
      this.mergeSelectionsOnSameRows();
      return this.mutateSelectedText(selection => selection.deleteLine());
    }

    /*
    Section: History
    */

    // Essential: Undo the last change.
    undo() {
      this.avoidMergingSelections(() => this.buffer.undo());
      return this.getLastSelection().autoscroll();
    }

    // Essential: Redo the last change.
    redo() {
      this.avoidMergingSelections(() => this.buffer.redo());
      return this.getLastSelection().autoscroll();
    }

    // Extended: Batch multiple operations as a single undo/redo step.
    //
    // Any group of operations that are logically grouped from the perspective of
    // undoing and redoing should be performed in a transaction. If you want to
    // abort the transaction, call {::abortTransaction} to terminate the function's
    // execution and revert any changes performed up to the abortion.
    //
    // * `groupingInterval` (optional) The {Number} of milliseconds for which this
    //   transaction should be considered 'groupable' after it begins. If a transaction
    //   with a positive `groupingInterval` is committed while the previous transaction is
    //   still 'groupable', the two transactions are merged with respect to undo and redo.
    // * `fn` A {Function} to call inside the transaction.
    transact(groupingInterval, fn) {
      return this.buffer.transact(groupingInterval, fn);
    }

    // Deprecated: Start an open-ended transaction.
    beginTransaction(groupingInterval) {
      Grim.deprecate('Transactions should be performed via TextEditor::transact only');
      return this.buffer.beginTransaction(groupingInterval);
    }

    // Deprecated: Commit an open-ended transaction started with {::beginTransaction}.
    commitTransaction() {
      Grim.deprecate('Transactions should be performed via TextEditor::transact only');
      return this.buffer.commitTransaction();
    }

    // Extended: Abort an open transaction, undoing any operations performed so far
    // within the transaction.
    abortTransaction() { return this.buffer.abortTransaction(); }

    // Extended: Create a pointer to the current state of the buffer for use
    // with {::revertToCheckpoint} and {::groupChangesSinceCheckpoint}.
    //
    // Returns a checkpoint value.
    createCheckpoint() { return this.buffer.createCheckpoint(); }

    // Extended: Revert the buffer to the state it was in when the given
    // checkpoint was created.
    //
    // The redo stack will be empty following this operation, so changes since the
    // checkpoint will be lost. If the given checkpoint is no longer present in the
    // undo history, no changes will be made to the buffer and this method will
    // return `false`.
    //
    // * `checkpoint` The checkpoint to revert to.
    //
    // Returns a {Boolean} indicating whether the operation succeeded.
    revertToCheckpoint(checkpoint) { return this.buffer.revertToCheckpoint(checkpoint); }

    // Extended: Group all changes since the given checkpoint into a single
    // transaction for purposes of undo/redo.
    //
    // If the given checkpoint is no longer present in the undo history, no
    // grouping will be performed and this method will return `false`.
    //
    // * `checkpoint` The checkpoint from which to group changes.
    //
    // Returns a {Boolean} indicating whether the operation succeeded.
    groupChangesSinceCheckpoint(checkpoint) { return this.buffer.groupChangesSinceCheckpoint(checkpoint); }

    /*
    Section: TextEditor Coordinates
    */

    // Essential: Convert a position in buffer-coordinates to screen-coordinates.
    //
    // The position is clipped via {::clipBufferPosition} prior to the conversion.
    // The position is also clipped via {::clipScreenPosition} following the
    // conversion, which only makes a difference when `options` are supplied.
    //
    // * `bufferPosition` A {Point} or {Array} of [row, column].
    // * `options` (optional) An options hash for {::clipScreenPosition}.
    //
    // Returns a {Point}.
    screenPositionForBufferPosition(bufferPosition, options) {
      if ((options != null ? options.clip : undefined) != null) {
        Grim.deprecate("The `clip` parameter has been deprecated and will be removed soon. Please, use `clipDirection` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.clip; }
      }
      if ((options != null ? options.wrapAtSoftNewlines : undefined) != null) {
        Grim.deprecate("The `wrapAtSoftNewlines` parameter has been deprecated and will be removed soon. Please, use `clipDirection: 'forward'` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.wrapAtSoftNewlines ? 'forward' : 'backward'; }
      }
      if ((options != null ? options.wrapBeyondNewlines : undefined) != null) {
        Grim.deprecate("The `wrapBeyondNewlines` parameter has been deprecated and will be removed soon. Please, use `clipDirection: 'forward'` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.wrapBeyondNewlines ? 'forward' : 'backward'; }
      }

      return this.displayLayer.translateBufferPosition(bufferPosition, options);
    }

    // Essential: Convert a position in screen-coordinates to buffer-coordinates.
    //
    // The position is clipped via {::clipScreenPosition} prior to the conversion.
    //
    // * `bufferPosition` A {Point} or {Array} of [row, column].
    // * `options` (optional) An options hash for {::clipScreenPosition}.
    //
    // Returns a {Point}.
    bufferPositionForScreenPosition(screenPosition, options) {
      if ((options != null ? options.clip : undefined) != null) {
        Grim.deprecate("The `clip` parameter has been deprecated and will be removed soon. Please, use `clipDirection` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.clip; }
      }
      if ((options != null ? options.wrapAtSoftNewlines : undefined) != null) {
        Grim.deprecate("The `wrapAtSoftNewlines` parameter has been deprecated and will be removed soon. Please, use `clipDirection: 'forward'` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.wrapAtSoftNewlines ? 'forward' : 'backward'; }
      }
      if ((options != null ? options.wrapBeyondNewlines : undefined) != null) {
        Grim.deprecate("The `wrapBeyondNewlines` parameter has been deprecated and will be removed soon. Please, use `clipDirection: 'forward'` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.wrapBeyondNewlines ? 'forward' : 'backward'; }
      }

      return this.displayLayer.translateScreenPosition(screenPosition, options);
    }

    // Essential: Convert a range in buffer-coordinates to screen-coordinates.
    //
    // * `bufferRange` {Range} in buffer coordinates to translate into screen coordinates.
    //
    // Returns a {Range}.
    screenRangeForBufferRange(bufferRange, options) {
      bufferRange = Range.fromObject(bufferRange);
      const start = this.screenPositionForBufferPosition(bufferRange.start, options);
      const end = this.screenPositionForBufferPosition(bufferRange.end, options);
      return new Range(start, end);
    }

    // Essential: Convert a range in screen-coordinates to buffer-coordinates.
    //
    // * `screenRange` {Range} in screen coordinates to translate into buffer coordinates.
    //
    // Returns a {Range}.
    bufferRangeForScreenRange(screenRange) {
      screenRange = Range.fromObject(screenRange);
      const start = this.bufferPositionForScreenPosition(screenRange.start);
      const end = this.bufferPositionForScreenPosition(screenRange.end);
      return new Range(start, end);
    }

    // Extended: Clip the given {Point} to a valid position in the buffer.
    //
    // If the given {Point} describes a position that is actually reachable by the
    // cursor based on the current contents of the buffer, it is returned
    // unchanged. If the {Point} does not describe a valid position, the closest
    // valid position is returned instead.
    //
    // ## Examples
    //
    // ```coffee
    // editor.clipBufferPosition([-1, -1]) # -> `[0, 0]`
    //
    // # When the line at buffer row 2 is 10 characters long
    // editor.clipBufferPosition([2, Infinity]) # -> `[2, 10]`
    // ```
    //
    // * `bufferPosition` The {Point} representing the position to clip.
    //
    // Returns a {Point}.
    clipBufferPosition(bufferPosition) { return this.buffer.clipPosition(bufferPosition); }

    // Extended: Clip the start and end of the given range to valid positions in the
    // buffer. See {::clipBufferPosition} for more information.
    //
    // * `range` The {Range} to clip.
    //
    // Returns a {Range}.
    clipBufferRange(range) { return this.buffer.clipRange(range); }

    // Extended: Clip the given {Point} to a valid position on screen.
    //
    // If the given {Point} describes a position that is actually reachable by the
    // cursor based on the current contents of the screen, it is returned
    // unchanged. If the {Point} does not describe a valid position, the closest
    // valid position is returned instead.
    //
    // ## Examples
    //
    // ```coffee
    // editor.clipScreenPosition([-1, -1]) # -> `[0, 0]`
    //
    // # When the line at screen row 2 is 10 characters long
    // editor.clipScreenPosition([2, Infinity]) # -> `[2, 10]`
    // ```
    //
    // * `screenPosition` The {Point} representing the position to clip.
    // * `options` (optional) {Object}
    //   * `clipDirection` {String} If `'backward'`, returns the first valid
    //     position preceding an invalid position. If `'forward'`, returns the
    //     first valid position following an invalid position. If `'closest'`,
    //     returns the first valid position closest to an invalid position.
    //     Defaults to `'closest'`.
    //
    // Returns a {Point}.
    clipScreenPosition(screenPosition, options) {
      if ((options != null ? options.clip : undefined) != null) {
        Grim.deprecate("The `clip` parameter has been deprecated and will be removed soon. Please, use `clipDirection` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.clip; }
      }
      if ((options != null ? options.wrapAtSoftNewlines : undefined) != null) {
        Grim.deprecate("The `wrapAtSoftNewlines` parameter has been deprecated and will be removed soon. Please, use `clipDirection: 'forward'` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.wrapAtSoftNewlines ? 'forward' : 'backward'; }
      }
      if ((options != null ? options.wrapBeyondNewlines : undefined) != null) {
        Grim.deprecate("The `wrapBeyondNewlines` parameter has been deprecated and will be removed soon. Please, use `clipDirection: 'forward'` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.wrapBeyondNewlines ? 'forward' : 'backward'; }
      }

      return this.displayLayer.clipScreenPosition(screenPosition, options);
    }

    // Extended: Clip the start and end of the given range to valid positions on screen.
    // See {::clipScreenPosition} for more information.
    //
    // * `range` The {Range} to clip.
    // * `options` (optional) See {::clipScreenPosition} `options`.
    //
    // Returns a {Range}.
    clipScreenRange(screenRange, options) {
      screenRange = Range.fromObject(screenRange);
      const start = this.displayLayer.clipScreenPosition(screenRange.start, options);
      const end = this.displayLayer.clipScreenPosition(screenRange.end, options);
      return Range(start, end);
    }

    /*
    Section: Decorations
    */

    // Essential: Add a decoration that tracks a {DisplayMarker}. When the
    // marker moves, is invalidated, or is destroyed, the decoration will be
    // updated to reflect the marker's state.
    //
    // The following are the supported decorations types:
    //
    // * __line__: Adds your CSS `class` to the line nodes within the range
    //     marked by the marker
    // * __line-number__: Adds your CSS `class` to the line number nodes within the
    //     range marked by the marker
    // * __highlight__: Adds a new highlight div to the editor surrounding the
    //     range marked by the marker. When the user selects text, the selection is
    //     visualized with a highlight decoration internally. The structure of this
    //     highlight will be
    //     ```html
    //     <div class="highlight <your-class>">
    //       <!-- Will be one region for each row in the range. Spans 2 lines? There will be 2 regions. -->
    //       <div class="region"></div>
    //     </div>
    //     ```
    // * __overlay__: Positions the view associated with the given item at the head
    //     or tail of the given `DisplayMarker`.
    // * __gutter__: A decoration that tracks a {DisplayMarker} in a {Gutter}. Gutter
    //     decorations are created by calling {Gutter::decorateMarker} on the
    //     desired `Gutter` instance.
    // * __block__: Positions the view associated with the given item before or
    //     after the row of the given `TextEditorMarker`.
    //
    // ## Arguments
    //
    // * `marker` A {DisplayMarker} you want this decoration to follow.
    // * `decorationParams` An {Object} representing the decoration e.g.
    //   `{type: 'line-number', class: 'linter-error'}`
    //   * `type` There are several supported decoration types. The behavior of the
    //     types are as follows:
    //     * `line` Adds the given `class` to the lines overlapping the rows
    //        spanned by the `DisplayMarker`.
    //     * `line-number` Adds the given `class` to the line numbers overlapping
    //       the rows spanned by the `DisplayMarker`.
    //     * `text` Injects spans into all text overlapping the marked range,
    //       then adds the given `class` or `style` properties to these spans.
    //       Use this to manipulate the foreground color or styling of text in
    //       a given range.
    //     * `highlight` Creates an absolutely-positioned `.highlight` div
    //       containing nested divs to cover the marked region. For example, this
    //       is used to implement selections.
    //     * `overlay` Positions the view associated with the given item at the
    //       head or tail of the given `DisplayMarker`, depending on the `position`
    //       property.
    //     * `gutter` Tracks a {DisplayMarker} in a {Gutter}. Created by calling
    //       {Gutter::decorateMarker} on the desired `Gutter` instance.
    //     * `block` Positions the view associated with the given item before or
    //       after the row of the given `TextEditorMarker`, depending on the `position`
    //       property.
    //     * `cursor` Renders a cursor at the head of the given marker. If multiple
    //       decorations are created for the same marker, their class strings and
    //       style objects are combined into a single cursor. You can use this
    //       decoration type to style existing cursors by passing in their markers
    //       or render artificial cursors that don't actually exist in the model
    //       by passing a marker that isn't actually associated with a cursor.
    //   * `class` This CSS class will be applied to the decorated line number,
    //     line, text spans, highlight regions, cursors, or overlay.
    //   * `style` An {Object} containing CSS style properties to apply to the
    //     relevant DOM node. Currently this only works with a `type` of `cursor`
    //     or `text`.
    //   * `item` (optional) An {HTMLElement} or a model {Object} with a
    //     corresponding view registered. Only applicable to the `gutter`,
    //     `overlay` and `block` decoration types.
    //   * `onlyHead` (optional) If `true`, the decoration will only be applied to
    //     the head of the `DisplayMarker`. Only applicable to the `line` and
    //     `line-number` decoration types.
    //   * `onlyEmpty` (optional) If `true`, the decoration will only be applied if
    //     the associated `DisplayMarker` is empty. Only applicable to the `gutter`,
    //     `line`, and `line-number` decoration types.
    //   * `onlyNonEmpty` (optional) If `true`, the decoration will only be applied
    //     if the associated `DisplayMarker` is non-empty. Only applicable to the
    //     `gutter`, `line`, and `line-number` decoration types.
    //   * `omitEmptyLastRow` (optional) If `false`, the decoration will be applied
    //     to the last row of a non-empty range, even if it ends at column 0.
    //     Defaults to `true`. Only applicable to the `gutter`, `line`, and
    //     `line-number` decoration types.
    //   * `position` (optional) Only applicable to decorations of type `overlay` and `block`.
    //     Controls where the view is positioned relative to the `TextEditorMarker`.
    //     Values can be `'head'` (the default) or `'tail'` for overlay decorations, and
    //     `'before'` (the default) or `'after'` for block decorations.
    //   * `avoidOverflow` (optional) Only applicable to decorations of type
    //      `overlay`. Determines whether the decoration adjusts its horizontal or
    //      vertical position to remain fully visible when it would otherwise
    //      overflow the editor. Defaults to `true`.
    //
    // Returns a {Decoration} object
    decorateMarker(marker, decorationParams) {
      return this.decorationManager.decorateMarker(marker, decorationParams);
    }

    // Essential: Add a decoration to every marker in the given marker layer. Can
    // be used to decorate a large number of markers without having to create and
    // manage many individual decorations.
    //
    // * `markerLayer` A {DisplayMarkerLayer} or {MarkerLayer} to decorate.
    // * `decorationParams` The same parameters that are passed to
    //   {TextEditor::decorateMarker}, except the `type` cannot be `overlay` or `gutter`.
    //
    // Returns a {LayerDecoration}.
    decorateMarkerLayer(markerLayer, decorationParams) {
      return this.decorationManager.decorateMarkerLayer(markerLayer, decorationParams);
    }

    // Deprecated: Get all the decorations within a screen row range on the default
    // layer.
    //
    // * `startScreenRow` the {Number} beginning screen row
    // * `endScreenRow` the {Number} end screen row (inclusive)
    //
    // Returns an {Object} of decorations in the form
    //  `{1: [{id: 10, type: 'line-number', class: 'someclass'}], 2: ...}`
    //   where the keys are {DisplayMarker} IDs, and the values are an array of decoration
    //   params objects attached to the marker.
    // Returns an empty object when no decorations are found
    decorationsForScreenRowRange(startScreenRow, endScreenRow) {
      return this.decorationManager.decorationsForScreenRowRange(startScreenRow, endScreenRow);
    }

    decorationsStateForScreenRowRange(startScreenRow, endScreenRow) {
      return this.decorationManager.decorationsStateForScreenRowRange(startScreenRow, endScreenRow);
    }

    // Extended: Get all decorations.
    //
    // * `propertyFilter` (optional) An {Object} containing key value pairs that
    //   the returned decorations' properties must match.
    //
    // Returns an {Array} of {Decoration}s.
    getDecorations(propertyFilter) {
      return this.decorationManager.getDecorations(propertyFilter);
    }

    // Extended: Get all decorations of type 'line'.
    //
    // * `propertyFilter` (optional) An {Object} containing key value pairs that
    //   the returned decorations' properties must match.
    //
    // Returns an {Array} of {Decoration}s.
    getLineDecorations(propertyFilter) {
      return this.decorationManager.getLineDecorations(propertyFilter);
    }

    // Extended: Get all decorations of type 'line-number'.
    //
    // * `propertyFilter` (optional) An {Object} containing key value pairs that
    //   the returned decorations' properties must match.
    //
    // Returns an {Array} of {Decoration}s.
    getLineNumberDecorations(propertyFilter) {
      return this.decorationManager.getLineNumberDecorations(propertyFilter);
    }

    // Extended: Get all decorations of type 'highlight'.
    //
    // * `propertyFilter` (optional) An {Object} containing key value pairs that
    //   the returned decorations' properties must match.
    //
    // Returns an {Array} of {Decoration}s.
    getHighlightDecorations(propertyFilter) {
      return this.decorationManager.getHighlightDecorations(propertyFilter);
    }

    // Extended: Get all decorations of type 'overlay'.
    //
    // * `propertyFilter` (optional) An {Object} containing key value pairs that
    //   the returned decorations' properties must match.
    //
    // Returns an {Array} of {Decoration}s.
    getOverlayDecorations(propertyFilter) {
      return this.decorationManager.getOverlayDecorations(propertyFilter);
    }

    /*
    Section: Markers
    */

    // Essential: Create a marker on the default marker layer with the given range
    // in buffer coordinates. This marker will maintain its logical location as the
    // buffer is changed, so if you mark a particular word, the marker will remain
    // over that word even if the word's location in the buffer changes.
    //
    // * `range` A {Range} or range-compatible {Array}
    // * `properties` A hash of key-value pairs to associate with the marker. There
    //   are also reserved property names that have marker-specific meaning.
    //   * `maintainHistory` (optional) {Boolean} Whether to store this marker's
    //     range before and after each change in the undo history. This allows the
    //     marker's position to be restored more accurately for certain undo/redo
    //     operations, but uses more time and memory. (default: false)
    //   * `reversed` (optional) {Boolean} Creates the marker in a reversed
    //     orientation. (default: false)
    //   * `invalidate` (optional) {String} Determines the rules by which changes
    //     to the buffer *invalidate* the marker. (default: 'overlap') It can be
    //     any of the following strategies, in order of fragility:
    //     * __never__: The marker is never marked as invalid. This is a good choice for
    //       markers representing selections in an editor.
    //     * __surround__: The marker is invalidated by changes that completely surround it.
    //     * __overlap__: The marker is invalidated by changes that surround the
    //       start or end of the marker. This is the default.
    //     * __inside__: The marker is invalidated by changes that extend into the
    //       inside of the marker. Changes that end at the marker's start or
    //       start at the marker's end do not invalidate the marker.
    //     * __touch__: The marker is invalidated by a change that touches the marked
    //       region in any way, including changes that end at the marker's
    //       start or start at the marker's end. This is the most fragile strategy.
    //
    // Returns a {DisplayMarker}.
    markBufferRange(bufferRange, options) {
      return this.defaultMarkerLayer.markBufferRange(bufferRange, options);
    }

    // Essential: Create a marker on the default marker layer with the given range
    // in screen coordinates. This marker will maintain its logical location as the
    // buffer is changed, so if you mark a particular word, the marker will remain
    // over that word even if the word's location in the buffer changes.
    //
    // * `range` A {Range} or range-compatible {Array}
    // * `properties` A hash of key-value pairs to associate with the marker. There
    //   are also reserved property names that have marker-specific meaning.
    //   * `maintainHistory` (optional) {Boolean} Whether to store this marker's
    //     range before and after each change in the undo history. This allows the
    //     marker's position to be restored more accurately for certain undo/redo
    //     operations, but uses more time and memory. (default: false)
    //   * `reversed` (optional) {Boolean} Creates the marker in a reversed
    //     orientation. (default: false)
    //   * `invalidate` (optional) {String} Determines the rules by which changes
    //     to the buffer *invalidate* the marker. (default: 'overlap') It can be
    //     any of the following strategies, in order of fragility:
    //     * __never__: The marker is never marked as invalid. This is a good choice for
    //       markers representing selections in an editor.
    //     * __surround__: The marker is invalidated by changes that completely surround it.
    //     * __overlap__: The marker is invalidated by changes that surround the
    //       start or end of the marker. This is the default.
    //     * __inside__: The marker is invalidated by changes that extend into the
    //       inside of the marker. Changes that end at the marker's start or
    //       start at the marker's end do not invalidate the marker.
    //     * __touch__: The marker is invalidated by a change that touches the marked
    //       region in any way, including changes that end at the marker's
    //       start or start at the marker's end. This is the most fragile strategy.
    //
    // Returns a {DisplayMarker}.
    markScreenRange(screenRange, options) {
      return this.defaultMarkerLayer.markScreenRange(screenRange, options);
    }

    // Essential: Create a marker on the default marker layer with the given buffer
    // position and no tail. To group multiple markers together in their own
    // private layer, see {::addMarkerLayer}.
    //
    // * `bufferPosition` A {Point} or point-compatible {Array}
    // * `options` (optional) An {Object} with the following keys:
    //   * `invalidate` (optional) {String} Determines the rules by which changes
    //     to the buffer *invalidate* the marker. (default: 'overlap') It can be
    //     any of the following strategies, in order of fragility:
    //     * __never__: The marker is never marked as invalid. This is a good choice for
    //       markers representing selections in an editor.
    //     * __surround__: The marker is invalidated by changes that completely surround it.
    //     * __overlap__: The marker is invalidated by changes that surround the
    //       start or end of the marker. This is the default.
    //     * __inside__: The marker is invalidated by changes that extend into the
    //       inside of the marker. Changes that end at the marker's start or
    //       start at the marker's end do not invalidate the marker.
    //     * __touch__: The marker is invalidated by a change that touches the marked
    //       region in any way, including changes that end at the marker's
    //       start or start at the marker's end. This is the most fragile strategy.
    //
    // Returns a {DisplayMarker}.
    markBufferPosition(bufferPosition, options) {
      return this.defaultMarkerLayer.markBufferPosition(bufferPosition, options);
    }

    // Essential: Create a marker on the default marker layer with the given screen
    // position and no tail. To group multiple markers together in their own
    // private layer, see {::addMarkerLayer}.
    //
    // * `screenPosition` A {Point} or point-compatible {Array}
    // * `options` (optional) An {Object} with the following keys:
    //   * `invalidate` (optional) {String} Determines the rules by which changes
    //     to the buffer *invalidate* the marker. (default: 'overlap') It can be
    //     any of the following strategies, in order of fragility:
    //     * __never__: The marker is never marked as invalid. This is a good choice for
    //       markers representing selections in an editor.
    //     * __surround__: The marker is invalidated by changes that completely surround it.
    //     * __overlap__: The marker is invalidated by changes that surround the
    //       start or end of the marker. This is the default.
    //     * __inside__: The marker is invalidated by changes that extend into the
    //       inside of the marker. Changes that end at the marker's start or
    //       start at the marker's end do not invalidate the marker.
    //     * __touch__: The marker is invalidated by a change that touches the marked
    //       region in any way, including changes that end at the marker's
    //       start or start at the marker's end. This is the most fragile strategy.
    //   * `clipDirection` {String} If `'backward'`, returns the first valid
    //     position preceding an invalid position. If `'forward'`, returns the
    //     first valid position following an invalid position. If `'closest'`,
    //     returns the first valid position closest to an invalid position.
    //     Defaults to `'closest'`.
    //
    // Returns a {DisplayMarker}.
    markScreenPosition(screenPosition, options) {
      return this.defaultMarkerLayer.markScreenPosition(screenPosition, options);
    }

    // Essential: Find all {DisplayMarker}s on the default marker layer that
    // match the given properties.
    //
    // This method finds markers based on the given properties. Markers can be
    // associated with custom properties that will be compared with basic equality.
    // In addition, there are several special properties that will be compared
    // with the range of the markers rather than their properties.
    //
    // * `properties` An {Object} containing properties that each returned marker
    //   must satisfy. Markers can be associated with custom properties, which are
    //   compared with basic equality. In addition, several reserved properties
    //   can be used to filter markers based on their current range:
    //   * `startBufferRow` Only include markers starting at this row in buffer
    //       coordinates.
    //   * `endBufferRow` Only include markers ending at this row in buffer
    //       coordinates.
    //   * `containsBufferRange` Only include markers containing this {Range} or
    //       in range-compatible {Array} in buffer coordinates.
    //   * `containsBufferPosition` Only include markers containing this {Point}
    //       or {Array} of `[row, column]` in buffer coordinates.
    //
    // Returns an {Array} of {DisplayMarker}s
    findMarkers(params) {
      return this.defaultMarkerLayer.findMarkers(params);
    }

    // Extended: Get the {DisplayMarker} on the default layer for the given
    // marker id.
    //
    // * `id` {Number} id of the marker
    getMarker(id) {
      return this.defaultMarkerLayer.getMarker(id);
    }

    // Extended: Get all {DisplayMarker}s on the default marker layer. Consider
    // using {::findMarkers}
    getMarkers() {
      return this.defaultMarkerLayer.getMarkers();
    }

    // Extended: Get the number of markers in the default marker layer.
    //
    // Returns a {Number}.
    getMarkerCount() {
      return this.defaultMarkerLayer.getMarkerCount();
    }

    destroyMarker(id) {
      return __guard__(this.getMarker(id), x => x.destroy());
    }

    // Essential: Create a marker layer to group related markers.
    //
    // * `options` An {Object} containing the following keys:
    //   * `maintainHistory` A {Boolean} indicating whether marker state should be
    //     restored on undo/redo. Defaults to `false`.
    //   * `persistent` A {Boolean} indicating whether or not this marker layer
    //     should be serialized and deserialized along with the rest of the
    //     buffer. Defaults to `false`. If `true`, the marker layer's id will be
    //     maintained across the serialization boundary, allowing you to retrieve
    //     it via {::getMarkerLayer}.
    //
    // Returns a {DisplayMarkerLayer}.
    addMarkerLayer(options) {
      return this.displayLayer.addMarkerLayer(options);
    }

    // Essential: Get a {DisplayMarkerLayer} by id.
    //
    // * `id` The id of the marker layer to retrieve.
    //
    // Returns a {DisplayMarkerLayer} or `undefined` if no layer exists with the
    // given id.
    getMarkerLayer(id) {
      return this.displayLayer.getMarkerLayer(id);
    }

    // Essential: Get the default {DisplayMarkerLayer}.
    //
    // All marker APIs not tied to an explicit layer interact with this default
    // layer.
    //
    // Returns a {DisplayMarkerLayer}.
    getDefaultMarkerLayer() {
      return this.defaultMarkerLayer;
    }

    /*
    Section: Cursors
    */

    // Essential: Get the position of the most recently added cursor in buffer
    // coordinates.
    //
    // Returns a {Point}
    getCursorBufferPosition() {
      return this.getLastCursor().getBufferPosition();
    }

    // Essential: Get the position of all the cursor positions in buffer coordinates.
    //
    // Returns {Array} of {Point}s in the order they were added
    getCursorBufferPositions() {
      return Array.from(this.getCursors()).map((cursor) => cursor.getBufferPosition());
    }

    // Essential: Move the cursor to the given position in buffer coordinates.
    //
    // If there are multiple cursors, they will be consolidated to a single cursor.
    //
    // * `position` A {Point} or {Array} of `[row, column]`
    // * `options` (optional) An {Object} containing the following keys:
    //   * `autoscroll` Determines whether the editor scrolls to the new cursor's
    //     position. Defaults to true.
    setCursorBufferPosition(position, options) {
      return this.moveCursors(cursor => cursor.setBufferPosition(position, options));
    }

    // Essential: Get a {Cursor} at given screen coordinates {Point}
    //
    // * `position` A {Point} or {Array} of `[row, column]`
    //
    // Returns the first matched {Cursor} or undefined
    getCursorAtScreenPosition(position) {
      let selection;
      if (selection = this.getSelectionAtScreenPosition(position)) {
        if (selection.getHeadScreenPosition().isEqual(position)) {
          return selection.cursor;
        }
      }
    }

    // Essential: Get the position of the most recently added cursor in screen
    // coordinates.
    //
    // Returns a {Point}.
    getCursorScreenPosition() {
      return this.getLastCursor().getScreenPosition();
    }

    // Essential: Get the position of all the cursor positions in screen coordinates.
    //
    // Returns {Array} of {Point}s in the order the cursors were added
    getCursorScreenPositions() {
      return Array.from(this.getCursors()).map((cursor) => cursor.getScreenPosition());
    }

    // Essential: Move the cursor to the given position in screen coordinates.
    //
    // If there are multiple cursors, they will be consolidated to a single cursor.
    //
    // * `position` A {Point} or {Array} of `[row, column]`
    // * `options` (optional) An {Object} combining options for {::clipScreenPosition} with:
    //   * `autoscroll` Determines whether the editor scrolls to the new cursor's
    //     position. Defaults to true.
    setCursorScreenPosition(position, options) {
      if ((options != null ? options.clip : undefined) != null) {
        Grim.deprecate("The `clip` parameter has been deprecated and will be removed soon. Please, use `clipDirection` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.clip; }
      }
      if ((options != null ? options.wrapAtSoftNewlines : undefined) != null) {
        Grim.deprecate("The `wrapAtSoftNewlines` parameter has been deprecated and will be removed soon. Please, use `clipDirection: 'forward'` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.wrapAtSoftNewlines ? 'forward' : 'backward'; }
      }
      if ((options != null ? options.wrapBeyondNewlines : undefined) != null) {
        Grim.deprecate("The `wrapBeyondNewlines` parameter has been deprecated and will be removed soon. Please, use `clipDirection: 'forward'` instead.");
        if (options.clipDirection == null) { options.clipDirection = options.wrapBeyondNewlines ? 'forward' : 'backward'; }
      }

      return this.moveCursors(cursor => cursor.setScreenPosition(position, options));
    }

    // Essential: Add a cursor at the given position in buffer coordinates.
    //
    // * `bufferPosition` A {Point} or {Array} of `[row, column]`
    //
    // Returns a {Cursor}.
    addCursorAtBufferPosition(bufferPosition, options) {
      this.selectionsMarkerLayer.markBufferPosition(bufferPosition, Object.assign({invalidate: 'never'}, options));
      if ((options != null ? options.autoscroll : undefined) !== false) { this.getLastSelection().cursor.autoscroll(); }
      return this.getLastSelection().cursor;
    }

    // Essential: Add a cursor at the position in screen coordinates.
    //
    // * `screenPosition` A {Point} or {Array} of `[row, column]`
    //
    // Returns a {Cursor}.
    addCursorAtScreenPosition(screenPosition, options) {
      this.selectionsMarkerLayer.markScreenPosition(screenPosition, {invalidate: 'never'});
      if ((options != null ? options.autoscroll : undefined) !== false) { this.getLastSelection().cursor.autoscroll(); }
      return this.getLastSelection().cursor;
    }

    // Essential: Returns {Boolean} indicating whether or not there are multiple cursors.
    hasMultipleCursors() {
      return this.getCursors().length > 1;
    }

    // Essential: Move every cursor up one row in screen coordinates.
    //
    // * `lineCount` (optional) {Number} number of lines to move
    moveUp(lineCount) {
      return this.moveCursors(cursor => cursor.moveUp(lineCount, {moveToEndOfSelection: true}));
    }

    // Essential: Move every cursor down one row in screen coordinates.
    //
    // * `lineCount` (optional) {Number} number of lines to move
    moveDown(lineCount) {
      return this.moveCursors(cursor => cursor.moveDown(lineCount, {moveToEndOfSelection: true}));
    }

    // Essential: Move every cursor left one column.
    //
    // * `columnCount` (optional) {Number} number of columns to move (default: 1)
    moveLeft(columnCount) {
      return this.moveCursors(cursor => cursor.moveLeft(columnCount, {moveToEndOfSelection: true}));
    }

    // Essential: Move every cursor right one column.
    //
    // * `columnCount` (optional) {Number} number of columns to move (default: 1)
    moveRight(columnCount) {
      return this.moveCursors(cursor => cursor.moveRight(columnCount, {moveToEndOfSelection: true}));
    }

    // Essential: Move every cursor to the beginning of its line in buffer coordinates.
    moveToBeginningOfLine() {
      return this.moveCursors(cursor => cursor.moveToBeginningOfLine());
    }

    // Essential: Move every cursor to the beginning of its line in screen coordinates.
    moveToBeginningOfScreenLine() {
      return this.moveCursors(cursor => cursor.moveToBeginningOfScreenLine());
    }

    // Essential: Move every cursor to the first non-whitespace character of its line.
    moveToFirstCharacterOfLine() {
      return this.moveCursors(cursor => cursor.moveToFirstCharacterOfLine());
    }

    // Essential: Move every cursor to the end of its line in buffer coordinates.
    moveToEndOfLine() {
      return this.moveCursors(cursor => cursor.moveToEndOfLine());
    }

    // Essential: Move every cursor to the end of its line in screen coordinates.
    moveToEndOfScreenLine() {
      return this.moveCursors(cursor => cursor.moveToEndOfScreenLine());
    }

    // Essential: Move every cursor to the beginning of its surrounding word.
    moveToBeginningOfWord() {
      return this.moveCursors(cursor => cursor.moveToBeginningOfWord());
    }

    // Essential: Move every cursor to the end of its surrounding word.
    moveToEndOfWord() {
      return this.moveCursors(cursor => cursor.moveToEndOfWord());
    }

    // Cursor Extended

    // Extended: Move every cursor to the top of the buffer.
    //
    // If there are multiple cursors, they will be merged into a single cursor.
    moveToTop() {
      return this.moveCursors(cursor => cursor.moveToTop());
    }

    // Extended: Move every cursor to the bottom of the buffer.
    //
    // If there are multiple cursors, they will be merged into a single cursor.
    moveToBottom() {
      return this.moveCursors(cursor => cursor.moveToBottom());
    }

    // Extended: Move every cursor to the beginning of the next word.
    moveToBeginningOfNextWord() {
      return this.moveCursors(cursor => cursor.moveToBeginningOfNextWord());
    }

    // Extended: Move every cursor to the previous word boundary.
    moveToPreviousWordBoundary() {
      return this.moveCursors(cursor => cursor.moveToPreviousWordBoundary());
    }

    // Extended: Move every cursor to the next word boundary.
    moveToNextWordBoundary() {
      return this.moveCursors(cursor => cursor.moveToNextWordBoundary());
    }

    // Extended: Move every cursor to the previous subword boundary.
    moveToPreviousSubwordBoundary() {
      return this.moveCursors(cursor => cursor.moveToPreviousSubwordBoundary());
    }

    // Extended: Move every cursor to the next subword boundary.
    moveToNextSubwordBoundary() {
      return this.moveCursors(cursor => cursor.moveToNextSubwordBoundary());
    }

    // Extended: Move every cursor to the beginning of the next paragraph.
    moveToBeginningOfNextParagraph() {
      return this.moveCursors(cursor => cursor.moveToBeginningOfNextParagraph());
    }

    // Extended: Move every cursor to the beginning of the previous paragraph.
    moveToBeginningOfPreviousParagraph() {
      return this.moveCursors(cursor => cursor.moveToBeginningOfPreviousParagraph());
    }

    // Extended: Returns the most recently added {Cursor}
    getLastCursor() {
      this.createLastSelectionIfNeeded();
      return _.last(this.cursors);
    }

    // Extended: Returns the word surrounding the most recently added cursor.
    //
    // * `options` (optional) See {Cursor::getBeginningOfCurrentWordBufferPosition}.
    getWordUnderCursor(options) {
      return this.getTextInBufferRange(this.getLastCursor().getCurrentWordBufferRange(options));
    }

    // Extended: Get an Array of all {Cursor}s.
    getCursors() {
      this.createLastSelectionIfNeeded();
      return this.cursors.slice();
    }

    // Extended: Get all {Cursors}s, ordered by their position in the buffer
    // instead of the order in which they were added.
    //
    // Returns an {Array} of {Selection}s.
    getCursorsOrderedByBufferPosition() {
      return this.getCursors().sort((a, b) => a.compare(b));
    }

    cursorsForScreenRowRange(startScreenRow, endScreenRow) {
      const cursors = [];
      for (let marker of Array.from(this.selectionsMarkerLayer.findMarkers({intersectsScreenRowRange: [startScreenRow, endScreenRow]}))) {
        var cursor;
        if (cursor = this.cursorsByMarkerId.get(marker.id)) {
          cursors.push(cursor);
        }
      }
      return cursors;
    }

    // Add a cursor based on the given {DisplayMarker}.
    addCursor(marker) {
      const cursor = new Cursor({editor: this, marker, showCursorOnSelection: this.showCursorOnSelection});
      this.cursors.push(cursor);
      this.cursorsByMarkerId.set(marker.id, cursor);
      return cursor;
    }

    moveCursors(fn) {
      return this.transact(() => {
        for (let cursor of Array.from(this.getCursors())) { fn(cursor); }
        return this.mergeCursors();
      });
    }

    cursorMoved(event) {
      return this.emitter.emit('did-change-cursor-position', event);
    }

    // Merge cursors that have the same screen position
    mergeCursors() {
      const positions = {};
      for (let cursor of Array.from(this.getCursors())) {
        const position = cursor.getBufferPosition().toString();
        if (positions.hasOwnProperty(position)) {
          cursor.destroy();
        } else {
          positions[position] = true;
        }
      }
    }

    /*
    Section: Selections
    */

    // Essential: Get the selected text of the most recently added selection.
    //
    // Returns a {String}.
    getSelectedText() {
      return this.getLastSelection().getText();
    }

    // Essential: Get the {Range} of the most recently added selection in buffer
    // coordinates.
    //
    // Returns a {Range}.
    getSelectedBufferRange() {
      return this.getLastSelection().getBufferRange();
    }

    // Essential: Get the {Range}s of all selections in buffer coordinates.
    //
    // The ranges are sorted by when the selections were added. Most recent at the end.
    //
    // Returns an {Array} of {Range}s.
    getSelectedBufferRanges() {
      return Array.from(this.getSelections()).map((selection) => selection.getBufferRange());
    }

    // Essential: Set the selected range in buffer coordinates. If there are multiple
    // selections, they are reduced to a single selection with the given range.
    //
    // * `bufferRange` A {Range} or range-compatible {Array}.
    // * `options` (optional) An options {Object}:
    //   * `reversed` A {Boolean} indicating whether to create the selection in a
    //     reversed orientation.
    //   * `preserveFolds` A {Boolean}, which if `true` preserves the fold settings after the
    //     selection is set.
    setSelectedBufferRange(bufferRange, options) {
      return this.setSelectedBufferRanges([bufferRange], options);
    }

    // Essential: Set the selected ranges in buffer coordinates. If there are multiple
    // selections, they are replaced by new selections with the given ranges.
    //
    // * `bufferRanges` An {Array} of {Range}s or range-compatible {Array}s.
    // * `options` (optional) An options {Object}:
    //   * `reversed` A {Boolean} indicating whether to create the selection in a
    //     reversed orientation.
    //   * `preserveFolds` A {Boolean}, which if `true` preserves the fold settings after the
    //     selection is set.
    setSelectedBufferRanges(bufferRanges, options) {
      if (options == null) { options = {}; }
      if (!bufferRanges.length) { throw new Error("Passed an empty array to setSelectedBufferRanges"); }

      const selections = this.getSelections();
      for (let selection of Array.from(selections.slice(bufferRanges.length))) { selection.destroy(); }

      return this.mergeIntersectingSelections(options, () => {
        for (let i = 0; i < bufferRanges.length; i++) {
          let bufferRange = bufferRanges[i];
          bufferRange = Range.fromObject(bufferRange);
          if (selections[i]) {
            selections[i].setBufferRange(bufferRange, options);
          } else {
            this.addSelectionForBufferRange(bufferRange, options);
          }
        }
      });
    }

    // Essential: Get the {Range} of the most recently added selection in screen
    // coordinates.
    //
    // Returns a {Range}.
    getSelectedScreenRange() {
      return this.getLastSelection().getScreenRange();
    }

    // Essential: Get the {Range}s of all selections in screen coordinates.
    //
    // The ranges are sorted by when the selections were added. Most recent at the end.
    //
    // Returns an {Array} of {Range}s.
    getSelectedScreenRanges() {
      return Array.from(this.getSelections()).map((selection) => selection.getScreenRange());
    }

    // Essential: Set the selected range in screen coordinates. If there are multiple
    // selections, they are reduced to a single selection with the given range.
    //
    // * `screenRange` A {Range} or range-compatible {Array}.
    // * `options` (optional) An options {Object}:
    //   * `reversed` A {Boolean} indicating whether to create the selection in a
    //     reversed orientation.
    setSelectedScreenRange(screenRange, options) {
      return this.setSelectedBufferRange(this.bufferRangeForScreenRange(screenRange, options), options);
    }

    // Essential: Set the selected ranges in screen coordinates. If there are multiple
    // selections, they are replaced by new selections with the given ranges.
    //
    // * `screenRanges` An {Array} of {Range}s or range-compatible {Array}s.
    // * `options` (optional) An options {Object}:
    //   * `reversed` A {Boolean} indicating whether to create the selection in a
    //     reversed orientation.
    setSelectedScreenRanges(screenRanges, options) {
      if (options == null) { options = {}; }
      if (!screenRanges.length) { throw new Error("Passed an empty array to setSelectedScreenRanges"); }

      const selections = this.getSelections();
      for (let selection of Array.from(selections.slice(screenRanges.length))) { selection.destroy(); }

      return this.mergeIntersectingSelections(options, () => {
        for (let i = 0; i < screenRanges.length; i++) {
          let screenRange = screenRanges[i];
          screenRange = Range.fromObject(screenRange);
          if (selections[i]) {
            selections[i].setScreenRange(screenRange, options);
          } else {
            this.addSelectionForScreenRange(screenRange, options);
          }
        }
      });
    }

    // Essential: Add a selection for the given range in buffer coordinates.
    //
    // * `bufferRange` A {Range}
    // * `options` (optional) An options {Object}:
    //   * `reversed` A {Boolean} indicating whether to create the selection in a
    //     reversed orientation.
    //   * `preserveFolds` A {Boolean}, which if `true` preserves the fold settings after the
    //     selection is set.
    //
    // Returns the added {Selection}.
    addSelectionForBufferRange(bufferRange, options) {
      if (options == null) { options = {}; }
      if (!options.preserveFolds) {
        this.destroyFoldsIntersectingBufferRange(bufferRange);
      }
      this.selectionsMarkerLayer.markBufferRange(bufferRange, {invalidate: 'never', reversed: options.reversed != null ? options.reversed : false});
      if (options.autoscroll !== false) { this.getLastSelection().autoscroll(); }
      return this.getLastSelection();
    }

    // Essential: Add a selection for the given range in screen coordinates.
    //
    // * `screenRange` A {Range}
    // * `options` (optional) An options {Object}:
    //   * `reversed` A {Boolean} indicating whether to create the selection in a
    //     reversed orientation.
    //   * `preserveFolds` A {Boolean}, which if `true` preserves the fold settings after the
    //     selection is set.
    // Returns the added {Selection}.
    addSelectionForScreenRange(screenRange, options) {
      if (options == null) { options = {}; }
      return this.addSelectionForBufferRange(this.bufferRangeForScreenRange(screenRange), options);
    }

    // Essential: Select from the current cursor position to the given position in
    // buffer coordinates.
    //
    // This method may merge selections that end up intesecting.
    //
    // * `position` An instance of {Point}, with a given `row` and `column`.
    selectToBufferPosition(position) {
      const lastSelection = this.getLastSelection();
      lastSelection.selectToBufferPosition(position);
      return this.mergeIntersectingSelections({reversed: lastSelection.isReversed()});
    }

    // Essential: Select from the current cursor position to the given position in
    // screen coordinates.
    //
    // This method may merge selections that end up intesecting.
    //
    // * `position` An instance of {Point}, with a given `row` and `column`.
    selectToScreenPosition(position, options) {
      const lastSelection = this.getLastSelection();
      lastSelection.selectToScreenPosition(position, options);
      if (!(options != null ? options.suppressSelectionMerge : undefined)) {
        return this.mergeIntersectingSelections({reversed: lastSelection.isReversed()});
      }
    }

    // Essential: Move the cursor of each selection one character upward while
    // preserving the selection's tail position.
    //
    // * `rowCount` (optional) {Number} number of rows to select (default: 1)
    //
    // This method may merge selections that end up intesecting.
    selectUp(rowCount) {
      return this.expandSelectionsBackward(selection => selection.selectUp(rowCount));
    }

    // Essential: Move the cursor of each selection one character downward while
    // preserving the selection's tail position.
    //
    // * `rowCount` (optional) {Number} number of rows to select (default: 1)
    //
    // This method may merge selections that end up intesecting.
    selectDown(rowCount) {
      return this.expandSelectionsForward(selection => selection.selectDown(rowCount));
    }

    // Essential: Move the cursor of each selection one character leftward while
    // preserving the selection's tail position.
    //
    // * `columnCount` (optional) {Number} number of columns to select (default: 1)
    //
    // This method may merge selections that end up intesecting.
    selectLeft(columnCount) {
      return this.expandSelectionsBackward(selection => selection.selectLeft(columnCount));
    }

    // Essential: Move the cursor of each selection one character rightward while
    // preserving the selection's tail position.
    //
    // * `columnCount` (optional) {Number} number of columns to select (default: 1)
    //
    // This method may merge selections that end up intesecting.
    selectRight(columnCount) {
      return this.expandSelectionsForward(selection => selection.selectRight(columnCount));
    }

    // Essential: Select from the top of the buffer to the end of the last selection
    // in the buffer.
    //
    // This method merges multiple selections into a single selection.
    selectToTop() {
      return this.expandSelectionsBackward(selection => selection.selectToTop());
    }

    // Essential: Selects from the top of the first selection in the buffer to the end
    // of the buffer.
    //
    // This method merges multiple selections into a single selection.
    selectToBottom() {
      return this.expandSelectionsForward(selection => selection.selectToBottom());
    }

    // Essential: Select all text in the buffer.
    //
    // This method merges multiple selections into a single selection.
    selectAll() {
      return this.expandSelectionsForward(selection => selection.selectAll());
    }

    // Essential: Move the cursor of each selection to the beginning of its line
    // while preserving the selection's tail position.
    //
    // This method may merge selections that end up intesecting.
    selectToBeginningOfLine() {
      return this.expandSelectionsBackward(selection => selection.selectToBeginningOfLine());
    }

    // Essential: Move the cursor of each selection to the first non-whitespace
    // character of its line while preserving the selection's tail position. If the
    // cursor is already on the first character of the line, move it to the
    // beginning of the line.
    //
    // This method may merge selections that end up intersecting.
    selectToFirstCharacterOfLine() {
      return this.expandSelectionsBackward(selection => selection.selectToFirstCharacterOfLine());
    }

    // Essential: Move the cursor of each selection to the end of its line while
    // preserving the selection's tail position.
    //
    // This method may merge selections that end up intersecting.
    selectToEndOfLine() {
      return this.expandSelectionsForward(selection => selection.selectToEndOfLine());
    }

    // Essential: Expand selections to the beginning of their containing word.
    //
    // Operates on all selections. Moves the cursor to the beginning of the
    // containing word while preserving the selection's tail position.
    selectToBeginningOfWord() {
      return this.expandSelectionsBackward(selection => selection.selectToBeginningOfWord());
    }

    // Essential: Expand selections to the end of their containing word.
    //
    // Operates on all selections. Moves the cursor to the end of the containing
    // word while preserving the selection's tail position.
    selectToEndOfWord() {
      return this.expandSelectionsForward(selection => selection.selectToEndOfWord());
    }

    // Extended: For each selection, move its cursor to the preceding subword
    // boundary while maintaining the selection's tail position.
    //
    // This method may merge selections that end up intersecting.
    selectToPreviousSubwordBoundary() {
      return this.expandSelectionsBackward(selection => selection.selectToPreviousSubwordBoundary());
    }

    // Extended: For each selection, move its cursor to the next subword boundary
    // while maintaining the selection's tail position.
    //
    // This method may merge selections that end up intersecting.
    selectToNextSubwordBoundary() {
      return this.expandSelectionsForward(selection => selection.selectToNextSubwordBoundary());
    }

    // Essential: For each cursor, select the containing line.
    //
    // This method merges selections on successive lines.
    selectLinesContainingCursors() {
      return this.expandSelectionsForward(selection => selection.selectLine());
    }

    // Essential: Select the word surrounding each cursor.
    selectWordsContainingCursors() {
      return this.expandSelectionsForward(selection => selection.selectWord());
    }

    // Selection Extended

    // Extended: For each selection, move its cursor to the preceding word boundary
    // while maintaining the selection's tail position.
    //
    // This method may merge selections that end up intersecting.
    selectToPreviousWordBoundary() {
      return this.expandSelectionsBackward(selection => selection.selectToPreviousWordBoundary());
    }

    // Extended: For each selection, move its cursor to the next word boundary while
    // maintaining the selection's tail position.
    //
    // This method may merge selections that end up intersecting.
    selectToNextWordBoundary() {
      return this.expandSelectionsForward(selection => selection.selectToNextWordBoundary());
    }

    // Extended: Expand selections to the beginning of the next word.
    //
    // Operates on all selections. Moves the cursor to the beginning of the next
    // word while preserving the selection's tail position.
    selectToBeginningOfNextWord() {
      return this.expandSelectionsForward(selection => selection.selectToBeginningOfNextWord());
    }

    // Extended: Expand selections to the beginning of the next paragraph.
    //
    // Operates on all selections. Moves the cursor to the beginning of the next
    // paragraph while preserving the selection's tail position.
    selectToBeginningOfNextParagraph() {
      return this.expandSelectionsForward(selection => selection.selectToBeginningOfNextParagraph());
    }

    // Extended: Expand selections to the beginning of the next paragraph.
    //
    // Operates on all selections. Moves the cursor to the beginning of the next
    // paragraph while preserving the selection's tail position.
    selectToBeginningOfPreviousParagraph() {
      return this.expandSelectionsBackward(selection => selection.selectToBeginningOfPreviousParagraph());
    }

    // Extended: Select the range of the given marker if it is valid.
    //
    // * `marker` A {DisplayMarker}
    //
    // Returns the selected {Range} or `undefined` if the marker is invalid.
    selectMarker(marker) {
      if (marker.isValid()) {
        const range = marker.getBufferRange();
        this.setSelectedBufferRange(range);
        return range;
      }
    }

    // Extended: Get the most recently added {Selection}.
    //
    // Returns a {Selection}.
    getLastSelection() {
      this.createLastSelectionIfNeeded();
      return _.last(this.selections);
    }

    getSelectionAtScreenPosition(position) {
      const markers = this.selectionsMarkerLayer.findMarkers({containsScreenPosition: position});
      if (markers.length > 0) {
        return this.cursorsByMarkerId.get(markers[0].id).selection;
      }
    }

    // Extended: Get current {Selection}s.
    //
    // Returns: An {Array} of {Selection}s.
    getSelections() {
      this.createLastSelectionIfNeeded();
      return this.selections.slice();
    }

    // Extended: Get all {Selection}s, ordered by their position in the buffer
    // instead of the order in which they were added.
    //
    // Returns an {Array} of {Selection}s.
    getSelectionsOrderedByBufferPosition() {
      return this.getSelections().sort((a, b) => a.compare(b));
    }

    // Extended: Determine if a given range in buffer coordinates intersects a
    // selection.
    //
    // * `bufferRange` A {Range} or range-compatible {Array}.
    //
    // Returns a {Boolean}.
    selectionIntersectsBufferRange(bufferRange) {
      return _.any(this.getSelections(), selection => selection.intersectsBufferRange(bufferRange));
    }

    // Selections Private

    // Add a similarly-shaped selection to the next eligible line below
    // each selection.
    //
    // Operates on all selections. If the selection is empty, adds an empty
    // selection to the next following non-empty line as close to the current
    // selection's column as possible. If the selection is non-empty, adds a
    // selection to the next line that is long enough for a non-empty selection
    // starting at the same column as the current selection to be added to it.
    addSelectionBelow() {
      return this.expandSelectionsForward(selection => selection.addSelectionBelow());
    }

    // Add a similarly-shaped selection to the next eligible line above
    // each selection.
    //
    // Operates on all selections. If the selection is empty, adds an empty
    // selection to the next preceding non-empty line as close to the current
    // selection's column as possible. If the selection is non-empty, adds a
    // selection to the next line that is long enough for a non-empty selection
    // starting at the same column as the current selection to be added to it.
    addSelectionAbove() {
      return this.expandSelectionsBackward(selection => selection.addSelectionAbove());
    }

    // Calls the given function with each selection, then merges selections
    expandSelectionsForward(fn) {
      return this.mergeIntersectingSelections(() => {
        for (let selection of Array.from(this.getSelections())) { fn(selection); }
      });
    }

    // Calls the given function with each selection, then merges selections in the
    // reversed orientation
    expandSelectionsBackward(fn) {
      return this.mergeIntersectingSelections({reversed: true}, () => {
        for (let selection of Array.from(this.getSelections())) { fn(selection); }
      });
    }

    finalizeSelections() {
      for (let selection of Array.from(this.getSelections())) { selection.finalize(); }
    }

    selectionsForScreenRows(startRow, endRow) {
      return this.getSelections().filter(selection => selection.intersectsScreenRowRange(startRow, endRow));
    }

    // Merges intersecting selections. If passed a function, it executes
    // the function with merging suppressed, then merges intersecting selections
    // afterward.
    mergeIntersectingSelections(...args) {
      return this.mergeSelections(...Array.from(args), function(previousSelection, currentSelection) {
        const exclusive = !currentSelection.isEmpty() && !previousSelection.isEmpty();

        return previousSelection.intersectsWith(currentSelection, exclusive);
      });
    }

    mergeSelectionsOnSameRows(...args) {
      return this.mergeSelections(...Array.from(args), function(previousSelection, currentSelection) {
        const screenRange = currentSelection.getScreenRange();

        return previousSelection.intersectsScreenRowRange(screenRange.start.row, screenRange.end.row);
      });
    }

    avoidMergingSelections(...args) {
      return this.mergeSelections(...Array.from(args), () => false);
    }

    mergeSelections(...args) {
      let fn, left, result;
      const mergePredicate = args.pop();
      if (_.isFunction(_.last(args))) { fn = args.pop(); }
      const options = (left = args.pop()) != null ? left : {};

      if (this.suppressSelectionMerging) { return (typeof fn === 'function' ? fn() : undefined); }

      if (fn != null) {
        this.suppressSelectionMerging = true;
        result = fn();
        this.suppressSelectionMerging = false;
      }

      const reducer = function(disjointSelections, selection) {
        const adjacentSelection = _.last(disjointSelections);
        if (mergePredicate(adjacentSelection, selection)) {
          adjacentSelection.merge(selection, options);
          return disjointSelections;
        } else {
          return disjointSelections.concat([selection]);
        }
      };

      const [head, ...tail] = Array.from(this.getSelectionsOrderedByBufferPosition());
      _.reduce(tail, reducer, [head]);
      if (fn != null) { return result; }
    }

    // Add a {Selection} based on the given {DisplayMarker}.
    //
    // * `marker` The {DisplayMarker} to highlight
    // * `options` (optional) An {Object} that pertains to the {Selection} constructor.
    //
    // Returns the new {Selection}.
    addSelection(marker, options) {
      if (options == null) { options = {}; }
      const cursor = this.addCursor(marker);
      let selection = new Selection(Object.assign({editor: this, marker, cursor}, options));
      this.selections.push(selection);
      const selectionBufferRange = selection.getBufferRange();
      this.mergeIntersectingSelections({preserveFolds: options.preserveFolds});

      if (selection.destroyed) {
        for (selection of Array.from(this.getSelections())) {
          if (selection.intersectsBufferRange(selectionBufferRange)) {
            return selection;
          }
        }
      } else {
        this.emitter.emit('did-add-cursor', cursor);
        this.emitter.emit('did-add-selection', selection);
        return selection;
      }
    }

    // Remove the given selection.
    removeSelection(selection) {
      _.remove(this.cursors, selection.cursor);
      _.remove(this.selections, selection);
      this.cursorsByMarkerId.delete(selection.cursor.marker.id);
      this.emitter.emit('did-remove-cursor', selection.cursor);
      return this.emitter.emit('did-remove-selection', selection);
    }

    // Reduce one or more selections to a single empty selection based on the most
    // recently added cursor.
    clearSelections(options) {
      this.consolidateSelections();
      return this.getLastSelection().clear(options);
    }

    // Reduce multiple selections to the least recently added selection.
    consolidateSelections() {
      const selections = this.getSelections();
      if (selections.length > 1) {
        for (let selection of Array.from(selections.slice(1, (selections.length)))) { selection.destroy(); }
        selections[0].autoscroll({center: true});
        return true;
      } else {
        return false;
      }
    }

    // Called by the selection
    selectionRangeChanged(event) {
      if (this.component != null) {
        this.component.didChangeSelectionRange();
      }
      return this.emitter.emit('did-change-selection-range', event);
    }

    createLastSelectionIfNeeded() {
      if (this.selections.length === 0) {
        return this.addSelectionForBufferRange([[0, 0], [0, 0]], {autoscroll: false, preserveFolds: true});
      }
    }

    /*
    Section: Searching and Replacing
    */

    // Essential: Scan regular expression matches in the entire buffer, calling the
    // given iterator function on each match.
    //
    // `::scan` functions as the replace method as well via the `replace`
    //
    // If you're programmatically modifying the results, you may want to try
    // {::backwardsScanInBufferRange} to avoid tripping over your own changes.
    //
    // * `regex` A {RegExp} to search for.
    // * `options` (optional) {Object}
    //   * `leadingContextLineCount` {Number} default `0`; The number of lines
    //      before the matched line to include in the results object.
    //   * `trailingContextLineCount` {Number} default `0`; The number of lines
    //      after the matched line to include in the results object.
    // * `iterator` A {Function} that's called on each match
    //   * `object` {Object}
    //     * `match` The current regular expression match.
    //     * `matchText` A {String} with the text of the match.
    //     * `range` The {Range} of the match.
    //     * `stop` Call this {Function} to terminate the scan.
    //     * `replace` Call this {Function} with a {String} to replace the match.
    scan(regex, options, iterator) {
      if (options == null) { options = {}; }
      if (_.isFunction(options)) {
        iterator = options;
        options = {};
      }

      return this.buffer.scan(regex, options, iterator);
    }

    // Essential: Scan regular expression matches in a given range, calling the given
    // iterator function on each match.
    //
    // * `regex` A {RegExp} to search for.
    // * `range` A {Range} in which to search.
    // * `iterator` A {Function} that's called on each match with an {Object}
    //   containing the following keys:
    //   * `match` The current regular expression match.
    //   * `matchText` A {String} with the text of the match.
    //   * `range` The {Range} of the match.
    //   * `stop` Call this {Function} to terminate the scan.
    //   * `replace` Call this {Function} with a {String} to replace the match.
    scanInBufferRange(regex, range, iterator) { return this.buffer.scanInRange(regex, range, iterator); }

    // Essential: Scan regular expression matches in a given range in reverse order,
    // calling the given iterator function on each match.
    //
    // * `regex` A {RegExp} to search for.
    // * `range` A {Range} in which to search.
    // * `iterator` A {Function} that's called on each match with an {Object}
    //   containing the following keys:
    //   * `match` The current regular expression match.
    //   * `matchText` A {String} with the text of the match.
    //   * `range` The {Range} of the match.
    //   * `stop` Call this {Function} to terminate the scan.
    //   * `replace` Call this {Function} with a {String} to replace the match.
    backwardsScanInBufferRange(regex, range, iterator) { return this.buffer.backwardsScanInRange(regex, range, iterator); }

    /*
    Section: Tab Behavior
    */

    // Essential: Returns a {Boolean} indicating whether softTabs are enabled for this
    // editor.
    getSoftTabs() { return this.softTabs; }

    // Essential: Enable or disable soft tabs for this editor.
    //
    // * `softTabs` A {Boolean}
    setSoftTabs(softTabs) { this.softTabs = softTabs; return this.update({softTabs: this.softTabs}); }

    // Returns a {Boolean} indicating whether atomic soft tabs are enabled for this editor.
    hasAtomicSoftTabs() { return this.displayLayer.atomicSoftTabs; }

    // Essential: Toggle soft tabs for this editor
    toggleSoftTabs() { return this.setSoftTabs(!this.getSoftTabs()); }

    // Essential: Get the on-screen length of tab characters.
    //
    // Returns a {Number}.
    getTabLength() { return this.tokenizedBuffer.getTabLength(); }

    // Essential: Set the on-screen length of tab characters. Setting this to a
    // {Number} This will override the `editor.tabLength` setting.
    //
    // * `tabLength` {Number} length of a single tab. Setting to `null` will
    //   fallback to using the `editor.tabLength` config setting
    setTabLength(tabLength) { return this.update({tabLength}); }

    // Returns an {Object} representing the current invisible character
    // substitutions for this editor. See {::setInvisibles}.
    getInvisibles() {
      if (!this.mini && this.showInvisibles && (this.invisibles != null)) {
        return this.invisibles;
      } else {
        return {};
      }
    }

    doesShowIndentGuide() { return this.showIndentGuide && !this.mini; }

    getSoftWrapHangingIndentLength() { return this.displayLayer.softWrapHangingIndent; }

    // Extended: Determine if the buffer uses hard or soft tabs.
    //
    // Returns `true` if the first non-comment line with leading whitespace starts
    // with a space character. Returns `false` if it starts with a hard tab (`\t`).
    //
    // Returns a {Boolean} or undefined if no non-comment lines had leading
    // whitespace.
    usesSoftTabs() {
      for (let bufferRow = 0, end = Math.min(1000, this.buffer.getLastRow()), asc = 0 <= end; asc ? bufferRow <= end : bufferRow >= end; asc ? bufferRow++ : bufferRow--) {
        if (this.tokenizedBuffer.tokenizedLines[bufferRow] != null ? this.tokenizedBuffer.tokenizedLines[bufferRow].isComment() : undefined) { continue; }

        const line = this.buffer.lineForRow(bufferRow);
        if (line[0] === ' ') { return true; }
        if (line[0] === '\t') { return false; }
      }

      return undefined;
    }

    // Extended: Get the text representing a single level of indent.
    //
    // If soft tabs are enabled, the text is composed of N spaces, where N is the
    // tab length. Otherwise the text is a tab character (`\t`).
    //
    // Returns a {String}.
    getTabText() { return this.buildIndentString(1); }

    // If soft tabs are enabled, convert all hard tabs to soft tabs in the given
    // {Range}.
    normalizeTabsInBufferRange(bufferRange) {
      if (!this.getSoftTabs()) { return; }
      return this.scanInBufferRange(/\t/g, bufferRange, ({replace}) => replace(this.getTabText()));
    }

    /*
    Section: Soft Wrap Behavior
    */

    // Essential: Determine whether lines in this editor are soft-wrapped.
    //
    // Returns a {Boolean}.
    isSoftWrapped() { return this.softWrapped; }

    // Essential: Enable or disable soft wrapping for this editor.
    //
    // * `softWrapped` A {Boolean}
    //
    // Returns a {Boolean}.
    setSoftWrapped(softWrapped) {
      this.update({softWrapped});
      return this.isSoftWrapped();
    }

    getPreferredLineLength() { return this.preferredLineLength; }

    // Essential: Toggle soft wrapping for this editor
    //
    // Returns a {Boolean}.
    toggleSoftWrapped() { return this.setSoftWrapped(!this.isSoftWrapped()); }

    // Essential: Gets the column at which column will soft wrap
    getSoftWrapColumn() {
      if (this.isSoftWrapped() && !this.mini) {
        if (this.softWrapAtPreferredLineLength) {
          return Math.min(this.getEditorWidthInChars(), this.preferredLineLength);
        } else {
          return this.getEditorWidthInChars();
        }
      } else {
        return MAX_SCREEN_LINE_LENGTH;
      }
    }

    /*
    Section: Indentation
    */

    // Essential: Get the indentation level of the given buffer row.
    //
    // Determines how deeply the given row is indented based on the soft tabs and
    // tab length settings of this editor. Note that if soft tabs are enabled and
    // the tab length is 2, a row with 4 leading spaces would have an indentation
    // level of 2.
    //
    // * `bufferRow` A {Number} indicating the buffer row.
    //
    // Returns a {Number}.
    indentationForBufferRow(bufferRow) {
      return this.indentLevelForLine(this.lineTextForBufferRow(bufferRow));
    }

    // Essential: Set the indentation level for the given buffer row.
    //
    // Inserts or removes hard tabs or spaces based on the soft tabs and tab length
    // settings of this editor in order to bring it to the given indentation level.
    // Note that if soft tabs are enabled and the tab length is 2, a row with 4
    // leading spaces would have an indentation level of 2.
    //
    // * `bufferRow` A {Number} indicating the buffer row.
    // * `newLevel` A {Number} indicating the new indentation level.
    // * `options` (optional) An {Object} with the following keys:
    //   * `preserveLeadingWhitespace` `true` to preserve any whitespace already at
    //      the beginning of the line (default: false).
    setIndentationForBufferRow(bufferRow, newLevel, param) {
      let endColumn;
      if (param == null) { param = {}; }
      const {preserveLeadingWhitespace} = param;
      if (preserveLeadingWhitespace) {
        endColumn = 0;
      } else {
        endColumn = this.lineTextForBufferRow(bufferRow).match(/^\s*/)[0].length;
      }
      const newIndentString = this.buildIndentString(newLevel);
      return this.buffer.setTextInRange([[bufferRow, 0], [bufferRow, endColumn]], newIndentString);
    }

    // Extended: Indent rows intersecting selections by one level.
    indentSelectedRows() {
      return this.mutateSelectedText(selection => selection.indentSelectedRows());
    }

    // Extended: Outdent rows intersecting selections by one level.
    outdentSelectedRows() {
      return this.mutateSelectedText(selection => selection.outdentSelectedRows());
    }

    // Extended: Get the indentation level of the given line of text.
    //
    // Determines how deeply the given line is indented based on the soft tabs and
    // tab length settings of this editor. Note that if soft tabs are enabled and
    // the tab length is 2, a row with 4 leading spaces would have an indentation
    // level of 2.
    //
    // * `line` A {String} representing a line of text.
    //
    // Returns a {Number}.
    indentLevelForLine(line) {
      return this.tokenizedBuffer.indentLevelForLine(line);
    }

    // Extended: Indent rows intersecting selections based on the grammar's suggested
    // indent level.
    autoIndentSelectedRows() {
      return this.mutateSelectedText(selection => selection.autoIndentSelectedRows());
    }

    // Indent all lines intersecting selections. See {Selection::indent} for more
    // information.
    indent(options) {
      if (options == null) { options = {}; }
      if (options.autoIndent == null) { options.autoIndent = this.shouldAutoIndent(); }
      return this.mutateSelectedText(selection => selection.indent(options));
    }

    // Constructs the string used for indents.
    buildIndentString(level, column) {
      if (column == null) { column = 0; }
      if (this.getSoftTabs()) {
        const tabStopViolation = column % this.getTabLength();
        return _.multiplyString(" ", Math.floor(level * this.getTabLength()) - tabStopViolation);
      } else {
        const excessWhitespace = _.multiplyString(' ', Math.round((level - Math.floor(level)) * this.getTabLength()));
        return _.multiplyString("\t", Math.floor(level)) + excessWhitespace;
      }
    }

    /*
    Section: Grammars
    */

    // Essential: Get the current {Grammar} of this editor.
    getGrammar() {
      return this.tokenizedBuffer.grammar;
    }

    // Essential: Set the current {Grammar} of this editor.
    //
    // Assigning a grammar will cause the editor to re-tokenize based on the new
    // grammar.
    //
    // * `grammar` {Grammar}
    setGrammar(grammar) {
      return this.tokenizedBuffer.setGrammar(grammar);
    }

    // Reload the grammar based on the file name.
    reloadGrammar() {
      return this.tokenizedBuffer.reloadGrammar();
    }

    // Experimental: Get a notification when async tokenization is completed.
    onDidTokenize(callback) {
      return this.tokenizedBuffer.onDidTokenize(callback);
    }

    /*
    Section: Managing Syntax Scopes
    */

    // Essential: Returns a {ScopeDescriptor} that includes this editor's language.
    // e.g. `['.source.ruby']`, or `['.source.coffee']`. You can use this with
    // {Config::get} to get language specific config values.
    getRootScopeDescriptor() {
      return this.tokenizedBuffer.rootScopeDescriptor;
    }

    // Essential: Get the syntactic scopeDescriptor for the given position in buffer
    // coordinates. Useful with {Config::get}.
    //
    // For example, if called with a position inside the parameter list of an
    // anonymous CoffeeScript function, the method returns the following array:
    // `["source.coffee", "meta.inline.function.coffee", "variable.parameter.function.coffee"]`
    //
    // * `bufferPosition` A {Point} or {Array} of [row, column].
    //
    // Returns a {ScopeDescriptor}.
    scopeDescriptorForBufferPosition(bufferPosition) {
      return this.tokenizedBuffer.scopeDescriptorForPosition(bufferPosition);
    }

    // Extended: Get the range in buffer coordinates of all tokens surrounding the
    // cursor that match the given scope selector.
    //
    // For example, if you wanted to find the string surrounding the cursor, you
    // could call `editor.bufferRangeForScopeAtCursor(".string.quoted")`.
    //
    // * `scopeSelector` {String} selector. e.g. `'.source.ruby'`
    //
    // Returns a {Range}.
    bufferRangeForScopeAtCursor(scopeSelector) {
      return this.bufferRangeForScopeAtPosition(scopeSelector, this.getCursorBufferPosition());
    }

    bufferRangeForScopeAtPosition(scopeSelector, position) {
      return this.tokenizedBuffer.bufferRangeForScopeAtPosition(scopeSelector, position);
    }

    // Extended: Determine if the given row is entirely a comment
    isBufferRowCommented(bufferRow) {
      let match;
      if (match = this.lineTextForBufferRow(bufferRow).match(/\S/)) {
        if (this.commentScopeSelector == null) { this.commentScopeSelector = new TextMateScopeSelector('comment.*'); }
        return this.commentScopeSelector.matches(this.scopeDescriptorForBufferPosition([bufferRow, match.index]).scopes);
      }
    }

    // Get the scope descriptor at the cursor.
    getCursorScope() {
      return this.getLastCursor().getScopeDescriptor();
    }

    tokenForBufferPosition(bufferPosition) {
      return this.tokenizedBuffer.tokenForPosition(bufferPosition);
    }

    /*
    Section: Clipboard Operations
    */

    // Essential: For each selection, copy the selected text.
    copySelectedText() {
      let maintainClipboard = false;
      for (let selection of Array.from(this.getSelectionsOrderedByBufferPosition())) {
        if (selection.isEmpty()) {
          const previousRange = selection.getBufferRange();
          selection.selectLine();
          selection.copy(maintainClipboard, true);
          selection.setBufferRange(previousRange);
        } else {
          selection.copy(maintainClipboard, false);
        }
        maintainClipboard = true;
      }
    }

    // Private: For each selection, only copy highlighted text.
    copyOnlySelectedText() {
      let maintainClipboard = false;
      for (let selection of Array.from(this.getSelectionsOrderedByBufferPosition())) {
        if (!selection.isEmpty()) {
          selection.copy(maintainClipboard, false);
          maintainClipboard = true;
        }
      }
    }

    // Essential: For each selection, cut the selected text.
    cutSelectedText() {
      let maintainClipboard = false;
      return this.mutateSelectedText(function(selection) {
        if (selection.isEmpty()) {
          selection.selectLine();
          selection.cut(maintainClipboard, true);
        } else {
          selection.cut(maintainClipboard, false);
        }
        return maintainClipboard = true;
      });
    }

    // Essential: For each selection, replace the selected text with the contents of
    // the clipboard.
    //
    // If the clipboard contains the same number of selections as the current
    // editor, each selection will be replaced with the content of the
    // corresponding clipboard selection text.
    //
    // * `options` (optional) See {Selection::insertText}.
    pasteText(options) {
      if (options == null) { options = {}; }
      let {text: clipboardText, metadata} = this.constructor.clipboard.readWithMetadata();
      if (!this.emitWillInsertTextEvent(clipboardText)) { return false; }

      if (metadata == null) { metadata = {}; }
      options.autoIndent = this.shouldAutoIndentOnPaste();

      return this.mutateSelectedText((selection, index) => {
        let fullLine, indentBasis, text;
        if ((metadata.selections != null ? metadata.selections.length : undefined) === this.getSelections().length) {
          ({text, indentBasis, fullLine} = metadata.selections[index]);
        } else {
          ({indentBasis, fullLine} = metadata);
          text = clipboardText;
        }

        delete options.indentBasis;
        const {cursor} = selection;
        if (indentBasis != null) {
          const containsNewlines = text.indexOf('\n') !== -1;
          if (containsNewlines || !cursor.hasPrecedingCharactersOnLine()) {
            if (options.indentBasis == null) { options.indentBasis = indentBasis; }
          }
        }

        let range = null;
        if (fullLine && selection.isEmpty()) {
          const oldPosition = selection.getBufferRange().start;
          selection.setBufferRange([[oldPosition.row, 0], [oldPosition.row, 0]]);
          range = selection.insertText(text, options);
          const newPosition = oldPosition.translate([1, 0]);
          selection.setBufferRange([newPosition, newPosition]);
        } else {
          range = selection.insertText(text, options);
        }

        const didInsertEvent = {text, range};
        return this.emitter.emit('did-insert-text', didInsertEvent);
      });
    }

    // Essential: For each selection, if the selection is empty, cut all characters
    // of the containing screen line following the cursor. Otherwise cut the selected
    // text.
    cutToEndOfLine() {
      let maintainClipboard = false;
      return this.mutateSelectedText(function(selection) {
        selection.cutToEndOfLine(maintainClipboard);
        return maintainClipboard = true;
      });
    }

    // Essential: For each selection, if the selection is empty, cut all characters
    // of the containing buffer line following the cursor. Otherwise cut the
    // selected text.
    cutToEndOfBufferLine() {
      let maintainClipboard = false;
      return this.mutateSelectedText(function(selection) {
        selection.cutToEndOfBufferLine(maintainClipboard);
        return maintainClipboard = true;
      });
    }

    /*
    Section: Folds
    */

    // Essential: Fold the most recent cursor's row based on its indentation level.
    //
    // The fold will extend from the nearest preceding line with a lower
    // indentation level up to the nearest following row with a lower indentation
    // level.
    foldCurrentRow() {
      const bufferRow = this.bufferPositionForScreenPosition(this.getCursorScreenPosition()).row;
      return this.foldBufferRow(bufferRow);
    }

    // Essential: Unfold the most recent cursor's row by one level.
    unfoldCurrentRow() {
      const bufferRow = this.bufferPositionForScreenPosition(this.getCursorScreenPosition()).row;
      return this.unfoldBufferRow(bufferRow);
    }

    // Essential: Fold the given row in buffer coordinates based on its indentation
    // level.
    //
    // If the given row is foldable, the fold will begin there. Otherwise, it will
    // begin at the first foldable row preceding the given row.
    //
    // * `bufferRow` A {Number}.
    foldBufferRow(bufferRow) {
      return this.languageMode.foldBufferRow(bufferRow);
    }

    // Essential: Unfold all folds containing the given row in buffer coordinates.
    //
    // * `bufferRow` A {Number}
    unfoldBufferRow(bufferRow) {
      return this.displayLayer.destroyFoldsIntersectingBufferRange(Range(Point(bufferRow, 0), Point(bufferRow, Infinity)));
    }

    // Extended: For each selection, fold the rows it intersects.
    foldSelectedLines() {
      for (let selection of Array.from(this.getSelections())) { selection.fold(); }
    }

    // Extended: Fold all foldable lines.
    foldAll() {
      return this.languageMode.foldAll();
    }

    // Extended: Unfold all existing folds.
    unfoldAll() {
      this.languageMode.unfoldAll();
      return this.scrollToCursorPosition();
    }

    // Extended: Fold all foldable lines at the given indent level.
    //
    // * `level` A {Number}.
    foldAllAtIndentLevel(level) {
      return this.languageMode.foldAllAtIndentLevel(level);
    }

    // Extended: Determine whether the given row in buffer coordinates is foldable.
    //
    // A *foldable* row is a row that *starts* a row range that can be folded.
    //
    // * `bufferRow` A {Number}
    //
    // Returns a {Boolean}.
    isFoldableAtBufferRow(bufferRow) {
      return this.tokenizedBuffer.isFoldableAtRow(bufferRow);
    }

    // Extended: Determine whether the given row in screen coordinates is foldable.
    //
    // A *foldable* row is a row that *starts* a row range that can be folded.
    //
    // * `bufferRow` A {Number}
    //
    // Returns a {Boolean}.
    isFoldableAtScreenRow(screenRow) {
      return this.isFoldableAtBufferRow(this.bufferRowForScreenRow(screenRow));
    }

    // Extended: Fold the given buffer row if it isn't currently folded, and unfold
    // it otherwise.
    toggleFoldAtBufferRow(bufferRow) {
      if (this.isFoldedAtBufferRow(bufferRow)) {
        return this.unfoldBufferRow(bufferRow);
      } else {
        return this.foldBufferRow(bufferRow);
      }
    }

    // Extended: Determine whether the most recently added cursor's row is folded.
    //
    // Returns a {Boolean}.
    isFoldedAtCursorRow() {
      return this.isFoldedAtBufferRow(this.getCursorBufferPosition().row);
    }

    // Extended: Determine whether the given row in buffer coordinates is folded.
    //
    // * `bufferRow` A {Number}
    //
    // Returns a {Boolean}.
    isFoldedAtBufferRow(bufferRow) {
      const range = Range(
        Point(bufferRow, 0),
        Point(bufferRow, this.buffer.lineLengthForRow(bufferRow))
      );
      return this.displayLayer.foldsIntersectingBufferRange(range).length > 0;
    }

    // Extended: Determine whether the given row in screen coordinates is folded.
    //
    // * `screenRow` A {Number}
    //
    // Returns a {Boolean}.
    isFoldedAtScreenRow(screenRow) {
      return this.isFoldedAtBufferRow(this.bufferRowForScreenRow(screenRow));
    }

    // Creates a new fold between two row numbers.
    //
    // startRow - The row {Number} to start folding at
    // endRow - The row {Number} to end the fold
    //
    // Returns the new {Fold}.
    foldBufferRowRange(startRow, endRow) {
      return this.foldBufferRange(Range(Point(startRow, Infinity), Point(endRow, Infinity)));
    }

    foldBufferRange(range) {
      return this.displayLayer.foldBufferRange(range);
    }

    // Remove any {Fold}s found that intersect the given buffer range.
    destroyFoldsIntersectingBufferRange(bufferRange) {
      return this.displayLayer.destroyFoldsIntersectingBufferRange(bufferRange);
    }

    /*
    Section: Gutters
    */

    // Essential: Add a custom {Gutter}.
    //
    // * `options` An {Object} with the following fields:
    //   * `name` (required) A unique {String} to identify this gutter.
    //   * `priority` (optional) A {Number} that determines stacking order between
    //       gutters. Lower priority items are forced closer to the edges of the
    //       window. (default: -100)
    //   * `visible` (optional) {Boolean} specifying whether the gutter is visible
    //       initially after being created. (default: true)
    //
    // Returns the newly-created {Gutter}.
    addGutter(options) {
      return this.gutterContainer.addGutter(options);
    }

    // Essential: Get this editor's gutters.
    //
    // Returns an {Array} of {Gutter}s.
    getGutters() {
      return this.gutterContainer.getGutters();
    }

    getLineNumberGutter() {
      return this.lineNumberGutter;
    }

    // Essential: Get the gutter with the given name.
    //
    // Returns a {Gutter}, or `null` if no gutter exists for the given name.
    gutterWithName(name) {
      return this.gutterContainer.gutterWithName(name);
    }

    /*
    Section: Scrolling the TextEditor
    */

    // Essential: Scroll the editor to reveal the most recently added cursor if it is
    // off-screen.
    //
    // * `options` (optional) {Object}
    //   * `center` Center the editor around the cursor if possible. (default: true)
    scrollToCursorPosition(options) {
      return this.getLastCursor().autoscroll({center: (options != null ? options.center : undefined) != null ? (options != null ? options.center : undefined) : true});
    }

    // Essential: Scrolls the editor to the given buffer position.
    //
    // * `bufferPosition` An object that represents a buffer position. It can be either
    //   an {Object} (`{row, column}`), {Array} (`[row, column]`), or {Point}
    // * `options` (optional) {Object}
    //   * `center` Center the editor around the position if possible. (default: false)
    scrollToBufferPosition(bufferPosition, options) {
      return this.scrollToScreenPosition(this.screenPositionForBufferPosition(bufferPosition), options);
    }

    // Essential: Scrolls the editor to the given screen position.
    //
    // * `screenPosition` An object that represents a screen position. It can be either
    //    an {Object} (`{row, column}`), {Array} (`[row, column]`), or {Point}
    // * `options` (optional) {Object}
    //   * `center` Center the editor around the position if possible. (default: false)
    scrollToScreenPosition(screenPosition, options) {
      return this.scrollToScreenRange(new Range(screenPosition, screenPosition), options);
    }

    scrollToTop() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::scrollToTop instead.");

      return this.getElement().scrollToTop();
    }

    scrollToBottom() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::scrollToTop instead.");

      return this.getElement().scrollToBottom();
    }

    scrollToScreenRange(screenRange, options) {
      if (options == null) { options = {}; }
      if (options.clip !== false) { screenRange = this.clipScreenRange(screenRange); }
      const scrollEvent = {screenRange, options};
      if (this.component != null) {
        this.component.didRequestAutoscroll(scrollEvent);
      }
      return this.emitter.emit("did-request-autoscroll", scrollEvent);
    }

    getHorizontalScrollbarHeight() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getHorizontalScrollbarHeight instead.");

      return this.getElement().getHorizontalScrollbarHeight();
    }

    getVerticalScrollbarWidth() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getVerticalScrollbarWidth instead.");

      return this.getElement().getVerticalScrollbarWidth();
    }

    pageUp() {
      return this.moveUp(this.getRowsPerPage());
    }

    pageDown() {
      return this.moveDown(this.getRowsPerPage());
    }

    selectPageUp() {
      return this.selectUp(this.getRowsPerPage());
    }

    selectPageDown() {
      return this.selectDown(this.getRowsPerPage());
    }

    // Returns the number of rows per page
    getRowsPerPage() {
      if (this.component != null) {
        const clientHeight = this.component.getScrollContainerClientHeight();
        const lineHeight = this.component.getLineHeight();
        return Math.max(1, Math.ceil(clientHeight / lineHeight));
      } else {
        return 1;
      }
    }

    /*
    Section: Config
    */

    // Experimental: Supply an object that will provide the editor with settings
    // for specific syntactic scopes. See the `ScopedSettingsDelegate` in
    // `text-editor-registry.js` for an example implementation.
    setScopedSettingsDelegate(scopedSettingsDelegate) {
      this.scopedSettingsDelegate = scopedSettingsDelegate;
    }

    // Experimental: Retrieve the {Object} that provides the editor with settings
    // for specific syntactic scopes.
    getScopedSettingsDelegate() { return this.scopedSettingsDelegate; }

    // Experimental: Is auto-indentation enabled for this editor?
    //
    // Returns a {Boolean}.
    shouldAutoIndent() { return this.autoIndent; }

    // Experimental: Is auto-indentation on paste enabled for this editor?
    //
    // Returns a {Boolean}.
    shouldAutoIndentOnPaste() { return this.autoIndentOnPaste; }

    // Experimental: Does this editor allow scrolling past the last line?
    //
    // Returns a {Boolean}.
    getScrollPastEnd() {
      if (this.getAutoHeight()) {
        return false;
      } else {
        return this.scrollPastEnd;
      }
    }

    // Experimental: How fast does the editor scroll in response to mouse wheel
    // movements?
    //
    // Returns a positive {Number}.
    getScrollSensitivity() { return this.scrollSensitivity; }

    // Experimental: Does this editor show cursors while there is a selection?
    //
    // Returns a positive {Boolean}.
    getShowCursorOnSelection() { return this.showCursorOnSelection; }

    // Experimental: Are line numbers enabled for this editor?
    //
    // Returns a {Boolean}
    doesShowLineNumbers() { return this.showLineNumbers; }

    // Experimental: Get the time interval within which text editing operations
    // are grouped together in the editor's undo history.
    //
    // Returns the time interval {Number} in milliseconds.
    getUndoGroupingInterval() { return this.undoGroupingInterval; }

    // Experimental: Get the characters that are *not* considered part of words,
    // for the purpose of word-based cursor movements.
    //
    // Returns a {String} containing the non-word characters.
    getNonWordCharacters(scopes) {
      let left;
      return (left = __guardMethod__(this.scopedSettingsDelegate, 'getNonWordCharacters', o => o.getNonWordCharacters(scopes))) != null ? left : this.nonWordCharacters;
    }

    getCommentStrings(scopes) {
      return __guardMethod__(this.scopedSettingsDelegate, 'getCommentStrings', o => o.getCommentStrings(scopes));
    }

    getIncreaseIndentPattern(scopes) {
      return __guardMethod__(this.scopedSettingsDelegate, 'getIncreaseIndentPattern', o => o.getIncreaseIndentPattern(scopes));
    }

    getDecreaseIndentPattern(scopes) {
      return __guardMethod__(this.scopedSettingsDelegate, 'getDecreaseIndentPattern', o => o.getDecreaseIndentPattern(scopes));
    }

    getDecreaseNextIndentPattern(scopes) {
      return __guardMethod__(this.scopedSettingsDelegate, 'getDecreaseNextIndentPattern', o => o.getDecreaseNextIndentPattern(scopes));
    }

    getFoldEndPattern(scopes) {
      return __guardMethod__(this.scopedSettingsDelegate, 'getFoldEndPattern', o => o.getFoldEndPattern(scopes));
    }

    /*
    Section: Event Handlers
    */

    handleGrammarChange() {
      this.unfoldAll();
      return this.emitter.emit('did-change-grammar', this.getGrammar());
    }

    /*
    Section: TextEditor Rendering
    */

    // Get the Element for the editor.
    getElement() {
      if (this.component != null) {
        return this.component.element;
      } else {
        if (TextEditorComponent == null) { TextEditorComponent = require('./text-editor-component'); }
        if (TextEditorElement == null) { TextEditorElement = require('./text-editor-element'); }
        new TextEditorComponent({
          model: this,
          updatedSynchronously: TextEditorElement.prototype.updatedSynchronously,
          initialScrollTopRow: this.initialScrollTopRow, initialScrollLeftColumn: this.initialScrollLeftColumn
        });
        return this.component.element;
      }
    }

    getAllowedLocations() {
      return ['center'];
    }

    // Essential: Retrieves the greyed out placeholder of a mini editor.
    //
    // Returns a {String}.
    getPlaceholderText() { return this.placeholderText; }

    // Essential: Set the greyed out placeholder of a mini editor. Placeholder text
    // will be displayed when the editor has no content.
    //
    // * `placeholderText` {String} text that is displayed when the editor has no content.
    setPlaceholderText(placeholderText) { return this.update({placeholderText}); }

    pixelPositionForBufferPosition(bufferPosition) {
      Grim.deprecate("This method is deprecated on the model layer. Use `TextEditorElement::pixelPositionForBufferPosition` instead");
      return this.getElement().pixelPositionForBufferPosition(bufferPosition);
    }

    pixelPositionForScreenPosition(screenPosition) {
      Grim.deprecate("This method is deprecated on the model layer. Use `TextEditorElement::pixelPositionForScreenPosition` instead");
      return this.getElement().pixelPositionForScreenPosition(screenPosition);
    }

    getVerticalScrollMargin() {
      const maxScrollMargin = Math.floor(((this.height / this.getLineHeightInPixels()) - 1) / 2);
      return Math.min(this.verticalScrollMargin, maxScrollMargin);
    }

    setVerticalScrollMargin(verticalScrollMargin) { this.verticalScrollMargin = verticalScrollMargin; return this.verticalScrollMargin; }

    getHorizontalScrollMargin() { return Math.min(this.horizontalScrollMargin, Math.floor(((this.width / this.getDefaultCharWidth()) - 1) / 2)); }
    setHorizontalScrollMargin(horizontalScrollMargin) { this.horizontalScrollMargin = horizontalScrollMargin; return this.horizontalScrollMargin; }

    getLineHeightInPixels() { return this.lineHeightInPixels; }
    setLineHeightInPixels(lineHeightInPixels) { this.lineHeightInPixels = lineHeightInPixels; return this.lineHeightInPixels; }

    getKoreanCharWidth() { return this.koreanCharWidth; }
    getHalfWidthCharWidth() { return this.halfWidthCharWidth; }
    getDoubleWidthCharWidth() { return this.doubleWidthCharWidth; }
    getDefaultCharWidth() { return this.defaultCharWidth; }

    ratioForCharacter(character) {
      if (isKoreanCharacter(character)) {
        return this.getKoreanCharWidth() / this.getDefaultCharWidth();
      } else if (isHalfWidthCharacter(character)) {
        return this.getHalfWidthCharWidth() / this.getDefaultCharWidth();
      } else if (isDoubleWidthCharacter(character)) {
        return this.getDoubleWidthCharWidth() / this.getDefaultCharWidth();
      } else {
        return 1;
      }
    }

    setDefaultCharWidth(defaultCharWidth, doubleWidthCharWidth, halfWidthCharWidth, koreanCharWidth) {
      if (doubleWidthCharWidth == null) { doubleWidthCharWidth = defaultCharWidth; }
      if (halfWidthCharWidth == null) { halfWidthCharWidth = defaultCharWidth; }
      if (koreanCharWidth == null) { koreanCharWidth = defaultCharWidth; }
      if ((defaultCharWidth !== this.defaultCharWidth) || ((doubleWidthCharWidth !== this.doubleWidthCharWidth) && (halfWidthCharWidth !== this.halfWidthCharWidth) && (koreanCharWidth !== this.koreanCharWidth))) {
        this.defaultCharWidth = defaultCharWidth;
        this.doubleWidthCharWidth = doubleWidthCharWidth;
        this.halfWidthCharWidth = halfWidthCharWidth;
        this.koreanCharWidth = koreanCharWidth;
        if (this.isSoftWrapped()) {
          this.displayLayer.reset({
            softWrapColumn: this.getSoftWrapColumn()
          });
        }
      }
      return defaultCharWidth;
    }

    setHeight(height) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::setHeight instead.");
      return this.getElement().setHeight(height);
    }

    getHeight() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getHeight instead.");
      return this.getElement().getHeight();
    }

    getAutoHeight() { return this.autoHeight != null ? this.autoHeight : true; }

    getAutoWidth() { return this.autoWidth != null ? this.autoWidth : false; }

    setWidth(width) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::setWidth instead.");
      return this.getElement().setWidth(width);
    }

    getWidth() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getWidth instead.");
      return this.getElement().getWidth();
    }

    // Use setScrollTopRow instead of this method
    setFirstVisibleScreenRow(screenRow) {
      return this.setScrollTopRow(screenRow);
    }

    getFirstVisibleScreenRow() {
      return this.getElement().component.getFirstVisibleRow();
    }

    getLastVisibleScreenRow() {
      return this.getElement().component.getLastVisibleRow();
    }

    getVisibleRowRange() {
      return [this.getFirstVisibleScreenRow(), this.getLastVisibleScreenRow()];
    }

    // Use setScrollLeftColumn instead of this method
    setFirstVisibleScreenColumn(column) {
      return this.setScrollLeftColumn(column);
    }

    getFirstVisibleScreenColumn() {
      return this.getElement().component.getFirstVisibleColumn();
    }

    getScrollTop() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getScrollTop instead.");

      return this.getElement().getScrollTop();
    }

    setScrollTop(scrollTop) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::setScrollTop instead.");

      return this.getElement().setScrollTop(scrollTop);
    }

    getScrollBottom() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getScrollBottom instead.");

      return this.getElement().getScrollBottom();
    }

    setScrollBottom(scrollBottom) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::setScrollBottom instead.");

      return this.getElement().setScrollBottom(scrollBottom);
    }

    getScrollLeft() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getScrollLeft instead.");

      return this.getElement().getScrollLeft();
    }

    setScrollLeft(scrollLeft) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::setScrollLeft instead.");

      return this.getElement().setScrollLeft(scrollLeft);
    }

    getScrollRight() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getScrollRight instead.");

      return this.getElement().getScrollRight();
    }

    setScrollRight(scrollRight) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::setScrollRight instead.");

      return this.getElement().setScrollRight(scrollRight);
    }

    getScrollHeight() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getScrollHeight instead.");

      return this.getElement().getScrollHeight();
    }

    getScrollWidth() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getScrollWidth instead.");

      return this.getElement().getScrollWidth();
    }

    getMaxScrollTop() {
      Grim.deprecate("This is now a view method. Call TextEditorElement::getMaxScrollTop instead.");

      return this.getElement().getMaxScrollTop();
    }

    getScrollTopRow() {
      return this.getElement().component.getScrollTopRow();
    }

    setScrollTopRow(scrollTopRow) {
      return this.getElement().component.setScrollTopRow(scrollTopRow);
    }

    getScrollLeftColumn() {
      return this.getElement().component.getScrollLeftColumn();
    }

    setScrollLeftColumn(scrollLeftColumn) {
      return this.getElement().component.setScrollLeftColumn(scrollLeftColumn);
    }

    intersectsVisibleRowRange(startRow, endRow) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::intersectsVisibleRowRange instead.");

      return this.getElement().intersectsVisibleRowRange(startRow, endRow);
    }

    selectionIntersectsVisibleRowRange(selection) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::selectionIntersectsVisibleRowRange instead.");

      return this.getElement().selectionIntersectsVisibleRowRange(selection);
    }

    screenPositionForPixelPosition(pixelPosition) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::screenPositionForPixelPosition instead.");

      return this.getElement().screenPositionForPixelPosition(pixelPosition);
    }

    pixelRectForScreenRange(screenRange) {
      Grim.deprecate("This is now a view method. Call TextEditorElement::pixelRectForScreenRange instead.");

      return this.getElement().pixelRectForScreenRange(screenRange);
    }

    /*
    Section: Utility
    */

    inspect() {
      return `<TextEditor ${this.id}>`;
    }

    emitWillInsertTextEvent(text) {
      let result = true;
      const cancel = () => result = false;
      const willInsertEvent = {cancel, text};
      this.emitter.emit('will-insert-text', willInsertEvent);
      return result;
    }

    /*
    Section: Language Mode Delegated Methods
    */

    suggestedIndentForBufferRow(bufferRow, options) { return this.languageMode.suggestedIndentForBufferRow(bufferRow, options); }

    autoIndentBufferRow(bufferRow, options) { return this.languageMode.autoIndentBufferRow(bufferRow, options); }

    autoIndentBufferRows(startRow, endRow) { return this.languageMode.autoIndentBufferRows(startRow, endRow); }

    autoDecreaseIndentForBufferRow(bufferRow) { return this.languageMode.autoDecreaseIndentForBufferRow(bufferRow); }

    toggleLineCommentForBufferRow(row) { return this.languageMode.toggleLineCommentsForBufferRow(row); }

    toggleLineCommentsForBufferRows(start, end) { return this.languageMode.toggleLineCommentsForBufferRows(start, end); }
  };
  TextEditor.initClass();
  return TextEditor;
})());

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}