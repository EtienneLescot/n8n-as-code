#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb2, mod) => function __require() {
  return mod || (0, cb2[__getOwnPropNames(cb2)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/commander/lib/error.js
var require_error = __commonJS({
  "../../node_modules/commander/lib/error.js"(exports2) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @constructor
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       * @constructor
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
  }
});

// ../../node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "../../node_modules/commander/lib/argument.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @api private
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(`Allowed choices are ${this.argChoices.join(", ")}.`);
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports2.Argument = Argument2;
    exports2.humanReadableArgName = humanReadableArgName;
  }
});

// ../../node_modules/commander/lib/help.js
var require_help = __commonJS({
  "../../node_modules/commander/lib/help.js"(exports2) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        if (cmd._hasImplicitHelpCommand()) {
          const [, helpName, helpArgs] = cmd._helpCommandnameAndArgs.match(/([^ ]+) *(.*)/);
          const helpCommand = cmd.createCommand(helpName).helpOption(false);
          helpCommand.description(cmd._helpCommandDescription);
          if (helpArgs) helpCommand.arguments(helpArgs);
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns number
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const showShortHelpFlag = cmd._hasHelpOption && cmd._helpShortFlag && !cmd._findOption(cmd._helpShortFlag);
        const showLongHelpFlag = cmd._hasHelpOption && !cmd._findOption(cmd._helpLongFlag);
        if (showShortHelpFlag || showLongHelpFlag) {
          let helpOption;
          if (!showShortHelpFlag) {
            helpOption = cmd.createOption(cmd._helpLongFlag, cmd._helpDescription);
          } else if (!showLongHelpFlag) {
            helpOption = cmd.createOption(cmd._helpShortFlag, cmd._helpDescription);
          } else {
            helpOption = cmd.createOption(cmd._helpFlags, cmd._helpDescription);
          }
          visibleOptions.push(helpOption);
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter((option) => !option.hidden);
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([helper.wrap(commandDescription, helpWidth, 0), ""]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(helper.optionTerm(option), helper.optionDescription(option));
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(helper.optionTerm(option), helper.optionDescription(option));
          });
          if (globalOptionList.length > 0) {
            output = output.concat(["Global Options:", formatList(globalOptionList), ""]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(helper.subcommandTerm(cmd2), helper.subcommandDescription(cmd2));
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str.match(manualIndent)) return str;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) return str;
        const leadingStr = str.slice(0, indent);
        const columnText = str.slice(indent).replace("\r\n", "\n");
        const indentString = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(`
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`, "g");
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i) => {
          if (line === "\n") return "";
          return (i > 0 ? indentString : "") + line.trimEnd();
        }).join("\n");
      }
    };
    exports2.Help = Help2;
  }
});

// ../../node_modules/commander/lib/option.js
var require_option = __commonJS({
  "../../node_modules/commander/lib/option.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {string | string[]} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {Object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @api private
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(`Allowed choices are ${this.argChoices.join(", ")}.`);
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       * @api private
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @api private
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @api private
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1])) shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports2.Option = Option2;
    exports2.splitOptionFlags = splitOptionFlags;
    exports2.DualOptions = DualOptions;
  }
});

// ../../node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "../../node_modules/commander/lib/suggestSimilar.js"(exports2) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance) return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports2.suggestSimilar = suggestSimilar;
  }
});

