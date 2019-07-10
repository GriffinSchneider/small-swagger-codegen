"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.readConfig = readConfig;

var _lodash = _interopRequireDefault(require("lodash"));

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _jsYaml = _interopRequireDefault(require("js-yaml"));

var _swift = _interopRequireDefault(require("./swift"));

var _kotlin = _interopRequireDefault(require("./kotlin"));

var _js = _interopRequireDefault(require("./js"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const languages = {
  swift: _swift.default,
  kotlin: _kotlin.default,
  js: _js.default
};

function readFromPath(pathArg) {
  if (!pathArg) {
    return {};
  }

  const configPath = _path.default.resolve(pathArg);

  const configDir = _path.default.dirname(configPath);

  const config = JSON.parse(_fs.default.readFileSync(configPath, 'utf8'));
  return {
    apis: _lodash.default.mapValues(config.specs, specConfig => ({ ...specConfig,
      spec: _path.default.resolve(_path.default.join(configDir, specConfig.spec))
    })),
    languageName: config.language,
    output: config.output,
    opts: config.opts,
    configDir
  };
}

function resolveSpec(fullPath) {
  const ext = (_path.default.extname(fullPath) || '').toLowerCase();

  const data = _fs.default.readFileSync(fullPath, 'utf8');

  if (['.yml', '.yaml'].includes(ext)) {
    return _jsYaml.default.safeLoad(data);
  }

  return JSON.parse(data);
}

function readConfig(argv) {
  var _argv$_;

  const {
    languageName,
    apis,
    output,
    opts,
    configDir
  } = readFromPath((_argv$_ = argv._) === null || _argv$_ === void 0 ? void 0 : _argv$_[0]);
  const language = languages[languageName || argv.language];

  if (!language) {
    const acceptableInputs = Object.keys(languages).map(l => `  "language": "${l}"`).join('\n');
    throw new Error(`Missing or unknown language '${languageName}'. Please add one of the following to the top level of your config file:\n${acceptableInputs}`);
  }

  if (!apis && (!argv.spec || !argv.name)) {
    throw new Error('Missing configuration file or spec/name arguments');
  }

  const rawSpecs = apis || {
    [argv.name]: {
      spec: argv.spec,
      className: argv.className || argv.name,
      basePath: argv.basePath || undefined
    }
  }; // If there's an output path in a config file, resolve the path relative to that config file.

  const resolvedOutput = configDir && output && _path.default.resolve(configDir, output);

  const finalConfig = {
    language,
    apis: _lodash.default.mapValues(rawSpecs, api => ({ ...api,
      // Load the specs from the file system
      spec: resolveSpec(api.spec)
    })),
    output: argv.output || resolvedOutput || 'client',
    opts: opts || argv
  };
  return finalConfig;
}