# node-webpmux

A mostly-complete pure Javascript re-implementation of webpmux.
Can load "simple" lossy/lossless images as well as animations.

### Install
```npm install node-webpmux```

### Basic usage
```javascript
const WebP = require('node-webpmux');
let img = new WebP.Image();
// Load an animation
await img.load('img.webp');
// Extract the (unprocessed) fourth frame
await img.demuxAnim('.', { frame: 3 });
// Replace the fourth frame with a new image from disk
await img.replaceFrame(3, 'different.webp'); // This preserves the existing frame settings
// Alternatively you can do
//   let frame = Image.generateFrame({ path: 'different.webp' });
//   img.frames[3] = frame;
// Which will completely replace the frame
// Save a new copy
await img.save({ path: 'newimg.webp' });
// Or alternatively, img.save() to save over the existing one
```
### Exports
`TYPE_LOSSY`
`TYPE_LOSSLESS`
`TYPE_EXTENDED`
Constants for what type of image is loaded.

`encodeResults`: enum of values that set[Image/Frame]Data returns.

`Image`: The main class.

### Class definition:

#### Class properties

##### `.width` (read-only)
The width of the loaded image.

##### `.height` (read-only)
The height of the loaded image.

##### `.type` (read-only)
The type of image from the TYPE_* constants table.

##### `.hasAnim` (read-only)
A boolean flag for easily checking if the image is an animation.

##### `.frames` (read-only)
Returns the array of frames, if any, or undefined.
Note that while the frames themselves are read/write, you shouldn't modify them.

##### `.frameCount` (read-only)
The number of frames in the image's animation, or 0 if it's not an animation.

##### `.anim` (read-only)
Direct access to the raw animation data (see below in the _Layout for internal Image data_ section).

##### `.iccp` (read/write)
A Buffer containing the raw ICCP data stored in the image, or undefined if there isn't any.

##### `.exif` (read/write)
A Buffer containing the raw EXIF data stored in the image, or undefined if there isn't any.

##### `.xmp` (read/write)
A Buffer containing the raw XMP data stored in the image, or undefined if there isn't any.

#### Image member functions

##### `async .initLib()`
Initialize the internal library used for [get/set]ImageData and [get/set]FrameData described below.
There is no need to call this unless you plan to use one of those 4 functions.

##### `async .load(path)`
Tries to load `path` as a WebP image.

##### `async .loadBuffer(buffer)`
Tries to load the contents of `buffer` as a WebP image.

##### `.convertToAnim()`
Sets the image up for being an animation.

##### `async .demuxAnim(path, { frame = -1, prefix = '#FNAME#', start = 0, end = 0 })`
Dump the individual, unprocessed WebP frames to a directory.
* `path`: The directory to dump the frames to.
* `prefix`: What to prefix the frame names with. Default is the file name of the original image (without .webp).
    Format is \<prefix\>_\<frame number\>.webp.
* `frame`: What frame to dump. Defaults to -1, which has it dump all available frames. Overrides `start`/`end`.
* `start`: The first frame to dump. Defaults to the first frame.
* `end`: The last frame to dump. Defaults to the last frame.

##### `async .demuxAnimToBuffers({ frame = -1, start = 0, end = 0 })`
Dump the individual, unprocessed WebP frames to an array of Buffers.
* `frame`, `start`, and `end` all work the same as in `async .demuxAnim` above.

##### `async .replaceFrame(frame, path)`
Replaces a frame in the animation with another image from disk. All other frame settings are preserved.
* `frame`: Which frame to replace. Frame indexes are 0-based.
* `path`: The new frame image.

##### `async .replaceFrameBuffer(frame, buffer)`
Replaces a frame in the animation with another image from a buffer. All other frame settings are preserved.
* `frame`: Which frame to replace. Frame indexes are 0-based.
* `buffer`: The new frame image.

##### `async .save(path = this.path, options)`
Save the image to `path`. Options are described below in the _Options for saving_ section.

##### `async .saveBuffer(options)`
Save the image to a buffer and return it. Options are described below in the _Options for saving_ section.

##### `async .getImageData()`
Get the raw RGBA pixel data for the image.
Returns a Buffer in the format `[ r, g, b, a, r, g, b, a, ... ]`. Values are range 0 - 255.
Use this for non-animations.
On error, this returns a Buffer full of 0s.

##### `async .setImageData(buf, { width = 0, height = 0, quality = 75, exact = false, lossless = 0, method = 4 })`
Encode `buf` as a new WebP using the provided settings and replace the image pixel data with it.
This preserves EXIF/ICCP/XMP if present.
Use this for non-animations.
Options:
* `width`/`height`
    If either are > 0, override the existing width and/or height with this value.
    Use this if the pixel data in `buf` has different dimensions than the original image.