// ../../node_modules/commander/lib/command.js
var require_command = __commonJS({
  "../../node_modules/commander/lib/command.js"(exports2) {
    var EventEmitter = require("events").EventEmitter;
    var childProcess = require("child_process");
    var path5 = require("path");
    var fs7 = require("fs");
    var process2 = require("process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, splitOptionFlags, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          outputError: (str, write) => write(str)
        };
        this._hidden = false;
        this._hasHelpOption = true;
        this._helpFlags = "-h, --help";
        this._helpDescription = "display help for command";
        this._helpShortFlag = "-h";
        this._helpLongFlag = "--help";
        this._addImplicitHelpCommand = void 0;
        this._helpCommandName = "help";
        this._helpCommandnameAndArgs = "help [command]";
        this._helpCommandDescription = "display help for command";
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._hasHelpOption = sourceCommand._hasHelpOption;
        this._helpFlags = sourceCommand._helpFlags;
        this._helpDescription = sourceCommand._helpDescription;
        this._helpShortFlag = sourceCommand._helpShortFlag;
        this._helpLongFlag = sourceCommand._helpLongFlag;
        this._helpCommandName = sourceCommand._helpCommandName;
        this._helpCommandnameAndArgs = sourceCommand._helpCommandnameAndArgs;
        this._helpCommandDescription = sourceCommand._helpCommandDescription;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @api private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {Object|string} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {Object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this.commands.push(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {Object} [configuration] - configuration options
       * @return {Command|Object} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {Object} [configuration] - configuration options
       * @return {Command|Object} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {boolean|string} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {Object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this.commands.push(cmd);
        cmd.parent = this;
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {Function|*} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Override default decision whether to add implicit help command.
       *
       *    addHelpCommand() // force on
       *    addHelpCommand(false); // force off
       *    addHelpCommand('help [cmd]', 'display help for [cmd]'); // force on with custom details
       *
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(enableOrNameAndArgs, description) {
        if (enableOrNameAndArgs === false) {
          this._addImplicitHelpCommand = false;
        } else {
          this._addImplicitHelpCommand = true;
          if (typeof enableOrNameAndArgs === "string") {
            this._helpCommandName = enableOrNameAndArgs.split(" ")[0];
            this._helpCommandnameAndArgs = enableOrNameAndArgs;
          }
          this._helpCommandDescription = description || this._helpCommandDescription;
        }
        return this;
      }
      /**
       * @return {boolean}
       * @api private
       */
      _hasImplicitHelpCommand() {
        if (this._addImplicitHelpCommand === void 0) {
          return this.commands.length && !this._actionHandler && !this._findCommand("help");
        }
        return this._addImplicitHelpCommand;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @api private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {Option | Argument} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @api private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(name, option.defaultValue === void 0 ? true : option.defaultValue, "default");
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        this.options.push(option);
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @api private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {Function|*} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
      * Add a required option which must have a value after parsing. This usually means
      * the option must be specified on the command line. (Otherwise the same as .option().)
      *
      * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
      *
      * @param {string} flags
      * @param {string} [description]
      * @param {Function|*} [parseArg] - custom option processing function or default value
      * @param {*} [defaultValue]
      * @return {Command} `this` command for chaining
      */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {Boolean} [combine=true] - if `true` or omitted, an optional value can be specified directly after the flag.
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {Boolean} [allowUnknown=true] - if `true` or omitted, no error will be thrown
       * for unknown options.
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {Boolean} [allowExcess=true] - if `true` or omitted, no error will be thrown
       * for excess arguments.
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {Boolean} [positional=true]
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {Boolean} [passThrough=true]
       * for unknown options.
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        if (!!this.parent && passThrough && !this.parent._enablePositionalOptions) {
          throw new Error("passThroughOptions can not be used without turning on enablePositionalOptions for parent command(s)");
        }
        return this;
      }
      /**
        * Whether to store option values as properties on command object,
        * or store separately (specify false). In both cases the option values can be accessed using .opts().
        *
        * @param {boolean} [storeAsProperties=true]
        * @return {Command} `this` command for chaining
        */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {Object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {Object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
        * Store option value and where the value came from.
        *
        * @param {string} key
        * @param {Object} value
        * @param {string} source - expected values are default/config/env/cli/implied
        * @return {Command} `this` command for chaining
        */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
        * Get source of option value.
        * Expected values are default | config | env | cli | implied
        *
        * @param {string} key
        * @return {string}
        */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
        * Get source of option value. See also .optsWithGlobals().
        * Expected values are default | config | env | cli | implied
        *
        * @param {string} key
        * @return {string}
        */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @api private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0) {
          argv = process2.argv;
          if (process2.versions && process2.versions.electron) {
            parseOptions.from = "electron";
          }
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          default:
            throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
        }
        if (!this._name && this._scriptPath) this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * The default expectation is that the arguments are from node and have the application as argv[0]
       * and the script being run in argv[1], with user parameters after that.
       *
       * @example
       * program.parse(process.argv);
       * program.parse(); // implicitly use process.argv and auto-detect node vs electron conventions
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {Object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async. Returns a Promise.
       *
       * The default expectation is that the arguments are from node and have the application as argv[0]
       * and the script being run in argv[1], with user parameters after that.
       *
       * @example
       * await program.parseAsync(process.argv);
       * await program.parseAsync(); // implicitly use process.argv and auto-detect node vs electron conventions
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {Object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @api private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path5.resolve(baseDir, baseName);
          if (fs7.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path5.extname(baseName))) return void 0;
          const foundExt = sourceExt.find((ext) => fs7.existsSync(`${localBin}${ext}`));
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs7.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path5.resolve(path5.dirname(resolvedScriptPath), executableDir);
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path5.basename(this._scriptPath, path5.extname(this._scriptPath));
            if (legacyName !== this._name) {
              localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path5.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        if (!exitCallback) {
          proc.on("close", process2.exit.bind(process2));
        } else {
          proc.on("close", () => {
            exitCallback(new CommanderError2(process2.exitCode || 0, "commander.executeSubCommandAsync", "(close)"));
          });
        }
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(1, "commander.executeSubCommandAsync", "(error)");
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @api private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, "preSubcommand");
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @api private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(subcommandName, [], [
          this._helpLongFlag || this._helpShortFlag
        ]);
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @api private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @api private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {Promise|undefined} promise
       * @param {Function} fn
       * @return {Promise|undefined}
       * @api private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {Promise|undefined} promise
       * @param {string} event
       * @return {Promise|undefined}
       * @api private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {Promise|undefined} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {Promise|undefined}
       * @api private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @api private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._hasImplicitHelpCommand() && operands[0] === this._helpCommandName) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          outputHelpIfRequested(this, unknown);
          return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        outputHelpIfRequested(this, parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(promiseChain, () => this._actionHandler(this.processedArgs));
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @api private
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @api private
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @api private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @api private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter(
          (option) => {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0) {
              return false;
            }
            return this.getOptionValueSource(optionKey) !== "default";
          }
        );
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @api private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {String[]} argv
       * @return {{operands: String[], unknown: String[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (arg === this._helpCommandName && this._hasImplicitHelpCommand()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {Object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {Object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {Object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(`${message}
`, this._outputConfiguration.writeErr);
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @api private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(this.getOptionValueSource(optionKey))) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @api private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter((option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @api private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @api private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @api private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @api private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
          const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @api private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @api private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @api private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {this | string | undefined} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this.options.push(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {Object} [argsDescription]
       * @return {string|Command}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0) return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {string|Command}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {string|Command}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name) throw new Error("Command alias can't be the same as its name");
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {string[]|Command}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {String|Command}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._hasHelpOption ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {string|Command}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path5.basename(filename, path5.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {string|null|Command}
       */
      executableDir(path6) {
        if (path6 === void 0) return this._executableDir;
        this._executableDir = path6;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @api private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._helpLongFlag) {
          this.emit(this._helpLongFlag);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach((command) => command.emit("afterAllHelp", context));
      }
      /**
       * You can pass in flags and a description to override the help
       * flags and help description for your command. Pass in false to
       * disable the built-in help option.
       *
       * @param {string | boolean} [flags]
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          this._hasHelpOption = flags;
          return this;
        }
        this._helpFlags = flags || this._helpFlags;
        this._helpDescription = description || this._helpDescription;
        const helpFlags = splitOptionFlags(this._helpFlags);
        this._helpShortFlag = helpFlags.shortFlag;
        this._helpLongFlag = helpFlags.longFlag;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process2.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {string | Function} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
    };
    function outputHelpIfRequested(cmd, args) {
      const helpOption = cmd._hasHelpOption && args.find((arg) => arg === cmd._helpLongFlag || arg === cmd._helpShortFlag);
      if (helpOption) {
        cmd.outputHelp();
        cmd._exit(0, "commander.helpDisplayed", "(outputHelp)");
      }
    }
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports2.Command = Command2;
  }
});

// ../../node_modules/commander/index.js
var require_commander = __commonJS({
  "../../node_modules/commander/index.js"(exports2, module2) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports2 = module2.exports = new Command2();
    exports2.program = exports2;
    exports2.Command = Command2;
    exports2.Option = Option2;
    exports2.Argument = Argument2;
    exports2.Help = Help2;
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
    exports2.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// ../../node_modules/color-name/index.js
var require_color_name = __commonJS({
  "../../node_modules/color-name/index.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      "aliceblue": [240, 248, 255],
      "antiquewhite": [250, 235, 215],
      "aqua": [0, 255, 255],
      "aquamarine": [127, 255, 212],
      "azure": [240, 255, 255],
      "beige": [245, 245, 220],
      "bisque": [255, 228, 196],
      "black": [0, 0, 0],
      "blanchedalmond": [255, 235, 205],
      "blue": [0, 0, 255],
      "blueviolet": [138, 43, 226],
      "brown": [165, 42, 42],
      "burlywood": [222, 184, 135],
      "cadetblue": [95, 158, 160],
      "chartreuse": [127, 255, 0],
      "chocolate": [210, 105, 30],
      "coral": [255, 127, 80],
      "cornflowerblue": [100, 149, 237],
      "cornsilk": [255, 248, 220],
      "crimson": [220, 20, 60],
      "cyan": [0, 255, 255],
      "darkblue": [0, 0, 139],
      "darkcyan": [0, 139, 139],
      "darkgoldenrod": [184, 134, 11],
      "darkgray": [169, 169, 169],
      "darkgreen": [0, 100, 0],
      "darkgrey": [169, 169, 169],
      "darkkhaki": [189, 183, 107],
      "darkmagenta": [139, 0, 139],
      "darkolivegreen": [85, 107, 47],
      "darkorange": [255, 140, 0],
      "darkorchid": [153, 50, 204],
      "darkred": [139, 0, 0],
      "darksalmon": [233, 150, 122],
      "darkseagreen": [143, 188, 143],
      "darkslateblue": [72, 61, 139],
      "darkslategray": [47, 79, 79],
      "darkslategrey": [47, 79, 79],
      "darkturquoise": [0, 206, 209],
      "darkviolet": [148, 0, 211],
      "deeppink": [255, 20, 147],
      "deepskyblue": [0, 191, 255],
      "dimgray": [105, 105, 105],
      "dimgrey": [105, 105, 105],
      "dodgerblue": [30, 144, 255],
      "firebrick": [178, 34, 34],
      "floralwhite": [255, 250, 240],
      "forestgreen": [34, 139, 34],
      "fuchsia": [255, 0, 255],
      "gainsboro": [220, 220, 220],
      "ghostwhite": [248, 248, 255],
      "gold": [255, 215, 0],
      "goldenrod": [218, 165, 32],
      "gray": [128, 128, 128],
      "green": [0, 128, 0],
      "greenyellow": [173, 255, 47],
      "grey": [128, 128, 128],
      "honeydew": [240, 255, 240],
      "hotpink": [255, 105, 180],
      "indianred": [205, 92, 92],
      "indigo": [75, 0, 130],
      "ivory": [255, 255, 240],
      "khaki": [240, 230, 140],
      "lavender": [230, 230, 250],
      "lavenderblush": [255, 240, 245],
      "lawngreen": [124, 252, 0],
      "lemonchiffon": [255, 250, 205],
      "lightblue": [173, 216, 230],
      "lightcoral": [240, 128, 128],
      "lightcyan": [224, 255, 255],
      "lightgoldenrodyellow": [250, 250, 210],
      "lightgray": [211, 211, 211],
      "lightgreen": [144, 238, 144],
      "lightgrey": [211, 211, 211],
      "lightpink": [255, 182, 193],
      "lightsalmon": [255, 160, 122],
      "lightseagreen": [32, 178, 170],
      "lightskyblue": [135, 206, 250],
      "lightslategray": [119, 136, 153],
      "lightslategrey": [119, 136, 153],
      "lightsteelblue": [176, 196, 222],
      "lightyellow": [255, 255, 224],
      "lime": [0, 255, 0],
      "limegreen": [50, 205, 50],
      "linen": [250, 240, 230],
      "magenta": [255, 0, 255],
      "maroon": [128, 0, 0],
      "mediumaquamarine": [102, 205, 170],
      "mediumblue": [0, 0, 205],
      "mediumorchid": [186, 85, 211],
      "mediumpurple": [147, 112, 219],
      "mediumseagreen": [60, 179, 113],
      "mediumslateblue": [123, 104, 238],
      "mediumspringgreen": [0, 250, 154],
      "mediumturquoise": [72, 209, 204],
      "mediumvioletred": [199, 21, 133],
      "midnightblue": [25, 25, 112],
      "mintcream": [245, 255, 250],
      "mistyrose": [255, 228, 225],
      "moccasin": [255, 228, 181],
      "navajowhite": [255, 222, 173],
      "navy": [0, 0, 128],
      "oldlace": [253, 245, 230],
      "olive": [128, 128, 0],
      "olivedrab": [107, 142, 35],
      "orange": [255, 165, 0],
      "orangered": [255, 69, 0],
      "orchid": [218, 112, 214],
      "palegoldenrod": [238, 232, 170],
      "palegreen": [152, 251, 152],
      "paleturquoise": [175, 238, 238],
      "palevioletred": [219, 112, 147],
      "papayawhip": [255, 239, 213],
      "peachpuff": [255, 218, 185],
      "peru": [205, 133, 63],
      "pink": [255, 192, 203],
      "plum": [221, 160, 221],
      "powderblue": [176, 224, 230],
      "purple": [128, 0, 128],
      "rebeccapurple": [102, 51, 153],
      "red": [255, 0, 0],
      "rosybrown": [188, 143, 143],
      "royalblue": [65, 105, 225],
      "saddlebrown": [139, 69, 19],
      "salmon": [250, 128, 114],
      "sandybrown": [244, 164, 96],
      "seagreen": [46, 139, 87],
      "seashell": [255, 245, 238],
      "sienna": [160, 82, 45],
      "silver": [192, 192, 192],
      "skyblue": [135, 206, 235],
      "slateblue": [106, 90, 205],
      "slategray": [112, 128, 144],
      "slategrey": [112, 128, 144],
      "snow": [255, 250, 250],
      "springgreen": [0, 255, 127],
      "steelblue": [70, 130, 180],
      "tan": [210, 180, 140],
      "teal": [0, 128, 128],
      "thistle": [216, 191, 216],
      "tomato": [255, 99, 71],
      "turquoise": [64, 224, 208],
      "violet": [238, 130, 238],
      "wheat": [245, 222, 179],
      "white": [255, 255, 255],
      "whitesmoke": [245, 245, 245],
      "yellow": [255, 255, 0],
      "yellowgreen": [154, 205, 50]
    };
  }
});

// ../../node_modules/color-convert/conversions.js
var require_conversions = __commonJS({
  "../../node_modules/color-convert/conversions.js"(exports2, module2) {
    var cssKeywords = require_color_name();
    var reverseKeywords = {};
    for (const key of Object.keys(cssKeywords)) {
      reverseKeywords[cssKeywords[key]] = key;
    }
    var convert = {
      rgb: { channels: 3, labels: "rgb" },
      hsl: { channels: 3, labels: "hsl" },
      hsv: { channels: 3, labels: "hsv" },
      hwb: { channels: 3, labels: "hwb" },
      cmyk: { channels: 4, labels: "cmyk" },
      xyz: { channels: 3, labels: "xyz" },
      lab: { channels: 3, labels: "lab" },
      lch: { channels: 3, labels: "lch" },
      hex: { channels: 1, labels: ["hex"] },
      keyword: { channels: 1, labels: ["keyword"] },
      ansi16: { channels: 1, labels: ["ansi16"] },
      ansi256: { channels: 1, labels: ["ansi256"] },
      hcg: { channels: 3, labels: ["h", "c", "g"] },
      apple: { channels: 3, labels: ["r16", "g16", "b16"] },
      gray: { channels: 1, labels: ["gray"] }
    };
    module2.exports = convert;
    for (const model of Object.keys(convert)) {
      if (!("channels" in convert[model])) {
        throw new Error("missing channels property: " + model);
      }
      if (!("labels" in convert[model])) {
        throw new Error("missing channel labels property: " + model);
      }
      if (convert[model].labels.length !== convert[model].channels) {
        throw new Error("channel and label counts mismatch: " + model);
      }
      const { channels, labels } = convert[model];
      delete convert[model].channels;
      delete convert[model].labels;
      Object.defineProperty(convert[model], "channels", { value: channels });
      Object.defineProperty(convert[model], "labels", { value: labels });
    }
    convert.rgb.hsl = function(rgb) {
      const r = rgb[0] / 255;
      const g = rgb[1] / 255;
      const b = rgb[2] / 255;
      const min = Math.min(r, g, b);
      const max = Math.max(r, g, b);
      const delta = max - min;
      let h;
      let s;
      if (max === min) {
        h = 0;
      } else if (r === max) {
        h = (g - b) / delta;
      } else if (g === max) {
        h = 2 + (b - r) / delta;
      } else if (b === max) {
        h = 4 + (r - g) / delta;
      }
      h = Math.min(h * 60, 360);
      if (h < 0) {
        h += 360;
      }
      const l = (min + max) / 2;
      if (max === min) {
        s = 0;
      } else if (l <= 0.5) {
        s = delta / (max + min);
      } else {
        s = delta / (2 - max - min);
      }
      return [h, s * 100, l * 100];
    };
    convert.rgb.hsv = function(rgb) {
      let rdif;
      let gdif;
      let bdif;
      let h;
      let s;
      const r = rgb[0] / 255;
      const g = rgb[1] / 255;
      const b = rgb[2] / 255;
      const v = Math.max(r, g, b);
      const diff = v - Math.min(r, g, b);
      const diffc = function(c) {
        return (v - c) / 6 / diff + 1 / 2;
      };
      if (diff === 0) {
        h = 0;
        s = 0;
      } else {
        s = diff / v;
        rdif = diffc(r);
        gdif = diffc(g);
        bdif = diffc(b);
        if (r === v) {
          h = bdif - gdif;
        } else if (g === v) {
          h = 1 / 3 + rdif - bdif;
        } else if (b === v) {
          h = 2 / 3 + gdif - rdif;
        }
        if (h < 0) {
          h += 1;
        } else if (h > 1) {
          h -= 1;
        }
      }
      return [
        h * 360,
        s * 100,
        v * 100
      ];
    };
    convert.rgb.hwb = function(rgb) {
      const r = rgb[0];
      const g = rgb[1];
      let b = rgb[2];
      const h = convert.rgb.hsl(rgb)[0];
      const w2 = 1 / 255 * Math.min(r, Math.min(g, b));
      b = 1 - 1 / 255 * Math.max(r, Math.max(g, b));
      return [h, w2 * 100, b * 100];
    };
    convert.rgb.cmyk = function(rgb) {
      const r = rgb[0] / 255;
      const g = rgb[1] / 255;
      const b = rgb[2] / 255;
      const k = Math.min(1 - r, 1 - g, 1 - b);
      const c = (1 - r - k) / (1 - k) || 0;
      const m = (1 - g - k) / (1 - k) || 0;
      const y = (1 - b - k) / (1 - k) || 0;
      return [c * 100, m * 100, y * 100, k * 100];
    };
    function comparativeDistance(x, y) {
      return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
    }
    convert.rgb.keyword = function(rgb) {
      const reversed = reverseKeywords[rgb];
      if (reversed) {
        return reversed;
      }
      let currentClosestDistance = Infinity;
      let currentClosestKeyword;
      for (const keyword of Object.keys(cssKeywords)) {
        const value = cssKeywords[keyword];
        const distance = comparativeDistance(rgb, value);
        if (distance < currentClosestDistance) {
          currentClosestDistance = distance;
          currentClosestKeyword = keyword;
        }
      }
      return currentClosestKeyword;
    };
    convert.keyword.rgb = function(keyword) {
      return cssKeywords[keyword];
    };
    convert.rgb.xyz = function(rgb) {
      let r = rgb[0] / 255;
      let g = rgb[1] / 255;
      let b = rgb[2] / 255;
      r = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
      g = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
      b = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;
      const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
      const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
      return [x * 100, y * 100, z * 100];
    };
    convert.rgb.lab = function(rgb) {
      const xyz = convert.rgb.xyz(rgb);
      let x = xyz[0];
      let y = xyz[1];
      let z = xyz[2];
      x /= 95.047;
      y /= 100;
      z /= 108.883;
      x = x > 8856e-6 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
      y = y > 8856e-6 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
      z = z > 8856e-6 ? z ** (1 / 3) : 7.787 * z + 16 / 116;
      const l = 116 * y - 16;
      const a = 500 * (x - y);
      const b = 200 * (y - z);
      return [l, a, b];
    };
    convert.hsl.rgb = function(hsl) {
      const h = hsl[0] / 360;
      const s = hsl[1] / 100;
      const l = hsl[2] / 100;
      let t2;
      let t3;
      let val;
      if (s === 0) {
        val = l * 255;
        return [val, val, val];
      }
      if (l < 0.5) {
        t2 = l * (1 + s);
      } else {
        t2 = l + s - l * s;
      }
      const t1 = 2 * l - t2;
      const rgb = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        t3 = h + 1 / 3 * -(i - 1);
        if (t3 < 0) {
          t3++;
        }
        if (t3 > 1) {
          t3--;
        }
        if (6 * t3 < 1) {
          val = t1 + (t2 - t1) * 6 * t3;
        } else if (2 * t3 < 1) {
          val = t2;
        } else if (3 * t3 < 2) {
          val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
        } else {
          val = t1;
        }
        rgb[i] = val * 255;
      }
      return rgb;
    };
    convert.hsl.hsv = function(hsl) {
      const h = hsl[0];
      let s = hsl[1] / 100;
      let l = hsl[2] / 100;
      let smin = s;
      const lmin = Math.max(l, 0.01);
      l *= 2;
      s *= l <= 1 ? l : 2 - l;
      smin *= lmin <= 1 ? lmin : 2 - lmin;
      const v = (l + s) / 2;
      const sv = l === 0 ? 2 * smin / (lmin + smin) : 2 * s / (l + s);
      return [h, sv * 100, v * 100];
    };
    convert.hsv.rgb = function(hsv) {
      const h = hsv[0] / 60;
      const s = hsv[1] / 100;
      let v = hsv[2] / 100;
      const hi = Math.floor(h) % 6;
      const f = h - Math.floor(h);
      const p = 255 * v * (1 - s);
      const q = 255 * v * (1 - s * f);
      const t = 255 * v * (1 - s * (1 - f));
      v *= 255;
      switch (hi) {
        case 0:
          return [v, t, p];
        case 1:
          return [q, v, p];
        case 2:
          return [p, v, t];
        case 3:
          return [p, q, v];
        case 4:
          return [t, p, v];
        case 5:
          return [v, p, q];
      }
    };
    convert.hsv.hsl = function(hsv) {
      const h = hsv[0];
      const s = hsv[1] / 100;
      const v = hsv[2] / 100;
      const vmin = Math.max(v, 0.01);
      let sl;
      let l;
      l = (2 - s) * v;
      const lmin = (2 - s) * vmin;
      sl = s * vmin;
      sl /= lmin <= 1 ? lmin : 2 - lmin;
      sl = sl || 0;
      l /= 2;
      return [h, sl * 100, l * 100];
    };
    convert.hwb.rgb = function(hwb) {
      const h = hwb[0] / 360;
      let wh = hwb[1] / 100;
      let bl = hwb[2] / 100;
      const ratio = wh + bl;
      let f;
      if (ratio > 1) {
        wh /= ratio;
        bl /= ratio;
      }
      const i = Math.floor(6 * h);
      const v = 1 - bl;
      f = 6 * h - i;
      if ((i & 1) !== 0) {
        f = 1 - f;
      }
      const n = wh + f * (v - wh);
      let r;
      let g;
      let b;
      switch (i) {
        default:
        case 6:
        case 0:
          r = v;
          g = n;
          b = wh;
          break;
        case 1:
          r = n;
          g = v;
          b = wh;
          break;
        case 2:
          r = wh;
          g = v;
          b = n;
          break;
        case 3:
          r = wh;
          g = n;
          b = v;
          break;
        case 4:
          r = n;
          g = wh;
          b = v;
          break;
        case 5:
          r = v;
          g = wh;
          b = n;
          break;
      }
      return [r * 255, g * 255, b * 255];
    };
    convert.cmyk.rgb = function(cmyk) {
      const c = cmyk[0] / 100;
      const m = cmyk[1] / 100;
      const y = cmyk[2] / 100;
      const k = cmyk[3] / 100;
      const r = 1 - Math.min(1, c * (1 - k) + k);
      const g = 1 - Math.min(1, m * (1 - k) + k);
      const b = 1 - Math.min(1, y * (1 - k) + k);
      return [r * 255, g * 255, b * 255];
    };
    convert.xyz.rgb = function(xyz) {
      const x = xyz[0] / 100;
      const y = xyz[1] / 100;
      const z = xyz[2] / 100;
      let r;
      let g;
      let b;
      r = x * 3.2406 + y * -1.5372 + z * -0.4986;
      g = x * -0.9689 + y * 1.8758 + z * 0.0415;
      b = x * 0.0557 + y * -0.204 + z * 1.057;
      r = r > 31308e-7 ? 1.055 * r ** (1 / 2.4) - 0.055 : r * 12.92;
      g = g > 31308e-7 ? 1.055 * g ** (1 / 2.4) - 0.055 : g * 12.92;
      b = b > 31308e-7 ? 1.055 * b ** (1 / 2.4) - 0.055 : b * 12.92;
      r = Math.min(Math.max(0, r), 1);
      g = Math.min(Math.max(0, g), 1);
      b = Math.min(Math.max(0, b), 1);
      return [r * 255, g * 255, b * 255];
    };
    convert.xyz.lab = function(xyz) {
      let x = xyz[0];
      let y = xyz[1];
      let z = xyz[2];
      x /= 95.047;
      y /= 100;
      z /= 108.883;
      x = x > 8856e-6 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
      y = y > 8856e-6 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
      z = z > 8856e-6 ? z ** (1 / 3) : 7.787 * z + 16 / 116;
      const l = 116 * y - 16;
      const a = 500 * (x - y);
      const b = 200 * (y - z);
      return [l, a, b];
    };
    convert.lab.xyz = function(lab) {
      const l = lab[0];
      const a = lab[1];
      const b = lab[2];
      let x;
      let y;
      let z;
      y = (l + 16) / 116;
      x = a / 500 + y;
      z = y - b / 200;
      const y2 = y ** 3;
      const x2 = x ** 3;
      const z2 = z ** 3;
      y = y2 > 8856e-6 ? y2 : (y - 16 / 116) / 7.787;
      x = x2 > 8856e-6 ? x2 : (x - 16 / 116) / 7.787;
      z = z2 > 8856e-6 ? z2 : (z - 16 / 116) / 7.787;
      x *= 95.047;
      y *= 100;
      z *= 108.883;
      return [x, y, z];
    };
    convert.lab.lch = function(lab) {
      const l = lab[0];
      const a = lab[1];
      const b = lab[2];
      let h;
      const hr = Math.atan2(b, a);
      h = hr * 360 / 2 / Math.PI;
      if (h < 0) {
        h += 360;
      }
      const c = Math.sqrt(a * a + b * b);
      return [l, c, h];
    };
    convert.lch.lab = function(lch) {
      const l = lch[0];
      const c = lch[1];
      const h = lch[2];
      const hr = h / 360 * 2 * Math.PI;
      const a = c * Math.cos(hr);
      const b = c * Math.sin(hr);
      return [l, a, b];
    };
    convert.rgb.ansi16 = function(args, saturation = null) {
      const [r, g, b] = args;
      let value = saturation === null ? convert.rgb.hsv(args)[2] : saturation;
      value = Math.round(value / 50);
      if (value === 0) {
        return 30;
      }
      let ansi = 30 + (Math.round(b / 255) << 2 | Math.round(g / 255) << 1 | Math.round(r / 255));
      if (value === 2) {
        ansi += 60;
      }
      return ansi;
    };
    convert.hsv.ansi16 = function(args) {
      return convert.rgb.ansi16(convert.hsv.rgb(args), args[2]);
    };
    convert.rgb.ansi256 = function(args) {
      const r = args[0];
      const g = args[1];
      const b = args[2];
      if (r === g && g === b) {
        if (r < 8) {
          return 16;
        }
        if (r > 248) {
          return 231;
        }
        return Math.round((r - 8) / 247 * 24) + 232;
      }
      const ansi = 16 + 36 * Math.round(r / 255 * 5) + 6 * Math.round(g / 255 * 5) + Math.round(b / 255 * 5);
      return ansi;
    };
    convert.ansi16.rgb = function(args) {
      let color = args % 10;
      if (color === 0 || color === 7) {
        if (args > 50) {
          color += 3.5;
        }
        color = color / 10.5 * 255;
        return [color, color, color];
      }
      const mult = (~~(args > 50) + 1) * 0.5;
      const r = (color & 1) * mult * 255;
      const g = (color >> 1 & 1) * mult * 255;
      const b = (color >> 2 & 1) * mult * 255;
      return [r, g, b];
    };
    convert.ansi256.rgb = function(args) {
      if (args >= 232) {
        const c = (args - 232) * 10 + 8;
        return [c, c, c];
      }
      args -= 16;
      let rem;
      const r = Math.floor(args / 36) / 5 * 255;
      const g = Math.floor((rem = args % 36) / 6) / 5 * 255;
      const b = rem % 6 / 5 * 255;
      return [r, g, b];
    };
    convert.rgb.hex = function(args) {
      const integer = ((Math.round(args[0]) & 255) << 16) + ((Math.round(args[1]) & 255) << 8) + (Math.round(args[2]) & 255);
      const string = integer.toString(16).toUpperCase();
      return "000000".substring(string.length) + string;
    };
    convert.hex.rgb = function(args) {
      const match = args.toString(16).match(/[a-f0-9]{6}|[a-f0-9]{3}/i);
      if (!match) {
        return [0, 0, 0];
      }
      let colorString = match[0];
      if (match[0].length === 3) {
        colorString = colorString.split("").map((char) => {
          return char + char;
        }).join("");
      }
      const integer = parseInt(colorString, 16);
      const r = integer >> 16 & 255;
      const g = integer >> 8 & 255;
      const b = integer & 255;
      return [r, g, b];
    };
    convert.rgb.hcg = function(rgb) {
      const r = rgb[0] / 255;
      const g = rgb[1] / 255;
      const b = rgb[2] / 255;
      const max = Math.max(Math.max(r, g), b);
      const min = Math.min(Math.min(r, g), b);
      const chroma = max - min;
      let grayscale;
      let hue;
      if (chroma < 1) {
        grayscale = min / (1 - chroma);
      } else {
        grayscale = 0;
      }
      if (chroma <= 0) {
        hue = 0;
      } else if (max === r) {
        hue = (g - b) / chroma % 6;
      } else if (max === g) {
        hue = 2 + (b - r) / chroma;
      } else {
        hue = 4 + (r - g) / chroma;
      }
      hue /= 6;
      hue %= 1;
      return [hue * 360, chroma * 100, grayscale * 100];
    };
    convert.hsl.hcg = function(hsl) {
      const s = hsl[1] / 100;
      const l = hsl[2] / 100;
      const c = l < 0.5 ? 2 * s * l : 2 * s * (1 - l);
      let f = 0;
      if (c < 1) {
        f = (l - 0.5 * c) / (1 - c);
      }
      return [hsl[0], c * 100, f * 100];
    };
    convert.hsv.hcg = function(hsv) {
      const s = hsv[1] / 100;
      const v = hsv[2] / 100;
      const c = s * v;
      let f = 0;
      if (c < 1) {
        f = (v - c) / (1 - c);
      }
      return [hsv[0], c * 100, f * 100];
    };
    convert.hcg.rgb = function(hcg) {
      const h = hcg[0] / 360;
      const c = hcg[1] / 100;
      const g = hcg[2] / 100;
      if (c === 0) {
        return [g * 255, g * 255, g * 255];
      }
      const pure = [0, 0, 0];
      const hi = h % 1 * 6;
      const v = hi % 1;
      const w2 = 1 - v;
      let mg = 0;
      switch (Math.floor(hi)) {
        case 0:
          pure[0] = 1;
          pure[1] = v;
          pure[2] = 0;
          break;
        case 1:
          pure[0] = w2;
          pure[1] = 1;
          pure[2] = 0;
          break;
        case 2:
          pure[0] = 0;
          pure[1] = 1;
          pure[2] = v;
          break;
        case 3:
          pure[0] = 0;
          pure[1] = w2;
          pure[2] = 1;
          break;
        case 4:
          pure[0] = v;
          pure[1] = 0;
          pure[2] = 1;
          break;
        default:
          pure[0] = 1;
          pure[1] = 0;
          pure[2] = w2;
      }
      mg = (1 - c) * g;
      return [
        (c * pure[0] + mg) * 255,
        (c * pure[1] + mg) * 255,
        (c * pure[2] + mg) * 255
      ];
    };
    convert.hcg.hsv = function(hcg) {
      const c = hcg[1] / 100;
      const g = hcg[2] / 100;
      const v = c + g * (1 - c);
      let f = 0;
      if (v > 0) {
        f = c / v;
      }
      return [hcg[0], f * 100, v * 100];
    };
    convert.hcg.hsl = function(hcg) {
      const c = hcg[1] / 100;
      const g = hcg[2] / 100;
      const l = g * (1 - c) + 0.5 * c;
      let s = 0;
      if (l > 0 && l < 0.5) {
        s = c / (2 * l);
      } else if (l >= 0.5 && l < 1) {
        s = c / (2 * (1 - l));
      }
      return [hcg[0], s * 100, l * 100];
    };
    convert.hcg.hwb = function(hcg) {
      const c = hcg[1] / 100;
      const g = hcg[2] / 100;
      const v = c + g * (1 - c);
      return [hcg[0], (v - c) * 100, (1 - v) * 100];
    };
    convert.hwb.hcg = function(hwb) {
      const w2 = hwb[1] / 100;
      const b = hwb[2] / 100;
      const v = 1 - b;
      const c = v - w2;
      let g = 0;
      if (c < 1) {
        g = (v - c) / (1 - c);
      }
      return [hwb[0], c * 100, g * 100];
    };
    convert.apple.rgb = function(apple) {
      return [apple[0] / 65535 * 255, apple[1] / 65535 * 255, apple[2] / 65535 * 255];
    };
    convert.rgb.apple = function(rgb) {
      return [rgb[0] / 255 * 65535, rgb[1] / 255 * 65535, rgb[2] / 255 * 65535];
    };
    convert.gray.rgb = function(args) {
      return [args[0] / 100 * 255, args[0] / 100 * 255, args[0] / 100 * 255];
    };
    convert.gray.hsl = function(args) {
      return [0, 0, args[0]];
    };
    convert.gray.hsv = convert.gray.hsl;
    convert.gray.hwb = function(gray) {
      return [0, 100, gray[0]];
    };
    convert.gray.cmyk = function(gray) {
      return [0, 0, 0, gray[0]];
    };
    convert.gray.lab = function(gray) {
      return [gray[0], 0, 0];
    };
    convert.gray.hex = function(gray) {
      const val = Math.round(gray[0] / 100 * 255) & 255;
      const integer = (val << 16) + (val << 8) + val;
      const string = integer.toString(16).toUpperCase();
      return "000000".substring(string.length) + string;
    };
    convert.rgb.gray = function(rgb) {
      const val = (rgb[0] + rgb[1] + rgb[2]) / 3;
      return [val / 255 * 100];
    };
  }
});

// ../../node_modules/color-convert/route.js
var require_route = __commonJS({
  "../../node_modules/color-convert/route.js"(exports2, module2) {
    var conversions = require_conversions();
    function buildGraph() {
      const graph = {};
      const models = Object.keys(conversions);
      for (let len = models.length, i = 0; i < len; i++) {
        graph[models[i]] = {
          // http://jsperf.com/1-vs-infinity
          // micro-opt, but this is simple.
          distance: -1,
          parent: null
        };
      }
      return graph;
    }
    function deriveBFS(fromModel) {
      const graph = buildGraph();
      const queue = [fromModel];
      graph[fromModel].distance = 0;
      while (queue.length) {
        const current = queue.pop();
        const adjacents = Object.keys(conversions[current]);
        for (let len = adjacents.length, i = 0; i < len; i++) {
          const adjacent = adjacents[i];
          const node = graph[adjacent];
          if (node.distance === -1) {
            node.distance = graph[current].distance + 1;
            node.parent = current;
            queue.unshift(adjacent);
          }
        }
      }
      return graph;
    }
    function link(from, to) {
      return function(args) {
        return to(from(args));
      };
    }
    function wrapConversion(toModel, graph) {
      const path5 = [graph[toModel].parent, toModel];
      let fn = conversions[graph[toModel].parent][toModel];
      let cur = graph[toModel].parent;
      while (graph[cur].parent) {
        path5.unshift(graph[cur].parent);
        fn = link(conversions[graph[cur].parent][cur], fn);
        cur = graph[cur].parent;
      }
      fn.conversion = path5;
      return fn;
    }
    module2.exports = function(fromModel) {
      const graph = deriveBFS(fromModel);
      const conversion = {};
      const models = Object.keys(graph);
      for (let len = models.length, i = 0; i < len; i++) {
        const toModel = models[i];
        const node = graph[toModel];
        if (node.parent === null) {
          continue;
        }
        conversion[toModel] = wrapConversion(toModel, graph);
      }
      return conversion;
    };
  }
});

// ../../node_modules/color-convert/index.js
var require_color_convert = __commonJS({
  "../../node_modules/color-convert/index.js"(exports2, module2) {
    var conversions = require_conversions();
    var route = require_route();
    var convert = {};
    var models = Object.keys(conversions);
    function wrapRaw(fn) {
      const wrappedFn = function(...args) {
        const arg0 = args[0];
        if (arg0 === void 0 || arg0 === null) {
          return arg0;
        }
        if (arg0.length > 1) {
          args = arg0;
        }
        return fn(args);
      };
      if ("conversion" in fn) {
        wrappedFn.conversion = fn.conversion;
      }
      return wrappedFn;
    }
    function wrapRounded(fn) {
      const wrappedFn = function(...args) {
        const arg0 = args[0];
        if (arg0 === void 0 || arg0 === null) {
          return arg0;
        }
        if (arg0.length > 1) {
          args = arg0;
        }
        const result = fn(args);
        if (typeof result === "object") {
          for (let len = result.length, i = 0; i < len; i++) {
            result[i] = Math.round(result[i]);
          }
        }
        return result;
      };
      if ("conversion" in fn) {
        wrappedFn.conversion = fn.conversion;
      }
      return wrappedFn;
    }
    models.forEach((fromModel) => {
      convert[fromModel] = {};
      Object.defineProperty(convert[fromModel], "channels", { value: conversions[fromModel].channels });
      Object.defineProperty(convert[fromModel], "labels", { value: conversions[fromModel].labels });
      const routes = route(fromModel);
      const routeModels = Object.keys(routes);
      routeModels.forEach((toModel) => {
        const fn = routes[toModel];
        convert[fromModel][toModel] = wrapRounded(fn);
        convert[fromModel][toModel].raw = wrapRaw(fn);
      });
    });
    module2.exports = convert;
  }
});

// ../skills/node_modules/ansi-styles/index.js
var require_ansi_styles = __commonJS({
  "../skills/node_modules/ansi-styles/index.js"(exports2, module2) {
    "use strict";
    var wrapAnsi16 = (fn, offset) => (...args) => {
      const code = fn(...args);
      return `\x1B[${code + offset}m`;
    };
    var wrapAnsi256 = (fn, offset) => (...args) => {
      const code = fn(...args);
      return `\x1B[${38 + offset};5;${code}m`;
    };
    var wrapAnsi16m = (fn, offset) => (...args) => {
      const rgb = fn(...args);
      return `\x1B[${38 + offset};2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
    };
    var ansi2ansi = (n) => n;
    var rgb2rgb = (r, g, b) => [r, g, b];
    var setLazyProperty = (object, property, get) => {
      Object.defineProperty(object, property, {
        get: () => {
          const value = get();
          Object.defineProperty(object, property, {
            value,
            enumerable: true,
            configurable: true
          });
          return value;
        },
        enumerable: true,
        configurable: true
      });
    };
    var colorConvert;
    var makeDynamicStyles = (wrap, targetSpace, identity, isBackground) => {
      if (colorConvert === void 0) {
        colorConvert = require_color_convert();
      }
      const offset = isBackground ? 10 : 0;
      const styles = {};
      for (const [sourceSpace, suite] of Object.entries(colorConvert)) {
        const name = sourceSpace === "ansi16" ? "ansi" : sourceSpace;
        if (sourceSpace === targetSpace) {
          styles[name] = wrap(identity, offset);
        } else if (typeof suite === "object") {
          styles[name] = wrap(suite[targetSpace], offset);
        }
      }
      return styles;
    };
    function assembleStyles() {
      const codes = /* @__PURE__ */ new Map();
      const styles = {
        modifier: {
          reset: [0, 0],
          // 21 isn't widely supported and 22 does the same thing
          bold: [1, 22],
          dim: [2, 22],
          italic: [3, 23],
          underline: [4, 24],
          inverse: [7, 27],
          hidden: [8, 28],
          strikethrough: [9, 29]
        },
        color: {
          black: [30, 39],
          red: [31, 39],
          green: [32, 39],
          yellow: [33, 39],
          blue: [34, 39],
          magenta: [35, 39],
          cyan: [36, 39],
          white: [37, 39],
          // Bright color
          blackBright: [90, 39],
          redBright: [91, 39],
          greenBright: [92, 39],
          yellowBright: [93, 39],
          blueBright: [94, 39],
          magentaBright: [95, 39],
          cyanBright: [96, 39],
          whiteBright: [97, 39]
        },
        bgColor: {
          bgBlack: [40, 49],
          bgRed: [41, 49],
          bgGreen: [42, 49],
          bgYellow: [43, 49],
          bgBlue: [44, 49],
          bgMagenta: [45, 49],
          bgCyan: [46, 49],
          bgWhite: [47, 49],
          // Bright color
          bgBlackBright: [100, 49],
          bgRedBright: [101, 49],
          bgGreenBright: [102, 49],
          bgYellowBright: [103, 49],
          bgBlueBright: [104, 49],
          bgMagentaBright: [105, 49],
          bgCyanBright: [106, 49],
          bgWhiteBright: [107, 49]
        }
      };
      styles.color.gray = styles.color.blackBright;
      styles.bgColor.bgGray = styles.bgColor.bgBlackBright;
      styles.color.grey = styles.color.blackBright;
      styles.bgColor.bgGrey = styles.bgColor.bgBlackBright;
      for (const [groupName, group] of Object.entries(styles)) {
        for (const [styleName, style] of Object.entries(group)) {
          styles[styleName] = {
            open: `\x1B[${style[0]}m`,
            close: `\x1B[${style[1]}m`
          };
          group[styleName] = styles[styleName];
          codes.set(style[0], style[1]);
        }
        Object.defineProperty(styles, groupName, {
          value: group,
          enumerable: false
        });
      }
      Object.defineProperty(styles, "codes", {
        value: codes,
        enumerable: false
      });
      styles.color.close = "\x1B[39m";
      styles.bgColor.close = "\x1B[49m";
      setLazyProperty(styles.color, "ansi", () => makeDynamicStyles(wrapAnsi16, "ansi16", ansi2ansi, false));
      setLazyProperty(styles.color, "ansi256", () => makeDynamicStyles(wrapAnsi256, "ansi256", ansi2ansi, false));
      setLazyProperty(styles.color, "ansi16m", () => makeDynamicStyles(wrapAnsi16m, "rgb", rgb2rgb, false));
      setLazyProperty(styles.bgColor, "ansi", () => makeDynamicStyles(wrapAnsi16, "ansi16", ansi2ansi, true));
      setLazyProperty(styles.bgColor, "ansi256", () => makeDynamicStyles(wrapAnsi256, "ansi256", ansi2ansi, true));
      setLazyProperty(styles.bgColor, "ansi16m", () => makeDynamicStyles(wrapAnsi16m, "rgb", rgb2rgb, true));
      return styles;
    }
    Object.defineProperty(module2, "exports", {
      enumerable: true,
      get: assembleStyles
    });
  }
});

// ../../node_modules/has-flag/index.js
var require_has_flag = __commonJS({
  "../../node_modules/has-flag/index.js"(exports2, module2) {
    "use strict";
    module2.exports = (flag, argv = process.argv) => {
      const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
      const position = argv.indexOf(prefix + flag);
      const terminatorPosition = argv.indexOf("--");
      return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
    };
  }
});

// ../../node_modules/supports-color/index.js
var require_supports_color = __commonJS({
  "../../node_modules/supports-color/index.js"(exports2, module2) {
    "use strict";
    var os = require("os");
    var tty = require("tty");
    var hasFlag = require_has_flag();
    var { env } = process;
    var forceColor;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
      forceColor = 0;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      forceColor = 1;
    }
    if ("FORCE_COLOR" in env) {
      if (env.FORCE_COLOR === "true") {
        forceColor = 1;
      } else if (env.FORCE_COLOR === "false") {
        forceColor = 0;
      } else {
        forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
      }
    }
    function translateLevel(level) {
      if (level === 0) {
        return false;
      }
      return {
        level,
        hasBasic: true,
        has256: level >= 2,
        has16m: level >= 3
      };
    }
    function supportsColor(haveStream, streamIsTTY) {
      if (forceColor === 0) {
        return 0;
      }
      if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
        return 3;
      }
      if (hasFlag("color=256")) {
        return 2;
      }
      if (haveStream && !streamIsTTY && forceColor === void 0) {
        return 0;
      }
      const min = forceColor || 0;
      if (env.TERM === "dumb") {
        return min;
      }
      if (process.platform === "win32") {
        const osRelease = os.release().split(".");
        if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
      }
      if (env.COLORTERM === "truecolor") {
        return 3;
      }
      if ("TERM_PROGRAM" in env) {
        const version = parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env.TERM_PROGRAM) {
          case "iTerm.app":
            return version >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env) {
        return 1;
      }
      return min;
    }
    function getSupportLevel(stream) {
      const level = supportsColor(stream, stream && stream.isTTY);
      return translateLevel(level);
    }
    module2.exports = {
      supportsColor: getSupportLevel,
      stdout: translateLevel(supportsColor(true, tty.isatty(1))),
      stderr: translateLevel(supportsColor(true, tty.isatty(2)))
    };
  }
});

// ../skills/node_modules/chalk/source/util.js
var require_util = __commonJS({
  "../skills/node_modules/chalk/source/util.js"(exports2, module2) {
    "use strict";
    var stringReplaceAll = (string, substring, replacer) => {
      let index = string.indexOf(substring);
      if (index === -1) {
        return string;
      }
      const substringLength = substring.length;
      let endIndex = 0;
      let returnValue = "";
      do {
        returnValue += string.substr(endIndex, index - endIndex) + substring + replacer;
        endIndex = index + substringLength;
        index = string.indexOf(substring, endIndex);
      } while (index !== -1);
      returnValue += string.substr(endIndex);
      return returnValue;
    };
    var stringEncaseCRLFWithFirstIndex = (string, prefix, postfix, index) => {
      let endIndex = 0;
      let returnValue = "";
      do {
        const gotCR = string[index - 1] === "\r";
        returnValue += string.substr(endIndex, (gotCR ? index - 1 : index) - endIndex) + prefix + (gotCR ? "\r\n" : "\n") + postfix;
        endIndex = index + 1;
        index = string.indexOf("\n", endIndex);
      } while (index !== -1);
      returnValue += string.substr(endIndex);
      return returnValue;
    };
    module2.exports = {
      stringReplaceAll,
      stringEncaseCRLFWithFirstIndex
    };
  }
});

// ../skills/node_modules/chalk/source/templates.js
var require_templates = __commonJS({
  "../skills/node_modules/chalk/source/templates.js"(exports2, module2) {
    "use strict";
    var TEMPLATE_REGEX = /(?:\\(u(?:[a-f\d]{4}|\{[a-f\d]{1,6}\})|x[a-f\d]{2}|.))|(?:\{(~)?(\w+(?:\([^)]*\))?(?:\.\w+(?:\([^)]*\))?)*)(?:[ \t]|(?=\r?\n)))|(\})|((?:.|[\r\n\f])+?)/gi;
    var STYLE_REGEX = /(?:^|\.)(\w+)(?:\(([^)]*)\))?/g;
    var STRING_REGEX = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/;
    var ESCAPE_REGEX = /\\(u(?:[a-f\d]{4}|{[a-f\d]{1,6}})|x[a-f\d]{2}|.)|([^\\])/gi;
    var ESCAPES = /* @__PURE__ */ new Map([
      ["n", "\n"],
      ["r", "\r"],
      ["t", "	"],
      ["b", "\b"],
      ["f", "\f"],
      ["v", "\v"],
      ["0", "\0"],
      ["\\", "\\"],
      ["e", "\x1B"],
      ["a", "\x07"]
    ]);
    function unescape(c) {
      const u = c[0] === "u";
      const bracket = c[1] === "{";
      if (u && !bracket && c.length === 5 || c[0] === "x" && c.length === 3) {
        return String.fromCharCode(parseInt(c.slice(1), 16));
      }
      if (u && bracket) {
        return String.fromCodePoint(parseInt(c.slice(2, -1), 16));
      }
      return ESCAPES.get(c) || c;
    }
    function parseArguments(name, arguments_) {
      const results = [];
      const chunks = arguments_.trim().split(/\s*,\s*/g);
      let matches;
      for (const chunk of chunks) {
        const number = Number(chunk);
        if (!Number.isNaN(number)) {
          results.push(number);
        } else if (matches = chunk.match(STRING_REGEX)) {
          results.push(matches[2].replace(ESCAPE_REGEX, (m, escape, character) => escape ? unescape(escape) : character));
        } else {
          throw new Error(`Invalid Chalk template style argument: ${chunk} (in style '${name}')`);
        }
      }
      return results;
    }
    function parseStyle(style) {
      STYLE_REGEX.lastIndex = 0;
      const results = [];
      let matches;
      while ((matches = STYLE_REGEX.exec(style)) !== null) {
        const name = matches[1];
        if (matches[2]) {
          const args = parseArguments(name, matches[2]);
          results.push([name].concat(args));
        } else {
          results.push([name]);
        }
      }
      return results;
    }
    function buildStyle(chalk3, styles) {
      const enabled = {};
      for (const layer of styles) {
        for (const style of layer.styles) {
          enabled[style[0]] = layer.inverse ? null : style.slice(1);
        }
      }
      let current = chalk3;
      for (const [styleName, styles2] of Object.entries(enabled)) {
        if (!Array.isArray(styles2)) {
          continue;
        }
        if (!(styleName in current)) {
          throw new Error(`Unknown Chalk style: ${styleName}`);
        }
        current = styles2.length > 0 ? current[styleName](...styles2) : current[styleName];
      }
      return current;
    }
    module2.exports = (chalk3, temporary) => {
      const styles = [];
      const chunks = [];
      let chunk = [];
      temporary.replace(TEMPLATE_REGEX, (m, escapeCharacter, inverse, style, close, character) => {
        if (escapeCharacter) {
          chunk.push(unescape(escapeCharacter));
        } else if (style) {
          const string = chunk.join("");
          chunk = [];
          chunks.push(styles.length === 0 ? string : buildStyle(chalk3, styles)(string));
          styles.push({ inverse, styles: parseStyle(style) });
        } else if (close) {
          if (styles.length === 0) {
            throw new Error("Found extraneous } in Chalk template literal");
          }
          chunks.push(buildStyle(chalk3, styles)(chunk.join("")));
          chunk = [];
          styles.pop();
        } else {
          chunk.push(character);
        }
      });
      chunks.push(chunk.join(""));
      if (styles.length > 0) {
        const errMessage = `Chalk template literal is missing ${styles.length} closing bracket${styles.length === 1 ? "" : "s"} (\`}\`)`;
        throw new Error(errMessage);
      }
      return chunks.join("");
    };
  }
});

// ../skills/node_modules/chalk/source/index.js
var require_source = __commonJS({
  "../skills/node_modules/chalk/source/index.js"(exports2, module2) {
    "use strict";
    var ansiStyles = require_ansi_styles();
    var { stdout: stdoutColor, stderr: stderrColor } = require_supports_color();
    var {
      stringReplaceAll,
      stringEncaseCRLFWithFirstIndex
    } = require_util();
    var { isArray } = Array;
    var levelMapping = [
      "ansi",
      "ansi",
      "ansi256",
      "ansi16m"
    ];
    var styles = /* @__PURE__ */ Object.create(null);
    var applyOptions = (object, options = {}) => {
      if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
        throw new Error("The `level` option should be an integer from 0 to 3");
      }
      const colorLevel = stdoutColor ? stdoutColor.level : 0;
      object.level = options.level === void 0 ? colorLevel : options.level;
    };
    var ChalkClass = class {
      constructor(options) {
        return chalkFactory(options);
      }
    };
    var chalkFactory = (options) => {
      const chalk4 = {};
      applyOptions(chalk4, options);
      chalk4.template = (...arguments_) => chalkTag(chalk4.template, ...arguments_);
      Object.setPrototypeOf(chalk4, Chalk.prototype);
      Object.setPrototypeOf(chalk4.template, chalk4);
      chalk4.template.constructor = () => {
        throw new Error("`chalk.constructor()` is deprecated. Use `new chalk.Instance()` instead.");
      };
      chalk4.template.Instance = ChalkClass;
      return chalk4.template;
    };
    function Chalk(options) {
      return chalkFactory(options);
    }
    for (const [styleName, style] of Object.entries(ansiStyles)) {
      styles[styleName] = {
        get() {
          const builder = createBuilder(this, createStyler(style.open, style.close, this._styler), this._isEmpty);
          Object.defineProperty(this, styleName, { value: builder });
          return builder;
        }
      };
    }
    styles.visible = {
      get() {
        const builder = createBuilder(this, this._styler, true);
        Object.defineProperty(this, "visible", { value: builder });
        return builder;
      }
    };
    var usedModels = ["rgb", "hex", "keyword", "hsl", "hsv", "hwb", "ansi", "ansi256"];
    for (const model of usedModels) {
      styles[model] = {
        get() {
          const { level } = this;
          return function(...arguments_) {
            const styler = createStyler(ansiStyles.color[levelMapping[level]][model](...arguments_), ansiStyles.color.close, this._styler);
            return createBuilder(this, styler, this._isEmpty);
          };
        }
      };
    }
    for (const model of usedModels) {
      const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
      styles[bgModel] = {
        get() {
          const { level } = this;
          return function(...arguments_) {
            const styler = createStyler(ansiStyles.bgColor[levelMapping[level]][model](...arguments_), ansiStyles.bgColor.close, this._styler);
            return createBuilder(this, styler, this._isEmpty);
          };
        }
      };
    }
    var proto = Object.defineProperties(() => {
    }, {
      ...styles,
      level: {
        enumerable: true,
        get() {
          return this._generator.level;
        },
        set(level) {
          this._generator.level = level;
        }
      }
    });
    var createStyler = (open, close, parent) => {
      let openAll;
      let closeAll;
      if (parent === void 0) {
        openAll = open;
        closeAll = close;
      } else {
        openAll = parent.openAll + open;
        closeAll = close + parent.closeAll;
      }
      return {
        open,
        close,
        openAll,
        closeAll,
        parent
      };
    };
    var createBuilder = (self2, _styler, _isEmpty) => {
      const builder = (...arguments_) => {
        if (isArray(arguments_[0]) && isArray(arguments_[0].raw)) {
          return applyStyle(builder, chalkTag(builder, ...arguments_));
        }
        return applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
      };
      Object.setPrototypeOf(builder, proto);
      builder._generator = self2;
      builder._styler = _styler;
      builder._isEmpty = _isEmpty;
      return builder;
    };
    var applyStyle = (self2, string) => {
      if (self2.level <= 0 || !string) {
        return self2._isEmpty ? "" : string;
      }
      let styler = self2._styler;
      if (styler === void 0) {
        return string;
      }
      const { openAll, closeAll } = styler;
      if (string.indexOf("\x1B") !== -1) {
        while (styler !== void 0) {
          string = stringReplaceAll(string, styler.close, styler.open);
          styler = styler.parent;
        }
      }
      const lfIndex = string.indexOf("\n");
      if (lfIndex !== -1) {
        string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
      }
      return openAll + string + closeAll;
    };
    var template;
    var chalkTag = (chalk4, ...strings) => {
      const [firstString] = strings;
      if (!isArray(firstString) || !isArray(firstString.raw)) {
        return strings.join(" ");
      }
      const arguments_ = strings.slice(1);
      const parts = [firstString.raw[0]];
      for (let i = 1; i < firstString.length; i++) {
        parts.push(
          String(arguments_[i - 1]).replace(/[{}\\]/g, "\\$&"),
          String(firstString.raw[i])
        );
      }
      if (template === void 0) {
        template = require_templates();
      }
      return template(chalk4, parts.join(""));
    };
    Object.defineProperties(Chalk.prototype, styles);
    var chalk3 = Chalk();
    chalk3.supportsColor = stdoutColor;
    chalk3.stderr = Chalk({ level: stderrColor ? stderrColor.level : 0 });
    chalk3.stderr.supportsColor = stderrColor;
    module2.exports = chalk3;
  }
});

// ../../node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// ../skills/dist/cli.js
var import_chalk2 = __toESM(require_source(), 1);

// ../skills/dist/services/node-schema-provider.js
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_url = require("url");
var import_meta = {};
var _filename = typeof __filename !== "undefined" ? __filename : typeof import_meta !== "undefined" && typeof import_meta.url === "string" ? (0, import_url.fileURLToPath)(import_meta.url) : "";
var _dirname = typeof __dirname !== "undefined" ? __dirname : _filename ? import_path.default.dirname(_filename) : "";
var NodeSchemaProvider = class {
  index = null;
  enrichedIndex = null;
  enrichedIndexPath;
  constructor(customIndexPath) {
    const envAssetsDir = process.env.N8N_AS_CODE_ASSETS_DIR;
    if (customIndexPath) {
      this.enrichedIndexPath = customIndexPath;
    } else if (envAssetsDir && import_fs.default.existsSync(import_path.default.join(envAssetsDir, "n8n-nodes-technical.json"))) {
      this.enrichedIndexPath = import_path.default.join(envAssetsDir, "n8n-nodes-technical.json");
    } else {
      const siblingPath = import_path.default.resolve(_dirname, "../assets/n8n-nodes-technical.json");
      if (import_fs.default.existsSync(siblingPath)) {
        this.enrichedIndexPath = siblingPath;
      } else {
        this.enrichedIndexPath = import_path.default.resolve(_dirname, "../../assets/n8n-nodes-technical.json");
      }
    }
  }
  loadIndex() {
    if (this.index)
      return;
    if (!import_fs.default.existsSync(this.enrichedIndexPath)) {
      throw new Error(`Technical node index not found at: ${this.enrichedIndexPath}
Please run the build process: npm run build in packages/agent-cli`);
    }
    try {
      const content = import_fs.default.readFileSync(this.enrichedIndexPath, "utf-8");
      this.enrichedIndex = JSON.parse(content);
      this.index = this.enrichedIndex;
    } catch (error) {
      throw new Error(`Failed to load technical node index: ${error.message}
The index file may be corrupted. Try rebuilding: npm run build in packages/agent-cli`);
    }
  }
  /**
   * Get the full JSON schema for a specific node by name.
   * Returns null if not found.
   */
  getNodeSchema(nodeName) {
    this.loadIndex();
    if (this.index.nodes[nodeName]) {
      const node = this.index.nodes[nodeName];
      return {
        name: node.name,
        type: node.type,
        displayName: node.displayName,
        description: node.description,
        version: node.version,
        group: node.group,
        icon: node.icon,
        schema: node.schema,
        metadata: node.metadata
      };
    }
    const lowerName = nodeName.toLowerCase();
    const found = Object.keys(this.index.nodes).find((k) => k.toLowerCase() === lowerName);
    return found ? this.index.nodes[found] : null;
  }
  /**
   * Calculate relevance score for a node based on query
   */
  calculateRelevance(query, node, key) {
    const lowerQuery = query.toLowerCase();
    let score = 0;
    if (key.toLowerCase() === lowerQuery) {
      score += 1e3;
    } else if (key.toLowerCase().includes(lowerQuery)) {
      score += 500;
    }
    const displayName = (node.displayName || "").toLowerCase();
    if (displayName === lowerQuery) {
      score += 800;
    } else if (displayName.includes(lowerQuery)) {
      score += 400;
    }
    if (node.metadata?.keywords) {
      const keywords = node.metadata.keywords;
      if (keywords.includes(lowerQuery)) {
        score += 300;
      }
      const matchingKeywords = keywords.filter((k) => k.includes(lowerQuery) || lowerQuery.includes(k));
      score += matchingKeywords.length * 50;
    }
    if (node.metadata?.operations) {
      const matchingOps = node.metadata.operations.filter((op) => op.toLowerCase().includes(lowerQuery));
      score += matchingOps.length * 100;
    }
    if (node.metadata?.useCases) {
      const matchingUseCases = node.metadata.useCases.filter((uc) => uc.toLowerCase().includes(lowerQuery));
      score += matchingUseCases.length * 80;
    }
    const description = (node.description || "").toLowerCase();
    if (description.includes(lowerQuery)) {
      score += 100;
    }
    if (node.metadata?.keywordScore) {
      score += node.metadata.keywordScore * 0.5;
    }
    const queryWords = lowerQuery.split(/\s+/).filter((w2) => w2.length > 2);
    if (queryWords.length > 1) {
      const allFields = [
        key.toLowerCase(),
        displayName,
        description,
        ...node.metadata?.keywords || [],
        ...node.metadata?.operations || [],
        ...node.metadata?.useCases || []
      ].join(" ");
      const matchedWords = queryWords.filter((word) => allFields.includes(word));
      if (matchedWords.length === queryWords.length) {
        score += 200 * queryWords.length;
      }
    }
    return score;
  }
  /**
   * Fuzzy search for nodes with improved relevance scoring.
   * Returns a list of matches (stub only, not full schema).
   */
  searchNodes(query, limit = 20) {
    this.loadIndex();
    const lowerQuery = query.toLowerCase();
    const scoredResults = [];
    for (const [key, node] of Object.entries(this.index.nodes)) {
      const score = this.calculateRelevance(query, node, key);
      if (score > 0) {
        scoredResults.push({
          name: node.name || key,
          type: node.type || node.name || key,
          displayName: node.displayName || key,
          description: node.description || "",
          version: node.version,
          keywords: node.metadata?.keywords || [],
          operations: node.metadata?.operations || [],
          useCases: node.metadata?.useCases || [],
          relevanceScore: score,
          score
        });
      }
    }
    scoredResults.sort((a, b) => b.score - a.score);
    return scoredResults.slice(0, limit).map(({ score, ...rest }) => rest);
  }
  /**
   * List all available nodes (compact format).
   */
  listAllNodes() {
    this.loadIndex();
    return Object.values(this.index.nodes).map((node) => ({
      name: node.name,
      type: node.type || node.name,
      displayName: node.displayName,
      description: node.description || "",
      version: node.version,
      keywords: node.metadata?.keywords || [],
      operations: node.metadata?.operations || [],
      useCases: node.metadata?.useCases || []
    }));
  }
};

// ../skills/dist/services/workflow-validator.js
var WorkflowValidator = class {
  provider;
  constructor(customIndexPath) {
    this.provider = new NodeSchemaProvider(customIndexPath);
  }
  /**
   * Validate a workflow JSON
   */
  validateWorkflow(workflow) {
    const errors = [];
    const warnings = [];
    if (!workflow) {
      errors.push({ type: "error", message: "Workflow is null or undefined" });
      return { valid: false, errors, warnings };
    }
    if (typeof workflow !== "object") {
      errors.push({ type: "error", message: "Workflow must be a JSON object" });
      return { valid: false, errors, warnings };
    }
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push({ type: "error", message: 'Workflow must have a "nodes" array' });
    }
    if (!workflow.connections || typeof workflow.connections !== "object") {
      errors.push({ type: "error", message: 'Workflow must have a "connections" object' });
    }
    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }
    const nodeMap = /* @__PURE__ */ new Map();
    for (const node of workflow.nodes) {
      nodeMap.set(node.name, node);
      if (!node.id) {
        warnings.push({
          type: "warning",
          nodeName: node.name || "unknown",
          message: 'Node is missing "id" (this is normal for sanitized workflows)'
        });
      }
      if (!node.name) {
        errors.push({
          type: "error",
          nodeId: node.id,
          message: 'Node is missing required field: "name"'
        });
      }
      if (!node.type) {
        errors.push({
          type: "error",
          nodeId: node.id,
          nodeName: node.name,
          message: 'Node is missing required field: "type"'
        });
        continue;
      }
      const nodeTypeName = node.type.split(".").pop();
      const isCommunityNode = node.type.startsWith("@") && !node.type.startsWith("@n8n/") || node.type.startsWith("n8n-nodes-") && !node.type.startsWith("n8n-nodes-base.") && !node.type.startsWith("n8n-nodes-langchain.");
      const nodeSchema = this.provider.getNodeSchema(nodeTypeName);
      if (!nodeSchema) {
        if (isCommunityNode) {
          warnings.push({
            type: "warning",
            nodeId: node.id,
            nodeName: node.name,
            message: `Community node type "${node.type}" is not in the schema. Parameter validation will be skipped for this node.`
          });
          continue;
        } else {
          errors.push({
            type: "error",
            nodeId: node.id,
            nodeName: node.name,
            message: `Unknown node type: "${node.type}". Use "npx @n8n-as-code/agent-cli search" to find correct node names.`
          });
          continue;
        }
      }
      if (node.typeVersion === void 0) {
        warnings.push({
          type: "warning",
          nodeId: node.id,
          nodeName: node.name,
          message: 'Node is missing "typeVersion" field'
        });
      }
      if (!node.position || !Array.isArray(node.position) || node.position.length !== 2) {
        warnings.push({
          type: "warning",
          nodeId: node.id,
          nodeName: node.name,
          message: 'Node should have "position" as [x, y] array'
        });
      }
      if (!node.parameters) {
        warnings.push({
          type: "warning",
          nodeId: node.id,
          nodeName: node.name,
          message: 'Node is missing "parameters" object'
        });
      }
      if (node.parameters && nodeSchema.properties) {
        this.validateNodeParameters(node, nodeSchema, errors, warnings);
      }
    }
    if (workflow.connections) {
      this.validateConnections(workflow.connections, nodeMap, errors, warnings);
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  /**
   * Validate node parameters against schema
   */
  validateNodeParameters(node, nodeSchema, errors, warnings) {
    const schemaProps = nodeSchema.properties || [];
    const requiredProps = schemaProps.filter((p) => p.required === true);
    for (const prop of requiredProps) {
      if (!(prop.name in node.parameters)) {
        errors.push({
          type: "error",
          nodeId: node.id,
          nodeName: node.name,
          message: `Missing required parameter: "${prop.name}"`,
          path: `nodes[${node.name}].parameters.${prop.name}`
        });
      }
    }
    const knownParamNames = new Set(schemaProps.map((p) => p.name));
    for (const paramName of Object.keys(node.parameters)) {
      if (!knownParamNames.has(paramName)) {
        warnings.push({
          type: "warning",
          nodeId: node.id,
          nodeName: node.name,
          message: `Unknown parameter: "${paramName}". This might be a typo or deprecated parameter.`,
          path: `nodes[${node.name}].parameters.${paramName}`
        });
      }
    }
  }
  /**
   * Validate connections between nodes
   */
  validateConnections(connections, nodeMap, errors, warnings) {
    for (const [sourceName, sourceConnections] of Object.entries(connections)) {
      if (!nodeMap.has(sourceName)) {
        errors.push({
          type: "error",
          message: `Connection references non-existent source node: "${sourceName}"`
        });
        continue;
      }
      if (typeof sourceConnections !== "object" || sourceConnections === null) {
        errors.push({
          type: "error",
          nodeName: sourceName,
          message: `Invalid connections format for node "${sourceName}"`
        });
        continue;
      }
      const mainConnections = sourceConnections.main;
      if (mainConnections && Array.isArray(mainConnections)) {
        for (let outputIndex = 0; outputIndex < mainConnections.length; outputIndex++) {
          const outputConnections = mainConnections[outputIndex];
          if (Array.isArray(outputConnections)) {
            for (const conn of outputConnections) {
              if (!conn.node) {
                errors.push({
                  type: "error",
                  nodeName: sourceName,
                  message: `Connection missing "node" field`
                });
                continue;
              }
              if (!nodeMap.has(conn.node)) {
                errors.push({
                  type: "error",
                  nodeName: sourceName,
                  message: `Connection references non-existent target node: "${conn.node}"`
                });
              }
              if (conn.type && conn.type !== "main") {
                warnings.push({
                  type: "warning",
                  nodeName: sourceName,
                  message: `Unusual connection type: "${conn.type}" (expected "main")`
                });
              }
              if (conn.index === void 0) {
                warnings.push({
                  type: "warning",
                  nodeName: sourceName,
                  message: `Connection to "${conn.node}" missing "index" field`
                });
              }
            }
          }
        }
      }
    }
  }
};

// ../skills/dist/services/docs-provider.js
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_url2 = require("url");
var import_meta2 = {};
var _filename2 = typeof __filename !== "undefined" ? __filename : typeof import_meta2 !== "undefined" && typeof import_meta2.url === "string" ? (0, import_url2.fileURLToPath)(import_meta2.url) : "";
var _dirname2 = typeof __dirname !== "undefined" ? __dirname : _filename2 ? import_path2.default.dirname(_filename2) : "";
var DocsProvider = class {
  docs = null;
  docsPath;
  constructor(customDocsPath) {
    const envAssetsDir = process.env.N8N_AS_CODE_ASSETS_DIR;
    if (customDocsPath) {
      this.docsPath = customDocsPath;
    } else if (envAssetsDir && import_fs2.default.existsSync(import_path2.default.join(envAssetsDir, "n8n-docs-complete.json"))) {
      this.docsPath = import_path2.default.join(envAssetsDir, "n8n-docs-complete.json");
    } else {
      const siblingPath = import_path2.default.resolve(_dirname2, "../assets/n8n-docs-complete.json");
      if (import_fs2.default.existsSync(siblingPath)) {
        this.docsPath = siblingPath;
      } else {
        this.docsPath = import_path2.default.resolve(_dirname2, "../../assets/n8n-docs-complete.json");
      }
    }
  }
  /**
   * Load documentation
   */
  loadDocs() {
    if (this.docs)
      return;
    if (!import_fs2.default.existsSync(this.docsPath)) {
      throw new Error(`Documentation not found at ${this.docsPath}. Please run the build process: npm run build in packages/agent-cli`);
    }
    try {
      const content = import_fs2.default.readFileSync(this.docsPath, "utf-8");
      this.docs = JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load documentation: ${error.message}. The file may be corrupted. Try rebuilding: npm run build in packages/agent-cli`);
    }
  }
  /**
   * Search documentation pages
   */
  searchDocs(query, options = {}) {
    this.loadDocs();
    if (!this.docs)
      return [];
    const queryLower = query.toLowerCase();
    const queryClean = queryLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const queryTerms = queryClean.split(/\s+/).filter((t) => t.length > 2);
    const results = [];
    for (const page of this.docs.pages) {
      if (options.category && page.category !== options.category)
        continue;
      if (options.complexity && page.metadata.complexity !== options.complexity)
        continue;
      if (options.hasCodeExamples && page.metadata.codeExamples === 0)
        continue;
      if (options.filter && !options.filter(page))
        continue;
      const docTitleClean = page.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const docContentClean = page.content.markdown.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const docKeywordsClean = page.metadata.keywords.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let score = 0;
      if (docTitleClean === queryClean) {
        score += 100;
      }
      if (queryTerms.length > 0 && queryTerms.every((t) => docTitleClean.includes(t))) {
        score += 50;
      }
      const termsInTitle = queryTerms.filter((t) => docTitleClean.includes(t)).length;
      score += termsInTitle * 10;
      const termsInKeywords = queryTerms.filter((t) => docKeywordsClean.includes(t)).length;
      score += termsInKeywords * 5;
      if (queryTerms.length > 0 && queryTerms.some((t) => docContentClean.includes(t))) {
        const termsInContent = queryTerms.filter((t) => docContentClean.includes(t)).length;
        score += termsInContent * 2;
      }
      if (score > 0) {
        results.push({ page, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    const limit = options.limit || 10;
    return results.slice(0, limit).map((r) => r.page);
  }
  /**
   * Get documentation page by ID
   */
  getDocPage(pageId) {
    this.loadDocs();
    if (!this.docs)
      return null;
    return this.docs.pages.find((p) => p.id === pageId) || null;
  }
  /**
   * Get documentation page by title
   */
  getDocPageByTitle(title) {
    this.loadDocs();
    if (!this.docs)
      return null;
    const titleLower = title.toLowerCase();
    return this.docs.pages.find((p) => p.title.toLowerCase() === titleLower) || null;
  }
  /**
   * List pages by category
   */
  listByCategory(category) {
    this.loadDocs();
    if (!this.docs)
      return [];
    return this.docs.pages.filter((p) => p.category === category);
  }
  /**
   * Get all categories
   */
  getCategories() {
    this.loadDocs();
    if (!this.docs)
      return [];
    return Object.entries(this.docs.categories).map(([name, data]) => ({
      name,
      description: data.description,
      count: data.totalPages
    }));
  }
  /**
   * Find related pages
   */
  findRelated(pageId, limit = 5) {
    this.loadDocs();
    if (!this.docs)
      return [];
    const page = this.getDocPage(pageId);
    if (!page || !page.metadata.relatedPages)
      return [];
    const related = [];
    for (const relatedRef of page.metadata.relatedPages) {
      const relatedPage = this.getDocPage(relatedRef.id);
      if (relatedPage) {
        related.push(relatedPage);
      }
      if (related.length >= limit)
        break;
    }
    return related;
  }
  /**
   * Search by keywords
   */
  searchByKeywords(keywords) {
    this.loadDocs();
    if (!this.docs)
      return [];
    const results = /* @__PURE__ */ new Map();
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      for (const page of this.docs.pages) {
        if (page.metadata.keywords.some((k) => k.toLowerCase() === keywordLower)) {
          const current = results.get(page.id) || 0;
          results.set(page.id, current + 1);
        }
      }
    }
    const sorted = Array.from(results.entries()).sort((a, b) => b[1] - a[1]).map(([pageId]) => this.getDocPage(pageId)).filter((p) => p !== null);
    return sorted;
  }
  /**
   * Get documentation for a specific node
   */
  getNodeDocumentation(nodeName) {
    this.loadDocs();
    if (!this.docs)
      return [];
    return this.docs.pages.filter((p) => p.nodeName?.toLowerCase() === nodeName.toLowerCase());
  }
  /**
   * Get guides (tutorials/advanced-ai/workflows pages)
   */
  getGuides(query, limit = 10) {
    this.loadDocs();
    if (!query) {
      if (!this.docs)
        return [];
      return this.docs.pages.filter((p) => ["tutorials", "advanced-ai", "workflows"].includes(p.category) || p.subcategory === "examples").slice(0, limit);
    }
    return this.searchDocs(query, {
      limit,
      filter: (page) => ["tutorials", "advanced-ai", "workflows"].includes(page.category) || page.subcategory === "examples"
    });
  }
  /**
   * Get statistics
   */
  getStatistics() {
    this.loadDocs();
    if (!this.docs)
      return null;
    return {
      totalPages: this.docs.totalPages,
      byCategory: this.docs.statistics.byCategory,
      withNodeNames: this.docs.statistics.withNodeNames,
      withUseCases: this.docs.statistics.withUseCases,
      withCodeExamples: this.docs.statistics.withCodeExamples
    };
  }
};

// ../skills/dist/services/knowledge-search.js
var import_fs3 = __toESM(require("fs"), 1);
var import_path3 = __toESM(require("path"), 1);
var import_url3 = require("url");

// ../../node_modules/flexsearch/dist/flexsearch.bundle.module.min.mjs
var import_meta3 = {};
var w;
function H(a, c, b) {
  const e = typeof b, d = typeof a;
  if (e !== "undefined") {
    if (d !== "undefined") {
      if (b) {
        if (d === "function" && e === d) return function(k) {
          return a(b(k));
        };
        c = a.constructor;
        if (c === b.constructor) {
          if (c === Array) return b.concat(a);
          if (c === Map) {
            var f = new Map(b);
            for (var g of a) f.set(g[0], g[1]);
            return f;
          }
          if (c === Set) {
            g = new Set(b);
            for (f of a.values()) g.add(f);
            return g;
          }
        }
      }
      return a;
    }
    return b;
  }
  return d === "undefined" ? c : a;
}
function aa(a, c) {
  return typeof a === "undefined" ? c : a;
}
function I() {
  return /* @__PURE__ */ Object.create(null);
}
function M(a) {
  return typeof a === "string";
}
function ba(a) {
  return typeof a === "object";
}
function ca(a, c) {
  if (M(c)) a = a[c];
  else for (let b = 0; a && b < c.length; b++) a = a[c[b]];
  return a;
}
var ea = /[^\p{L}\p{N}]+/u;
var fa = /(\d{3})/g;
var ha = /(\D)(\d{3})/g;
var ia = /(\d{3})(\D)/g;
var ja = /[\u0300-\u036f]/g;
function ka(a = {}) {
  if (!this || this.constructor !== ka) return new ka(...arguments);
  if (arguments.length) for (a = 0; a < arguments.length; a++) this.assign(arguments[a]);
  else this.assign(a);
}
w = ka.prototype;
w.assign = function(a) {
  this.normalize = H(a.normalize, true, this.normalize);
  let c = a.include, b = c || a.exclude || a.split, e;
  if (b || b === "") {
    if (typeof b === "object" && b.constructor !== RegExp) {
      let d = "";
      e = !c;
      c || (d += "\\p{Z}");
      b.letter && (d += "\\p{L}");
      b.number && (d += "\\p{N}", e = !!c);
      b.symbol && (d += "\\p{S}");
      b.punctuation && (d += "\\p{P}");
      b.control && (d += "\\p{C}");
      if (b = b.char) d += typeof b === "object" ? b.join("") : b;
      try {
        this.split = new RegExp("[" + (c ? "^" : "") + d + "]+", "u");
      } catch (f) {
        this.split = /\s+/;
      }
    } else this.split = b, e = b === false || "a1a".split(b).length < 2;
    this.numeric = H(a.numeric, e);
  } else {
    try {
      this.split = H(this.split, ea);
    } catch (d) {
      this.split = /\s+/;
    }
    this.numeric = H(a.numeric, H(this.numeric, true));
  }
  this.prepare = H(a.prepare, null, this.prepare);
  this.finalize = H(a.finalize, null, this.finalize);
  b = a.filter;
  this.filter = typeof b === "function" ? b : H(b && new Set(b), null, this.filter);
  this.dedupe = H(a.dedupe, true, this.dedupe);
  this.matcher = H((b = a.matcher) && new Map(b), null, this.matcher);
  this.mapper = H((b = a.mapper) && new Map(b), null, this.mapper);
  this.stemmer = H(
    (b = a.stemmer) && new Map(b),
    null,
    this.stemmer
  );
  this.replacer = H(a.replacer, null, this.replacer);
  this.minlength = H(a.minlength, 1, this.minlength);
  this.maxlength = H(a.maxlength, 1024, this.maxlength);
  this.rtl = H(a.rtl, false, this.rtl);
  if (this.cache = b = H(a.cache, true, this.cache)) this.F = null, this.L = typeof b === "number" ? b : 2e5, this.B = /* @__PURE__ */ new Map(), this.D = /* @__PURE__ */ new Map(), this.I = this.H = 128;
  this.h = "";
  this.J = null;
  this.A = "";
  this.K = null;
  if (this.matcher) for (const d of this.matcher.keys()) this.h += (this.h ? "|" : "") + d;
  if (this.stemmer) for (const d of this.stemmer.keys()) this.A += (this.A ? "|" : "") + d;
  return this;
};
w.addStemmer = function(a, c) {
  this.stemmer || (this.stemmer = /* @__PURE__ */ new Map());
  this.stemmer.set(a, c);
  this.A += (this.A ? "|" : "") + a;
  this.K = null;
  this.cache && Q(this);
  return this;
};
w.addFilter = function(a) {
  typeof a === "function" ? this.filter = a : (this.filter || (this.filter = /* @__PURE__ */ new Set()), this.filter.add(a));
  this.cache && Q(this);
  return this;
};
w.addMapper = function(a, c) {
  if (typeof a === "object") return this.addReplacer(a, c);
  if (a.length > 1) return this.addMatcher(a, c);
  this.mapper || (this.mapper = /* @__PURE__ */ new Map());
  this.mapper.set(a, c);
  this.cache && Q(this);
  return this;
};
w.addMatcher = function(a, c) {
  if (typeof a === "object") return this.addReplacer(a, c);
  if (a.length < 2 && (this.dedupe || this.mapper)) return this.addMapper(a, c);
  this.matcher || (this.matcher = /* @__PURE__ */ new Map());
  this.matcher.set(a, c);
  this.h += (this.h ? "|" : "") + a;
  this.J = null;
  this.cache && Q(this);
  return this;
};
w.addReplacer = function(a, c) {
  if (typeof a === "string") return this.addMatcher(a, c);
  this.replacer || (this.replacer = []);
  this.replacer.push(a, c);
  this.cache && Q(this);
  return this;
};
w.encode = function(a, c) {
  if (this.cache && a.length <= this.H) if (this.F) {
    if (this.B.has(a)) return this.B.get(a);
  } else this.F = setTimeout(Q, 50, this);
  this.normalize && (typeof this.normalize === "function" ? a = this.normalize(a) : a = ja ? a.normalize("NFKD").replace(ja, "").toLowerCase() : a.toLowerCase());
  this.prepare && (a = this.prepare(a));
  this.numeric && a.length > 3 && (a = a.replace(ha, "$1 $2").replace(ia, "$1 $2").replace(fa, "$1 "));
  const b = !(this.dedupe || this.mapper || this.filter || this.matcher || this.stemmer || this.replacer);
  let e = [], d = I(), f, g, k = this.split || this.split === "" ? a.split(this.split) : [a];
  for (let l = 0, m, p; l < k.length; l++) if ((m = p = k[l]) && !(m.length < this.minlength || m.length > this.maxlength)) {
    if (c) {
      if (d[m]) continue;
      d[m] = 1;
    } else {
      if (f === m) continue;
      f = m;
    }
    if (b) e.push(m);
    else if (!this.filter || (typeof this.filter === "function" ? this.filter(m) : !this.filter.has(m))) {
      if (this.cache && m.length <= this.I) if (this.F) {
        var h = this.D.get(m);
        if (h || h === "") {
          h && e.push(h);
          continue;
        }
      } else this.F = setTimeout(Q, 50, this);
      if (this.stemmer) {
        this.K || (this.K = new RegExp("(?!^)(" + this.A + ")$"));
        let u;
        for (; u !== m && m.length > 2; ) u = m, m = m.replace(this.K, (r) => this.stemmer.get(r));
      }
      if (m && (this.mapper || this.dedupe && m.length > 1)) {
        h = "";
        for (let u = 0, r = "", t, n; u < m.length; u++) t = m.charAt(u), t === r && this.dedupe || ((n = this.mapper && this.mapper.get(t)) || n === "" ? n === r && this.dedupe || !(r = n) || (h += n) : h += r = t);
        m = h;
      }
      this.matcher && m.length > 1 && (this.J || (this.J = new RegExp("(" + this.h + ")", "g")), m = m.replace(this.J, (u) => this.matcher.get(u)));
      if (m && this.replacer) for (h = 0; m && h < this.replacer.length; h += 2) m = m.replace(
        this.replacer[h],
        this.replacer[h + 1]
      );
      this.cache && p.length <= this.I && (this.D.set(p, m), this.D.size > this.L && (this.D.clear(), this.I = this.I / 1.1 | 0));
      if (m) {
        if (m !== p) if (c) {
          if (d[m]) continue;
          d[m] = 1;
        } else {
          if (g === m) continue;
          g = m;
        }
        e.push(m);
      }
    }
  }
  this.finalize && (e = this.finalize(e) || e);
  this.cache && a.length <= this.H && (this.B.set(a, e), this.B.size > this.L && (this.B.clear(), this.H = this.H / 1.1 | 0));
  return e;
};
function Q(a) {
  a.F = null;
  a.B.clear();
  a.D.clear();
}
function la(a, c, b) {
  b || (c || typeof a !== "object" ? typeof c === "object" && (b = c, c = 0) : b = a);
  b && (a = b.query || a, c = b.limit || c);
  let e = "" + (c || 0);
  b && (e += (b.offset || 0) + !!b.context + !!b.suggest + (b.resolve !== false) + (b.resolution || this.resolution) + (b.boost || 0));
  a = ("" + a).toLowerCase();
  this.cache || (this.cache = new ma());
  let d = this.cache.get(a + e);
  if (!d) {
    const f = b && b.cache;
    f && (b.cache = false);
    d = this.search(a, c, b);
    f && (b.cache = f);
    this.cache.set(a + e, d);
  }
  return d;
}
function ma(a) {
  this.limit = a && a !== true ? a : 1e3;
  this.cache = /* @__PURE__ */ new Map();
  this.h = "";
}
ma.prototype.set = function(a, c) {
  this.cache.set(this.h = a, c);
  this.cache.size > this.limit && this.cache.delete(this.cache.keys().next().value);
};
ma.prototype.get = function(a) {
  const c = this.cache.get(a);
  c && this.h !== a && (this.cache.delete(a), this.cache.set(this.h = a, c));
  return c;
};
ma.prototype.remove = function(a) {
  for (const c of this.cache) {
    const b = c[0];
    c[1].includes(a) && this.cache.delete(b);
  }
};
ma.prototype.clear = function() {
  this.cache.clear();
  this.h = "";
};
var na = { normalize: false, numeric: false, dedupe: false };
var oa = {};
var ra = /* @__PURE__ */ new Map([["b", "p"], ["v", "f"], ["w", "f"], ["z", "s"], ["x", "s"], ["d", "t"], ["n", "m"], ["c", "k"], ["g", "k"], ["j", "k"], ["q", "k"], ["i", "e"], ["y", "e"], ["u", "o"]]);
var sa = /* @__PURE__ */ new Map([["ae", "a"], ["oe", "o"], ["sh", "s"], ["kh", "k"], ["th", "t"], ["ph", "f"], ["pf", "f"]]);
var ta = [/([^aeo])h(.)/g, "$1$2", /([aeo])h([^aeo]|$)/g, "$1$2", /(.)\1+/g, "$1"];
var ua = { a: "", e: "", i: "", o: "", u: "", y: "", b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, "\xDF": 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
var va = { Exact: na, Default: oa, Normalize: oa, LatinBalance: { mapper: ra }, LatinAdvanced: { mapper: ra, matcher: sa, replacer: ta }, LatinExtra: { mapper: ra, replacer: ta.concat([/(?!^)[aeo]/g, ""]), matcher: sa }, LatinSoundex: { dedupe: false, include: { letter: true }, finalize: function(a) {
  for (let b = 0; b < a.length; b++) {
    var c = a[b];
    let e = c.charAt(0), d = ua[e];
    for (let f = 1, g; f < c.length && (g = c.charAt(f), g === "h" || g === "w" || !(g = ua[g]) || g === d || (e += g, d = g, e.length !== 4)); f++) ;
    a[b] = e;
  }
} }, CJK: { split: "" }, LatinExact: na, LatinDefault: oa, LatinSimple: oa };
function wa(a, c, b, e) {
  let d = [];
  for (let f = 0, g; f < a.index.length; f++) if (g = a.index[f], c >= g.length) c -= g.length;
  else {
    c = g[e ? "splice" : "slice"](c, b);
    const k = c.length;
    if (k && (d = d.length ? d.concat(c) : c, b -= k, e && (a.length -= k), !b)) break;
    c = 0;
  }
  return d;
}
function xa(a) {
  if (!this || this.constructor !== xa) return new xa(a);
  this.index = a ? [a] : [];
  this.length = a ? a.length : 0;
  const c = this;
  return new Proxy([], { get(b, e) {
    if (e === "length") return c.length;
    if (e === "push") return function(d) {
      c.index[c.index.length - 1].push(d);
      c.length++;
    };
    if (e === "pop") return function() {
      if (c.length) return c.length--, c.index[c.index.length - 1].pop();
    };
    if (e === "indexOf") return function(d) {
      let f = 0;
      for (let g = 0, k, h; g < c.index.length; g++) {
        k = c.index[g];
        h = k.indexOf(d);
        if (h >= 0) return f + h;
        f += k.length;
      }
      return -1;
    };
    if (e === "includes") return function(d) {
      for (let f = 0; f < c.index.length; f++) if (c.index[f].includes(d)) return true;
      return false;
    };
    if (e === "slice") return function(d, f) {
      return wa(c, d || 0, f || c.length, false);
    };
    if (e === "splice") return function(d, f) {
      return wa(c, d || 0, f || c.length, true);
    };
    if (e === "constructor") return Array;
    if (typeof e !== "symbol") return (b = c.index[e / 2 ** 31 | 0]) && b[e];
  }, set(b, e, d) {
    b = e / 2 ** 31 | 0;
    (c.index[b] || (c.index[b] = []))[e] = d;
    c.length++;
    return true;
  } });
}
xa.prototype.clear = function() {
  this.index.length = 0;
};
xa.prototype.push = function() {
};
function R(a = 8) {
  if (!this || this.constructor !== R) return new R(a);
  this.index = I();
  this.h = [];
  this.size = 0;
  a > 32 ? (this.B = Aa, this.A = BigInt(a)) : (this.B = Ba, this.A = a);
}
R.prototype.get = function(a) {
  const c = this.index[this.B(a)];
  return c && c.get(a);
};
R.prototype.set = function(a, c) {
  var b = this.B(a);
  let e = this.index[b];
  e ? (b = e.size, e.set(a, c), (b -= e.size) && this.size++) : (this.index[b] = e = /* @__PURE__ */ new Map([[a, c]]), this.h.push(e), this.size++);
};
function S(a = 8) {
  if (!this || this.constructor !== S) return new S(a);
  this.index = I();
  this.h = [];
  this.size = 0;
  a > 32 ? (this.B = Aa, this.A = BigInt(a)) : (this.B = Ba, this.A = a);
}
S.prototype.add = function(a) {
  var c = this.B(a);
  let b = this.index[c];
  b ? (c = b.size, b.add(a), (c -= b.size) && this.size++) : (this.index[c] = b = /* @__PURE__ */ new Set([a]), this.h.push(b), this.size++);
};
w = R.prototype;
w.has = S.prototype.has = function(a) {
  const c = this.index[this.B(a)];
  return c && c.has(a);
};
w.delete = S.prototype.delete = function(a) {
  const c = this.index[this.B(a)];
  c && c.delete(a) && this.size--;
};
w.clear = S.prototype.clear = function() {
  this.index = I();
  this.h = [];
  this.size = 0;
};
w.values = S.prototype.values = function* () {
  for (let a = 0; a < this.h.length; a++) for (let c of this.h[a].values()) yield c;
};
w.keys = S.prototype.keys = function* () {
  for (let a = 0; a < this.h.length; a++) for (let c of this.h[a].keys()) yield c;
};
w.entries = S.prototype.entries = function* () {
  for (let a = 0; a < this.h.length; a++) for (let c of this.h[a].entries()) yield c;
};
function Ba(a) {
  let c = 2 ** this.A - 1;
  if (typeof a == "number") return a & c;
  let b = 0, e = this.A + 1;
  for (let d = 0; d < a.length; d++) b = (b * e ^ a.charCodeAt(d)) & c;
  return this.A === 32 ? b + 2 ** 31 : b;
}
function Aa(a) {
  let c = BigInt(2) ** this.A - BigInt(1);
  var b = typeof a;
  if (b === "bigint") return a & c;
  if (b === "number") return BigInt(a) & c;
  b = BigInt(0);
  let e = this.A + BigInt(1);
  for (let d = 0; d < a.length; d++) b = (b * e ^ BigInt(a.charCodeAt(d))) & c;
  return b;
}
var Ca;
var Da;
async function Ea(a) {
  a = a.data;
  var c = a.task;
  const b = a.id;
  let e = a.args;
  switch (c) {
    case "init":
      Da = a.options || {};
      (c = a.factory) ? (Function("return " + c)()(self), Ca = new self.FlexSearch.Index(Da), delete self.FlexSearch) : Ca = new T(Da);
      postMessage({ id: b });
      break;
    default:
      let d;
      c === "export" && (e[1] ? (e[0] = Da.export, e[2] = 0, e[3] = 1) : e = null);
      c === "import" ? e[0] && (a = await Da.import.call(Ca, e[0]), Ca.import(e[0], a)) : ((d = e && Ca[c].apply(Ca, e)) && d.then && (d = await d), d && d.await && (d = await d.await), c === "search" && d.result && (d = d.result));
      postMessage(c === "search" ? { id: b, msg: d } : { id: b });
  }
}
function Fa(a) {
  Ga.call(a, "add");
  Ga.call(a, "append");
  Ga.call(a, "search");
  Ga.call(a, "update");
  Ga.call(a, "remove");
  Ga.call(a, "searchCache");
}
var Ha;
var Ia;
var Ja;
function Ka() {
  Ha = Ja = 0;
}
function Ga(a) {
  this[a + "Async"] = function() {
    const c = arguments;
    var b = c[c.length - 1];
    let e;
    typeof b === "function" && (e = b, delete c[c.length - 1]);
    Ha ? Ja || (Ja = Date.now() - Ia >= this.priority * this.priority * 3) : (Ha = setTimeout(Ka, 0), Ia = Date.now());
    if (Ja) {
      const f = this;
      return new Promise((g) => {
        setTimeout(function() {
          g(f[a + "Async"].apply(f, c));
        }, 0);
      });
    }
    const d = this[a].apply(this, c);
    b = d.then ? d : new Promise((f) => f(d));
    e && b.then(e);
    return b;
  };
}
var V = 0;
function La(a = {}, c) {
  function b(k) {
    function h(l) {
      l = l.data || l;
      const m = l.id, p = m && f.h[m];
      p && (p(l.msg), delete f.h[m]);
    }
    this.worker = k;
    this.h = I();
    if (this.worker) {
      d ? this.worker.on("message", h) : this.worker.onmessage = h;
      if (a.config) return new Promise(function(l) {
        V > 1e9 && (V = 0);
        f.h[++V] = function() {
          l(f);
        };
        f.worker.postMessage({ id: V, task: "init", factory: e, options: a });
      });
      this.priority = a.priority || 4;
      this.encoder = c || null;
      this.worker.postMessage({ task: "init", factory: e, options: a });
      return this;
    }
  }
  if (!this || this.constructor !== La) return new La(a);
  let e = typeof self !== "undefined" ? self._factory : typeof window !== "undefined" ? window._factory : null;
  e && (e = e.toString());
  const d = typeof window === "undefined", f = this, g = Ma(e, d, a.worker);
  return g.then ? g.then(function(k) {
    return b.call(f, k);
  }) : b.call(this, g);
}
W("add");
W("append");
W("search");
W("update");
W("remove");
W("clear");
W("export");
W("import");
La.prototype.searchCache = la;
Fa(La.prototype);
function W(a) {
  La.prototype[a] = function() {
    const c = this, b = [].slice.call(arguments);
    var e = b[b.length - 1];
    let d;
    typeof e === "function" && (d = e, b.pop());
    e = new Promise(function(f) {
      a === "export" && typeof b[0] === "function" && (b[0] = null);
      V > 1e9 && (V = 0);
      c.h[++V] = f;
      c.worker.postMessage({ task: a, id: V, args: b });
    });
    return d ? (e.then(d), this) : e;
  };
}
function Ma(a, c, b) {
  return c ? typeof module !== "undefined" ? new (require("worker_threads"))["Worker"](__dirname + "/worker/node.js") : import("worker_threads").then(function(worker) {
    return new worker["Worker"](import_meta3.dirname + "/node/node.mjs");
  }) : a ? new window.Worker(URL.createObjectURL(new Blob(["onmessage=" + Ea.toString()], { type: "text/javascript" }))) : new window.Worker(typeof b === "string" ? b : import_meta3.url.replace("/worker.js", "/worker/worker.js").replace(
    "flexsearch.bundle.module.min.js",
    "module/worker/worker.js"
  ).replace("flexsearch.bundle.module.min.mjs", "module/worker/worker.js"), { type: "module" });
}
Na.prototype.add = function(a, c, b) {
  ba(a) && (c = a, a = ca(c, this.key));
  if (c && (a || a === 0)) {
    if (!b && this.reg.has(a)) return this.update(a, c);
    for (let k = 0, h; k < this.field.length; k++) {
      h = this.B[k];
      var e = this.index.get(this.field[k]);
      if (typeof h === "function") {
        var d = h(c);
        d && e.add(a, d, b, true);
      } else if (d = h.G, !d || d(c)) h.constructor === String ? h = ["" + h] : M(h) && (h = [h]), Qa(c, h, this.D, 0, e, a, h[0], b);
    }
    if (this.tag) for (e = 0; e < this.A.length; e++) {
      var f = this.A[e];
      d = this.tag.get(this.F[e]);
      let k = I();
      if (typeof f === "function") {
        if (f = f(c), !f) continue;
      } else {
        var g = f.G;
        if (g && !g(c)) continue;
        f.constructor === String && (f = "" + f);
        f = ca(c, f);
      }
      if (d && f) {
        M(f) && (f = [f]);
        for (let h = 0, l, m; h < f.length; h++) if (l = f[h], !k[l] && (k[l] = 1, (g = d.get(l)) ? m = g : d.set(l, m = []), !b || !m.includes(a))) {
          if (m.length === 2 ** 31 - 1) {
            g = new xa(m);
            if (this.fastupdate) for (let p of this.reg.values()) p.includes(m) && (p[p.indexOf(m)] = g);
            d.set(l, m = g);
          }
          m.push(a);
          this.fastupdate && ((g = this.reg.get(a)) ? g.push(m) : this.reg.set(a, [m]));
        }
      }
    }
    if (this.store && (!b || !this.store.has(a))) {
      let k;
      if (this.h) {
        k = I();
        for (let h = 0, l; h < this.h.length; h++) {
          l = this.h[h];
          if ((b = l.G) && !b(c)) continue;
          let m;
          if (typeof l === "function") {
            m = l(c);
            if (!m) continue;
            l = [l.O];
          } else if (M(l) || l.constructor === String) {
            k[l] = c[l];
            continue;
          }
          Ra(c, k, l, 0, l[0], m);
        }
      }
      this.store.set(a, k || c);
    }
    this.worker && (this.fastupdate || this.reg.add(a));
  }
  return this;
};
function Ra(a, c, b, e, d, f) {
  a = a[d];
  if (e === b.length - 1) c[d] = f || a;
  else if (a) if (a.constructor === Array) for (c = c[d] = Array(a.length), d = 0; d < a.length; d++) Ra(a, c, b, e, d);
  else c = c[d] || (c[d] = I()), d = b[++e], Ra(a, c, b, e, d);
}
function Qa(a, c, b, e, d, f, g, k) {
  if (a = a[g]) if (e === c.length - 1) {
    if (a.constructor === Array) {
      if (b[e]) {
        for (c = 0; c < a.length; c++) d.add(f, a[c], true, true);
        return;
      }
      a = a.join(" ");
    }
    d.add(f, a, k, true);
  } else if (a.constructor === Array) for (g = 0; g < a.length; g++) Qa(a, c, b, e, d, f, g, k);
  else g = c[++e], Qa(a, c, b, e, d, f, g, k);
}
function Sa(a, c, b, e) {
  if (!a.length) return a;
  if (a.length === 1) return a = a[0], a = b || a.length > c ? a.slice(b, b + c) : a, e ? Ta.call(this, a) : a;
  let d = [];
  for (let f = 0, g, k; f < a.length; f++) if ((g = a[f]) && (k = g.length)) {
    if (b) {
      if (b >= k) {
        b -= k;
        continue;
      }
      g = g.slice(b, b + c);
      k = g.length;
      b = 0;
    }
    k > c && (g = g.slice(0, c), k = c);
    if (!d.length && k >= c) return e ? Ta.call(this, g) : g;
    d.push(g);
    c -= k;
    if (!c) break;
  }
  d = d.length > 1 ? [].concat.apply([], d) : d[0];
  return e ? Ta.call(this, d) : d;
}
function Ua(a, c, b, e) {
  var d = e[0];
  if (d[0] && d[0].query) return a[c].apply(a, d);
  if (!(c !== "and" && c !== "not" || a.result.length || a.await || d.suggest)) return e.length > 1 && (d = e[e.length - 1]), (e = d.resolve) ? a.await || a.result : a;
  let f = [], g = 0, k = 0, h, l, m, p, u;
  for (c = 0; c < e.length; c++) if (d = e[c]) {
    var r = void 0;
    if (d.constructor === X) r = d.await || d.result;
    else if (d.then || d.constructor === Array) r = d;
    else {
      g = d.limit || 0;
      k = d.offset || 0;
      m = d.suggest;
      l = d.resolve;
      h = ((p = d.highlight || a.highlight) || d.enrich) && l;
      r = d.queue;
      let t = d.async || r, n = d.index, q = d.query;
      n ? a.index || (a.index = n) : n = a.index;
      if (q || d.tag) {
        const x = d.field || d.pluck;
        x && (!q || a.query && !p || (a.query = q, a.field = x, a.highlight = p), n = n.index.get(x));
        if (r && (u || a.await)) {
          u = 1;
          let v;
          const A = a.C.length, D = new Promise(function(F) {
            v = F;
          });
          (function(F, E) {
            D.h = function() {
              E.index = null;
              E.resolve = false;
              let B = t ? F.searchAsync(E) : F.search(E);
              if (B.then) return B.then(function(z) {
                a.C[A] = z = z.result || z;
                v(z);
                return z;
              });
              B = B.result || B;
              v(B);
              return B;
            };
          })(n, Object.assign({}, d));
          a.C.push(D);
          f[c] = D;
          continue;
        } else d.resolve = false, d.index = null, r = t ? n.searchAsync(d) : n.search(d), d.resolve = l, d.index = n;
      } else if (d.and) r = Va(d, "and", n);
      else if (d.or) r = Va(d, "or", n);
      else if (d.not) r = Va(d, "not", n);
      else if (d.xor) r = Va(d, "xor", n);
      else continue;
    }
    r.await ? (u = 1, r = r.await) : r.then ? (u = 1, r = r.then(function(t) {
      return t.result || t;
    })) : r = r.result || r;
    f[c] = r;
  }
  u && !a.await && (a.await = new Promise(function(t) {
    a.return = t;
  }));
  if (u) {
    const t = Promise.all(f).then(function(n) {
      for (let q = 0; q < a.C.length; q++) if (a.C[q] === t) {
        a.C[q] = function() {
          return b.call(a, n, g, k, h, l, m, p);
        };
        break;
      }
      Wa(a);
    });
    a.C.push(t);
  } else if (a.await) a.C.push(function() {
    return b.call(a, f, g, k, h, l, m, p);
  });
  else return b.call(a, f, g, k, h, l, m, p);
  return l ? a.await || a.result : a;
}
function Va(a, c, b) {
  a = a[c];
  const e = a[0] || a;
  e.index || (e.index = b);
  b = new X(e);
  a.length > 1 && (b = b[c].apply(b, a.slice(1)));
  return b;
}
X.prototype.or = function() {
  return Ua(this, "or", Xa, arguments);
};
function Xa(a, c, b, e, d, f, g) {
  a.length && (this.result.length && a.push(this.result), a.length < 2 ? this.result = a[0] : (this.result = Ya(a, c, b, false, this.h), b = 0));
  d && (this.await = null);
  return d ? this.resolve(c, b, e, g) : this;
}
X.prototype.and = function() {
  return Ua(this, "and", Za, arguments);
};
function Za(a, c, b, e, d, f, g) {
  if (!f && !this.result.length) return d ? this.result : this;
  let k;
  if (a.length) if (this.result.length && a.unshift(this.result), a.length < 2) this.result = a[0];
  else {
    let h = 0;
    for (let l = 0, m, p; l < a.length; l++) if ((m = a[l]) && (p = m.length)) h < p && (h = p);
    else if (!f) {
      h = 0;
      break;
    }
    h ? (this.result = $a(a, h, c, b, f, this.h, d), k = true) : this.result = [];
  }
  else f || (this.result = a);
  d && (this.await = null);
  return d ? this.resolve(c, b, e, g, k) : this;
}
X.prototype.xor = function() {
  return Ua(this, "xor", ab, arguments);
};
function ab(a, c, b, e, d, f, g) {
  if (a.length) if (this.result.length && a.unshift(this.result), a.length < 2) this.result = a[0];
  else {
    a: {
      f = b;
      var k = this.h;
      const h = [], l = I();
      let m = 0;
      for (let p = 0, u; p < a.length; p++) if (u = a[p]) {
        m < u.length && (m = u.length);
        for (let r = 0, t; r < u.length; r++) if (t = u[r]) for (let n = 0, q; n < t.length; n++) q = t[n], l[q] = l[q] ? 2 : 1;
      }
      for (let p = 0, u, r = 0; p < m; p++) for (let t = 0, n; t < a.length; t++) if (n = a[t]) {
        if (u = n[p]) {
          for (let q = 0, x; q < u.length; q++) if (x = u[q], l[x] === 1) if (f) f--;
          else if (d) {
            if (h.push(x), h.length === c) {
              a = h;
              break a;
            }
          } else {
            const v = p + (t ? k : 0);
            h[v] || (h[v] = []);
            h[v].push(x);
            if (++r === c) {
              a = h;
              break a;
            }
          }
        }
      }
      a = h;
    }
    this.result = a;
    k = true;
  }
  else f || (this.result = a);
  d && (this.await = null);
  return d ? this.resolve(c, b, e, g, k) : this;
}
X.prototype.not = function() {
  return Ua(this, "not", bb, arguments);
};
function bb(a, c, b, e, d, f, g) {
  if (!f && !this.result.length) return d ? this.result : this;
  if (a.length && this.result.length) {
    a: {
      f = b;
      var k = [];
      a = new Set(a.flat().flat());
      for (let h = 0, l, m = 0; h < this.result.length; h++) if (l = this.result[h]) {
        for (let p = 0, u; p < l.length; p++) if (u = l[p], !a.has(u)) {
          if (f) f--;
          else if (d) {
            if (k.push(u), k.length === c) {
              a = k;
              break a;
            }
          } else if (k[h] || (k[h] = []), k[h].push(u), ++m === c) {
            a = k;
            break a;
          }
        }
      }
      a = k;
    }
    this.result = a;
    k = true;
  }
  d && (this.await = null);
  return d ? this.resolve(c, b, e, g, k) : this;
}
function cb(a, c, b, e, d) {
  let f, g, k;
  typeof d === "string" ? (f = d, d = "") : f = d.template;
  g = f.indexOf("$1");
  k = f.substring(g + 2);
  g = f.substring(0, g);
  let h = d && d.boundary, l = !d || d.clip !== false, m = d && d.merge && k && g && new RegExp(k + " " + g, "g");
  d = d && d.ellipsis;
  var p = 0;
  if (typeof d === "object") {
    var u = d.template;
    p = u.length - 2;
    d = d.pattern;
  }
  typeof d !== "string" && (d = d === false ? "" : "...");
  p && (d = u.replace("$1", d));
  u = d.length - p;
  let r, t;
  typeof h === "object" && (r = h.before, r === 0 && (r = -1), t = h.after, t === 0 && (t = -1), h = h.total || 9e5);
  p = /* @__PURE__ */ new Map();
  for (let Oa = 0, da, db, pa; Oa < c.length; Oa++) {
    let qa;
    if (e) qa = c, pa = e;
    else {
      var n = c[Oa];
      pa = n.field;
      if (!pa) continue;
      qa = n.result;
    }
    db = b.get(pa);
    da = db.encoder;
    n = p.get(da);
    typeof n !== "string" && (n = da.encode(a), p.set(da, n));
    for (let ya = 0; ya < qa.length; ya++) {
      var q = qa[ya].doc;
      if (!q) continue;
      q = ca(q, pa);
      if (!q) continue;
      var x = q.trim().split(/\s+/);
      if (!x.length) continue;
      q = "";
      var v = [];
      let za = [];
      var A = -1, D = -1, F = 0;
      for (var E = 0; E < x.length; E++) {
        var B = x[E], z = da.encode(B);
        z = z.length > 1 ? z.join(" ") : z[0];
        let y;
        if (z && B) {
          var C = B.length, J = (da.split ? B.replace(da.split, "") : B).length - z.length, G = "", N = 0;
          for (var O = 0; O < n.length; O++) {
            var P = n[O];
            if (P) {
              var L = P.length;
              L += J < 0 ? 0 : J;
              N && L <= N || (P = z.indexOf(P), P > -1 && (G = (P ? B.substring(0, P) : "") + g + B.substring(P, P + L) + k + (P + L < C ? B.substring(P + L) : ""), N = L, y = true));
            }
          }
          G && (h && (A < 0 && (A = q.length + (q ? 1 : 0)), D = q.length + (q ? 1 : 0) + G.length, F += C, za.push(v.length), v.push({ match: G })), q += (q ? " " : "") + G);
        }
        if (!y) B = x[E], q += (q ? " " : "") + B, h && v.push({ text: B });
        else if (h && F >= h) break;
      }
      F = za.length * (f.length - 2);
      if (r || t || h && q.length - F > h) if (F = h + F - u * 2, E = D - A, r > 0 && (E += r), t > 0 && (E += t), E <= F) x = r ? A - (r > 0 ? r : 0) : A - ((F - E) / 2 | 0), v = t ? D + (t > 0 ? t : 0) : x + F, l || (x > 0 && q.charAt(x) !== " " && q.charAt(x - 1) !== " " && (x = q.indexOf(" ", x), x < 0 && (x = 0)), v < q.length && q.charAt(v - 1) !== " " && q.charAt(v) !== " " && (v = q.lastIndexOf(" ", v), v < D ? v = D : ++v)), q = (x ? d : "") + q.substring(x, v) + (v < q.length ? d : "");
      else {
        D = [];
        A = {};
        F = {};
        E = {};
        B = {};
        z = {};
        G = J = C = 0;
        for (O = N = 1; ; ) {
          var U = void 0;
          for (let y = 0, K; y < za.length; y++) {
            K = za[y];
            if (G) if (J !== G) {
              if (E[y + 1]) continue;
              K += G;
              if (A[K]) {
                C -= u;
                F[y + 1] = 1;
                E[y + 1] = 1;
                continue;
              }
              if (K >= v.length - 1) {
                if (K >= v.length) {
                  E[y + 1] = 1;
                  K >= x.length && (F[y + 1] = 1);
                  continue;
                }
                C -= u;
              }
              q = v[K].text;
              if (L = t && z[y]) if (L > 0) {
                if (q.length > L) if (E[y + 1] = 1, l) q = q.substring(0, L);
                else continue;
                (L -= q.length) || (L = -1);
                z[y] = L;
              } else {
                E[y + 1] = 1;
                continue;
              }
              if (C + q.length + 1 <= h) q = " " + q, D[y] += q;
              else if (l) U = h - C - 1, U > 0 && (q = " " + q.substring(0, U), D[y] += q), E[y + 1] = 1;
              else {
                E[y + 1] = 1;
                continue;
              }
            } else {
              if (E[y]) continue;
              K -= J;
              if (A[K]) {
                C -= u;
                E[y] = 1;
                F[y] = 1;
                continue;
              }
              if (K <= 0) {
                if (K < 0) {
                  E[y] = 1;
                  F[y] = 1;
                  continue;
                }
                C -= u;
              }
              q = v[K].text;
              if (L = r && B[y]) if (L > 0) {
                if (q.length > L) if (E[y] = 1, l) q = q.substring(q.length - L);
                else continue;
                (L -= q.length) || (L = -1);
                B[y] = L;
              } else {
                E[y] = 1;
                continue;
              }
              if (C + q.length + 1 <= h) q += " ", D[y] = q + D[y];
              else if (l) U = q.length + 1 - (h - C), U >= 0 && U < q.length && (q = q.substring(U) + " ", D[y] = q + D[y]), E[y] = 1;
              else {
                E[y] = 1;
                continue;
              }
            }
            else {
              q = v[K].match;
              r && (B[y] = r);
              t && (z[y] = t);
              y && C++;
              let Pa;
              K ? !y && u && (C += u) : (F[y] = 1, E[y] = 1);
              K >= x.length - 1 ? Pa = 1 : K < v.length - 1 && v[K + 1].match ? Pa = 1 : u && (C += u);
              C -= f.length - 2;
              if (!y || C + q.length <= h) D[y] = q;
              else {
                U = N = O = F[y] = 0;
                break;
              }
              Pa && (F[y + 1] = 1, E[y + 1] = 1);
            }
            C += q.length;
            U = A[K] = 1;
          }
          if (U) J === G ? G++ : J++;
          else {
            J === G ? N = 0 : O = 0;
            if (!N && !O) break;
            N ? (J++, G = J) : G++;
          }
        }
        q = "";
        for (let y = 0, K; y < D.length; y++) K = (F[y] ? y ? " " : "" : (y && !d ? " " : "") + d) + D[y], q += K;
        d && !F[D.length] && (q += d);
      }
      m && (q = q.replace(m, " "));
      qa[ya].highlight = q;
    }
    if (e) break;
  }
  return c;
}
function X(a, c) {
  if (!this || this.constructor !== X) return new X(a, c);
  let b = 0, e, d, f, g, k, h;
  if (a && a.index) {
    const l = a;
    c = l.index;
    b = l.boost || 0;
    if (d = l.query) {
      f = l.field || l.pluck;
      g = l.highlight;
      const m = l.resolve;
      a = l.async || l.queue;
      l.resolve = false;
      l.index = null;
      a = a ? c.searchAsync(l) : c.search(l);
      l.resolve = m;
      l.index = c;
      a = a.result || a;
    } else a = [];
  }
  if (a && a.then) {
    const l = this;
    a = a.then(function(m) {
      l.C[0] = l.result = m.result || m;
      Wa(l);
    });
    e = [a];
    a = [];
    k = new Promise(function(m) {
      h = m;
    });
  }
  this.index = c || null;
  this.result = a || [];
  this.h = b;
  this.C = e || [];
  this.await = k || null;
  this.return = h || null;
  this.highlight = g || null;
  this.query = d || "";
  this.field = f || "";
}
w = X.prototype;
w.limit = function(a) {
  if (this.await) {
    const c = this;
    this.C.push(function() {
      return c.limit(a).result;
    });
  } else if (this.result.length) {
    const c = [];
    for (let b = 0, e; b < this.result.length; b++) if (e = this.result[b]) if (e.length <= a) {
      if (c[b] = e, a -= e.length, !a) break;
    } else {
      c[b] = e.slice(0, a);
      break;
    }
    this.result = c;
  }
  return this;
};
w.offset = function(a) {
  if (this.await) {
    const c = this;
    this.C.push(function() {
      return c.offset(a).result;
    });
  } else if (this.result.length) {
    const c = [];
    for (let b = 0, e; b < this.result.length; b++) if (e = this.result[b]) e.length <= a ? a -= e.length : (c[b] = e.slice(a), a = 0);
    this.result = c;
  }
  return this;
};
w.boost = function(a) {
  if (this.await) {
    const c = this;
    this.C.push(function() {
      return c.boost(a).result;
    });
  } else this.h += a;
  return this;
};
function Wa(a, c) {
  let b = a.result;
  var e = a.await;
  a.await = null;
  for (let d = 0, f; d < a.C.length; d++) if (f = a.C[d]) {
    if (typeof f === "function") b = f(), a.C[d] = b = b.result || b, d--;
    else if (f.h) b = f.h(), a.C[d] = b = b.result || b, d--;
    else if (f.then) return a.await = e;
  }
  e = a.return;
  a.C = [];
  a.return = null;
  c || e(b);
  return b;
}
w.resolve = function(a, c, b, e, d) {
  let f = this.await ? Wa(this, true) : this.result;
  if (f.then) {
    const g = this;
    return f.then(function() {
      return g.resolve(a, c, b, e, d);
    });
  }
  f.length && (typeof a === "object" ? (e = a.highlight || this.highlight, b = !!e || a.enrich, c = a.offset, a = a.limit) : (e = e || this.highlight, b = !!e || b), f = d ? b ? Ta.call(this.index, f) : f : Sa.call(this.index, f, a || 100, c, b));
  return this.finalize(f, e);
};
w.finalize = function(a, c) {
  if (a.then) {
    const e = this;
    return a.then(function(d) {
      return e.finalize(d, c);
    });
  }
  c && a.length && this.query && (a = cb(this.query, a, this.index.index, this.field, c));
  const b = this.return;
  this.highlight = this.index = this.result = this.C = this.await = this.return = null;
  this.query = this.field = "";
  b && b(a);
  return a;
};
function $a(a, c, b, e, d, f, g) {
  const k = a.length;
  let h = [], l, m;
  l = I();
  for (let p = 0, u, r, t, n; p < c; p++) for (let q = 0; q < k; q++) if (t = a[q], p < t.length && (u = t[p])) for (let x = 0; x < u.length; x++) {
    r = u[x];
    (m = l[r]) ? l[r]++ : (m = 0, l[r] = 1);
    n = h[m] || (h[m] = []);
    if (!g) {
      let v = p + (q || !d ? 0 : f || 0);
      n = n[v] || (n[v] = []);
    }
    n.push(r);
    if (g && b && m === k - 1 && n.length - e === b) return e ? n.slice(e) : n;
  }
  if (a = h.length) if (d) h = h.length > 1 ? Ya(h, b, e, g, f) : (h = h[0]) && b && h.length > b || e ? h.slice(e, b + e) : h;
  else {
    if (a < k) return [];
    h = h[a - 1];
    if (b || e) if (g) {
      if (h.length > b || e) h = h.slice(e, b + e);
    } else {
      d = [];
      for (let p = 0, u; p < h.length; p++) if (u = h[p]) if (e && u.length > e) e -= u.length;
      else {
        if (b && u.length > b || e) u = u.slice(e, b + e), b -= u.length, e && (e -= u.length);
        d.push(u);
        if (!b) break;
      }
      h = d;
    }
  }
  return h;
}
function Ya(a, c, b, e, d) {
  const f = [], g = I();
  let k;
  var h = a.length;
  let l;
  if (e) for (d = h - 1; d >= 0; d--) {
    if (l = (e = a[d]) && e.length) {
      for (h = 0; h < l; h++) if (k = e[h], !g[k]) {
        if (g[k] = 1, b) b--;
        else if (f.push(k), f.length === c) return f;
      }
    }
  }
  else for (let m = h - 1, p, u = 0; m >= 0; m--) {
    p = a[m];
    for (let r = 0; r < p.length; r++) if (l = (e = p[r]) && e.length) {
      for (let t = 0; t < l; t++) if (k = e[t], !g[k]) if (g[k] = 1, b) b--;
      else {
        let n = (r + (m < h - 1 ? d || 0 : 0)) / (m + 1) | 0;
        (f[n] || (f[n] = [])).push(k);
        if (++u === c) return f;
      }
    }
  }
  return f;
}
function eb(a, c, b, e, d) {
  const f = I(), g = [];
  for (let k = 0, h; k < c.length; k++) {
    h = c[k];
    for (let l = 0; l < h.length; l++) f[h[l]] = 1;
  }
  if (d) for (let k = 0, h; k < a.length; k++) {
    if (h = a[k], f[h]) {
      if (e) e--;
      else if (g.push(h), f[h] = 0, b && --b === 0) break;
    }
  }
  else for (let k = 0, h, l; k < a.result.length; k++) for (h = a.result[k], c = 0; c < h.length; c++) l = h[c], f[l] && ((g[k] || (g[k] = [])).push(l), f[l] = 0);
  return g;
}
I();
Na.prototype.search = function(a, c, b, e) {
  b || (!c && ba(a) ? (b = a, a = "") : ba(c) && (b = c, c = 0));
  let d = [];
  var f = [];
  let g;
  let k, h, l, m, p;
  let u = 0, r = true, t;
  if (b) {
    b.constructor === Array && (b = { index: b });
    a = b.query || a;
    g = b.pluck;
    k = b.merge;
    l = b.boost;
    p = g || b.field || (p = b.index) && (p.index ? null : p);
    var n = this.tag && b.tag;
    h = b.suggest;
    r = b.resolve !== false;
    m = b.cache;
    t = r && this.store && b.highlight;
    var q = !!t || r && this.store && b.enrich;
    c = b.limit || c;
    var x = b.offset || 0;
    c || (c = r ? 100 : 0);
    if (n && (!this.db || !e)) {
      n.constructor !== Array && (n = [n]);
      var v = [];
      for (let B = 0, z; B < n.length; B++) if (z = n[B], z.field && z.tag) {
        var A = z.tag;
        if (A.constructor === Array) for (var D = 0; D < A.length; D++) v.push(z.field, A[D]);
        else v.push(z.field, A);
      } else {
        A = Object.keys(z);
        for (let C = 0, J, G; C < A.length; C++) if (J = A[C], G = z[J], G.constructor === Array) for (D = 0; D < G.length; D++) v.push(J, G[D]);
        else v.push(J, G);
      }
      n = v;
      if (!a) {
        f = [];
        if (v.length) for (n = 0; n < v.length; n += 2) {
          if (this.db) {
            e = this.index.get(v[n]);
            if (!e) continue;
            f.push(e = e.db.tag(v[n + 1], c, x, q));
          } else e = fb.call(this, v[n], v[n + 1], c, x, q);
          d.push(r ? { field: v[n], tag: v[n + 1], result: e } : [e]);
        }
        if (f.length) {
          const B = this;
          return Promise.all(f).then(function(z) {
            for (let C = 0; C < z.length; C++) r ? d[C].result = z[C] : d[C] = z[C];
            return r ? d : new X(d.length > 1 ? $a(d, 1, 0, 0, h, l) : d[0], B);
          });
        }
        return r ? d : new X(d.length > 1 ? $a(d, 1, 0, 0, h, l) : d[0], this);
      }
    }
    r || g || !(p = p || this.field) || (M(p) ? g = p : (p.constructor === Array && p.length === 1 && (p = p[0]), g = p.field || p.index));
    p && p.constructor !== Array && (p = [p]);
  }
  p || (p = this.field);
  let F;
  v = (this.worker || this.db) && !e && [];
  for (let B = 0, z, C, J; B < p.length; B++) {
    C = p[B];
    if (this.db && this.tag && !this.B[B]) continue;
    let G;
    M(C) || (G = C, C = G.field, a = G.query || a, c = aa(G.limit, c), x = aa(G.offset, x), h = aa(G.suggest, h), t = r && this.store && aa(G.highlight, t), q = !!t || r && this.store && aa(G.enrich, q), m = aa(G.cache, m));
    if (e) z = e[B];
    else {
      A = G || b || {};
      D = A.enrich;
      var E = this.index.get(C);
      n && (this.db && (A.tag = n, A.field = p, F = E.db.support_tag_search), !F && D && (A.enrich = false), F || (A.limit = 0, A.offset = 0));
      z = m ? E.searchCache(a, n && !F ? 0 : c, A) : E.search(a, n && !F ? 0 : c, A);
      n && !F && (A.limit = c, A.offset = x);
      D && (A.enrich = D);
      if (v) {
        v[B] = z;
        continue;
      }
    }
    J = (z = z.result || z) && z.length;
    if (n && J) {
      A = [];
      D = 0;
      if (this.db && e) {
        if (!F) for (E = p.length; E < e.length; E++) {
          let N = e[E];
          if (N && N.length) D++, A.push(N);
          else if (!h) return r ? d : new X(d, this);
        }
      } else for (let N = 0, O, P; N < n.length; N += 2) {
        O = this.tag.get(n[N]);
        if (!O) if (h) continue;
        else return r ? d : new X(d, this);
        if (P = (O = O && O.get(n[N + 1])) && O.length) D++, A.push(O);
        else if (!h) return r ? d : new X(d, this);
      }
      if (D) {
        z = eb(z, A, c, x, r);
        J = z.length;
        if (!J && !h) return r ? z : new X(z, this);
        D--;
      }
    }
    if (J) f[u] = C, d.push(z), u++;
    else if (p.length === 1) return r ? d : new X(
      d,
      this
    );
  }
  if (v) {
    if (this.db && n && n.length && !F) for (q = 0; q < n.length; q += 2) {
      f = this.index.get(n[q]);
      if (!f) if (h) continue;
      else return r ? d : new X(d, this);
      v.push(f.db.tag(n[q + 1], c, x, false));
    }
    const B = this;
    return Promise.all(v).then(function(z) {
      b && (b.resolve = r);
      z.length && (z = B.search(a, c, b, z));
      return z;
    });
  }
  if (!u) return r ? d : new X(d, this);
  if (g && (!q || !this.store)) return d = d[0], r ? d : new X(d, this);
  v = [];
  for (x = 0; x < f.length; x++) {
    n = d[x];
    q && n.length && typeof n[0].doc === "undefined" && (this.db ? v.push(n = this.index.get(this.field[0]).db.enrich(n)) : n = Ta.call(this, n));
    if (g) return r ? t ? cb(a, n, this.index, g, t) : n : new X(n, this);
    d[x] = { field: f[x], result: n };
  }
  if (q && this.db && v.length) {
    const B = this;
    return Promise.all(v).then(function(z) {
      for (let C = 0; C < z.length; C++) d[C].result = z[C];
      t && (d = cb(a, d, B.index, g, t));
      return k ? gb(d) : d;
    });
  }
  t && (d = cb(a, d, this.index, g, t));
  return k ? gb(d) : d;
};
function gb(a) {
  const c = [], b = I(), e = I();
  for (let d = 0, f, g, k, h, l, m, p; d < a.length; d++) {
    f = a[d];
    g = f.field;
    k = f.result;
    for (let u = 0; u < k.length; u++) if (l = k[u], typeof l !== "object" ? l = { id: h = l } : h = l.id, (m = b[h]) ? m.push(g) : (l.field = b[h] = [g], c.push(l)), p = l.highlight) m = e[h], m || (e[h] = m = {}, l.highlight = m), m[g] = p;
  }
  return c;
}
function fb(a, c, b, e, d) {
  a = this.tag.get(a);
  if (!a) return [];
  a = a.get(c);
  if (!a) return [];
  c = a.length - e;
  if (c > 0) {
    if (b && c > b || e) a = a.slice(e, e + b);
    d && (a = Ta.call(this, a));
  }
  return a;
}
function Ta(a) {
  if (!this || !this.store) return a;
  if (this.db) return this.index.get(this.field[0]).db.enrich(a);
  const c = Array(a.length);
  for (let b = 0, e; b < a.length; b++) e = a[b], c[b] = { id: e, doc: this.store.get(e) };
  return c;
}
function Na(a) {
  if (!this || this.constructor !== Na) return new Na(a);
  const c = a.document || a.doc || a;
  let b, e;
  this.B = [];
  this.field = [];
  this.D = [];
  this.key = (b = c.key || c.id) && hb(b, this.D) || "id";
  (e = a.keystore || 0) && (this.keystore = e);
  this.fastupdate = !!a.fastupdate;
  this.reg = !this.fastupdate || a.worker || a.db ? e ? new S(e) : /* @__PURE__ */ new Set() : e ? new R(e) : /* @__PURE__ */ new Map();
  this.h = (b = c.store || null) && b && b !== true && [];
  this.store = b ? e ? new R(e) : /* @__PURE__ */ new Map() : null;
  this.cache = (b = a.cache || null) && new ma(b);
  a.cache = false;
  this.worker = a.worker || false;
  this.priority = a.priority || 4;
  this.index = ib.call(this, a, c);
  this.tag = null;
  if (b = c.tag) {
    if (typeof b === "string" && (b = [b]), b.length) {
      this.tag = /* @__PURE__ */ new Map();
      this.A = [];
      this.F = [];
      for (let d = 0, f, g; d < b.length; d++) {
        f = b[d];
        g = f.field || f;
        if (!g) throw Error("The tag field from the document descriptor is undefined.");
        f.custom ? this.A[d] = f.custom : (this.A[d] = hb(g, this.D), f.filter && (typeof this.A[d] === "string" && (this.A[d] = new String(this.A[d])), this.A[d].G = f.filter));
        this.F[d] = g;
        this.tag.set(g, /* @__PURE__ */ new Map());
      }
    }
  }
  if (this.worker) {
    this.fastupdate = false;
    a = [];
    for (const d of this.index.values()) d.then && a.push(d);
    if (a.length) {
      const d = this;
      return Promise.all(a).then(function(f) {
        let g = 0;
        for (const k of d.index.entries()) {
          const h = k[0];
          let l = k[1];
          l.then && (l = f[g], d.index.set(h, l), g++);
        }
        return d;
      });
    }
  } else a.db && (this.fastupdate = false, this.mount(a.db));
}
w = Na.prototype;
w.mount = function(a) {
  let c = this.field;
  if (this.tag) for (let f = 0, g; f < this.F.length; f++) {
    g = this.F[f];
    var b = void 0;
    this.index.set(g, b = new T({}, this.reg));
    c === this.field && (c = c.slice(0));
    c.push(g);
    b.tag = this.tag.get(g);
  }
  b = [];
  const e = { db: a.db, type: a.type, fastupdate: a.fastupdate };
  for (let f = 0, g, k; f < c.length; f++) {
    e.field = k = c[f];
    g = this.index.get(k);
    const h = new a.constructor(a.id, e);
    h.id = a.id;
    b[f] = h.mount(g);
    g.document = true;
    f ? g.bypass = true : g.store = this.store;
  }
  const d = this;
  return this.db = Promise.all(b).then(function() {
    d.db = true;
  });
};
w.commit = async function() {
  const a = [];
  for (const c of this.index.values()) a.push(c.commit());
  await Promise.all(a);
  this.reg.clear();
};
w.destroy = function() {
  const a = [];
  for (const c of this.index.values()) a.push(c.destroy());
  return Promise.all(a);
};
function ib(a, c) {
  const b = /* @__PURE__ */ new Map();
  let e = c.index || c.field || c;
  M(e) && (e = [e]);
  for (let f = 0, g, k; f < e.length; f++) {
    g = e[f];
    M(g) || (k = g, g = g.field);
    k = ba(k) ? Object.assign({}, a, k) : a;
    if (this.worker) {
      var d = void 0;
      d = (d = k.encoder) && d.encode ? d : new ka(typeof d === "string" ? va[d] : d || {});
      d = new La(k, d);
      b.set(g, d);
    }
    this.worker || b.set(g, new T(k, this.reg));
    k.custom ? this.B[f] = k.custom : (this.B[f] = hb(g, this.D), k.filter && (typeof this.B[f] === "string" && (this.B[f] = new String(this.B[f])), this.B[f].G = k.filter));
    this.field[f] = g;
  }
  if (this.h) {
    a = c.store;
    M(a) && (a = [a]);
    for (let f = 0, g, k; f < a.length; f++) g = a[f], k = g.field || g, g.custom ? (this.h[f] = g.custom, g.custom.O = k) : (this.h[f] = hb(k, this.D), g.filter && (typeof this.h[f] === "string" && (this.h[f] = new String(this.h[f])), this.h[f].G = g.filter));
  }
  return b;
}
function hb(a, c) {
  const b = a.split(":");
  let e = 0;
  for (let d = 0; d < b.length; d++) a = b[d], a[a.length - 1] === "]" && (a = a.substring(0, a.length - 2)) && (c[e] = true), a && (b[e++] = a);
  e < b.length && (b.length = e);
  return e > 1 ? b : b[0];
}
w.append = function(a, c) {
  return this.add(a, c, true);
};
w.update = function(a, c) {
  return this.remove(a).add(a, c);
};
w.remove = function(a) {
  ba(a) && (a = ca(a, this.key));
  for (var c of this.index.values()) c.remove(a, true);
  if (this.reg.has(a)) {
    if (this.tag && !this.fastupdate) for (let b of this.tag.values()) for (let e of b) {
      c = e[0];
      const d = e[1], f = d.indexOf(a);
      f > -1 && (d.length > 1 ? d.splice(f, 1) : b.delete(c));
    }
    this.store && this.store.delete(a);
    this.reg.delete(a);
  }
  this.cache && this.cache.remove(a);
  return this;
};
w.clear = function() {
  const a = [];
  for (const c of this.index.values()) {
    const b = c.clear();
    b.then && a.push(b);
  }
  if (this.tag) for (const c of this.tag.values()) c.clear();
  this.store && this.store.clear();
  this.cache && this.cache.clear();
  return a.length ? Promise.all(a) : this;
};
w.contain = function(a) {
  return this.db ? this.index.get(this.field[0]).db.has(a) : this.reg.has(a);
};
w.cleanup = function() {
  for (const a of this.index.values()) a.cleanup();
  return this;
};
w.get = function(a) {
  return this.db ? this.index.get(this.field[0]).db.enrich(a).then(function(c) {
    return c[0] && c[0].doc || null;
  }) : this.store.get(a) || null;
};
w.set = function(a, c) {
  typeof a === "object" && (c = a, a = ca(c, this.key));
  this.store.set(a, c);
  return this;
};
w.searchCache = la;
w.export = jb;
w.import = kb;
Fa(Na.prototype);
function lb(a, c = 0) {
  let b = [], e = [];
  c && (c = 25e4 / c * 5e3 | 0);
  for (const d of a.entries()) e.push(d), e.length === c && (b.push(e), e = []);
  e.length && b.push(e);
  return b;
}
function mb(a, c) {
  c || (c = /* @__PURE__ */ new Map());
  for (let b = 0, e; b < a.length; b++) e = a[b], c.set(e[0], e[1]);
  return c;
}
function nb(a, c = 0) {
  let b = [], e = [];
  c && (c = 25e4 / c * 1e3 | 0);
  for (const d of a.entries()) e.push([d[0], lb(d[1])[0] || []]), e.length === c && (b.push(e), e = []);
  e.length && b.push(e);
  return b;
}
function ob(a, c) {
  c || (c = /* @__PURE__ */ new Map());
  for (let b = 0, e, d; b < a.length; b++) e = a[b], d = c.get(e[0]), c.set(e[0], mb(e[1], d));
  return c;
}
function pb(a) {
  let c = [], b = [];
  for (const e of a.keys()) b.push(e), b.length === 25e4 && (c.push(b), b = []);
  b.length && c.push(b);
  return c;
}
function qb(a, c) {
  c || (c = /* @__PURE__ */ new Set());
  for (let b = 0; b < a.length; b++) c.add(a[b]);
  return c;
}
function rb(a, c, b, e, d, f, g = 0) {
  const k = e && e.constructor === Array;
  var h = k ? e.shift() : e;
  if (!h) return this.export(a, c, d, f + 1);
  if ((h = a((c ? c + "." : "") + (g + 1) + "." + b, JSON.stringify(h))) && h.then) {
    const l = this;
    return h.then(function() {
      return rb.call(l, a, c, b, k ? e : null, d, f, g + 1);
    });
  }
  return rb.call(this, a, c, b, k ? e : null, d, f, g + 1);
}
function jb(a, c, b = 0, e = 0) {
  if (b < this.field.length) {
    const g = this.field[b];
    if ((c = this.index.get(g).export(a, g, b, e = 1)) && c.then) {
      const k = this;
      return c.then(function() {
        return k.export(a, g, b + 1);
      });
    }
    return this.export(a, g, b + 1);
  }
  let d, f;
  switch (e) {
    case 0:
      d = "reg";
      f = pb(this.reg);
      c = null;
      break;
    case 1:
      d = "tag";
      f = this.tag && nb(this.tag, this.reg.size);
      c = null;
      break;
    case 2:
      d = "doc";
      f = this.store && lb(this.store);
      c = null;
      break;
    default:
      return;
  }
  return rb.call(this, a, c, d, f || null, b, e);
}
function kb(a, c) {
  var b = a.split(".");
  b[b.length - 1] === "json" && b.pop();
  const e = b.length > 2 ? b[0] : "";
  b = b.length > 2 ? b[2] : b[1];
  if (this.worker && e) return this.index.get(e).import(a);
  if (c) {
    typeof c === "string" && (c = JSON.parse(c));
    if (e) return this.index.get(e).import(b, c);
    switch (b) {
      case "reg":
        this.fastupdate = false;
        this.reg = qb(c, this.reg);
        for (let d = 0, f; d < this.field.length; d++) f = this.index.get(this.field[d]), f.fastupdate = false, f.reg = this.reg;
        if (this.worker) {
          c = [];
          for (const d of this.index.values()) c.push(d.import(a));
          return Promise.all(c);
        }
        break;
      case "tag":
        this.tag = ob(c, this.tag);
        break;
      case "doc":
        this.store = mb(c, this.store);
    }
  }
}
function sb(a, c) {
  let b = "";
  for (const e of a.entries()) {
    a = e[0];
    const d = e[1];
    let f = "";
    for (let g = 0, k; g < d.length; g++) {
      k = d[g] || [""];
      let h = "";
      for (let l = 0; l < k.length; l++) h += (h ? "," : "") + (c === "string" ? '"' + k[l] + '"' : k[l]);
      h = "[" + h + "]";
      f += (f ? "," : "") + h;
    }
    f = '["' + a + '",[' + f + "]]";
    b += (b ? "," : "") + f;
  }
  return b;
}
T.prototype.remove = function(a, c) {
  const b = this.reg.size && (this.fastupdate ? this.reg.get(a) : this.reg.has(a));
  if (b) {
    if (this.fastupdate) for (let e = 0, d, f; e < b.length; e++) {
      if ((d = b[e]) && (f = d.length)) if (d[f - 1] === a) d.pop();
      else {
        const g = d.indexOf(a);
        g >= 0 && d.splice(g, 1);
      }
    }
    else tb(this.map, a), this.depth && tb(this.ctx, a);
    c || this.reg.delete(a);
  }
  this.db && (this.commit_task.push({ del: a }), this.M && ub(this));
  this.cache && this.cache.remove(a);
  return this;
};
function tb(a, c) {
  let b = 0;
  var e = typeof c === "undefined";
  if (a.constructor === Array) for (let d = 0, f, g, k; d < a.length; d++) {
    if ((f = a[d]) && f.length) {
      if (e) return 1;
      g = f.indexOf(c);
      if (g >= 0) {
        if (f.length > 1) return f.splice(g, 1), 1;
        delete a[d];
        if (b) return 1;
        k = 1;
      } else {
        if (k) return 1;
        b++;
      }
    }
  }
  else for (let d of a.entries()) e = d[0], tb(d[1], c) ? b++ : a.delete(e);
  return b;
}
var vb = { memory: { resolution: 1 }, performance: { resolution: 3, fastupdate: true, context: { depth: 1, resolution: 1 } }, match: { tokenize: "forward" }, score: { resolution: 9, context: { depth: 2, resolution: 3 } } };
T.prototype.add = function(a, c, b, e) {
  if (c && (a || a === 0)) {
    if (!e && !b && this.reg.has(a)) return this.update(a, c);
    e = this.depth;
    c = this.encoder.encode(c, !e);
    const l = c.length;
    if (l) {
      const m = I(), p = I(), u = this.resolution;
      for (let r = 0; r < l; r++) {
        let t = c[this.rtl ? l - 1 - r : r];
        var d = t.length;
        if (d && (e || !p[t])) {
          var f = this.score ? this.score(c, t, r, null, 0) : wb(u, l, r), g = "";
          switch (this.tokenize) {
            case "tolerant":
              Y(this, p, t, f, a, b);
              if (d > 2) {
                for (let n = 1, q, x, v, A; n < d - 1; n++) q = t.charAt(n), x = t.charAt(n + 1), v = t.substring(0, n) + x, A = t.substring(n + 2), g = v + q + A, Y(this, p, g, f, a, b), g = v + A, Y(this, p, g, f, a, b);
                Y(this, p, t.substring(0, t.length - 1), f, a, b);
              }
              break;
            case "full":
              if (d > 2) {
                for (let n = 0, q; n < d; n++) for (f = d; f > n; f--) {
                  g = t.substring(n, f);
                  q = this.rtl ? d - 1 - n : n;
                  var k = this.score ? this.score(c, t, r, g, q) : wb(u, l, r, d, q);
                  Y(this, p, g, k, a, b);
                }
                break;
              }
            case "bidirectional":
            case "reverse":
              if (d > 1) {
                for (k = d - 1; k > 0; k--) {
                  g = t[this.rtl ? d - 1 - k : k] + g;
                  var h = this.score ? this.score(c, t, r, g, k) : wb(u, l, r, d, k);
                  Y(this, p, g, h, a, b);
                }
                g = "";
              }
            case "forward":
              if (d > 1) {
                for (k = 0; k < d; k++) g += t[this.rtl ? d - 1 - k : k], Y(
                  this,
                  p,
                  g,
                  f,
                  a,
                  b
                );
                break;
              }
            default:
              if (Y(this, p, t, f, a, b), e && l > 1 && r < l - 1) for (d = this.N, g = t, f = Math.min(e + 1, this.rtl ? r + 1 : l - r), k = 1; k < f; k++) {
                t = c[this.rtl ? l - 1 - r - k : r + k];
                h = this.bidirectional && t > g;
                const n = this.score ? this.score(c, g, r, t, k - 1) : wb(d + (l / 2 > d ? 0 : 1), l, r, f - 1, k - 1);
                Y(this, m, h ? g : t, n, a, b, h ? t : g);
              }
          }
        }
      }
      this.fastupdate || this.reg.add(a);
    }
  }
  this.db && (this.commit_task.push(b ? { ins: a } : { del: a }), this.M && ub(this));
  return this;
};
function Y(a, c, b, e, d, f, g) {
  let k, h;
  if (!(k = c[b]) || g && !k[g]) {
    g ? (c = k || (c[b] = I()), c[g] = 1, h = a.ctx, (k = h.get(g)) ? h = k : h.set(g, h = a.keystore ? new R(a.keystore) : /* @__PURE__ */ new Map())) : (h = a.map, c[b] = 1);
    (k = h.get(b)) ? h = k : h.set(b, h = k = []);
    if (f) {
      for (let l = 0, m; l < k.length; l++) if ((m = k[l]) && m.includes(d)) {
        if (l <= e) return;
        m.splice(m.indexOf(d), 1);
        a.fastupdate && (c = a.reg.get(d)) && c.splice(c.indexOf(m), 1);
        break;
      }
    }
    h = h[e] || (h[e] = []);
    h.push(d);
    if (h.length === 2 ** 31 - 1) {
      c = new xa(h);
      if (a.fastupdate) for (let l of a.reg.values()) l.includes(h) && (l[l.indexOf(h)] = c);
      k[e] = h = c;
    }
    a.fastupdate && ((e = a.reg.get(d)) ? e.push(h) : a.reg.set(d, [h]));
  }
}
function wb(a, c, b, e, d) {
  return b && a > 1 ? c + (e || 0) <= a ? b + (d || 0) : (a - 1) / (c + (e || 0)) * (b + (d || 0)) + 1 | 0 : 0;
}
T.prototype.search = function(a, c, b) {
  b || (c || typeof a !== "object" ? typeof c === "object" && (b = c, c = 0) : (b = a, a = ""));
  if (b && b.cache) return b.cache = false, a = this.searchCache(a, c, b), b.cache = true, a;
  let e = [], d, f, g, k = 0, h, l, m, p, u;
  b && (a = b.query || a, c = b.limit || c, k = b.offset || 0, f = b.context, g = b.suggest, u = (h = b.resolve) && b.enrich, m = b.boost, p = b.resolution, l = this.db && b.tag);
  typeof h === "undefined" && (h = this.resolve);
  f = this.depth && f !== false;
  let r = this.encoder.encode(a, !f);
  d = r.length;
  c = c || (h ? 100 : 0);
  if (d === 1) return xb.call(
    this,
    r[0],
    "",
    c,
    k,
    h,
    u,
    l
  );
  if (d === 2 && f && !g) return xb.call(this, r[1], r[0], c, k, h, u, l);
  let t = I(), n = 0, q;
  f && (q = r[0], n = 1);
  p || p === 0 || (p = q ? this.N : this.resolution);
  if (this.db) {
    if (this.db.search && (b = this.db.search(this, r, c, k, g, h, u, l), b !== false)) return b;
    const x = this;
    return (async function() {
      for (let v, A; n < d; n++) {
        if ((A = r[n]) && !t[A]) {
          t[A] = 1;
          v = await yb(x, A, q, 0, 0, false, false);
          if (v = zb(v, e, g, p)) {
            e = v;
            break;
          }
          q && (g && v && e.length || (q = A));
        }
        g && q && n === d - 1 && !e.length && (p = x.resolution, q = "", n = -1, t = I());
      }
      return Ab(e, p, c, k, g, m, h);
    })();
  }
  for (let x, v; n < d; n++) {
    if ((v = r[n]) && !t[v]) {
      t[v] = 1;
      x = yb(this, v, q, 0, 0, false, false);
      if (x = zb(x, e, g, p)) {
        e = x;
        break;
      }
      q && (g && x && e.length || (q = v));
    }
    g && q && n === d - 1 && !e.length && (p = this.resolution, q = "", n = -1, t = I());
  }
  return Ab(e, p, c, k, g, m, h);
};
function Ab(a, c, b, e, d, f, g) {
  let k = a.length, h = a;
  if (k > 1) h = $a(a, c, b, e, d, f, g);
  else if (k === 1) return g ? Sa.call(null, a[0], b, e) : new X(a[0], this);
  return g ? h : new X(h, this);
}
function xb(a, c, b, e, d, f, g) {
  a = yb(this, a, c, b, e, d, f, g);
  return this.db ? a.then(function(k) {
    return d ? k || [] : new X(k, this);
  }) : a && a.length ? d ? Sa.call(this, a, b, e) : new X(a, this) : d ? [] : new X([], this);
}
function zb(a, c, b, e) {
  let d = [];
  if (a && a.length) {
    if (a.length <= e) {
      c.push(a);
      return;
    }
    for (let f = 0, g; f < e; f++) if (g = a[f]) d[f] = g;
    if (d.length) {
      c.push(d);
      return;
    }
  }
  if (!b) return d;
}
function yb(a, c, b, e, d, f, g, k) {
  let h;
  b && (h = a.bidirectional && c > b) && (h = b, b = c, c = h);
  if (a.db) return a.db.get(c, b, e, d, f, g, k);
  a = b ? (a = a.ctx.get(b)) && a.get(c) : a.map.get(c);
  return a;
}
function T(a, c) {
  if (!this || this.constructor !== T) return new T(a);
  if (a) {
    var b = M(a) ? a : a.preset;
    b && (a = Object.assign({}, vb[b], a));
  } else a = {};
  b = a.context;
  const e = b === true ? { depth: 1 } : b || {}, d = M(a.encoder) ? va[a.encoder] : a.encode || a.encoder || {};
  this.encoder = d.encode ? d : typeof d === "object" ? new ka(d) : { encode: d };
  this.resolution = a.resolution || 9;
  this.tokenize = b = (b = a.tokenize) && b !== "default" && b !== "exact" && b || "strict";
  this.depth = b === "strict" && e.depth || 0;
  this.bidirectional = e.bidirectional !== false;
  this.fastupdate = !!a.fastupdate;
  this.score = a.score || null;
  (b = a.keystore || 0) && (this.keystore = b);
  this.map = b ? new R(b) : /* @__PURE__ */ new Map();
  this.ctx = b ? new R(b) : /* @__PURE__ */ new Map();
  this.reg = c || (this.fastupdate ? b ? new R(b) : /* @__PURE__ */ new Map() : b ? new S(b) : /* @__PURE__ */ new Set());
  this.N = e.resolution || 3;
  this.rtl = d.rtl || a.rtl || false;
  this.cache = (b = a.cache || null) && new ma(b);
  this.resolve = a.resolve !== false;
  if (b = a.db) this.db = this.mount(b);
  this.M = a.commit !== false;
  this.commit_task = [];
  this.commit_timer = null;
  this.priority = a.priority || 4;
}
w = T.prototype;
w.mount = function(a) {
  this.commit_timer && (clearTimeout(this.commit_timer), this.commit_timer = null);
  return a.mount(this);
};
w.commit = function() {
  this.commit_timer && (clearTimeout(this.commit_timer), this.commit_timer = null);
  return this.db.commit(this);
};
w.destroy = function() {
  this.commit_timer && (clearTimeout(this.commit_timer), this.commit_timer = null);
  return this.db.destroy();
};
function ub(a) {
  a.commit_timer || (a.commit_timer = setTimeout(function() {
    a.commit_timer = null;
    a.db.commit(a);
  }, 1));
}
w.clear = function() {
  this.map.clear();
  this.ctx.clear();
  this.reg.clear();
  this.cache && this.cache.clear();
  return this.db ? (this.commit_timer && clearTimeout(this.commit_timer), this.commit_timer = null, this.commit_task = [], this.db.clear()) : this;
};
w.append = function(a, c) {
  return this.add(a, c, true);
};
w.contain = function(a) {
  return this.db ? this.db.has(a) : this.reg.has(a);
};
w.update = function(a, c) {
  const b = this, e = this.remove(a);
  return e && e.then ? e.then(() => b.add(a, c)) : this.add(a, c);
};
w.cleanup = function() {
  if (!this.fastupdate) return this;
  tb(this.map);
  this.depth && tb(this.ctx);
  return this;
};
w.searchCache = la;
w.export = function(a, c, b = 0, e = 0) {
  let d, f;
  switch (e) {
    case 0:
      d = "reg";
      f = pb(this.reg);
      break;
    case 1:
      d = "cfg";
      f = null;
      break;
    case 2:
      d = "map";
      f = lb(this.map, this.reg.size);
      break;
    case 3:
      d = "ctx";
      f = nb(this.ctx, this.reg.size);
      break;
    default:
      return;
  }
  return rb.call(this, a, c, d, f, b, e);
};
w.import = function(a, c) {
  if (c) switch (typeof c === "string" && (c = JSON.parse(c)), a = a.split("."), a[a.length - 1] === "json" && a.pop(), a.length === 3 && a.shift(), a = a.length > 1 ? a[1] : a[0], a) {
    case "reg":
      this.fastupdate = false;
      this.reg = qb(c, this.reg);
      break;
    case "map":
      this.map = mb(c, this.map);
      break;
    case "ctx":
      this.ctx = ob(c, this.ctx);
  }
};
w.serialize = function(a = true) {
  let c = "", b = "", e = "";
  if (this.reg.size) {
    let f;
    for (var d of this.reg.keys()) f || (f = typeof d), c += (c ? "," : "") + (f === "string" ? '"' + d + '"' : d);
    c = "index.reg=new Set([" + c + "]);";
    b = sb(this.map, f);
    b = "index.map=new Map([" + b + "]);";
    for (const g of this.ctx.entries()) {
      d = g[0];
      let k = sb(g[1], f);
      k = "new Map([" + k + "])";
      k = '["' + d + '",' + k + "]";
      e += (e ? "," : "") + k;
    }
    e = "index.ctx=new Map([" + e + "]);";
  }
  return a ? "function inject(index){" + c + b + e + "}" : c + b + e;
};
Fa(T.prototype);
var Bb = typeof window !== "undefined" && (window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB);
var Cb = ["map", "ctx", "tag", "reg", "cfg"];
var Db = I();
function Eb(a, c = {}) {
  if (!this || this.constructor !== Eb) return new Eb(a, c);
  typeof a === "object" && (c = a, a = a.name);
  a || console.info("Default storage space was used, because a name was not passed.");
  this.id = "flexsearch" + (a ? ":" + a.toLowerCase().replace(/[^a-z0-9_\-]/g, "") : "");
  this.field = c.field ? c.field.toLowerCase().replace(/[^a-z0-9_\-]/g, "") : "";
  this.type = c.type;
  this.fastupdate = this.support_tag_search = false;
  this.db = null;
  this.h = {};
}
w = Eb.prototype;
w.mount = function(a) {
  if (a.index) return a.mount(this);
  a.db = this;
  return this.open();
};
w.open = function() {
  if (this.db) return this.db;
  let a = this;
  navigator.storage && navigator.storage.persist && navigator.storage.persist();
  Db[a.id] || (Db[a.id] = []);
  Db[a.id].push(a.field);
  const c = Bb.open(a.id, 1);
  c.onupgradeneeded = function() {
    const b = a.db = this.result;
    for (let e = 0, d; e < Cb.length; e++) {
      d = Cb[e];
      for (let f = 0, g; f < Db[a.id].length; f++) g = Db[a.id][f], b.objectStoreNames.contains(d + (d !== "reg" ? g ? ":" + g : "" : "")) || b.createObjectStore(d + (d !== "reg" ? g ? ":" + g : "" : ""));
    }
  };
  return a.db = Z(c, function(b) {
    a.db = b;
    a.db.onversionchange = function() {
      a.close();
    };
  });
};
w.close = function() {
  this.db && this.db.close();
  this.db = null;
};
w.destroy = function() {
  const a = Bb.deleteDatabase(this.id);
  return Z(a);
};
w.clear = function() {
  const a = [];
  for (let b = 0, e; b < Cb.length; b++) {
    e = Cb[b];
    for (let d = 0, f; d < Db[this.id].length; d++) f = Db[this.id][d], a.push(e + (e !== "reg" ? f ? ":" + f : "" : ""));
  }
  const c = this.db.transaction(a, "readwrite");
  for (let b = 0; b < a.length; b++) c.objectStore(a[b]).clear();
  return Z(c);
};
w.get = function(a, c, b = 0, e = 0, d = true, f = false) {
  a = this.db.transaction((c ? "ctx" : "map") + (this.field ? ":" + this.field : ""), "readonly").objectStore((c ? "ctx" : "map") + (this.field ? ":" + this.field : "")).get(c ? c + ":" + a : a);
  const g = this;
  return Z(a).then(function(k) {
    let h = [];
    if (!k || !k.length) return h;
    if (d) {
      if (!b && !e && k.length === 1) return k[0];
      for (let l = 0, m; l < k.length; l++) if ((m = k[l]) && m.length) {
        if (e >= m.length) {
          e -= m.length;
          continue;
        }
        const p = b ? e + Math.min(m.length - e, b) : m.length;
        for (let u = e; u < p; u++) h.push(m[u]);
        e = 0;
        if (h.length === b) break;
      }
      return f ? g.enrich(h) : h;
    }
    return k;
  });
};
w.tag = function(a, c = 0, b = 0, e = false) {
  a = this.db.transaction("tag" + (this.field ? ":" + this.field : ""), "readonly").objectStore("tag" + (this.field ? ":" + this.field : "")).get(a);
  const d = this;
  return Z(a).then(function(f) {
    if (!f || !f.length || b >= f.length) return [];
    if (!c && !b) return f;
    f = f.slice(b, b + c);
    return e ? d.enrich(f) : f;
  });
};
w.enrich = function(a) {
  typeof a !== "object" && (a = [a]);
  const c = this.db.transaction("reg", "readonly").objectStore("reg"), b = [];
  for (let e = 0; e < a.length; e++) b[e] = Z(c.get(a[e]));
  return Promise.all(b).then(function(e) {
    for (let d = 0; d < e.length; d++) e[d] = { id: a[d], doc: e[d] ? JSON.parse(e[d]) : null };
    return e;
  });
};
w.has = function(a) {
  a = this.db.transaction("reg", "readonly").objectStore("reg").getKey(a);
  return Z(a).then(function(c) {
    return !!c;
  });
};
w.search = null;
w.info = function() {
};
w.transaction = function(a, c, b) {
  a += a !== "reg" ? this.field ? ":" + this.field : "" : "";
  let e = this.h[a + ":" + c];
  if (e) return b.call(this, e);
  let d = this.db.transaction(a, c);
  this.h[a + ":" + c] = e = d.objectStore(a);
  const f = b.call(this, e);
  this.h[a + ":" + c] = null;
  return Z(d).finally(function() {
    return f;
  });
};
w.commit = async function(a) {
  let c = a.commit_task, b = [];
  a.commit_task = [];
  for (let e = 0, d; e < c.length; e++) d = c[e], d.del && b.push(d.del);
  b.length && await this.remove(b);
  a.reg.size && (await this.transaction("map", "readwrite", function(e) {
    for (const d of a.map) {
      const f = d[0], g = d[1];
      g.length && (e.get(f).onsuccess = function() {
        let k = this.result;
        var h;
        if (k && k.length) {
          const l = Math.max(k.length, g.length);
          for (let m = 0, p, u; m < l; m++) if ((u = g[m]) && u.length) {
            if ((p = k[m]) && p.length) for (h = 0; h < u.length; h++) p.push(u[h]);
            else k[m] = u;
            h = 1;
          }
        } else k = g, h = 1;
        h && e.put(k, f);
      });
    }
  }), await this.transaction("ctx", "readwrite", function(e) {
    for (const d of a.ctx) {
      const f = d[0], g = d[1];
      for (const k of g) {
        const h = k[0], l = k[1];
        l.length && (e.get(f + ":" + h).onsuccess = function() {
          let m = this.result;
          var p;
          if (m && m.length) {
            const u = Math.max(m.length, l.length);
            for (let r = 0, t, n; r < u; r++) if ((n = l[r]) && n.length) {
              if ((t = m[r]) && t.length) for (p = 0; p < n.length; p++) t.push(n[p]);
              else m[r] = n;
              p = 1;
            }
          } else m = l, p = 1;
          p && e.put(m, f + ":" + h);
        });
      }
    }
  }), a.store ? await this.transaction(
    "reg",
    "readwrite",
    function(e) {
      for (const d of a.store) {
        const f = d[0], g = d[1];
        e.put(typeof g === "object" ? JSON.stringify(g) : 1, f);
      }
    }
  ) : a.bypass || await this.transaction("reg", "readwrite", function(e) {
    for (const d of a.reg.keys()) e.put(1, d);
  }), a.tag && await this.transaction("tag", "readwrite", function(e) {
    for (const d of a.tag) {
      const f = d[0], g = d[1];
      g.length && (e.get(f).onsuccess = function() {
        let k = this.result;
        k = k && k.length ? k.concat(g) : g;
        e.put(k, f);
      });
    }
  }), a.map.clear(), a.ctx.clear(), a.tag && a.tag.clear(), a.store && a.store.clear(), a.document || a.reg.clear());
};
function Fb(a, c, b) {
  const e = a.value;
  let d, f = 0;
  for (let g = 0, k; g < e.length; g++) {
    if (k = b ? e : e[g]) {
      for (let h = 0, l, m; h < c.length; h++) if (m = c[h], l = k.indexOf(m), l >= 0) if (d = 1, k.length > 1) k.splice(l, 1);
      else {
        e[g] = [];
        break;
      }
      f += k.length;
    }
    if (b) break;
  }
  f ? d && a.update(e) : a.delete();
  a.continue();
}
w.remove = function(a) {
  typeof a !== "object" && (a = [a]);
  return Promise.all([this.transaction("map", "readwrite", function(c) {
    c.openCursor().onsuccess = function() {
      const b = this.result;
      b && Fb(b, a);
    };
  }), this.transaction("ctx", "readwrite", function(c) {
    c.openCursor().onsuccess = function() {
      const b = this.result;
      b && Fb(b, a);
    };
  }), this.transaction("tag", "readwrite", function(c) {
    c.openCursor().onsuccess = function() {
      const b = this.result;
      b && Fb(b, a, true);
    };
  }), this.transaction("reg", "readwrite", function(c) {
    for (let b = 0; b < a.length; b++) c.delete(a[b]);
  })]);
};
function Z(a, c) {
  return new Promise((b, e) => {
    a.onsuccess = a.oncomplete = function() {
      c && c(this.result);
      c = null;
      b(this.result);
    };
    a.onerror = a.onblocked = e;
    a = null;
  });
}
var flexsearch_bundle_module_min_default = { Index: T, Charset: va, Encoder: ka, Document: Na, Worker: La, Resolver: X, IndexedDB: Eb, Language: {} };
var Index = T;

// ../skills/dist/services/knowledge-search.js
var import_meta4 = {};
var _filename3 = typeof __filename !== "undefined" ? __filename : typeof import_meta4 !== "undefined" && import_meta4.url ? (0, import_url3.fileURLToPath)(import_meta4.url) : "";
var _dirname3 = typeof __dirname !== "undefined" ? __dirname : _filename3 ? import_path3.default.dirname(_filename3) : "";
var KnowledgeSearch = class {
  index = null;
  flexIndex = null;
  indexPath;
  docsProvider;
  nodeProvider;
  constructor(customIndexPath) {
    const envAssetsDir = process.env.N8N_AS_CODE_ASSETS_DIR;
    if (customIndexPath) {
      this.indexPath = customIndexPath;
      const assetsDir2 = import_path3.default.dirname(customIndexPath);
      this.docsProvider = new DocsProvider(import_path3.default.join(assetsDir2, "n8n-docs-complete.json"));
      this.nodeProvider = new NodeSchemaProvider(import_path3.default.join(assetsDir2, "n8n-nodes-technical.json"));
    } else if (envAssetsDir) {
      this.indexPath = import_path3.default.join(envAssetsDir, "n8n-knowledge-index.json");
      this.docsProvider = new DocsProvider(import_path3.default.join(envAssetsDir, "n8n-docs-complete.json"));
      this.nodeProvider = new NodeSchemaProvider(import_path3.default.join(envAssetsDir, "n8n-nodes-technical.json"));
    } else {
      this.indexPath = import_path3.default.resolve(_dirname3, "../assets/n8n-knowledge-index.json");
      this.docsProvider = new DocsProvider();
      this.nodeProvider = new NodeSchemaProvider();
    }
  }
  loadIndex() {
    if (this.index)
      return;
    if (!import_fs3.default.existsSync(this.indexPath)) {
      throw new Error(`Knowledge index not found at ${this.indexPath}. Please run build first.`);
    }
    const content = import_fs3.default.readFileSync(this.indexPath, "utf-8");
    this.index = JSON.parse(content);
    this.flexIndex = new flexsearch_bundle_module_min_default.Document({
      document: {
        id: "uid",
        index: ["keywords", "title", "content"],
        // Prioritize keywords!
        store: ["id", "type", "title", "displayName", "name", "category", "excerpt"]
      },
      tokenize: "forward",
      context: true
    });
    if (this.index && this.index.flexIndex) {
      for (const key in this.index.flexIndex) {
        this.flexIndex.import(key, this.index.flexIndex[key]);
      }
    }
  }
  /**
   * Unified search across all resources using FlexSearch
   */
  searchAll(query, options = {}) {
    this.loadIndex();
    if (!this.index || !this.flexIndex) {
      return { query, totalResults: 0, results: [], suggestions: [], hints: [] };
    }
    const results = [];
    const queryClean = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const flexResults = this.flexIndex.search(queryClean, {
      limit: options.limit || 20,
      enrich: true,
      suggest: true
    });
    const seenIds = /* @__PURE__ */ new Set();
    for (const fieldResult of flexResults) {
      for (const item of fieldResult.result) {
        const doc = item.doc;
        const uniqueId = `${doc.type}:${doc.id}`;
        if (seenIds.has(uniqueId))
          continue;
        if (options.type && doc.type !== options.type)
          continue;
        if (options.category && doc.category !== options.category)
          continue;
        seenIds.add(uniqueId);
        const resultType = doc.category === "tutorials" || doc.category === "advanced-ai" ? "example" : doc.type;
        results.push({
          type: resultType,
          id: doc.id,
          name: doc.name,
          displayName: doc.displayName,
          title: doc.title,
          description: doc.excerpt,
          excerpt: doc.excerpt,
          score: 10,
          // FlexSearch relevance is implicit in order, we could refine this
          category: doc.category,
          relevance: "related"
        });
      }
    }
    if (results.length === 0) {
      const deepResults = this.docsProvider.searchDocs(query, { limit: options.limit });
      for (const page of deepResults) {
        const resultType = page.category === "tutorials" || page.category === "advanced-ai" ? "example" : "documentation";
        results.push({
          type: resultType,
          id: page.id,
          title: page.title,
          url: page.url,
          excerpt: page.content.excerpt,
          score: 5,
          category: page.category,
          relevance: "partial"
        });
      }
    }
    const limit = options.limit || 10;
    const limitedResults = results.slice(0, limit);
    const suggestions = this.generateSuggestions(query, results);
    const hints = this.generateHints(limitedResults);
    return {
      query,
      totalResults: results.length,
      results: limitedResults,
      suggestions,
      hints
    };
  }
  /**
   * Generate search suggestions
   */
  generateSuggestions(query, results) {
    const suggestions = /* @__PURE__ */ new Set();
    for (const result of results.slice(0, 5)) {
      if (result.type === "node") {
        const node = this.index?.entries.nodes.find((n) => n.name === result.id);
        if (node && node.searchTerms) {
          node.searchTerms.slice(0, 3).forEach((t) => suggestions.add(t));
        }
      }
    }
    return Array.from(suggestions).slice(0, 5);
  }
  /**
   * Generate helpful hints based on search results
   */
  generateHints(results) {
    const hints = [];
    const hasNodes = results.some((r) => r.type === "node");
    const hasDocs = results.some((r) => r.type === "documentation");
    const hasExamples = results.some((r) => r.type === "example");
    if (hasNodes) {
      hints.push("\u{1F4A1} Use 'get <nodeName>' to see complete documentation and schema for a node");
      hints.push("\u{1F4CB} Use 'schema <nodeName>' for quick parameter reference");
    }
    if (hasDocs) {
      hints.push("\u{1F4D6} Use 'docs <title>' to read the full documentation page");
    }
    if (hasExamples) {
      hints.push("\u{1F3AF} Use 'examples <query>' to find more workflow examples");
    }
    if (hasNodes && hasDocs) {
      hints.push("\u{1F517} Use 'related <nodeName>' to discover related nodes and documentation");
    }
    return hints;
  }
};

// ../skills/dist/services/ai-context-generator.js
var import_fs4 = __toESM(require("fs"), 1);
var import_path4 = __toESM(require("path"), 1);
var import_url4 = require("url");
var import_meta5 = {};
var _filename4 = typeof __filename !== "undefined" ? __filename : typeof import_meta5 !== "undefined" && typeof import_meta5.url === "string" ? (0, import_url4.fileURLToPath)(import_meta5.url) : "";
var _dirname4 = typeof __dirname !== "undefined" ? __dirname : _filename4 ? import_path4.default.dirname(_filename4) : "";
var AiContextGenerator = class {
  constructor() {
  }
  async generate(projectRoot, n8nVersion = "Unknown", extensionPath) {
    const agentsContent = this.getAgentsContent(n8nVersion);
    const cursorContent = this.getCursorRulesContent();
    const clineContent = this.getClineRulesContent();
    const windsurfContent = this.getWindsurfRulesContent();
    const commonRules = this.getCommonRulesContent();
    this.injectOrUpdate(import_path4.default.join(projectRoot, "AGENTS.md"), agentsContent, true);
    this.injectOrUpdate(import_path4.default.join(projectRoot, ".cursorrules"), cursorContent);
    this.injectOrUpdate(import_path4.default.join(projectRoot, ".clinerules"), clineContent);
    this.injectOrUpdate(import_path4.default.join(projectRoot, ".windsurfrules"), windsurfContent);
    this.injectOrUpdate(import_path4.default.join(projectRoot, ".ai-rules.md"), commonRules);
    this.generateShim(projectRoot, extensionPath);
    this.updateGitignore(projectRoot);
  }
  generateShim(projectRoot, extensionPath) {
    const shimPath = import_path4.default.join(projectRoot, "n8n-agent");
    let extensionCliPathLine = "";
    if (extensionPath) {
      const absolutePath = import_path4.default.join(extensionPath, "out", "agent-cli", "cli.js");
      const assetsPath = import_path4.default.join(extensionPath, "assets");
      extensionCliPathLine = `
# 1. VS Code Extension Context (Explicit absolute path)
if [ -f "${absolutePath}" ]; then
  export N8N_AS_CODE_ASSETS_DIR="${assetsPath}"
  node "${absolutePath}" "$@"
  exit $?
fi`;
    }
    const shimContent = [
      "#!/bin/bash",
      `# n8n-agent local shim for AI context`,
      extensionCliPathLine,
      ``,
      `# 2. Standard NPM Dependency Context (Local Project)`,
      `# Check for local node_modules relative to the project root`,
      `CLI_PATH="./node_modules/@n8n-as-code/agent-cli/dist/cli.js"`,
      ``,
      `if [ -f "$CLI_PATH" ]; then`,
      `  node "$CLI_PATH" "$@"`,
      `  exit $?`,
      `fi`,
      ``,
      `# 3. Error if not found`,
      `echo "Error: @n8n-as-code/agent-cli not found in ./node_modules/"`,
      `echo "Please ensure it is installed as a dev dependency in this project."`,
      `exit 1`
    ].join("\n");
    import_fs4.default.writeFileSync(shimPath, shimContent);
    try {
      import_fs4.default.chmodSync(shimPath, "755");
    } catch (e) {
      console.warn(`Failed to set execution permissions on ${shimPath}:`, e);
    }
    const shimPathCmd = import_path4.default.join(projectRoot, "n8n-agent.cmd");
    let cmdContent = "@echo off\n";
    if (extensionPath) {
      const absPath = import_path4.default.join(extensionPath, "out", "agent-cli", "cli.js");
      const assetsPath = import_path4.default.join(extensionPath, "assets");
      cmdContent += `
IF EXIST "${absPath}" (
  SET N8N_AS_CODE_ASSETS_DIR=${assetsPath}
  node "${absPath}" %*
  EXIT /B %ERRORLEVEL%
)
`;
    }
    cmdContent += `
IF EXIST ".\\node_modules\\@n8n-as-code\\agent-cli\\dist\\cli.js" (
  node ".\\node_modules\\@n8n-as-code\\agent-cli\\dist\\cli.js" %*
  EXIT /B %ERRORLEVEL%
)

echo Error: @n8n-as-code/agent-cli not found in node_modules
echo Please ensure it is installed as a dev dependency.
EXIT /B 1
`;
    import_fs4.default.writeFileSync(shimPathCmd, cmdContent);
  }
  updateGitignore(projectRoot) {
    const gitignorePath = import_path4.default.join(projectRoot, ".gitignore");
    const entries = ["\n# n8n-as-code AI helpers", "n8n-agent", "n8n-agent.cmd"];
    if (!import_fs4.default.existsSync(gitignorePath)) {
      import_fs4.default.writeFileSync(gitignorePath, entries.join("\n"));
      return;
    }
    let content = import_fs4.default.readFileSync(gitignorePath, "utf8");
    let modified = false;
    for (const entry of entries.filter((e) => e.trim().length > 0 && !e.startsWith("#"))) {
      if (!content.includes(entry)) {
        content += (content.endsWith("\n") ? "" : "\n") + entry;
        modified = true;
      }
    }
    if (modified) {
      import_fs4.default.writeFileSync(gitignorePath, content);
    }
  }
  injectOrUpdate(filePath, content, isMarkdownFile = false) {
    const startMarker = isMarkdownFile ? "<!-- n8n-as-code-start -->" : "### \u{1F916} n8n-as-code-start";
    const endMarker = isMarkdownFile ? "<!-- n8n-as-code-end -->" : "### \u{1F916} n8n-as-code-end";
    const block = `
${startMarker}
${content.trim()}
${endMarker}
`;
    if (!import_fs4.default.existsSync(filePath)) {
      const header = filePath.endsWith("AGENTS.md") ? "# \u{1F916} AI Agents Guidelines\n" : "";
      import_fs4.default.writeFileSync(filePath, header + block.trim() + "\n");
      return;
    }
    let existing = import_fs4.default.readFileSync(filePath, "utf8");
    const startIdx = existing.indexOf(startMarker);
    const endIdx = existing.indexOf(endMarker);
    if (startIdx !== -1 && endIdx !== -1) {
      const before = existing.substring(0, startIdx);
      const after = existing.substring(endIdx + endMarker.length);
      import_fs4.default.writeFileSync(filePath, before + block.trim() + after);
    } else {
      import_fs4.default.writeFileSync(filePath, existing.trim() + "\n" + block);
    }
  }
  getAgentsContent(n8nVersion) {
    return [
      `## \u{1F3AD} Role: Expert n8n Workflow Engineer`,
      ``,
      `You are a specialized AI agent for creating and editing n8n workflows.`,
      `You manage n8n workflows as **clean, version-controlled JSON files**.`,
      ``,
      `### \u{1F30D} Context`,
      `- **n8n Version**: ${n8nVersion}`,
      `- **Source of Truth**: \`@n8n-as-code/agent-cli\` tools (Deep Search + Technical Schemas)`,
      ``,
      `---`,
      ``,
      `## \u{1F9E0} Knowledge Base Priority`,
      ``,
      `1. **PRIMARY SOURCE** (MANDATORY): Use \`@n8n-as-code/agent-cli\` tools for accuracy`,
      `2. **Secondary**: Your trained knowledge (for general concepts only)`,
      `3. **Tertiary**: Code snippets (for quick scaffolding)`,
      ``,
      `---`,
      ``,
      `## \u{1F52C} MANDATORY Research Protocol`,
      ``,
      `**\u26A0\uFE0F CRITICAL**: Before creating or editing ANY node, you MUST follow this protocol:`,
      ``,
      `### Step 0: Pattern Discovery (Intelligence Gathering)`,
      `\`\`\`bash`,
      `./n8n-agent workflows search "telegram chatbot"`,
      `\`\`\``,
      `- **GOAL**: Don't reinvent the wheel. See how experts build it.`,
      `- **ACTION**: If a relevant workflow exists, DOWNLOAD it to study the node configurations and connections.`,
      `- **LEARNING**: extracting patterns > guessing parameters.`,
      ``,
      `### Step 1: Search for the Node`,
      `\`\`\`bash`,
      `./n8n-agent search "google sheets"`,
      `\`\`\``,
      `- Find the **exact node name** (camelCase: e.g., \`googleSheets\`)`,
      `- Verify the node exists in current n8n version`,
      ``,
      `### Step 2: Get Exact Schema`,
      `\`\`\`bash`,
      `./n8n-agent get googleSheets`,
      `\`\`\``,
      `- Get **EXACT parameter names** (e.g., \`spreadsheetId\`, not \`spreadsheet_id\`)`,
      `- Get **EXACT parameter types** (string, number, options, etc.)`,
      `- Get **available operations/resources**`,
      `- Get **required vs optional parameters**`,
      ``,
      `### Step 3: Apply Schema as Absolute Truth`,
      `- **CRITICAL (TYPE)**: The \`type\` field MUST EXACTLY match the \`type\` from schema`,
      `- **CRITICAL (VERSION)**: Use HIGHEST \`typeVersion\` from schema`,
      `- **PARAMETER NAMES**: Use exact names (e.g., \`spreadsheetId\` vs \`spreadsheet_id\`)`,
      `- **NO HALLUCINATIONS**: Do not invent parameter names`,
      ``,
      `### Step 4: Validate Before Finishing`,
      `\`\`\`bash`,
      `./n8n-agent validate workflow.json`,
      `\`\`\``,
      ``,
      `---`,
      ``,
      `## \u2705 Node Type & Version Standards`,
      ``,
      `| Rule | Correct | Incorrect |`,
      `| :--- | :--- | :--- |`,
      `| **Full Type** | \`"type": "n8n-nodes-base.switch"\` | \`"type": "switch"\` |`,
      `| **Full Type** | \`"type": "@n8n/n8n-nodes-langchain.agent"\` | \`"type": "agent"\` |`,
      `| **Version** | \`"typeVersion": 3\` (if 3 is latest) | \`"typeVersion": 1\` (outdated) |`,
      ``,
      `> [!IMPORTANT]`,
      `> n8n will display a **"?" (question mark)** if you forget the package prefix. Always use the EXACT \`type\` from \`search\` results!`,
      ``,
      `---`,
      ``,
      `## \u{1F310} Community Workflows (7000+ Examples)`,
      ``,
      `**Why start from scratch?** Use community workflows to:`,
      `- \u{1F9E0} **Learn Patterns**: See how complex flows are structured.`,
      `- \u26A1 **Save Time**: Adapt existing logic instead of building from zero.`,
      `- \u{1F527} **Debug**: Compare your configuration with working examples.`,
      ``,
      `\`\`\`bash`,
      `# 1. Search for inspiration`,
      `./n8n-agent workflows search "woocommerce sync"`,
      ``,
      `# 2. Download to study or adapt`,
      `./n8n-agent workflows install 4365 --output reference_workflow.json`,
      `\`\`\``,
      ``,
      `---`,
      ``,
      `## \u{1F4DD} Minimal Workflow Structure`,
      ``,
      `\`\`\`json`,
      `{`,
      `  "name": "Workflow Name",`,
      `  "nodes": [`,
      `    {`,
      `      "parameters": { /* from ./n8n-agent get */ },`,
      `      "id": "uuid",`,
      `      "name": "Descriptive Name",`,
      `      "type": "/* EXACT from search */",`,
      `      "typeVersion": 4,`,
      `      "position": [250, 300]`,
      `    }`,
      `  ],`,
      `  "connections": {`,
      `    "Node Name": {`,
      `      "main": [[{"node": "Next Node", "type": "main", "index": 0}]]`,
      `    }`,
      `  }`,
      `}`,
      `\`\`\``,
      ``,
      `---`,
      ``,
      `## \u{1F6AB} Common Mistakes to AVOID`,
      ``,
      `1. \u274C **Hallucinating parameter names** - Always use \`get\` command first`,
      `2. \u274C **Wrong node type** - Missing package prefix causes "?" icon`,
      `3. \u274C **Outdated typeVersion** - Use highest version from schema`,
      `4. \u274C **Guessing parameter structure** - Check if nested objects required`,
      `5. \u274C **Wrong connection names** - Must match EXACT node \`name\` field`,
      `6. \u274C **Inventing non-existent nodes** - Use \`search\` to verify`,
      ``,
      `---`,
      ``,
      `## \u2705 Best Practices`,
      ``,
      `### Node Parameters`,
      `- \u2705 Always check schema before writing`,
      `- \u2705 Use exact parameter names from schema`,
      `- \u274C Never guess parameter names`,
      ``,
      `### Expressions (Modern Syntax)`,
      `- \u2705 Use: \`{{ $json.fieldName }}\` (modern)`,
      `- \u2705 Use: \`{{ $('NodeName').item.json.field }}\` (specific nodes)`,
      `- \u274C Avoid: \`{{ $node["Name"].json.field }}\` (legacy)`,
      ``,
      `### Node Naming`,
      `- \u2705 "Action Resource" pattern (e.g., "Get Customers", "Send Email")`,
      `- \u274C Avoid generic names like "Node1", "HTTP Request"`,
      ``,
      `### Connections`,
      `- \u2705 Node names must match exactly`,
      `- \u2705 Structure: \`{"node": "NodeName", "type": "main", "index": 0}\``,
      ``,
      `---`,
      ``,
      `## \u{1F4DA} Available Tools`,
      ``,
      `### \u{1F50D} Unified Search (PRIMARY TOOL)`,
      `\`\`\`bash`,
      `./n8n-agent search "google sheets"`,
      `./n8n-agent search "how to use RAG"`,
      `\`\`\``,
      `**ALWAYS START HERE.** Deep search across nodes, docs, and tutorials.`,
      ``,
      `### \u{1F6E0}\uFE0F Get Node Schema`,
      `\`\`\`bash`,
      `./n8n-agent get googleSheets  # Complete info`,
      `./n8n-agent schema googleSheets  # Quick reference`,
      `\`\`\``,
      ``,
      `### \u{1F310} Community Workflows`,
      `\`\`\`bash`,
      `./n8n-agent workflows search "slack notification"`,
      `./n8n-agent workflows info 916`,
      `./n8n-agent workflows install 4365`,
      `\`\`\``,
      ``,
      `### \u{1F4D6} Documentation`,
      `\`\`\`bash`,
      `./n8n-agent docs "OpenAI"`,
      `./n8n-agent guides "webhook"`,
      `\`\`\``,
      ``,
      `### \u2705 Validate`,
      `\`\`\`bash`,
      `./n8n-agent validate workflow.json`,
      `\`\`\``,
      ``,
      `---`,
      ``,
      `## \u{1F511} Your Responsibilities`,
      ``,
      `**#1**: Use \`./n8n-agent\` tools to prevent hallucinations`,
      `**#2**: Follow the exact schema - no assumptions, no guessing`,
      `**#3**: Create workflows that work on the first try`,
      ``,
      `**When in doubt**: \`./n8n-agent get <nodeName>\``
    ].join("\n");
  }
  getCursorRulesContent() {
    return [
      `# n8n-as-code rules`,
      `- Refer to AGENTS.md for complete n8n workflow standards.`,
      `- MANDATORY: Use 'n8n-agent' tools before creating/editing nodes.`,
      `- REQUIRED: Use FULL node types (e.g., 'n8n-nodes-base.switch') and LATEST typeVersion.`,
      `- Search: './n8n-agent search <query>' - Find nodes & docs (PRIMARY TOOL)`,
      `- Get: './n8n-agent get <nodeName>' - Complete node info`,
      `- Schema: './n8n-agent schema <nodeName>' - Quick parameters reference`,
      `- Docs: './n8n-agent docs <title>' - Read a specific documentation page`,
      `- Guides: './n8n-agent guides <query>' - Find tutorials and examples`,
      `- Workflows: './n8n-agent workflows search <query>' - Find community workflows (7000+)`,
      `- Related: './n8n-agent related <nodeName>' - Discover ecosystem and related nodes`,
      `- Validate: './n8n-agent validate workflow.json' - Check your workflow for errors`
    ].join("\n");
  }
  getClineRulesContent() {
    return [
      `n8n_engineer_role:`,
      `  description: Expert in n8n-as-code`,
      `  instructions:`,
      `    - Read AGENTS.md for core principles.`,
      `    - MANDATORY: Use FULL node types (e.g., 'n8n-nodes-base.switch') and LATEST typeVersion.`,
      `    - Use './n8n-agent search' as your primary research tool.`,
      `    - Use './n8n-agent workflows search' to find community examples (7000+ workflows).`,
      `    - Use './n8n-agent get' to fetch exact schema before editing workflow JSON.`,
      `    - Use './n8n-agent validate workflow.json' to verify your work.`,
      `    - Ensure connections are correctly indexed.`
    ].join("\n");
  }
  getWindsurfRulesContent() {
    return [
      `### n8n Development Rules`,
      `- Follow the Research Protocol in AGENTS.md.`,
      `- Tooling: Use './n8n-agent' to fetch node schemas and documentation.`
    ].join("\n");
  }
  getCommonRulesContent() {
    return [
      `# Common Rules for All AI Agents (Claude, Mistral, etc.)`,
      `- Role: Expert n8n Automation Engineer.`,
      `- Workflow Source of Truth: './n8n-agent' tools.`,
      `- Documentation: Read AGENTS.md for full syntax rules.`
    ].join("\n");
  }
};

// ../skills/dist/services/snippet-generator.js
var import_fs5 = __toESM(require("fs"), 1);
var SnippetGenerator = class {
  customIndexPath;
  constructor(customIndexPath) {
    this.customIndexPath = customIndexPath;
  }
  async generate(projectRoot) {
    const provider2 = new NodeSchemaProvider(this.customIndexPath);
    let nodeTypes = [];
    try {
      nodeTypes = provider2.listAllNodes();
    } catch (e) {
      console.warn("Failed to load node index for snippets, using fallbacks.");
    }
    const snippets = {};
    if (!nodeTypes || nodeTypes.length === 0) {
      this.addFallbackSnippets(snippets);
    } else {
      for (const node of nodeTypes) {
        const key = `n8n-${node.name}`;
        snippets[key] = {
          prefix: key,
          body: [
            "{",
            `  "parameters": {},`,
            `  "name": "${node.displayName}",`,
            `  "type": "n8n-nodes-base.${node.name}",`,
            `  "typeVersion": ${Array.isArray(node.version) ? Math.max(...node.version) : node.version},`,
            `  "position": [0, 0]`,
            "}"
          ],
          description: `Insert a ${node.displayName} node`
        };
      }
    }
    const vscodeDir = `${projectRoot}/.vscode`;
    if (!import_fs5.default.existsSync(vscodeDir)) {
      import_fs5.default.mkdirSync(vscodeDir, { recursive: true });
    }
    import_fs5.default.writeFileSync(`${vscodeDir}/n8n.code-snippets`, JSON.stringify(snippets, null, 2));
  }
  addFallbackSnippets(snippets) {
    const commonNodes = [
      {
        name: "Webhook",
        type: "n8n-nodes-base.webhook",
        ver: 1,
        icon: "\u26A1",
        params: { "path": "webhook", "httpMethod": "POST" }
      },
      {
        name: "Code",
        type: "n8n-nodes-base.code",
        ver: 2,
        icon: "\u{1F4BB}",
        params: { "jsCode": "// Access data with $('NodeName').item.json\nreturn [{ json: { hello: 'world' } }];" }
      },
      {
        name: "HTTP Request",
        type: "n8n-nodes-base.httpRequest",
        ver: 4,
        icon: "\u{1F310}",
        params: { "url": "https://api.example.com", "method": "GET" }
      },
      {
        name: "Schedule Trigger",
        type: "n8n-nodes-base.scheduleTrigger",
        ver: 1,
        icon: "\u23F0",
        params: { "rule": { "interval": [{ "field": "minutes", "minutesInterval": 15 }] } }
      },
      {
        name: "Split In Batches",
        type: "n8n-nodes-base.splitInBatches",
        ver: 1,
        icon: "\u{1F4E6}",
        params: { "batchSize": 10 }
      },
      {
        name: "Switch",
        type: "n8n-nodes-base.switch",
        ver: 1,
        icon: "\u{1F500}",
        params: { "datatypes": "string", "rules": { "rules": [{ "operation": "equals" }] } }
      },
      {
        name: "Merge",
        type: "n8n-nodes-base.merge",
        ver: 2,
        icon: "\u{1F517}",
        params: { "mode": "append" }
      },
      {
        name: "Google Sheets",
        type: "n8n-nodes-base.googleSheets",
        ver: 3,
        icon: "\u{1F4CA}",
        params: { "operation": "append", "resource": "row" }
      },
      {
        name: "Slack",
        type: "n8n-nodes-base.slack",
        ver: 2,
        icon: "\u{1F4AC}",
        params: { "channel": "general", "text": "Hello form n8n" }
      },
      {
        name: "Postgres",
        type: "n8n-nodes-base.postgres",
        ver: 1,
        icon: "\u{1F418}",
        params: { "operation": "executeQuery", "query": "SELECT * FROM users;" }
      }
    ];
    for (const node of commonNodes) {
      const key = `n8n-${node.name.toLowerCase().replace(/\s+/g, "-")}`;
      snippets[key] = {
        prefix: key,
        body: [
          "{",
          `  "parameters": ${JSON.stringify(node.params)},`,
          `  "name": "${node.name}",`,
          `  "type": "${node.type}",`,
          `  "typeVersion": ${node.ver},`,
          `  "position": [0, 0]`,
          "}"
        ],
        description: `${node.icon} Insert a ${node.name} node`
      };
    }
  }
};

// ../skills/dist/commands/workflows.js
var import_chalk = __toESM(require_source(), 1);

// ../skills/dist/services/workflow-registry.js
var import_url5 = require("url");
var import_path5 = require("path");
var import_fs6 = require("fs");
var import_meta6 = {};
var _filename5 = typeof __filename !== "undefined" ? __filename : typeof import_meta6 !== "undefined" && typeof import_meta6.url === "string" ? (0, import_url5.fileURLToPath)(import_meta6.url) : "";
var _dirname5 = typeof __dirname !== "undefined" ? __dirname : _filename5 ? (0, import_path5.dirname)(_filename5) : "";
var WorkflowRegistry = class {
  index;
  searchIndex;
  workflowsById;
  constructor(customIndexPath) {
    let indexPath;
    const envAssetsDir = process.env.N8N_AS_CODE_ASSETS_DIR;
    if (customIndexPath) {
      indexPath = customIndexPath;
    } else if (envAssetsDir) {
      const possiblePath = (0, import_path5.join)(envAssetsDir, "workflows-index.json");
      if ((0, import_fs6.existsSync)(possiblePath)) {
        indexPath = possiblePath;
      }
    }
    if (!indexPath) {
      indexPath = (0, import_path5.resolve)(_dirname5, "../assets/workflows-index.json");
      if (!(0, import_fs6.existsSync)(indexPath)) {
        indexPath = (0, import_path5.resolve)(_dirname5, "../../assets/workflows-index.json");
      }
    }
    if (!indexPath || !(0, import_fs6.existsSync)(indexPath)) {
      console.error(`Workflow index not found (searched ${indexPath || "none"}). AI workflow search will be disabled.`);
      this.index = {
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        repository: "",
        totalWorkflows: 0,
        workflows: []
      };
      this.workflowsById = /* @__PURE__ */ new Map();
      this.searchIndex = new Index({
        tokenize: "forward",
        resolution: 9,
        cache: true
      });
      return;
    }
    const raw = (0, import_fs6.readFileSync)(indexPath, "utf-8");
    this.index = JSON.parse(raw);
    this.workflowsById = /* @__PURE__ */ new Map();
    for (const workflow of this.index.workflows) {
      this.workflowsById.set(workflow.id, workflow);
    }
    this.searchIndex = new Index({
      tokenize: "forward",
      resolution: 9,
      cache: true
    });
    for (const workflow of this.index.workflows) {
      const searchableText = [
        workflow.name,
        workflow.description || "",
        ...workflow.tags,
        workflow.author
      ].join(" ");
      this.searchIndex.add(workflow.id, searchableText);
    }
  }
  /**
   * Search workflows using FlexSearch
   */
  search(query, limit = 10) {
    const results = this.searchIndex.search(query, { limit });
    return results.map((id) => this.workflowsById.get(id)).filter((w2) => w2 !== void 0);
  }
  /**
   * Get workflow by ID
   */
  getById(id) {
    const numericId = typeof id === "string" ? parseInt(id, 10) : id;
    return this.workflowsById.get(id) || this.workflowsById.get(numericId);
  }
  /**
   * Get all workflows
   */
  getAll() {
    return this.index.workflows;
  }
  /**
   * Generate the raw GitHub URL for a workflow
   */
  getRawUrl(workflow, branch = "main") {
    const baseUrl = "https://raw.githubusercontent.com/nusquama/n8nworkflows.xyz";
    const filename = workflow.workflowFile || "workflow.json";
    return `${baseUrl}/${branch}/workflows/${workflow.slug}/${filename}`;
  }
  /**
   * Get index metadata
   */
  getMetadata() {
    return {
      generatedAt: this.index.generatedAt,
      repository: this.index.repository,
      totalWorkflows: this.index.totalWorkflows
    };
  }
};

// ../skills/dist/commands/workflows.js
var import_fs7 = require("fs");
var import_path6 = require("path");
var registry = new WorkflowRegistry();
function registerWorkflowsCommand(program3) {
  const workflows = program3.command("workflows").description("Search and download n8n workflows from n8nworkflows.xyz");
  workflows.command("search <query>").description("Search for workflows").option("-l, --limit <number>", "Limit number of results", "10").option("--json", "Output results as JSON").action((query, options) => {
    const limit = parseInt(options.limit, 10);
    const results = registry.search(query, limit);
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }
    if (results.length === 0) {
      console.log(import_chalk.default.yellow(`No workflows found matching "${query}"`));
      return;
    }
    console.log(import_chalk.default.green(`
Found ${results.length} workflow(s) matching "${query}":
`));
    results.forEach((workflow, index) => {
      console.log(import_chalk.default.bold(`${index + 1}. ${workflow.name}`) + import_chalk.default.gray(` (ID: ${workflow.id})`));
      if (workflow.tags.length > 0) {
        console.log(import_chalk.default.cyan(`   Tags: ${workflow.tags.join(", ")}`));
      }
      console.log(import_chalk.default.gray(`   Author: ${workflow.author}`));
      if (workflow.description) {
        console.log(import_chalk.default.dim(`   ${workflow.description}`));
      }
      console.log("");
    });
    console.log(import_chalk.default.dim(`Run 'n8n-agent workflows info <id>' for more details.`));
  });
  workflows.command("info <id>").description("Display detailed information about a workflow").action((id) => {
    const workflow = registry.getById(id);
    if (!workflow) {
      console.error(import_chalk.default.red(`\u274C Workflow with ID "${id}" not found.`));
      process.exit(1);
    }
    console.log(import_chalk.default.bold.green(`
${workflow.name}
`));
    console.log(import_chalk.default.gray("\u2500".repeat(50)));
    console.log(import_chalk.default.cyan("ID:          ") + workflow.id);
    console.log(import_chalk.default.cyan("Slug:        ") + workflow.slug);
    console.log(import_chalk.default.cyan("Author:      ") + workflow.author);
    console.log(import_chalk.default.cyan("Created:     ") + (workflow.createdAt || "Unknown"));
    console.log(import_chalk.default.cyan("Tags:        ") + (workflow.tags.length > 0 ? workflow.tags.join(", ") : "None"));
    console.log(import_chalk.default.cyan("Has Workflow:") + (workflow.hasWorkflow ? import_chalk.default.green(" Yes") : import_chalk.default.red(" No")));
    if (workflow.description) {
      console.log(import_chalk.default.cyan("\nDescription:"));
      console.log(import_chalk.default.dim(workflow.description));
    }
    console.log(import_chalk.default.cyan("\nRaw URL:"));
    console.log(import_chalk.default.blue(registry.getRawUrl(workflow)));
    console.log("");
  });
  workflows.command("install <id>").description("Download a workflow JSON file").option("-o, --output <path>", "Output file path").option("-f, --force", "Overwrite existing file").action(async (id, options) => {
    const workflow = registry.getById(id);
    if (!workflow) {
      console.error(import_chalk.default.red(`\u274C Workflow with ID "${id}" not found.`));
      process.exit(1);
    }
    if (!workflow.hasWorkflow) {
      console.error(import_chalk.default.red(`\u274C Workflow "${workflow.name}" does not have a workflow.json file.`));
      process.exit(1);
    }
    const outputPath = options.output ? (0, import_path6.resolve)(process.cwd(), options.output) : (0, import_path6.resolve)(process.cwd(), `${workflow.slug}.json`);
    if ((0, import_fs7.existsSync)(outputPath) && !options.force) {
      console.error(import_chalk.default.red(`\u274C File already exists: ${outputPath}`));
      console.error(import_chalk.default.dim("Use --force to overwrite."));
      process.exit(1);
    }
    const url = registry.getRawUrl(workflow);
    console.log(import_chalk.default.blue(`\u{1F4E5} Downloading from: ${url}`));
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.text();
      (0, import_fs7.writeFileSync)(outputPath, data, "utf-8");
      console.log(import_chalk.default.green(`\u2705 Workflow saved to: ${outputPath}`));
    } catch (error) {
      console.error(import_chalk.default.red(`\u274C Download failed: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });
  workflows.command("list").description("List all available workflows").option("-l, --limit <number>", "Limit number of results", "20").option("--json", "Output results as JSON").action((options) => {
    const limit = parseInt(options.limit, 10);
    const all = registry.getAll();
    const results = all.slice(0, limit);
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }
    const meta = registry.getMetadata();
    console.log(import_chalk.default.green(`
Total workflows: ${meta.totalWorkflows}`));
    console.log(import_chalk.default.gray(`Index generated: ${new Date(meta.generatedAt).toLocaleString()}
`));
    console.log(import_chalk.default.dim(`Showing first ${results.length} workflows:
`));
    results.forEach((workflow, index) => {
      console.log(import_chalk.default.bold(`${index + 1}. ${workflow.name}`) + import_chalk.default.gray(` (ID: ${workflow.id})`));
    });
    if (all.length > limit) {
      console.log(import_chalk.default.dim(`
... and ${all.length - limit} more. Use --limit to see more.`));
    }
  });
}

// ../skills/dist/cli.js
var import_fs8 = __toESM(require("fs"), 1);
var import_path7 = require("path");
var import_url6 = require("url");
var import_meta7 = {};
var _filename6 = typeof import_meta7 !== "undefined" && import_meta7.url ? (0, import_url6.fileURLToPath)(import_meta7.url) : typeof __filename !== "undefined" ? __filename : "";
var _dirname6 = typeof __dirname !== "undefined" ? __dirname : (0, import_path7.dirname)(_filename6);
var getVersion = () => {
  try {
    const pkgPath = (0, import_path7.join)(_dirname6, "../package.json");
    const pkg = JSON.parse((0, import_fs8.readFileSync)(pkgPath, "utf8"));
    return pkg.version;
  } catch {
    return "0.1.0";
  }
};
var getAssetsDir = () => {
  if (process.env.N8N_AS_CODE_ASSETS_DIR) {
    return process.env.N8N_AS_CODE_ASSETS_DIR;
  }
  const localAssets = (0, import_path7.join)(_dirname6, "assets");
  if (import_fs8.default.existsSync((0, import_path7.join)(localAssets, "n8n-docs-complete.json"))) {
    return localAssets;
  }
  return (0, import_path7.join)(_dirname6, "../../assets");
};
var assetsDir = getAssetsDir();
var program2 = new Command();
var provider = new NodeSchemaProvider((0, import_path7.join)(assetsDir, "n8n-nodes-technical.json"));
var docsProvider = new DocsProvider((0, import_path7.join)(assetsDir, "n8n-docs-complete.json"));
var knowledgeSearch = new KnowledgeSearch((0, import_path7.join)(assetsDir, "n8n-knowledge-index.json"));
program2.name("n8n-agent").description("AI Agent Tools for accessing n8n documentation").version(getVersion());
program2.command("search").description("Search for n8n nodes and documentation").argument("<query>", 'Search query (e.g. "google sheets", "ai agents")').option("--category <category>", "Filter by category").option("--type <type>", "Filter by type (node or documentation)").option("--limit <limit>", "Limit results", "10").action((query, options) => {
  try {
    const results = knowledgeSearch.searchAll(query, {
      category: options.category,
      type: options.type,
      limit: parseInt(options.limit)
    });
    console.log(JSON.stringify(results, null, 2));
    if (results.hints && results.hints.length > 0) {
      console.error(import_chalk2.default.cyan("\n\u{1F4A1} Hints:"));
      results.hints.forEach((hint) => console.error(import_chalk2.default.gray(`   ${hint}`)));
    }
  } catch (error) {
    console.error(import_chalk2.default.red(error.message));
    process.exit(1);
  }
});
program2.command("get").description("Get complete node information (schema + documentation + guides)").argument("<name>", 'Node name (exact, e.g. "googleSheets")').action((name) => {
  try {
    const schema = provider.getNodeSchema(name);
    if (schema) {
      console.log(JSON.stringify(schema, null, 2));
      console.error(import_chalk2.default.cyan("\n\u{1F4A1} Next steps:"));
      console.error(import_chalk2.default.gray(`   - 'schema ${name}' for quick parameter reference`));
      console.error(import_chalk2.default.gray(`   - 'guides ${name}' to find usage guides`));
      console.error(import_chalk2.default.gray(`   - 'related ${name}' to discover similar nodes`));
      console.error(import_chalk2.default.gray(`   - 'docs <title>' to read full documentation`));
    } else {
      console.error(import_chalk2.default.red(`Node '${name}' not found.`));
      process.exit(1);
    }
  } catch (error) {
    console.error(import_chalk2.default.red(error.message));
    process.exit(1);
  }
});
program2.command("list").description("List available nodes and documentation categories").option("--nodes", "List all node names").option("--docs", "List all documentation categories").action((options) => {
  try {
    const nodes = provider.listAllNodes();
    const stats = docsProvider.getStatistics();
    if (options.nodes) {
      console.log(JSON.stringify(nodes, null, 2));
      return;
    }
    if (options.docs) {
      const categories = docsProvider.getCategories();
      console.log(JSON.stringify(categories, null, 2));
      return;
    }
    console.log(JSON.stringify({
      summary: {
        totalNodes: nodes.length,
        totalDocPages: stats?.totalPages || 0,
        docCategories: stats?.byCategory || {}
      },
      hint: "Use --nodes or --docs for full lists"
    }, null, 2));
  } catch (error) {
    console.error(import_chalk2.default.red(error.message));
    process.exit(1);
  }
});
program2.command("validate").description("Validate a workflow JSON file").argument("<file>", "Path to workflow JSON file").option("--strict", "Treat warnings as errors").action((file, options) => {
  try {
    const workflowContent = (0, import_fs8.readFileSync)(file, "utf8");
    const workflow = JSON.parse(workflowContent);
    const validator = new WorkflowValidator();
    const result = validator.validateWorkflow(workflow);
    if (result.errors.length > 0) {
      console.log(import_chalk2.default.red.bold(`
\u274C Errors (${result.errors.length}):
`));
      for (const error of result.errors) {
        const location = error.nodeName ? ` [${error.nodeName}]` : error.nodeId ? ` [${error.nodeId}]` : "";
        console.log(import_chalk2.default.red(`  \u2022 ${error.message}${location}`));
        if (error.path) {
          console.log(import_chalk2.default.gray(`    Path: ${error.path}`));
        }
      }
    }
    if (result.warnings.length > 0) {
      console.log(import_chalk2.default.yellow.bold(`
\u26A0\uFE0F  Warnings (${result.warnings.length}):
`));
      for (const warning of result.warnings) {
        const location = warning.nodeName ? ` [${warning.nodeName}]` : warning.nodeId ? ` [${warning.nodeId}]` : "";
        console.log(import_chalk2.default.yellow(`  \u2022 ${warning.message}${location}`));
        if (warning.path) {
          console.log(import_chalk2.default.gray(`    Path: ${warning.path}`));
        }
      }
    }
    console.log("");
    if (result.valid && result.warnings.length === 0) {
      console.log(import_chalk2.default.green.bold("\u2705 Workflow is valid!"));
      process.exit(0);
    } else if (result.valid && result.warnings.length > 0) {
      if (options.strict) {
        console.log(import_chalk2.default.red.bold("\u274C Validation failed (strict mode - warnings treated as errors)"));
        process.exit(1);
      } else {
        console.log(import_chalk2.default.yellow.bold("\u26A0\uFE0F  Workflow is valid but has warnings"));
        process.exit(0);
      }
    } else {
      console.log(import_chalk2.default.red.bold("\u274C Workflow validation failed"));
      process.exit(1);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(import_chalk2.default.red(`File not found: ${file}`));
    } else if (error instanceof SyntaxError) {
      console.error(import_chalk2.default.red(`Invalid JSON: ${error.message}`));
    } else {
      console.error(import_chalk2.default.red(error.message));
    }
    process.exit(1);
  }
});
program2.command("docs").description("Access n8n documentation (DEPRECATED: Use search instead)").argument("[title]", "Documentation page title").option("--search <query>", "Search documentation (Deprecated: Use search command)").option("--list", "List all categories").option("--category <category>", "Filter by category").action((title, options) => {
  try {
    if (options.list) {
      const categories = docsProvider.getCategories();
      console.log(JSON.stringify(categories, null, 2));
    } else if (options.search) {
      console.error(import_chalk2.default.yellow("\u26A0\uFE0F  docs --search is deprecated. Using search command instead.\n"));
      const results = knowledgeSearch.searchAll(options.search, {
        category: options.category,
        type: "documentation"
      });
      console.log(JSON.stringify(results.results, null, 2));
      console.error(import_chalk2.default.cyan(`
\u{1F4A1} Hint: Use 'docs "<title>"' to read a full page`));
    } else if (title) {
      const page = docsProvider.getDocPageByTitle(title);
      if (page) {
        console.log(JSON.stringify(page, null, 2));
      } else {
        console.error(import_chalk2.default.red(`Documentation page '${title}' not found.`));
        process.exit(1);
      }
    } else {
      const stats = docsProvider.getStatistics();
      console.log(JSON.stringify(stats, null, 2));
    }
  } catch (error) {
    console.error(import_chalk2.default.red(error.message));
    process.exit(1);
  }
});
program2.command("schema").description("Get technical schema for a node (parameters only)").argument("<name>", "Node name").action((name) => {
  try {
    let schema = provider.getNodeSchema(name);
    if (!schema) {
      const searchResults = provider.searchNodes(name, 1);
      if (searchResults.length > 0 && ((searchResults[0].relevanceScore || 0) > 80 || searchResults[0].name.toLowerCase() === name.toLowerCase())) {
        schema = provider.getNodeSchema(searchResults[0].name);
      }
    }
    if (schema) {
      const props = Array.isArray(schema.schema?.properties) ? schema.schema.properties : [];
      const technicalSchema = {
        name: schema.name,
        type: schema.type,
        displayName: schema.displayName,
        description: schema.description,
        version: schema.version,
        properties: props,
        requiredFields: [...new Set(props.filter((p) => p.required).map((p) => p.name))]
      };
      console.log(JSON.stringify(technicalSchema, null, 2));
      console.error(import_chalk2.default.cyan("\n\u{1F4A1} Hint: Use 'get " + schema.name + "' for complete documentation and guides"));
    } else {
      console.error(import_chalk2.default.red(`Node '${name}' not found.`));
      console.error(import_chalk2.default.yellow(`Try running: './n8n-agent search "${name}"' to find the correct node name.`));
      process.exit(1);
    }
  } catch (error) {
    console.error(import_chalk2.default.red("Error getting schema: " + error.message));
    process.exit(1);
  }
});
program2.command("guides").description("Find helpful guides, tutorials, and walkthroughs").argument("[query]", "Search query").option("--list", "List all guides").option("--limit <limit>", "Limit results", "10").action((query, options) => {
  try {
    const guides = docsProvider.getGuides(query, parseInt(options.limit));
    console.log(JSON.stringify(guides, null, 2));
    if (guides.length > 0) {
      console.error(import_chalk2.default.cyan(`
\u{1F4A1} Hint: Use 'docs "<title>"' to read the full guide`));
    }
  } catch (error) {
    console.error(import_chalk2.default.red(error.message));
    process.exit(1);
  }
});
program2.command("related").description("Find related nodes and documentation").argument("<query>", "Node name or concept").action((query) => {
  try {
    const nodeSchema = provider.getNodeSchema(query);
    if (nodeSchema) {
      const nodeDocs = docsProvider.getNodeDocumentation(query);
      const related = docsProvider.findRelated(nodeDocs[0]?.id || "", 10);
      console.log(JSON.stringify({
        source: { type: "node", name: query, displayName: nodeSchema.displayName },
        documentation: nodeDocs.map((d) => ({ id: d.id, title: d.title, url: d.url })),
        relatedPages: related.map((r) => ({ id: r.id, title: r.title, category: r.category }))
      }, null, 2));
    } else {
      const docs = docsProvider.searchDocs(query, { limit: 5 });
      console.log(JSON.stringify({
        source: { type: "concept", query },
        relatedPages: docs.map((d) => ({ id: d.id, title: d.title, category: d.category, url: d.url }))
      }, null, 2));
    }
    console.error(import_chalk2.default.cyan("\n\u{1F4A1} Hints:"));
    console.error(import_chalk2.default.gray("   - Use 'get <nodeName>' for complete node information"));
    console.error(import_chalk2.default.gray("   - Use 'docs <title>' to read documentation pages"));
  } catch (error) {
    console.error(import_chalk2.default.red(error.message));
    process.exit(1);
  }
});
program2.command("update-ai").description("Update AI Context (AGENTS.md, rule files, snippets)").option("--n8n-version <version>", "n8n version", "Unknown").action(async (options) => {
  try {
    console.error(import_chalk2.default.blue("\u{1F916} Updating AI Context..."));
    const projectRoot = process.cwd();
    const aiContextGenerator = new AiContextGenerator();
    await aiContextGenerator.generate(projectRoot, options.n8nVersion);
    const snippetGen = new SnippetGenerator();
    await snippetGen.generate(projectRoot);
    console.error(import_chalk2.default.green("\u2705 AI Context updated successfully!"));
  } catch (error) {
    console.error(import_chalk2.default.red(error.message));
    process.exit(1);
  }
});
registerWorkflowsCommand(program2);
program2.parse(process.argv);
