const { src, dest } = require('gulp');

// Copy node SVG/PNG icons into dist next to their compiled .js.
function buildIcons() {
  return src('nodes/**/*.{png,svg}').pipe(dest('dist/nodes'));
}
exports['build:icons'] = buildIcons;