* `quality`: What quality to set.
    Range is 0 - 100.
    Default is 75.
* `exact`: Preserve data in transparent pixels.
    Defaults to `false`, which means transparent pixels may be modified to help with compression.
* `lossless`: Save the data as a lossy/lossless image.
    Range is 0 - 9.
    Default is 0 (lossy).
    Higher values will result in smaller files, but requires more processing time.
* `method`: Compression method to use.
    Range is 0 - 6.
    Default is 4.
    Higher values will result in smaller files, but requires more processing time.

If `lossless` is set above 0, then setting `quality` or `method` is discouraged as they will override settings in the lossless preset.
Return value can be checked against the values in encodeResults.

##### `async .getFrameData(frame)`
Get the raw RGBA pixel data for a specific frame.
Use this for animations.
Otherwise identical to `.getImageData()`.

##### `async .setFrameData(frame, buffer, { width = 0, height = 0, quality = 75, exact = false, lossless = 0, method = 4 })`
Encode `buf` as a new WebP using the provided settings and replace an existing frame's pixel data with it.
Use this for animations.
Otherwise identical to `.setImageData()`.

#### Static functions

##### `async Image.save(path, options)`
Save the `options` to `path` using `Image.getEmptyImage()`.
Works the same as `.save()` otherwise.
Can be used to create an animation from scratch by passing `frames` in `options`.
&ensp; Example: `Image.save('animation.webp', undefined, { frames: ... })`

##### `async Image.saveBuffer(options)`
Save the `options` using `Image.getEmptyImage()` to a buffer and return it.
Works the same as `.saveBuffer()` otherwise.
Can be used to create an animation from scratch by passing `frames` in `options`.
&ensp; Example: `Image.saveBuffer(undefined, { frames: ... })`

##### `async Image.getEmptyImage()`
Returns a basic, lossy 1x1 black image with no alpha or metadata.
Useful if you need to create a WebP from scratch, such as when converting from PNG.
`.setImageData()` would be used to change the canvas size/contents.

##### `async Image.generateFrame({ path = undefined, buffer = undefined, x = undefined, y = undefined, duration = undefined, blend = undefined, dispose = undefined })`
Generates enough of an `anmf` structure to be placed in `.frames`.
Note that, at the moment, only *static* images are supported in this function.
* `path`/`buffer`
    Only one of these can be present.
    `path` will load image data from file, while `buffer` will load from the buffer.
* `x`/`y`/`duration`/`blend`/`dispose`
    Explicitly set these properties. See the _Options for saving_ section for what these do.

### Options for saving
#### These options affect both static images and animations
*   `exif`/`iccp`/`xmp`
      Save or override EXIF/ICCP/XMP chunks.
      Pass `true` to save the existing ones, or pass a Buffer to replace them.
      Note that there is no verification whatsoever that the data passed is valid.

####  The options below are only used when saving an animation:
*   `width`/`height`: Width/height of the image.
      Range 0 - 16777216.
      The product of width*height must NOT exceed (2 ** 32) - 1.
      Passing 0 to either flags it for being set automatically.
*   `bgColor`: The background color of the animation.
      Format is [ r, g, b, a ].
      Defaults to [ 255, 255, 255, 255 ].
*   `loops`: Number of times the animation loops.
      Range is 0 - 65535, with 0 being an infinite loop.
      Default is 0.
*   `x`/`y`/`delay`/`blend`/`dispose`: Changes the default frame x/y position where a frame omits it (see below).
* *   `x`/`y` defaults to 0.
* *   `delay` defaults to 100.
* *   `blend` defaults to `true`.
* *   `dispose` defaults to `false`.
* *   `frames`: An array of objects defining each frame of the animation with the following properties.
* * *  `x`/`y`: x, y offset to place the frame within the animation.
        Range 0 - 16777215.
        Default is 0,0 (defined above).
* * *  `delay`: Length of this frame in miliseconds.
        Range 0 - 16777215.
        Default is 100 (defined above).
        According to the documentation, delays <= 10ms are WebP implementation defined, and many tools/browsers/etc assign their own minimum-allowed delay.
* * *  `blend`
        Boolean flag for whether or not to use alpha blending when drawing the frame.
        Default is `true` (defined above).
* * *  `dispose`: Boolean flag to control frame disposal method.
        `true` causes the background color to be drawn under the frame.
        `false` draws the new frame directly.
        Default is `false` (defined above).

