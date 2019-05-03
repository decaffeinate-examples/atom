module.exports = {
  fileFilterFn: path => !path.includes('spec/fixtures'),
  codePrefix: '/** @babel */\n',
};
