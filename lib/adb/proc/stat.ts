import { EventEmitter } from 'events';
import Parser from '../parser';
import Sync from '../sync';
import { CpuStats, Loads } from '../../CpuStats';
import Bluebird from 'bluebird';

const RE_CPULINE = /^cpu[0-9]+ .*$/gm;
const RE_COLSEP = /\ +/g;

interface CpuStatsWithLine extends CpuStats {
	line: string;
}

interface LoadsWithLine {
	[index: string]: CpuStatsWithLine;
}

type Stats = { cpus: LoadsWithLine };

class ProcStat extends EventEmitter {
	public interval = 1000;
	public stats: Stats;
	private readonly _ignore;
	private readonly _timer;

	constructor(private sync: Sync) {
		super();

		this.stats = this._emptyStats();
		this._ignore = {};
		this._timer = setInterval(() => {
			return this.update();
		}, this.interval);
		this.update();
	}

	public end(): Sync {
		clearInterval(this._timer);
		this.sync.end();
		return (this.sync = null);
	}

	public update(): Bluebird<Stats> {
		return new Parser(this.sync.pull('/proc/stat'))
			.readAll()
			.then((out) => {
				return this._parse(out.toString());
			})
			.catch((err) => {
				this._error(err);
			});
	}

	private _parse(out: string): Stats {
		let cols, i, len, match, total, type, val;
		const stats = this._emptyStats();
		while ((match = RE_CPULINE.exec(out))) {
			const line: string = match[0];
			cols = line.split(RE_COLSEP);
			type = cols.shift();
			if (this._ignore[type] === line) {
				continue;
			}
			total = 0;
			for (i = 0, len = cols.length; i < len; i++) {
				val = cols[i];
				total += +val;
			}
			stats.cpus[type] = {
				line: line,
				user: +cols[0] || 0,
				nice: +cols[1] || 0,
				system: +cols[2] || 0,
				idle: +cols[3] || 0,
				iowait: +cols[4] || 0,
				irq: +cols[5] || 0,
				softirq: +cols[6] || 0,
				steal: +cols[7] || 0,
				guest: +cols[8] || 0,
				guestnice: +cols[9] || 0,
				total: total,
			};
		}
		return this._set(stats);
	}

	private _set(stats: Stats): Stats {
		let cur, found, id, m, old, ticks;
		const loads: Loads = {};
		found = false;
		const ref = stats.cpus;
		for (id in ref) {
			cur = ref[id];
			old = this.stats.cpus[id];
			if (!old) {
				continue;
			}
			ticks = cur.total - old.total;
			if (ticks > 0) {
				found = true;
				// Calculate percentages for everything. For ease of formatting,
				// let's do `x / y * 100` as `100 / y * x`.
				m = 100 / ticks;
				loads[id] = {
					user: Math.floor(m * (cur.user - old.user)),
					nice: Math.floor(m * (cur.nice - old.nice)),
					system: Math.floor(m * (cur.system - old.system)),
					idle: Math.floor(m * (cur.idle - old.idle)),
					iowait: Math.floor(m * (cur.iowait - old.iowait)),
					irq: Math.floor(m * (cur.irq - old.irq)),
					softirq: Math.floor(m * (cur.softirq - old.softirq)),
					steal: Math.floor(m * (cur.steal - old.steal)),
					guest: Math.floor(m * (cur.guest - old.guest)),
					guestnice: Math.floor(m * (cur.guestnice - old.guestnice)),
					total: 100,
				};
			} else {
				// The CPU is either offline (nothing was done) or it mysteriously
				// warped back in time (idle stat dropped significantly), causing the
				// total tick count to be <0. The latter seems to only happen on
				// Galaxy S4 so far. Either way we don't want those anomalies in our
				// stats. We'll also ignore the line in the next cycle. This doesn't
				// completely eliminate the anomalies, but it helps.
				this._ignore[id] = cur.line;
				delete stats.cpus[id];
			}
		}
		if (found) {
			this.emit('load', loads);
		}
		return (this.stats = stats);
	}

	private _error(err): boolean {
		return this.emit('error', err);
	}

	private _emptyStats(): { cpus: LoadsWithLine } {
		return {
			cpus: {},
		};
	}
}

export = ProcStat;
