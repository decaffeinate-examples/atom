/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const TextEditor = require('../src/text-editor');

describe("Selection", function() {
  let [buffer, editor, selection] = Array.from([]);

  beforeEach(function() {
    buffer = atom.project.bufferForPathSync('sample.js');
    editor = new TextEditor({buffer, tabLength: 2});
    return selection = editor.getLastSelection();
  });

  afterEach(() => buffer.destroy());

  describe(".deleteSelectedText()", function() {
    describe("when nothing is selected", () =>
      it("deletes nothing", function() {
        selection.setBufferRange([[0, 3], [0, 3]]);
        selection.deleteSelectedText();
        return expect(buffer.lineForRow(0)).toBe("var quicksort = function () {");
      })
    );

    describe("when one line is selected", () =>
      it("deletes selected text and clears the selection", function() {
        selection.setBufferRange([[0, 4], [0, 14]]);
        selection.deleteSelectedText();
        expect(buffer.lineForRow(0)).toBe("var = function () {");

        const endOfLine = buffer.lineForRow(0).length;
        selection.setBufferRange([[0, 0], [0, endOfLine]]);
        selection.deleteSelectedText();
        expect(buffer.lineForRow(0)).toBe("");

        return expect(selection.isEmpty()).toBeTruthy();
      })
    );

    describe("when multiple lines are selected", () =>
      it("deletes selected text and clears the selection", function() {
        selection.setBufferRange([[0, 1], [2, 39]]);
        selection.deleteSelectedText();
        expect(buffer.lineForRow(0)).toBe("v;");
        return expect(selection.isEmpty()).toBeTruthy();
      })
    );

    return describe("when the cursor precedes the tail", () =>
      it("deletes selected text and clears the selection", function() {
        selection.cursor.setScreenPosition([0, 13]);
        selection.selectToScreenPosition([0, 4]);

        selection.delete();
        expect(buffer.lineForRow(0)).toBe("var  = function () {");
        return expect(selection.isEmpty()).toBeTruthy();
      })
    );
  });

  describe(".isReversed()", () =>
    it("returns true if the cursor precedes the tail", function() {
      selection.cursor.setScreenPosition([0, 20]);
      selection.selectToScreenPosition([0, 10]);
      expect(selection.isReversed()).toBeTruthy();

      selection.selectToScreenPosition([0, 25]);
      return expect(selection.isReversed()).toBeFalsy();
    })
  );

  describe(".selectLine(row)", function() {
    describe("when passed a row", () =>
      it("selects the specified row", function() {
        selection.setBufferRange([[2, 4], [3, 4]]);
        selection.selectLine(5);
        return expect(selection.getBufferRange()).toEqual([[5, 0], [6, 0]]);
    })
  );

    return describe("when not passed a row", () =>
      it("selects all rows spanned by the selection", function() {
        selection.setBufferRange([[2, 4], [3, 4]]);
        selection.selectLine();
        return expect(selection.getBufferRange()).toEqual([[2, 0], [4, 0]]);
    })
  );
});

  describe("when only the selection's tail is moved (regression)", () =>
    it("notifies ::onDidChangeRange observers", function() {
      selection.setBufferRange([[2, 0], [2, 10]], {reversed: true});
      const changeScreenRangeHandler = jasmine.createSpy('changeScreenRangeHandler');
      selection.onDidChangeRange(changeScreenRangeHandler);

      buffer.insert([2, 5], 'abc');
      return expect(changeScreenRangeHandler).toHaveBeenCalled();
    })
  );

  describe("when the selection is destroyed", () =>
    it("destroys its marker", function() {
      selection.setBufferRange([[2, 0], [2, 10]]);
      const { marker } = selection;
      selection.destroy();
      return expect(marker.isDestroyed()).toBeTruthy();
    })
  );

  describe(".insertText(text, options)", function() {
    it("allows pasting white space only lines when autoIndent is enabled", function() {
      selection.setBufferRange([[0, 0], [0, 0]]);
      selection.insertText("    \n    \n\n", {autoIndent: true});
      expect(buffer.lineForRow(0)).toBe("    ");
      expect(buffer.lineForRow(1)).toBe("    ");
      return expect(buffer.lineForRow(2)).toBe("");
    });

    it("auto-indents if only a newline is inserted", function() {
      selection.setBufferRange([[2, 0], [3, 0]]);
      selection.insertText("\n", {autoIndent: true});
      return expect(buffer.lineForRow(2)).toBe("  ");
    });

    return it("auto-indents if only a carriage return + newline is inserted", function() {
      selection.setBufferRange([[2, 0], [3, 0]]);
      selection.insertText("\r\n", {autoIndent: true});
      return expect(buffer.lineForRow(2)).toBe("  ");
    });
  });

  return describe(".fold()", function() {
    it("folds the buffer range spanned by the selection", function() {
      selection.setBufferRange([[0, 3], [1, 6]]);
      selection.fold();

      expect(selection.getScreenRange()).toEqual([[0, 4], [0, 4]]);
      expect(selection.getBufferRange()).toEqual([[1, 6], [1, 6]]);
      expect(editor.lineTextForScreenRow(0)).toBe(`var${editor.displayLayer.foldCharacter}sort = function(items) {`);
      return expect(editor.isFoldedAtBufferRow(0)).toBe(true);
    });

    return it("doesn't create a fold when the selection is empty", function() {
      selection.setBufferRange([[0, 3], [0, 3]]);
      selection.fold();

      expect(selection.getScreenRange()).toEqual([[0, 3], [0, 3]]);
      expect(selection.getBufferRange()).toEqual([[0, 3], [0, 3]]);
      expect(editor.lineTextForScreenRow(0)).toBe("var quicksort = function () {");
      return expect(editor.isFoldedAtBufferRow(0)).toBe(false);
    });
  });
});
