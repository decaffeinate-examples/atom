/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const isHighSurrogate = charCode => 0xD800 <= charCode && charCode <= 0xDBFF;

const isLowSurrogate = charCode => 0xDC00 <= charCode && charCode <= 0xDFFF;

const isVariationSelector = charCode => 0xFE00 <= charCode && charCode <= 0xFE0F;

const isCombiningCharacter = charCode =>
  (0x0300 <= charCode && charCode <= 0x036F) ||
  (0x1AB0 <= charCode && charCode <= 0x1AFF) ||
  (0x1DC0 <= charCode && charCode <= 0x1DFF) ||
  (0x20D0 <= charCode && charCode <= 0x20FF) ||
  (0xFE20 <= charCode && charCode <= 0xFE2F)
;

// Are the given character codes a high/low surrogate pair?
//
// * `charCodeA` The first character code {Number}.
// * `charCode2` The second character code {Number}.
//
// Return a {Boolean}.
const isSurrogatePair = (charCodeA, charCodeB) => isHighSurrogate(charCodeA) && isLowSurrogate(charCodeB);

// Are the given character codes a variation sequence?
//
// * `charCodeA` The first character code {Number}.
// * `charCode2` The second character code {Number}.
//
// Return a {Boolean}.
const isVariationSequence = (charCodeA, charCodeB) => !isVariationSelector(charCodeA) && isVariationSelector(charCodeB);

// Are the given character codes a combined character pair?
//
// * `charCodeA` The first character code {Number}.
// * `charCode2` The second character code {Number}.
//
// Return a {Boolean}.
const isCombinedCharacter = (charCodeA, charCodeB) => !isCombiningCharacter(charCodeA) && isCombiningCharacter(charCodeB);

// Is the character at the given index the start of high/low surrogate pair
// a variation sequence, or a combined character?
//
// * `string` The {String} to check for a surrogate pair, variation sequence,
//            or combined character.
// * `index`  The {Number} index to look for a surrogate pair, variation
//            sequence, or combined character.
//
// Return a {Boolean}.
const isPairedCharacter = function(string, index) {
  if (index == null) { index = 0; }
  const charCodeA = string.charCodeAt(index);
  const charCodeB = string.charCodeAt(index + 1);
  return isSurrogatePair(charCodeA, charCodeB) ||
  isVariationSequence(charCodeA, charCodeB) ||
  isCombinedCharacter(charCodeA, charCodeB);
};

const IsJapaneseKanaCharacter = charCode => 0x3000 <= charCode && charCode <= 0x30FF;

const isCJKUnifiedIdeograph = charCode => 0x4E00 <= charCode && charCode <= 0x9FFF;

const isFullWidthForm = charCode =>
  (0xFF01 <= charCode && charCode <= 0xFF5E) ||
  (0xFFE0 <= charCode && charCode <= 0xFFE6)
;

const isDoubleWidthCharacter = function(character) {
  const charCode = character.charCodeAt(0);

  return IsJapaneseKanaCharacter(charCode) ||
  isCJKUnifiedIdeograph(charCode) ||
  isFullWidthForm(charCode);
};

const isHalfWidthCharacter = function(character) {
  const charCode = character.charCodeAt(0);

  return (0xFF65 <= charCode && charCode <= 0xFFDC) ||
  (0xFFE8 <= charCode && charCode <= 0xFFEE);
};

const isKoreanCharacter = function(character) {
  const charCode = character.charCodeAt(0);

  return (0xAC00 <= charCode && charCode <= 0xD7A3) ||
  (0x1100 <= charCode && charCode <= 0x11FF) ||
  (0x3130 <= charCode && charCode <= 0x318F) ||
  (0xA960 <= charCode && charCode <= 0xA97F) ||
  (0xD7B0 <= charCode && charCode <= 0xD7FF);
};

const isCJKCharacter = character =>
  isDoubleWidthCharacter(character) ||
  isHalfWidthCharacter(character) ||
  isKoreanCharacter(character)
;

const isWordStart = (previousCharacter, character) =>
  ((previousCharacter === ' ') || (previousCharacter === '\t')) &&
  ((character !== ' ')  && (character !== '\t'))
;

const isWrapBoundary = (previousCharacter, character) => isWordStart(previousCharacter, character) || isCJKCharacter(character);

// Does the given string contain at least surrogate pair, variation sequence,
// or combined character?
//
// * `string` The {String} to check for the presence of paired characters.
//
// Returns a {Boolean}.
const hasPairedCharacter = function(string) {
  let index = 0;
  while (index < string.length) {
    if (isPairedCharacter(string, index)) { return true; }
    index++;
  }
  return false;
};

module.exports = {
  isPairedCharacter, hasPairedCharacter,
  isDoubleWidthCharacter, isHalfWidthCharacter, isKoreanCharacter,
  isWrapBoundary
};
