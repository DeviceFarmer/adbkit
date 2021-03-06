export type ColorFormat = 'bgr' | 'bgra' | 'rgb' | 'rgba';
export default interface FramebufferMeta {
  /**
   * The framebuffer version. Useful for patching possible backwards-compatibility issues.
   */
  version: number;
  /**
   * The framebuffer format for convenience. This can be one of `'bgr'`, `'bgra'`, `'rgb'`, `'rgba'`.
   */
  format: ColorFormat;
  /**
   * The horizontal resolution of the framebuffer. This SHOULD always be the same as screen width. We have not encountered any device with incorrect framebuffer metadata, but according to rumors there might be some.
   */
  width: number;
  /**
   * The vertical resolution of the framebuffer. This SHOULD always be the same as screen height.
   */
  height: number;
  /**
   * Bits per pixel (i.e. color depth).
   */
  bpp: number;
  /**
   * The raw byte size of the framebuffer.
   */
  size: number;
  /**
   * The bit offset of the red color in a pixel.
   */
  red_offset: number;
  /**
   * The bit length of the red color in a pixel.
   */
  red_length: number;
  /**
   * The bit offset of the blue color in a pixel.
   */
  blue_offset: number;
  /**
   * The bit length of the blue color in a pixel.
   */
  blue_length: number;
  /**
   * The bit offset of the green color in a pixel.
   */
  green_offset: number;
  /**
   * The bit length of the green color in a pixel.
   */
  green_length: number;
  /**
   * The bit offset of alpha in a pixel.
   */
  alpha_offset: number;
  /**
   * The bit length of alpha in a pixel. `0` when not available.
   */
  alpha_length: number;
}
