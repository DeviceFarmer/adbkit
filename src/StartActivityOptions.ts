import StartServiceOptions from './StartServiceOptions';

export default interface StartActivityOptions extends StartServiceOptions {
    debug?: boolean;
    wait?: boolean;
}
