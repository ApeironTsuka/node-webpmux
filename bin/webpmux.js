#!/usr/bin/env node

const fs = require('fs');
const WebP = require('../webp.js');

function parseDuration(d) {
  let a = d.split(',');
  if (a.length == 1) { return { dur: a[0], start: 0, end: 0 }; }
  if (a.length == 2) { return { dur: a[0], start: a[1], end: a[1] }; }
  if (a.length == 3) { return { dur: a[0], start: a[1], end: a[2] }; }
  throw new Error('Failed to parse duration');
}
function parseFrame(f) {
  let out = {}, a = f.split('+');
  if (a.length < 2) { throw new Error('Failed to parse frame setting shorthand'); }
  out.duration = a[1];
  out.x = a[2];
  out.y = a[3];
  if (a[4] == 1) { out.dispose = true; }
  else if (a[4] == 0) { out.dispose = false; }
  else if (a[4] !== undefined) {
    let x = a[4].split('-');
    if (x[0] == 1) { out.dispose = true; }
    else if (x[0] == 0) { out.dispose = false; }
    if (x[1] == 'b') { out.blend = false; }
  }
  if (a[5] == 'b') { out.blend = true; }
  return out;
}
function parseCmdLine(args) {
  let state = {}, tester = /^-/;
  let test = (i, t, v) => {
    if ((t) && (i >= args.length)) { return false; }
    else if (tester.test(args[i])) {
      if (t) { return false; }
      throw new Error(`Expected argument, got flag at word ${i} (${args[i-1]} ${args[i]} ${args[i+1]})`);
    }
    if (t) { return (v && v == args[i] ? true : v ? false : true); }
    else { return true; }
  };
  for (let i = 0, l = args.length; i < l; i++) {
    switch (args[i]) {
      case '-get':
        if (!test(i+1, true)) { throw new Error('GET_OPTS missing argument'); }
        state.get = { what: args[++i] };
        switch (state.get.what) {
          case 'icc': case 'iccp': state.get.what = 'iccp'; break;
          case 'exif': case 'xmp': break;
          case 'frame':
            if (!test(i+1, true)) { throw new Error('GET_OPTS frame missing argument'); }
            state.get.frame = args[++i];
            break;
          default: throw new Error(`Unknown GET_OPTS ${state.set.what}`);
        }
        break;
      case '-set':
        if (!test(i+1, true)) { throw new Error('SET_OPTS missing argument'); }
        state.set = { what: args[++i] };
        switch (state.set.what) {
          case 'loop': if (!test(i+1, true)) { throw new Error('SET_OPTS loop missing argument'); } state.set.loop = args[++i]; break;
          case 'iccp': case 'icc': if (!test(i+1, true)) { throw new Error(`SET_OPTS ${state.set.what} missing argument`); } state.set.what = 'iccp'; state.set.iccp = args[++i]; break;
          case 'exif': if (!test(i+1, true)) { throw new Error('SET_OPTS exif missing argument'); } state.set.exif = args[++i]; break;
          case 'xmp': if (!test(i+1, true)) { throw new Error('SET_OPTS xmp missing argument'); } state.set.xmp = args[++i]; break;
          default: throw new Error(`Unknown SET_OPTS ${state.set.what}`);
        }
        break;
      case '-strip': if (!test(i+1, true)) { throw new Error('STRIP_OPTS missing argument'); } state.strip = args[++i]; break;
      case '-duration': if (!test(i+1, true)) { throw new Error('DUR_OPTS missing argument'); } if (!state.duration) { state.duration = []; } state.duration.push(parseDuration(args[++i])); break;
      case '-frame':
        {
          let f = {};
          if (!test(i+1, true)) { throw new Error('FRAME_OPTS missing argument'); }
          if (!state.frames) { state.frames = []; }
          f.path = args[++i];
          if (!test(i+1, true)) { throw new Error('Missing arguments in -frame'); }
          if (args[i+1][0] == '+') { f.bin = parseFrame(args[++i]); }
          else {
            let ni;
            for (let x = i+1, xl = l; x < xl; x++) {
              switch (args[x]) {
                case 'duration': if (!test(i+1, true)) { throw new Error('FRAME_OPTS duration missing argument'); } f.duration = args[++x]; break;
                case 'x': if (!test(i+1, true)) { throw new Error('FRAME_OPTS x missing argument'); } f.x = args[++x]; break;
                case 'y': if (!test(i+1, true)) { throw new Error('FRAME_OPTS y missing argument'); } f.y = args[++x]; break;
                case 'dispose': if (!test(i+1, true)) { throw new Error('FRAME_OPTS dispose missing argument'); } f.dispose = args[++x]; break;
                case 'blend': if (!test(i+1, true)) { throw new Error('FRAME_OPTS blend missing argument'); } f.blend = args[++x]; break;
                default: break;
              }
              ni = x-1;
            }
            i = ni;
          }
          state.frames.push(f);
        }
        break;
      case '-info': state.info = true; break;
      case '-h': case '-help': state.help = true; break;
      case '-version': state.version = true; break;
      case '-o': if (!test(i+1, true)) { throw new Error('OUT missing argument'); } state.out = args[++i]; break;
      case '-loop': if (!test(i+1, true)) { throw new Error('COUNT missing argument'); } state.loop = args[++i]; break;
      case '-bg': if (!test(i+1, true)) { throw new Error('COLOR missing argument'); } state.bg = args[++i].split(','); break;
      default: if (!state.in) { state.in = args[i]; } else { throw new Error(`Unknown flag ${args[i]}`); }
    }
  }
  return state;
}
function printHelp() {
  console.log(`Usage: webpmux -get GET_OPTS IN -o OUT
       webpmux -set SET_OPTS IN -o OUT
       webpmux -strip STRIP_OPTS IN -o OUT
       webpmux -duration DUR_OPTS [-duration ...] IN -o OUT
       webpmux -frame FRAME_OPTS [-frame ...] [-loop COUNT] [-bg COLOR] -o OUT
       webpmux -info IN
       webpmux [-h|-help]
       webpmux -version

GET_OPTS:
  Extract the relevant data:
    iccp (or icc, for backwards support)
    exif
    xmp
    frame n

SET_OPTS:
  Set color profile/metadata:
    loop COUNT       set the loop count
    iccp file.iccp   set the ICC profile
    icc file.icc     set the ICC profile (backwards support)
    exif file.exif   set the EXIF metadata
    xmp file.xmp     set the XMP metadata
    where:  'file.icc'/'file.iccp' contains the ICC profile to be set.
            'file.exif' contains the EXIF metadata to be set.
            'file.xmp' contains the XMP metadata to be set.

DUR_OPTS:
  Set duration of selected frames
    duration             set duration for each frame
    duration,frame       set duration of a particular frame
    duration,start,end   set duration of frames in the
                           interval [start, end]
    where: 'duration' is the duration in milliseconds.
           'start' is the start frame index.
           'end' is the inclusive end frame index.
           The special 'end' value '0' means: last frame.

STRIP_OPTS:
  Strip color profile/metadata:
    iccp     strip ICC profile
    icc      strip ICC profile (for backwards support)
    exif     strip EXIF metadata
    xmp      strip XMP metadata

FRAME_OPTS:
  Create an animation frame:
    frame.webp       the animation frame
    WEBPMUX_FRAMES   legacy frame settings
       OR
    frame.webp       the animation frame
    duration N       the pause duration before next frame
    x X              the x offset for this frame
    y Y              the y offset for this frame
    dispose on/off   dispose method for this frame (on: background, off: none)
    blend on/off     blending method for this frame

COUNT:
  Number of times to repeat the animation.
  Valid range is 0 to 65535 [Default: 0 (infinite)]

COLOR:
  Background color of the animation canvas.
  R,G,B,A ('normal' mode)
  A,R,G,B ('legacy' mode)
  where: 'A', 'R', 'G', and 'B' are integers in the range 0 to 255 specifying
         the Alpha, Red, Green, and Blue component values respectively
         [Default: 255, 255, 255, 255]

WEBPMUX_FRAMES (for drop-in support for the upstream webpmux binary, puts it into 'legacy' mode):
  +d[+x+y[+m[+b]]]
  where: 'd' is the pause duration before next frame
         'x', 'y' specify the image offset for this frame
         'm' is the dispose method for this frame (0 or 1)
         'b' is the blending method for this frame (+b or -b)

IN & OUT are in WebP format.

Note: The nature of EXIF, XMP, and ICC data is not checked and is assumed to be valid.`);
}
function printInfo(img) {
  let f = [];
  let pad = (s, n) => { let o = `${s}`; while (o.length < n) { o = ` ${o}`; } return o; };
  let fra = (fr) => { return fr.vp8 ? fr.vp8.alpha : fr.vp8l ? fr.vp8l.alpha : false; };
  let bgcol = (c) => { return `0x${c[0].toString(16)}${c[0].toString(16)}${c[1].toString(16)}${c[2].toString(16)}${c[3].toString(16)}`.toUpperCase(); }
  console.log(`Canvas size: ${img.width} x ${img.height}`);
  if (img.hasAnim) { f.push('animation'); }
  if (img.hasAlpha) { f.push(!img.hasAnim ? 'transparency' : 'alpha'); }
  if (f.length == 0) { console.log('No features present.'); }
  else { console.log(`Features present: ${f.join(' ')}`); }
  if (img.hasAnim) {
    console.log(`Background color : ${bgcol(img.anim.bgColor)}  Loop Count : ${img.anim.loops}`);
    console.log(`Number of frames: ${img.frames.length}`);
    console.log('No.: width height alpha x_offset y_offset duration   dispose blend image_size  compression');
    for (let i = 0, fr = img.frames, l = fr.length; i < l; i++) {
      let out = '';
      out += `${pad(i+1, 3)}: ${pad(fr[i].width, 5)} ${pad(fr[i].height, 5)}   ${fra(fr[i]) ? 'yes' : ' no'} `;
      out += `${pad(fr[i].x, 8)} ${pad(fr[i].y, 8)} ${pad(fr[i].duration, 8)} ${pad(fr[i].dispose ? 'background' : 'none', 10)} `;
      out += `${pad(fr[i].blend ? 'yes' : 'no', 5)} ${pad(fr[i].alph ? fr[i].raw.length+14 : fr[i].raw.length-4, 10)} `;
      out += `${pad(fr[i].vp8 ? 'lossy' : 'lossless', 11)}`;
      console.log(out);
    }
  } else {
    let size = (fs.statSync(img.path)).size;
    if (img.hasAlpha) { console.log(`Size of the image (with alpha): ${size}`); }
  }
}
async function main() {
  let state = parseCmdLine(process.argv.slice(2)), img = new WebP.Image(), d;
  if (state.help) { printHelp(); }
  else if (state.version) { console.log(`node-webpmux ${JSON.parse(fs.readFileSync('../package.json')).version}`); }
  else if (state.get) {
    if (!state.in) { console.log('Missing input file'); return; }
    if (!state.out) { console.log('Missing output file'); return; }
    try { await img.load(state.in); }
    catch (e) { console.log(`Error opening ${state.in}`); return; }
    switch (state.get.what) {
      case 'iccp': d = img.iccp; break;
      case 'exif': d = img.exif; break;
      case 'xmp': d = img.xmp; break;
      case 'frame': d = (await img.demuxToBuffers({ frame: d.frame }))[0]; break;
    }
    fs.writeFileSync(state.out, d);
  }
  else if (state.set) {
    if (!state.in) { console.log('Missing input file'); return; }
    if (!state.out) { console.log('Missing output file'); return; }
    try { await img.load(state.in); }
    catch (e) { console.log(`Error opening ${state.in}`); return; }
    switch (state.set.what) {
      case 'loop':
        if (!img.hasAnim) { console.log("Image isn't an animation; cannot set loop count"); return; }
        d = parseInt(state.set.loop);
        if (isNaN(d)) { console.log('Loop count must be a number 0 <= n <= 65535'); return; }
        if ((d < 0) || (d >= 65536)) { console.log('Loop count must be a number 0 <= n <= 65535'); return; }
        img.anim.loops = d;
        try { await img.save(state.out); }
        catch (e) { console.log(e); }
        break;
      case 'iccp':
      case 'exif':
      case 'xmp':
        try { d = fs.readFileSync(state.set[state.set.what]); }
        catch (e) { console.log(`Could not open/read ${state.set[state.set.what]}`); return; }
        img[state.set.what] = d;
        try { await img.save(state.out); }
        catch (e) { console.log(e); }
        break;
    }
  }
  else if (state.strip) {
    if (!state.in) { console.log('Missing input file'); return; }
    if (!state.out) { console.log('Missing output file'); return; }
    try { await img.load(state.in); }
    catch (e) { console.log(`Error opening ${state.in}`); return; }
    img[state.strip.what] = undefined;
    try { await img.save(state.out); }
    catch (e) { console.log(e); }
  }
  else if (state.duration) {
    if (!state.in) { console.log('Missing input file'); return; }
    if (!state.out) { console.log('Missing output file'); return; }
    try { await img.load(state.in); }
    catch (e) { console.log(`Error opening ${state.in}`); return; }
    if (!img.hasAnim) { console.log("Image isn't an animation; cannot set frame durations"); return; }
    for (let i = 0, dur = state.duration, l = dur.length; i < l; i++) {
      if (isNaN(parseInt(dur.dur))) { console.log('Duration must be a number '); return; }
      if (isNaN(parseInt(dur.start))) { console.log('Start frame must be a number'); return; }
      if (isNaN(parseInt(dur.end))) { console.log('Start frame must be a number'); return; }
      if (dur.start < 0) { console.log('Start frame cannot be < 0'); return; }
      if (dur.end == 0) { dur.end = img.frames.length-1; }
      if (dur.end < 0) { console.log('End frame cannot be < 0'); return; }
      if (dur.end >= img.frames.length) { console.log('Warning: End frame beyond frame count; clipping'); dur.end = img.frames.length-1; }
      if (dur.start >= img.frames.length) { console.log('Warning: Start frame beyond frame count; clipping'); dur.start = img.frames.length-1; }
      for (let x = dur.start, xl = dur.end; x <= xl; x++) { img.frames[x].duration = dur.dur; }
    }
    try { await img.save(state.out); }
    catch (e) { console.log(e); }
  }
  else if (state.frames) {
    let bin = false;
    if (!state.out) { console.log('Missing output file'); return; }
    img = await WebP.Image.getEmptyImage();
    img.convertToAnim();
    for (let i = 0, f = state.frames, l = f.length; i < l; i++) {
      if (f[i].bin) { bin = true; d = f[i].bin; }
      else { d = f[i]; }
      d = WebP.Image.generateFrame({
        path: f[i].path,
        x: d.x,
        y: d.y,
        duration: d.duration,
        dispose: d.dispose,
        blend: d.blend
      });
      img.frames.push(d);
    }
    if (state.loop !== undefined) { img.anim.loops = state.loop; }
    if (state.bg !== undefined) {
      if (bin) { img.anim.bgColor = [ state.bg[3], state.bg[0], state.bg[1], state.bg[2] ]; }
      else { img.anim.bgColor = [ state.bg[0], state.bg[1], state.bg[2], state.bg[3] ]; }
    }
    try { await img.save(state.out); }
    catch (e) { console.log(e); }
  }
  else if (state.info) {
    if (!state.in) { console.log('Missing input file'); return; }
    try { await img.load(state.in); }
    catch (e) { console.log(`Error opening ${state.in}`); return; }
    printInfo(img);
  } else { printHelp(); }
}
main().then(()=>{});
