export default class Protocol {
  public static OKAY = 'OKAY';
  public static FAIL = 'FAIL';
  public static STAT = 'STAT';
  public static LIST = 'LIST';
  public static DENT = 'DENT';
  public static RECV = 'RECV';
  public static DATA = 'DATA';
  public static DONE = 'DONE';
  public static SEND = 'SEND';
  public static QUIT = 'QUIT';

  static decodeLength(length: string): number {
    return parseInt(length, 16);
  }

  static encodeLength(length: number): string {
    return length.toString(16).padStart(4, '0').toUpperCase();
  }

  static encodeData(data: Buffer | string): Buffer {
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data);
    }
    const len = Protocol.encodeLength(data.length);
    return Buffer.concat([Buffer.from(len), data]);
  }
}
