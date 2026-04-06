const fs = require('fs');
const path = require('path');

const patches = [
  {
    pkgPath: path.join(__dirname, '../node_modules/@turf/center-of-mass/package.json'),
    patch: (pkg) => {
      pkg.exports = {
        '.': {
          'import': './dist/es/index.js',
          'require': './dist/js/index.js',
          'types': './dist/js/index.d.ts'
        }
      };
      return pkg;
    }
  },
  {
    pkgPath: path.join(__dirname, '../node_modules/@turf/helpers/package.json'),
    patch: (pkg) => {
      pkg.exports = {
        '.': {
          'import': './dist/es/index.js',
          'require': './dist/js/index.js',
          'types': './dist/js/index.d.ts'
        }
      };
      return pkg;
    }
  },
  {
    pkgPath: path.join(__dirname, '../node_modules/react-dat-gui/package.json'),
    patch: (pkg) => {
      pkg.exports = {
        '.': './dist/index.cjs.js',
        './dist/index.css': './dist/index.css'
      };
      return pkg;
    }
  }
];

patches.forEach(({ pkgPath, patch }) => {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const patched = patch(pkg);
  fs.writeFileSync(pkgPath, JSON.stringify(patched, null, 2));
  console.log(`✅ Patched ${pkgPath}`);
});