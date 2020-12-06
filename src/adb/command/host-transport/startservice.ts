import StartActivityCommand from './startactivity';
import StartServiceOptions from '../../../StartServiceOptions';

export default class StartServiceCommand extends StartActivityCommand {
    execute(options: StartServiceOptions): Promise<boolean> {
        const args = this._intentArgs(options);
        if (options.user || options.user === 0) {
            args.push('--user', this._escape(options.user));
        }
        return this._run('startservice', args);
    }
}