### Information about the internal library

[get/set]ImageData and [get/set]FrameData are powered by Google's official libwebp library obtained from the [GitHub mirror](https://github.com/webmproject/libwebp).
Commit 5651a6b was the latest at the time of compilation.
This library was compiled with Emscripten with the command `emcc -O3 -s WASM=1 -s MODULARIZE -s EXTRA_EXPORTED_RUNTIME_METHODS='[cwrap]' -s ALLOW_MEMORY_GROWTH=1  -I libwebp binding.cpp libwebp/src/{dec,dsp,demux,enc,mux,utils}/*.c -o libwebp.js`.
binding.cpp is a shim I wrote to bridge the needed parts together and can be found in the libwebp/ directory.
libwebp.mjs, found in the root, is the Javascript interface to it.

At present, the only options for encoding are setting the lossless preset, quality, method, and exact flag.
If access to other options is desired (see upstream libwebp/src/webp/encode.h, struct WebPConfig for settings), leave a feature request and I'll add it.
The upstream command line tool `cwebp` can be used to play with the features and see what you find useful.

### Layout for internal Image data
```javascript
{
  path, // The path loaded.
  loaded, // Boolean flag for if this object has an image loaded.
  data: { // The loaded data.
    type, // The type of image from the constants table.
    vp8: { // The lossy format image. Only if .type is TYPE_LOSSY or TYPE_EXTENDED.
      raw, // The raw, compressed image data from the VP8 chunk.
      width, height // The width/height, extracted from the VP8 image data.
    },
    vp8l: { // The lossless format image. Only if .type is TYPE_LOSSLESS or TYPE_EXTENDED.
      raw, // The raw, compressed image data from the VP8L chunk.
      alpha, // A flag for if this image has alpha data, extracted from the VP8L image data.
      width, height // The width/height, extracted from the VP8L image data.
    },
    extended: { // Only if .type is TYPE_EXTENDED.
      raw, // The raw data for the VP8X chunk.
      hasICCP, // Flag for if there's an ICC profile chunk defined.
      hasAlpha, // Flag for if any image/frame defined has alpha data.
      hasEXIF, // Flag for if there's an EXIF chunk defined.
      hasXMP, // Flag for if there's an XMP chunk defined.
      hasAnim, // Flag for if this image has an animation defined.
      width, height // Width/height of the image.
    },
    anim: {
      raw, // A Buffer containing the raw data for the ANIM chunk. Mainly for internal use.
      bgColor, // The background color in [ r, g, b, a ] format.
      loops, // The loop count.
      frames: [ // Array of frames
        { // The frame object definition
          raw, // The raw data for the ANMF chunk. Mainly for internal use.
          type, // The type of image this frame is, from the constants table.
          x, y, // The frame's x, y position.
          width, height, // The frame's width and height.
          duration, // The duration of the frame.
          blend, dispose, // The frame's blend/dispose flags.
          // Additionally, one or more of the following.
          vp8, // The raw, compressed WebP data for a lossy image. If present, there will be no `vp8l`.
          vp8l, // The raw, compressed WebP data for a lossless image. If present, there will be no `vp8` or `alph`.
          alph // The raw, compressed WebP data for an alpha map. Might be present if the image is lossy.
        },
        ...
      ]
    },
    alph: {
      raw // The raw alpha map chunk. Only likely to be here if .vp8 is also defined and .type is TYPE_EXTENDED.
    },
    iccp: {
      raw // The raw ICCP chunk, if defined.
    },
    exif: {
      raw // The raw EXIF chunk, if defined.
    },
    xmp: {
      raw // The raw XMP chunk, if defined.
    }
  }
}
```
### Breaking changes from 1.x
Image.muxAnim and .muxAnim were merged into Image.save and .save respectively.
* Replace `Image.muxAnim({ path, frames, width, height, bgColor, loops, delay, x, y, blend, dispose, exif, iccp, xmp })`
* With `Image.save(path, undefined, { frames, width, height, bgColor, loops, delay, x, y, blend, dispose, exif, iccp, xmp })`
.
* Replace `.muxAnim({ path, width, height, bgColor, loops, delay, x, y, blend, dispose, exif, iccp, xmp })`
* With `.save(path, { width, height, bgColor, loops, delay, x, y, blend, dispose, exif, iccp, xmp })`

`.anim.backgroundColor` renamed to `.anim.bgColor` for brevity and consisteny.
`.anim.loopCount` renamed to `.anim.loop` for consistency.
`.anim.frameCount` and `.frameCount` were removed. Should use `.anim.frames.length` and `.frames.length` respectively instead.
