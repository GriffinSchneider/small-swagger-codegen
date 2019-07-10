"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.render = render;

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _mkdirp = _interopRequireDefault(require("mkdirp"));

var _lodash = _interopRequireDefault(require("lodash"));

var _handlebars = _interopRequireDefault(require("handlebars"));

var _verify = require("./verify");

var _templateDatasFromSpecs = _interopRequireDefault(require("./templateDatasFromSpecs"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Parse the api specs, render our templates, and write the output files.
// Also functions as the programmatic interface for small-swagger-codegen.
function render(language, apis, options, output) {
  const templateDatas = (0, _templateDatasFromSpecs.default)(apis, language, options);
  (0, _verify.verify)(templateDatas);
  language.configureHandlebars(_handlebars.default);
  const templateSpecs = language.templates;
  const compiledTemplates = templateSpecs.map(({
    source
  }) => {
    if (typeof source === 'function') {
      return source;
    }

    return _handlebars.default.compile(_fs.default.readFileSync(source, 'utf8'));
  });
  templateSpecs.forEach(({
    partial
  }, index) => {
    if (partial) {
      _handlebars.default.registerPartial(partial, compiledTemplates[index]);
    }
  });

  const outputs = _lodash.default.map(templateDatas, (templateData, apiName) => {
    const specConfig = apis[apiName].spec;
    const apiVersion = (options === null || options === void 0 ? void 0 : options.version) || specConfig.info.version;
    return templateSpecs.map(({
      filename,
      partial
    }, index) => {
      if (partial) {
        return null;
      }

      const templateArgs = { ...templateData,
        options,
        apiClassName: apis[apiName].className || apis[apiName].name,
        apiName,
        apiVersion,
        spec: specConfig
      };
      const rendered = compiledTemplates[index](templateArgs);
      return [filename(templateArgs), rendered];
    }).filter(_lodash.default.identity);
  });

  const parts = _lodash.default.fromPairs(_lodash.default.flatten(outputs));

  if (output) {
    Object.entries(parts).forEach(([filename, content]) => {
      const fullPath = _path.default.join(output, filename);

      _mkdirp.default.sync(_path.default.dirname(fullPath));

      _fs.default.writeFileSync(fullPath, content);
    });
  }

  return parts;
}