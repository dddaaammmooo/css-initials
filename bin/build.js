const { dirname, join } = require('path');
const fs = require('fs');
const R = require('ramda');
const mdn = require('mdn-data');
const makeDir = require('make-dir');

const EXCLUDE_LIST = [
  'all',
  'unicode-bidi',
  'direction',
];

const APPEARANCE_FIX = {
  '-webkit-appearance': 'none',
     '-moz-appearance': 'none',
      '-ms-appearance': 'none',
          'appearance': 'none',
};

const USER_AGENT_DEPENDENT_PROPS = [
  'color', 'outline-color', 'quotes', 'text-align', 'box-orient', 'font-family'
];

const cssProps = R.path(['css', 'properties']);

// { [$prop]: valueObj, … } => [ { prop: $prop, value: valueObj }, … ]
const obj2arr = R.pipe(...[
  R.toPairs,
  R.map(R.zipObj(['prop', 'val'])),
]);

// Remove unneccesaery props
// [ { prop: $prop, value: valueObj }, … ] => [ { prop: $prop, value: initialValue }, … ]

const mapVal = fn => R.map(
  R.over(
    R.lensProp('val'),
    fn
  )
);

const initial = R.prop('initial');
const normalize = R.replace(/<\/?code>/g, '');

// [ { prop: $prop, value: initialValue }, … ] => { [$prop]: initialValue, … }
const arr2ObjReducer = (acc, i) => R.merge(
  acc,
  R.pipe(...[
    R.values,
    R.map(R.of),
    R.apply(R.zipObj),
  ])(i)
);

const arr2Obj = R.reduce( arr2ObjReducer, {} );

const fn = (options = {}) => R.pipe(...[
  cssProps,
  obj2arr,
  R.reject(R.either(...[
    // rejecting by prop name
    R.propSatisfies(R.anyPass([
      // `all` prop ignores `unicode-bidi` and `direction` props
      R.contains(R.__, EXCLUDE_LIST)
    ]), 'prop'),
    // rejecting by prop value
    R.propSatisfies(R.anyPass([
      // we don't need experimental props
      R.propEq('status', 'experimental'),
      // we don't need non-standard props
      R.propEq('status', 'nonstandard'),
      // we do need only non-complex props
      R.complement(R.propIs(String, 'initial')),
      // If in herited option is specified - filter by the inherited property.
      ({inherited}) => options.inherited === undefined ? false : inherited !== options.inherited
    ]), 'val')
  ])),
  // we dont need any browser dependent props
  R.map((data) => {
    if (USER_AGENT_DEPENDENT_PROPS.indexOf(data.prop) !== -1) {
      data.val.initial = 'initial'
    }
    return data
  }),
  mapVal(R.pipe(...[
    initial,
    normalize
  ])),
  arr2Obj,
  R.merge(R.__, APPEARANCE_FIX),
]);

const css = R.pipe(...[
  obj2arr,
  R.map(R.pipe(...[
    R.values,
    R.join(': '),
    _ => `  ${_};`
  ])),
  R.join('\n'),
  // R.tap(console.log),
]);

const writeFile = (filepath, content) => {
  return makeDir(dirname(filepath)).then(() => {
    return new Promise((resolve, reject) => {
      fs.writeFile(filepath, content, 'utf8', (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    })
  })
}

const targetDir = join(__dirname, '..');

const writeCss = (res, {selector, filename}) => {
  const cssResult = `${selector} {\n${css(res)}\n}`;
  return writeFile(join(targetDir, `${filename}.css`), cssResult, 'utf8');
};

const writeCJS = (res, {filename}) => {
  const jsonResult = `module.exports = ${JSON.stringify(res, null, 2)};`;
  return writeFile(join(targetDir, `dist/${filename}.cjs.js`), jsonResult)
};

const writeESM = (res, {filename}) => {
  const jsonResult = `export default ${JSON.stringify(res, null, 2)};`;
  return writeFile(join(targetDir, `dist/${filename}.esm.js`), jsonResult)
};

const writePkg = name => {
  const pkg = {
    name: `css-initials/${name}`,
    main: `../dist/${name}.cjs.js`,
    module: `../dist/${name}.esm.js`
  };
  return writeFile(`${name}/package.json`, JSON.stringify(pkg, null, 2));
}

const resAll = fn()(mdn)
const resInherited = fn({inherited: true})(mdn)

Promise
  .all([
    writeCss(resAll, {selector: '.initials-all', filename: 'all'}),
    writeCJS(resAll, {filename: 'all'}),
    writeESM(resAll, {filename: 'all'}),
    writePkg('all'),
    writeCss(resInherited, {selector: '.initials-inherited', filename: 'inherited'}),
    writeCJS(resInherited, {filename: 'inherited'}),
    writeESM(resInherited, {filename: 'inherited'}),
    writePkg('inherited'),
  ])
  .catch((err) => {
    throw err
  })
  .then(() => {
    console.log('☯ All done');
  })
