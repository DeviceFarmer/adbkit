import Device from './Device';

/**
 * A device as listed by `adb devices -l`. adb prints each field only when it
 * knows it, so any of them but `id` and `type` can be `undefined`.
 */
export default interface DeviceWithPath extends Device {
  /** The device path, such as `usb:1-1` on Linux. Missing for emulators, network devices and on Windows. */
  path: string;
  /** The `product:` field, such as `sdk_gphone64_arm64`. */
  product: string;
  /** The `model:` field, such as `Pixel_7`. adb replaces spaces with `_`. */
  model: string;
  /** The `device:` field, such as `emu64a`. */
  device: string;
  /** The `transport_id:` field, which `adb -t` takes. */
  transportId: string;
}
