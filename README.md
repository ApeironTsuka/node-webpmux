<h1 align="center">node-webpmux</h1>
<p1> Node-webpmux is a mostly complete re-implementation of webpmux in pure JavaScript. Can load "simple" lossy/lossless images as well as animations. </p1>

## Install: 
``` npm install node-webpmux-commonjs ```

## Basic usage: 
```js
//require the package
const WebP = require('node-webpmux-commonjs').default;
//create an image instance
let img = new WebP.Image();
// Load an animation
await img.load('img.webp');
// Extract the (unprocessed) fourth frame
await img.demuxAnim('.', 3);
// Replace the fourth frame with a new image
await img.replaceFrame('different.webp', 3);
// Save over the old one
await img.muxAnim({ path: 'img.webp' });
```
## Class properties

.width (read-only)
  The width of the loaded image

.height (read-only)
  The height of the loaded image

.type (read-only)
  The type of image from the TYPE_* constants table.

.hasAnim (read-only)
  A boolean flag for easily checking if the image is an animation

.frames
  Returns the array of frames, if any, or undefined

.frameCount (read-only)
  The number of frames in the image's animation, or 0 if it's not an animation

.anim (read-only)
  Direct access to the raw animation data (see below)

.iccp (read/write)
  A Buffer containing the raw ICC profile data stored in the image, or undefined if there isn't any

.exif (read/write)
  A Buffer containing the raw EXIF data stored in the image, or undefined if there isn't any

.xmp (read/write)
  A Buffer containing the raw XMP data stored in the image, or undefined if there isn't any

## Class functions:

```async .load(path)```

  Tries to load "path" as a WebP image.

```async .demuxAnim(path, frame = -1, prefix = '#FNAME')```

  Dump the individual, unprocessed WebP frames to a directory

  "path": The directory to dump the frames to
  
  "prefix": What to prefix the frame names with. Default is the file name of the original image (without .webp).
  
  Format is <prefix>_<frame number>.webp
  
  "frame": What frame to dump. Defaults to -1, which has it dump all available frames.
    

```async .replaceFrame(path, frame)```
  Replaces a frame in the animation with another image. All other frame settings are preserved.

  "path": The new frame image  

  "frame": Which frame to replace. Frame indexes are 0-based

```async .muxAnim(options)```
  A convenience function to remux this image preserving settings. See the static .muxAnim function below for more information

  The "width", "height", "bgColor", "loops", "exif", "iccp", and "xmp" options default to the settings of this image.
  
  Passing false to "exif, "iccp, or "xmp" will disable saving those
  
  Should pass 0 to both width and height if any frame sizes were changed

```async .save(path = this.path)```

  A convenience function to save any modifications made to this image, such as adding EXIF metadata.

## Static functions:

```async Image.muxAnim(options)```
  Mux a WebP image

   **-** "options": an object with the following properties
  
   **-** "width"/"height": Width/height of the image
     
   - Range 0-16777216.

   **NOTE:** The product of width*height must NOT exceed (2**32)-1
   
   - Passing 0 to either flags it for being set automatically
    
   **-**  "bgColor": The background color of the animation
      
   - Format is [r, g, b, a]

   - Defaults to [255, 255, 255, 255]
    
   **-**  "loops": Number of times the animation loops
      
   - Range is 0-65535, with 0 being an infinite loop
 
   - Default is 0
   
   **-**  "x"/"y"/"delay"/"blend"/"dispose": Changes the default frame x/y position where a frame omits it (see below)

   - "x"/"y": defaults to 0

   - "delay" defaults to 100

   - "blend" defaults to `true`

   - "dispose" defaults to `false`

   **-** "frames": An array of objects defining each frame of the animation with the following properties 

   - "x"/"y": x,y offset to place the frame within the animation

   - Range 0-16777215

   - Default is 0,0 (defined above)

   **-**  "delay": Length of this frame in miliseconds

   - Range 0-16777215
    
   - Default is 100 (defined above)
    
   - According to the documentation, delays <= 10ms are WebP implementation defined, and many tools/browsers/etc assign their own minimum-allowed delay.
   
   **-** "blend": Boolean flag for whether or not to use alpha blending when drawing the frame
        
   - Default is "true" (defined above)
      
   **-**  "dispose": Boolean flag to control frame disposal method

   - "true" causes the background color to be drawn under the frame
   
   - "false" draws the new frame directly
   
   - Default is false" (defined above)
    
   **-** "exif"/"iccp"/"xmp": Set EXIF/ICCP/XMP chunks in the animation. Note that there is no verification whatsoever that the data passed is valid

```async Image.save(path, image)```

  Save the given WebP "image" to "path".

  Does not currently support animations (use Image.muxAnim above instead).

== Animation object ==

  .anim
    An object with the following properties, or undefined if not an animation
    `raw`
      A Buffer containing the raw data for the ANIM chunk. Mainly for internal use
    `backgroundColor`
      The background color in [r, g, b, a] format
    `loopCount`
      The loop count
    `frames`
      Array in the following format
      [
        {
          raw, // The raw data for this ANMF chunk
          type, // The type of image this frame is, from the constants table
          x, y, // The x,y position
          width, height, // The frame's width/height
          duration, // Frame delay
          blend, dispose, // Blend/dipose flags
          // Additionally, one or more of the following
          vp8, // The raw, compressed WebP data for a lossy image
          vp8l, // The raw, compressed WebP data for a lossless image
          alph // The raw, compressed WebP data for an alpha map. If this frame is lossy, it might have this
        },
        ...
      ]

== The full layout for internal Image data ==
{
  path, // The path loaded
  loaded, // Boolean flag for if this object has an image loaded
  data: { // The loaded data
    type, // The type of image from the constants table
    vp8: { // The lossy format image. Only if .type is TYPE_LOSSY or TYPE_EXTENDED
      raw, // The raw, compressed image data from the VP8 chunk
      width, height // The width/height, extracted from the VP8 image data
    },
    vp8l: { // The lossless format image. Only if .type is TYPE_LOSSLESS or TYPE_EXTENDED
      raw, // The raw, compressed image data from the VP8L chunk
      alpha, // A flag for if this image has alpha data, extracted from the VP8L image data
      width, height // The width/height, extracted from the VP8L image data
    },
    extended: { // Only if .type is TYPE_EXTENDED
      raw, // The raw data for the VP8X chunk
      hasICC, // Flag for if there's an ICC profile chunk defined
      hasAlpha, // Flag for if any image/frame defined has alpha data
      hasEXIF, // Flag for if there's an EXIF chunk defined
      hasXMP, // Flag for if there's an XMP chunk defined
      hasAnim, // Flag for if this image has an animation defined
      width, height // Width/height of the image
    },
    anim, // See above
    alph: {
      raw // The raw alpha map chunk. Only likely to be here if .vp8 is also defined
    },
    iccp: {
      raw // The raw ICCP chunk, if defined
    },
    exif: {
      raw // The raw EXIF chunk, if defined
    },
    xmp: {
      raw // The raw XMP chunk, if defined
    }
  }
}
