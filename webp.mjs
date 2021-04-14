// https://developers.google.com/speed/webp/docs/riff_container
import _fs from 'fs';
import { promisify } from 'util';
import { basename } from 'path';
const fs = {
  read: promisify(_fs.read),
  write: promisify(_fs.write),
  open: promisify(_fs.open),
  close: promisify(_fs.close)
};
const nullByte = Buffer.alloc(1);
nullByte[0] = 0;
export const constants = {
  TYPE_LOSSY: 0,
  TYPE_LOSSLESS: 1,
  TYPE_EXTENDED: 2
};
function VP8Width(data) {
  let n = (data[7]<<8)|data[6];
  return n&0b0011111111111111;
}
function VP8Height(data) {
  let n = (data[9]<<8)|data[8];
  return n&0b0011111111111111;
}
function VP8LWidth(data) {
  let n = (data[2]<<8)|data[1];
  return (n&0b0011111111111111)+1;
}
function VP8LHeight(data) {
  let n = (data[4]<<16)|(data[3]<<8)|data[2];
  n = n >> 6;
  return (n&0b0011111111111111)+1;
}
function doesVP8LHaveAlpha(data) { return !!(data[4]&0b00010000); }
function createBasicChunk(name, data) {
  let chunk = Buffer.alloc(8), size = data.length, out;
  chunk.write(name, 0);
  chunk.writeUInt32LE(size, 4);
  out = [chunk, data];
  if (size&1) { out[2] = nullByte; }
  return out;
}
class Image {
  data = null;
  loaded = false;
  path = '';
  clear() { this.data = null; this.path = ''; this.loaded = false; }
  get width() {
    if (!this.loaded) { return undefined; }
    let d = this.data; return d.extended ? d.extended.width : d.vp8l ? d.vp8l.width : d.vp8 ? d.vp8.width : undefined;
  }
  get height() {
    if (!this.loaded) { return undefined; }
    let d = this.data; return d.extended ? d.extended.height : d.vp8l ? d.vp8l.height : d.vp8 ? d.vp8.height : undefined;
  }
  get type() { return this.loaded ? this.data.type : undefined; }
  get hasAnim() { return this.loaded ? this.data.extended ? this.data.extended.hasAnim : false : false; }
  get anim() { return this.hasAnim ? this.data.anim : undefined; }
  get frames() { return this.anim ? this.anim.frames : undefined; }
  get frameCount() { return this.anim ? this.anim.frameCount : 0; }
  get iccp() { return this.data.extended ? this.data.extended.hasICCP ? this.data.iccp.raw : undefined : undefined; }
  set iccp(raw) {
    if (!this.data.extended) { this.#convertToExtended(); }
    if (raw === undefined) { this.data.extended.hasICCP = false; delete this.data.iccp; }
    else { this.data.iccp = { raw }; this.data.extended.hasICCP = true; }
  }
  get exif() { return this.data.extended ? this.data.extended.hasEXIF ? this.data.exif.raw : undefined : undefined; }
  set exif(raw) {
    if (!this.data.extended) { this.#convertToExtended(); }
    if (raw === undefined) { this.data.extended.hasEXIF = false; delete this.data.exif; }
    else { this.data.exif = { raw }; this.data.extended.hasEXIF = true; }
  }
  get xmp() { return this.data.extended ? this.data.extended.hasXMP ? this.data.xmp.raw : undefined : undefined; }
  set xmp(raw) {
    if (!this.data.extended) { this.#convertToExtended(); }
    if (raw === undefined) { this.data.extended.hasXMP = false; delete this.data.xmp; }
    else { this.data.xmp = { raw }; this.data.extended.hasXMP = true; }
  }
  async load(path) { this.path = path; this.data = await this.#read(path); this.loaded = true; }
  #convertToExtended() {
    if (!this.loaded) { throw new Error('No image loaded'); }
    this.data.type = constants.TYPE_EXTENDED;
    this.data.extended = {
      hasICCP: false,
      hasAlpha: false,
      hasEXIF: false,
      hasXMP: false,
      width: this.data.vp8 ? this.data.vp8.width : this.data.vp8l ? this.data.vp8l.width : 1,
      height: this.data.vp8 ? this.data.vp8.height : this.data.vp8l ? this.data.vp8l.height : 1
    };
  }
  async #demuxFrame(path, frame) {
    let header = Buffer.alloc(12), size, chunk, out = [];
    header.write('RIFF', 0);
    header.write('WEBP', 8);
    out.push(header);
    if ((this.data.extended.hasICCP) ||
        (this.data.extended.hasEXIF) ||
        (this.data.extended.hasXMP) ||
        ((frame.vp8) && (frame.vp8.alpha))) {
      chunk = Buffer.alloc(18);
      chunk.write('VP8X', 0);
      chunk.writeUInt32LE(10, 4);
      if (this.data.extended.hasICCP) { chunk[8] |= 0b00100000; }
      if (((frame.vp8l) && (frame.vp8l.alpha)) ||
          ((frame.vp8) && (frame.vp8.alpha))) { chunk[8] |= 0b00010000; }
      if (this.data.extended.hasEXIF) { chunk[8] |= 0b00001000; }
      if (this.data.extended.hasXMP) { chunk[8] |= 0b00000100; }
      chunk.writeUIntLE(frame.width-1, 12, 3);
      chunk.writeUIntLE(frame.height-1, 15, 3);
      out.push(chunk);
    }
    if (frame.vp8l) { out.push(...createBasicChunk('VP8L', frame.vp8l.raw)); }
    else if (frame.vp8) {
      if (frame.vp8.alpha) { out.push(...createBasicChunk('ALPH', frame.alph.raw)); }
      out.push(...createBasicChunk('VP8 ', frame.vp8.raw));
    } else { throw new Error('Frame has no VP8/VP8L?'); }
    if (this.type == constants.TYPE_EXTENDED) {
      if (this.data.extended.hasICCP) { out.push(...createBasicChunk('ICCP', this.data.iccp.raw)); }
      if (this.data.extended.hasEXIF) { out.push(...createBasicChunk('EXIF', this.data.exif.raw)); }
      if (this.data.extended.hasXMP) { out.push(...createBasicChunk('XMP ', this.data.xmp.raw)); }
    }
    size = 4; for (let i = 1, l = out.length; i < l; i++) { size += out[i].length; }
    header.writeUInt32LE(size, 4);
    let fp = await fs.open(path, 'w');
    for (let i = 0, l = out.length; i < l; i++) { await fs.write(fp, out[i], 0, undefined, undefined); }
    await fs.close(fp);
  }
  async demuxAnim(path, frame = -1, prefix = '#FNAME#') {
    let start = 0, end = this.frameCount;
    if (end == 0) { throw new Error('This WebP isn\'t an animation'); }
    if (frame != -1) { start = end = frame; }
    for (let i = start; i <= end; i++) {
      await this.#demuxFrame((`${path}/${prefix}_${i}.webp`).replace(/#FNAME#/g, basename(this.path, '.webp')), this.anim.frames[i]);
    }
  }
  async replaceFrame(path, frame) {
    if (!this.hasAnim) { throw new Error('WebP isn\'t animated'); }
    if ((frame < 0) || (frame >= this.frameCount)) { throw new Error(`Frame index ${frame} out of bounds (0<=index<${this.frameCount})`); }
    let r = new Image();
    await r.load(path);
    switch (r.type) {
      case constants.TYPE_LOSSY:
      case constants.TYPE_LOSSLESS:
        break;
      case constants.TYPE_EXTENDED:
        if (r.hasAnim) { throw new Error('Merging animations not currently supported'); }
        break;
      default: throw new Error('Unknown WebP type');
    }
    switch (this.anim.frames[frame].type) {
      case constants.TYPE_LOSSY:
        if (this.anim.frames[frame].vp8.alpha) { delete this.anim.frames[frame].alph; }
        delete this.anim.frames[frame].vp8;
        break;
      case constants.TYPE_LOSSLESS:
        delete this.anim.frames[frame].vp8l;
        break;
      default: throw new Error('Unknown frame type');
    }
    switch (r.type) {
      case constants.TYPE_LOSSY:
        this.anim.frames[frame].vp8 = r.data.vp8;
        break;
      case constants.TYPE_LOSSLESS:
        this.anim.frames[frame].vp8l = r.data.vp8l;
        break;
      case constants.TYPE_EXTENDED:
        if (r.data.vp8) {
          this.anim.frames[frame].vp8 = r.data.vp8;
          if (r.data.vp8.alpha) { this.anim.frames[frame].alph = r.data.alph; }
        } else if (r.data.vp8l) { this.anim.frames[frame].vp8l = r.data.vp8l; }
        break;
    }
    this.anim.frames[frame].width = r.width;
    this.anim.frames[frame].height = r.height;
  }
  async muxAnim({ path, bgColor = this.hasAnim ? this.anim.backgroundColor : [255,255,255,255], loops = this.hasAnim ? this.anim.loopCount : 0, exif = !!this.exif, iccp = !!this.iccp, xmp = !!this.xmp, width = this.width, height = this.height }={}) { return Image.muxAnim({ path, bgColor, loops, frames: this.frames, width, height, exif: exif ? this.exif : undefined, iccp: iccp ? this.iccp : undefined, xmp: xmp ? this.xmp : undefined }); }
  async save(path = this.path) { return Image.save(path, this); }

  async #readHeader(fd) {
    let buf = Buffer.alloc(12);
    let { bytesRead } = await fs.read(fd, buf, 0, 12, undefined);
    if (bytesRead != 12) { throw new Error('Reached end of file while reading header'); }
    if (buf.toString('utf8', 0, 4) != 'RIFF') { throw new Error('Bad header (not RIFF)'); }
    if (buf.toString('utf8', 8, 12) != 'WEBP') { throw new Error('Bad header (not WEBP)'); }
    return { fileSize: buf.readUInt32LE(4) };
  }
  async #readChunkHeader(fd) {
    let buf = Buffer.alloc(8);
    let { bytesRead } = await fs.read(fd, buf, 0, 8, undefined);
    if (bytesRead == 0) { return { fourCC: '\x00\x00\x00\x00', size: 0 }; }
    else if (bytesRead < 8) { throw new Error('Reached end of file while reading chunk header'); }
    return { fourCC: buf.toString('utf8', 0, 4), size: buf.readUInt32LE(4) };
  }
  #readChunkHeader_buf(buf, cursor) {
    if (cursor >= buf.length) { return { fourCC: '\x00\x00\x00\x00', size: 0 }; }
    return { fourCC: buf.toString('utf8', cursor, cursor+4), size: buf.readUInt32LE(cursor+4) };
  }
  async #readChunk_raw(n, fd, size) {
    let buf = Buffer.alloc(size), discard = Buffer.alloc(1);
    let { bytesRead } = await fs.read(fd, buf, 0, size, undefined);
    if (bytesRead != size) { throw new Error(`Reached end of file while reading ${n} chunk`); }
    if (size&1) { await fs.read(fd, discard, 0, 1, undefined); }
    return { raw: buf };
  }
  async #readChunk_VP8(fd, size) {
    let buf = Buffer.alloc(size), discard = Buffer.alloc(1);
    let { bytesRead } = await fs.read(fd, buf, 0, size, undefined);
    if (bytesRead != size) { throw new Error('Reached end of file while reading VP8 chunk'); }
    if (size&1) { await fs.read(fd, discard, 0, 1, undefined); }
    return { raw: buf, width: VP8Width(buf, 8), height: VP8Height(buf, 8) };
  }
  #readChunk_VP8_buf(buf, size, cursor) {
    if (cursor >= buf.length) { throw new Error('Reached end of buffer while reading VP8 chunk'); }
    let raw = buf.slice(cursor, cursor+size);
    return { raw, width: VP8Width(raw), height: VP8Height(raw) };
  }
  async #readChunk_VP8L(fd, size) {
    let buf = Buffer.alloc(size), discard = Buffer.alloc(1);
    let { bytesRead } = await fs.read(fd, buf, 0, size, undefined);
    if (bytesRead != size) { throw new Error('Reached end of file while reading VP8L chunk'); }
    if (size&1) { await fs.read(fd, discard, 0, 1, undefined); }
    return { raw: buf, alpha: doesVP8LHaveAlpha(buf), width: VP8LWidth(buf), height: VP8LHeight(buf) };
  }
  #readChunk_VP8L_buf(buf, size, cursor) {
    if (cursor >= buf.length) { throw new Error('Reached end of buffer while reading VP8L chunk'); }
    let raw = buf.slice(cursor, cursor+size);
    return { raw, alpha: doesVP8LHaveAlpha(raw), width: VP8LWidth(raw), height: VP8LHeight(raw) };
  }
  async #readChunk_VP8X(fd, size) {
    let buf = Buffer.alloc(size);
    let { bytesRead } = await fs.read(fd, buf, 0, size, undefined);
    if (bytesRead != size) { throw new Error('Reached end of file while reading VP8X chunk'); }
    return {
      raw: buf,
      hasICCP:    !!(buf[0]&0b00100000),
      hasAlpha:   !!(buf[0]&0b00010000),
      hasEXIF:    !!(buf[0]&0b00001000),
      hasXMP:     !!(buf[0]&0b00000100),
      hasAnim:    !!(buf[0]&0b00000010),
      width: buf.readUIntLE(4, 3)+1,
      height: buf.readUIntLE(7, 3)+1
    };
  }
  async #readChunk_ANIM(fd, size) {
    let buf = Buffer.alloc(size);
    let { bytesRead } = await fs.read(fd, buf, 0, size, undefined);
    if (bytesRead != size) { throw new Error('Reached end of file while reading ANIM chunk'); }
    return {
      raw: buf,
      bgColor: buf.slice(0, 4),
      loopCount: buf.readUInt16LE(4)
    }
  }
  async #readChunk_ANMF(fd, size) {
    let buf = Buffer.alloc(size), discard = Buffer.alloc(1);
    let { bytesRead } = await fs.read(fd, buf, 0, size, undefined);
    if (bytesRead != size) { throw new Error('Reached end of file while reading ANMF chunk'); }
    if (size&1) { await fs.read(fd, discard, 0, 1, undefined); }
    let out = {
      raw: buf,
      x: buf.readUIntLE(0, 3),
      y: buf.readUIntLE(3, 3),
      width: buf.readUIntLE(6, 3)+1,
      height: buf.readUIntLE(9, 3)+1,
      duration: buf.readUIntLE(12, 3),
      blend: !(buf[15]&0b00000010),
      dispose: !!(buf[15]&0b00000001)
    };
    let keepLooping = true, cursor = 16;
    while (keepLooping) {
      let header = this.#readChunkHeader_buf(buf, cursor), t;
      cursor += 8;
      switch (header.fourCC) {
        case 'VP8 ':
          if (!out.vp8) {
            out.type = constants.TYPE_LOSSY;
            out.vp8 = this.#readChunk_VP8_buf(buf, header.size, cursor);
            if (out.alph) { out.vp8.alpha = true; }
          }
          break;
        case 'VP8L':
          if (!out.vp8l) {
            out.type = constants.TYPE_LOSSLESS;
            out.vp8l = this.#readChunk_VP8L_buf(buf, header.size, cursor);
          }
          break;
        case 'ALPH':
          if (!out.alph) {
            out.alph = this.#readChunk_ALPH_buf(buf, header.size, cursor);
            if (out.vp8) { out.vp8.alpha = true; }
          }
          break;
        case '\x00\x00\x00\x00':
        default:
          keepLooping = false;
          break;
      }
      cursor += header.size;
      if (header.size&1) { cursor++; }
      if (cursor >= buf.length) { keepLooping = false; }
    }
    return out;
  }
  async #readChunk_ALPH(fd, size) { return this.#readChunk_raw('ALPH', fd, size); }
  #readChunk_ALPH_buf(buf, size, cursor) {
    if (cursor >= buf.length) { throw new Error('Reached end of buffer while reading ALPH chunk'); }
    return { raw: buf.slice(cursor, cursor+size) };
  }
  async #readChunk_ICCP(fd, size) { return this.#readChunk_raw('ICCP', fd, size); }
  async #readChunk_EXIF(fd, size) { return this.#readChunk_raw('EXIF', fd, size); }
  async #readChunk_XMP(fd, size) { return this.#readChunk_raw('XMP ', fd, size); }
  async #readChunk_Skip(fd, size) {
    let buf = Buffer.alloc(size), discard = Buffer.alloc(1);
    let { bytesRead } = await fs.read(fd, buf, 0, size, undefined);
    if (bytesRead != size) { throw new Error('Reached end of file while skipping chunk'); }
    if (size&1) { await fs.read(fd, discard, 0, 1, undefined); }
  }
  async #read(path) {
    let fd = await fs.open(path, 'r'), out = {}, keepLooping = true, first = true;
    let { fileSize } = await this.#readHeader(fd);
    while (keepLooping) {
      let { fourCC, size } = await this.#readChunkHeader(fd);
      switch (fourCC) {
        case 'VP8 ':
          if (!out.vp8) { out.vp8 = await this.#readChunk_VP8(fd, size); }
          else { await this.#readChunk_Skip(fd, size); }
          if (first) { out.type = constants.TYPE_LOSSY; keepLooping = false; }
          break;
        case 'VP8L':
          if (!out.vp8l) { out.vp8l = await this.#readChunk_VP8L(fd, size); }
          else { await this.#readChunk_Skip(fd, size); }
          if (first) { out.type = constants.TYPE_LOSSLESS; keepLooping = false; }
          break;
        case 'VP8X':
          if (!out.extended) {
            out.type = constants.TYPE_EXTENDED;
            out.extended = await this.#readChunk_VP8X(fd, size);
          } else { await this.#readChunk_Skip(fd, size); }
          break;
        case 'ANIM':
          if (!out.anim) {
            let { raw, bgColor, loopCount } = await this.#readChunk_ANIM(fd, size);
            out.anim = {
              backgroundColor: [ bgColor[2], bgColor[1], bgColor[0], bgColor[3] ],
              loopCount,
              frames: []
            };
            out.anim.raw = raw;
          } else { await this.#readChunk_Skip(fd, size); }
          break;
        case 'ANMF':
          {
            let f = await this.#readChunk_ANMF(fd, size);
            out.anim.frames.push(f);
          }
          break;
        case 'ALPH':
          if (!out.alph) { out.alph = await this.#readChunk_ALPH(fd, size); }
          else { await this.#readChunk_Skip(fd, size); }
          break;
        case 'ICCP':
          if (!out.iccp) { out.iccp = await this.#readChunk_ICCP(fd, size); }
          else { await this.#readChunk_Skip(fd, size); }
          break;
        case 'EXIF':
          if (!out.exif) { out.exif = await this.#readChunk_EXIF(fd, size); }
          else { await this.#readChunk_Skip(fd, size); }
          break;
        case 'XMP ':
          if (!out.xmp) { out.xmp = await this.#readChunk_XMP(fd, size); }
          else { await this.#readChunk_Skip(fd, size); }
          break;
        case '\x00\x00\x00\x00': keepLooping = false; break;
        default: await this.#readChunk_Skip(fd, size); break;
      }
      first = false;
    }
    if ((out.type == constants.TYPE_EXTENDED) &&
        (out.extended.hasAnim)) { out.anim.frameCount = out.anim.frames.length; }
    return out;
  }
  static async save(path, image) {
    let header = Buffer.alloc(12), out = [], size;
    let _width = image.width-1, _height = image.height-1;
    if ((_width <= 0) || (_width > (1<<24))) { throw new Error('Width out of range'); }
    else if ((_height <= 0) || (_height > (1<<24))) { throw new Error('Height out of range'); }
    else if ((_height*_width) > (Math.pow(2,32)-1)) { throw new Error(`Width*height too large (${_width}, ${_height})`); }
    else if (image.hasAnim) { throw new Error('Using `save` for animations is not currently supported. Use `muxAnim` instead'); }
    header.write('RIFF', 0);
    header.write('WEBP', 8);
    out.push(header);
    switch (image.type) {
      case constants.TYPE_LOSSY: out.push(...createBasicChunk('VP8 ', image.data.vp8.raw)); break;
      case constants.TYPE_LOSSLESS: out.push(...createBasicChunk('VP8L', image.data.vp8l.raw)); break;
      case constants.TYPE_EXTENDED:
        {
          let chunk = Buffer.alloc(18);
          chunk.write('VP8X', 0);
          chunk.writeUInt32LE(10, 4);
          chunk.writeUIntLE(_width, 12, 3);
          chunk.writeUIntLE(_height, 15, 3);
          out.push(chunk);
          if ((image.data.alph) || ((image.data.vp8l) && (image.data.vp8l.alpha))) { chunk[8] |= 0b00010000; }
          if (image.data.vp8) {
            if (image.data.alph) { out.push(...createBasicChunk('ALPH', image.data.alph.raw)); }
            out.push(...createBasicChunk('VP8 ', image.data.vp8.raw));
          }
          else if (image.data.vp8l) { out.push(...createBasicChunk('VP8L', image.data.vp8l.raw)); }
          if (image.data.extended.hasICCP) { chunk[8] |= 0b00100000; out.push(...createBasicChunk('ICCP', image.data.iccp.raw)); }
          if (image.data.extended.hasEXIF) { chunk[8] |= 0b00001000; out.push(...createBasicChunk('EXIF', image.data.exif.raw)); }
          if (image.data.extended.hasXMP) { chunk[8] |= 0b00000100; out.push(...createBasicChunk('XMP ', image.data.xmp.raw)); }
        }
        break;
      default: throw new Error('Unknown image type');
    }
    size = 4; for (let i = 1, l = out.length; i < l; i++) { size += out[i].length; }
    header.writeUInt32LE(size, 4);
    let fp = await fs.open(path, 'w');
    for (let i = 0, l = out.length; i < l; i++) { await fs.write(fp, out[i], 0, undefined, undefined); }
    await fs.close(fp);
  }
  static async muxAnim({ path, frames, width = 0, height = 0, bgColor = [255,255,255,255], loops = 0, delay = 100, x = 0, y = 0, blend = true, dispose = false, exif = undefined, iccp = undefined, xmp = undefined }={}) {
    let header = Buffer.alloc(12), chunk = Buffer.alloc(18), vp8x = chunk, out = [], img, alpha = false, size, _w = 0, _h = 0;
    let _width = width-1, _height = height-1;
    if (frames.length == 0) { throw new Error('No frames to mux'); }
    else if ((width != 0) && ((_width <= 0) || (_width > (1<<24)))) { throw new Error('Width out of range'); }
    else if ((height != 0) && ((_height <= 0) || (_height > (1<<24)))) { throw new Error('Height out of range'); }
    else if ((width != 0) && (height != 0) && ((_height*_width) > (Math.pow(2,32)-1))) { throw new Error(`Width*height too large (${_width}, ${_height})`); }
    else if ((loops < 0) || (loops >= (1<<24))) { throw new Error('Loops out of range'); }
    else if ((delay < 0) || (delay >= (1<<24))) { throw new Error('Delay out of range'); }
    else if ((x < 0) || (x >= (1<<24))) { throw new Error('X out of range'); }
    else if ((y < 0) || (y >= (1<<24))) { throw new Error('Y out of range'); }
    header.write('RIFF', 0);
    header.write('WEBP', 8);
    chunk.write('VP8X', 0);
    chunk.writeUInt32LE(10, 4);
    chunk[8] |= 0b00000010;
    if (width != 0) { chunk.writeUIntLE(_width, 12, 3); }
    if (height != 0) { chunk.writeUIntLE(_height, 15, 3); }
    out.push(header, chunk);
    chunk = Buffer.alloc(14);
    chunk.write('ANIM', 0);
    chunk.writeUInt32LE(6, 4);
    chunk.writeUInt8(bgColor[2], 8);
    chunk.writeUInt8(bgColor[1], 9)
    chunk.writeUInt8(bgColor[0], 10);
    chunk.writeUInt8(bgColor[3], 11);
    chunk.writeUInt16LE(loops, 12);
    out.push(chunk);
    for (let i = 0, l = frames.length; i < l; i++) {
      let _delay = typeof frames[i].delay === 'undefined' ? delay : frames[i].delay,
          _x = typeof frames[i].x === 'undefined' ? x : frames[i].x,
          _y = typeof frames[i].y === 'undefined' ? y : frames[i].y,
          _blend = typeof frames[i].blend === 'undefined' ? blend : frames[i].blend,
          _dispose = typeof frames[i].dispose === 'undefined' ? dispose : frames[i].dispose,
          size = 16, keepChunk = true, imgData;
      if ((delay < 0) || (delay >= (1<<24))) { throw new Error(`Delay out of range on frame ${i}`); }
      else if ((x < 0) || (x >= (1<<24))) { throw new Error(`X out of range on frame ${i}`); }
      else if ((y < 0) || (y >= (1<<24))) { throw new Error(`Y out of range on frame ${i}`); }
      chunk = Buffer.alloc(24);
      chunk.write('ANMF', 0);
      chunk.writeUIntLE(_x, 8, 3);
      chunk.writeUIntLE(_y, 11, 3);
      chunk.writeUIntLE(_delay, 20, 3);
      if (!_blend) { chunk[23] |= 0b00000010; }
      if (_dispose) { chunk[23] |= 0b00000001; }
      if (frames[i].path) {
        img = new Image();
        await img.load(frames[i].path);
      } else {
        img = { data: frames[i] };
      }
      chunk.writeUIntLE(img.data.width-1, 14, 3);
      chunk.writeUIntLE(img.data.height-1, 17, 3);
      switch (img.data.type) {
        case constants.TYPE_LOSSY:
          {
            let c = img.data.vp8;
            _w = c.width > _w ? c.width : _w;
            _h = c.height > _h ? c.height : _h;
            imgData = createBasicChunk('VP8 ', c.raw);
            size += c.raw.length+8+(c.raw.length&1);
          }
          break;
        case constants.TYPE_LOSSLESS:
          {
            let c = img.data.vp8l;
            _w = c.width > _w ? c.width : _w;
            _h = c.height > _h ? c.height : _h;
            if (c.alpha) { alpha = true; }
            imgData = createBasicChunk('VP8L', c.raw);
            size += c.raw.length+8+(c.raw.length&1);
          }
          break;
        case constants.TYPE_EXTENDED:
          if (img.data.extended.hasAnim) {
            let fr = img.data.anim.frames;
            keepChunk = false;
            if (img.data.extended.hasAlpha) { alpha = true; }
            for (let i = 0, l = fr.length; i < l; i++) {
              _w = fr[i].width+_x > _w ? fr[i].width+_x : _w;
              _h = fr[i].height+_y > _h ? fr[i].height+_y : _h;
              let b = Buffer.alloc(8);
              b.write('ANMF', 0);
              b.writeUInt32LE(fr[i].raw.length, 4);
              out.push(b, fr[i].raw);
              if (fr[i].raw.length&1) { out.push(nullByte); }
              b = fr[i].raw;
              b.writeUIntLE(_x, 0, 3);
              b.writeUIntLE(_y, 3, 3);
              b.writeUIntLE(_delay, 12, 3);
              if (!_blend) { b[15] |= 0b00000010; }
              else { b[15] &= 0b11111101; }
              if (_dispose) { b[15] |= 0b00000001; }
              else { b[15] &= 0b11111110; }
            }
          } else {
            _w = img.data.extended.width > _w ? img.data.extended.width : _w;
            _h = img.data.extended.height > _h ? img.data.extended.height : _h;
            if (img.data.vp8) {
              imgData = [];
              if (img.data.alph) {
                alpha = true;
                imgData.push(...createBasicChunk('ALPH', img.data.alph.raw));
                size += img.data.alph.raw.length+8+(img.data.alph.raw.length&1);
              }
              imgData.push(...createBasicChunk('VP8 ', img.data.vp8.raw));
              size += img.data.vp8.raw.length+8+(img.data.vp8.raw.length&1);
            } else if (img.data.vp8l) {
              imgData = createBasicChunk('VP8L', img.data.vp8l.raw);
              if (img.data.vp8l.alpha) { alpha = true; }
              size += img.data.vp8l.raw.length+8+(img.data.vp8l.raw.length&1);
            }
          }
          break;
        default: throw new Error('Unknown image type');
      }
      if (keepChunk) { chunk.writeUInt32LE(size, 4); out.push(chunk, ...imgData); }
    }
    if (width == 0) { vp8x.writeUIntLE(_w-1, 12, 3); }
    if (height == 0) { vp8x.writeUIntLE(_h-1, 15, 3); }
    if (iccp) { vp8x[8] |= 0b00100000; out.push(...createBasicChunk('ICCP', iccp)); }
    if (exif) { vp8x[8] |= 0b00001000; out.push(...createBasicChunk('EXIF', exif)); }
    if (xmp) { vp8x[8] |= 0b00000100; out.push(...createBasicChunk('XMP ', xmp)); }
    size = 4; for (let i = 1, l = out.length; i < l; i++) { size += out[i].length; }
    header.writeUInt32LE(size, 4);
    if (alpha) { vp8x[8] |= 0b00010000; }
    let fp = await fs.open(path, 'w');
    for (let i = 0, l = out.length; i < l; i++) { await fs.write(fp, out[i], 0, undefined, undefined); }
    await fs.close(fp);
  }
}
export default {
  TYPE_LOSSY: constants.TYPE_LOSSY,
  TYPE_LOSSLESS: constants.TYPE_LOSSLESS,
  TYPE_EXTENDED: constants.TYPE_EXTENDED,
  Image
};

