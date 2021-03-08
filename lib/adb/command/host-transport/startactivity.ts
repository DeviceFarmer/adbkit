import Protocol from '../../protocol';
import Parser from '../../parser';
import Command from '../../command';
import { StartActivityOptions } from '../../../StartActivityOptions';
import Bluebird from 'bluebird';
import { ExtraValue } from '../../../StartServiceOptions';

const RE_ERROR = /^Error: (.*)$/;

const EXTRA_TYPES = {
	string: 's',
	null: 'sn',
	bool: 'z',
	int: 'i',
	long: 'l',
	float: 'l',
	uri: 'u',
	component: 'cn',
};

class StartActivityCommand extends Command<boolean> {
	execute(options: StartActivityOptions): Bluebird<boolean> {
		const args = this._intentArgs(options);
		if (options.debug) {
			args.push('-D');
		}
		if (options.wait) {
			args.push('-W');
		}
		if (options.user || options.user === 0) {
			args.push('--user', this._escape(options.user));
		}
		return this._run('start', args);
	}

	_run(command: string, args: Array<string | number>): Bluebird<boolean> {
		this._send(`shell:am ${command} ${args.join(' ')}`);
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser
						.searchLine(RE_ERROR)
						.finally(() => {
							return this.parser.end();
						})
						.then(function (match) {
							throw new Error(match[1]);
						})
						.catch(Parser.PrematureEOFError, function () {
							return true;
						});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}

	protected _intentArgs(options: StartActivityOptions): Array<string | number> {
		const args = [];
		if (options.extras) {
			args.push(...this._formatExtras(options.extras));
		}
		if (options.action) {
			args.push('-a', this._escape(options.action));
		}
		if (options.data) {
			args.push('-d', this._escape(options.data));
		}
		if (options.mimeType) {
			args.push('-t', this._escape(options.mimeType));
		}
		if (options.category) {
			if (Array.isArray(options.category)) {
				options.category.forEach((category) => {
					return args.push('-c', this._escape(category));
				});
			} else {
				args.push('-c', this._escape(options.category));
			}
		}
		if (options.component) {
			args.push('-n', this._escape(options.component));
		}
		if (options.flags) {
			args.push('-f', this._escape(options.flags));
		}
		return args;
	}

	private _formatExtras(extras: StartActivityOptions['extras']): Array<number | string> {
		if (!extras) {
			return [];
		}
		if (Array.isArray(extras)) {
			return extras.reduce((all, extra) => {
				return all.concat(this._formatLongExtra(extra));
			}, []);
		} else {
			return Object.keys(extras).reduce((all, key) => {
				return all.concat(this._formatShortExtra(key, extras[key]));
			}, []);
		}
	}

	private _formatShortExtra(key: string, value: ExtraValue): Array<string | number> {
		let sugared;
		sugared = {
			key: key,
		};
		if (value === null) {
			sugared.type = 'null';
		} else if (Array.isArray(value)) {
			throw new Error(
				`Refusing to format array value '${key}' using short syntax; empty array would cause unpredictable results due to unknown type. Please use long syntax instead.`,
			);
		} else {
			switch (typeof value) {
				case 'string':
					sugared.type = 'string';
					sugared.value = value;
					break;
				case 'boolean':
					sugared.type = 'bool';
					sugared.value = value;
					break;
				case 'number':
					sugared.type = 'int';
					sugared.value = value;
					break;
				case 'object':
					sugared = value;
					sugared.key = key;
			}
		}
		return this._formatLongExtra(sugared);
	}

	private _formatLongExtra(extra): Array<string | number> {
		const args = [];
		if (!extra.type) {
			extra.type = 'string';
		}
		const type = EXTRA_TYPES[extra.type];
		if (!type) {
			throw new Error(`Unsupported type '${extra.type}' for extra '${extra.key}'`);
		}
		if (extra.type === 'null') {
			args.push(`--e${type}`);
			args.push(this._escape(extra.key));
		} else if (Array.isArray(extra.value)) {
			args.push(`--e${type}a`);
			args.push(this._escape(extra.key));
			args.push(this._escape(extra.value.join(',')));
		} else {
			args.push(`--e${type}`);
			args.push(this._escape(extra.key));
			args.push(this._escape(extra.value));
		}
		return args;
	}
}

export = StartActivityCommand;
