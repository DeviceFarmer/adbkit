import * as Fs from 'fs';

export default class Stats extends Fs.Stats {
  // The following constant were extracted from `man 2 stat` on Ubuntu 12.10.
  public static S_IFMT = 0o170000; // bit mask for the file type bit fields

  public static S_IFSOCK = 0o140000; // socket

  public static S_IFLNK = 0o120000; // symbolic link

  public static S_IFREG = 0o100000; // regular file

  public static S_IFBLK = 0o060000; // block device

  public static S_IFDIR = 0o040000; // directory

  public static S_IFCHR = 0o020000; // character device

  public static S_IFIFO = 0o010000; // FIFO

  public static S_ISUID = 0o004000; // set UID bit

  public static S_ISGID = 0o002000; // set-group-ID bit (see below)

  public static S_ISVTX = 0o001000; // sticky bit (see below)

  public static S_IRWXU = 0o0700; // mask for file owner permissions

  public static S_IRUSR = 0o0400; // owner has read permission

  public static S_IWUSR = 0o0200; // owner has write permission

  public static S_IXUSR = 0o0100; // owner has execute permission

  public static S_IRWXG = 0o0070; // mask for group permissions

  public static S_IRGRP = 0o0040; // group has read permission

  sizeBig: bigint;

  constructor(mode: number, sizeBig: bigint, mtime: number) {
    super();
    this.mode = Number(mode);
    this.size = Number(sizeBig);
    this.sizeBig = sizeBig;
    this.mtime = new Date(mtime * 1000);
  }
}
