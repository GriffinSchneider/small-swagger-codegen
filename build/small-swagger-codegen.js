#!/usr/bin/env node
"use strict";

var _minimist = _interopRequireDefault(require("minimist"));

var _configReader = require("./configReader");

var _renderer = require("./renderer");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Process command line args.
const argv = (0, _minimist.default)(process.argv.slice(2)); // eslint-disable-next-line consistent-return

function safeConfigRead() {
  try {
    return (0, _configReader.readConfig)(argv);
  } catch (error) {
    console.error(error.message);
    process.exit(-1);
  }
}

const {
  language,
  apis,
  output,
  opts
} = safeConfigRead();
(0, _renderer.render)(language, apis, opts, output);