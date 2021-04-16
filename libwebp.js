const libwebpF = require('./libwebp/libwebp.js');
module.exports = class libWebP {
  enc = 0;
  async init() {
    let Module = this.Module = await libwebpF();
    let api = this.api = {
      encoderCreate: Module.cwrap('encoderCreate', 'number', []),
      encoderDestroy: Module.cwrap('encoderDestroy', '', [ 'number' ]),
      encoderInit: Module.cwrap('encoderInit', 'bool', [ 'number' ]),
      encoderReset: Module.cwrap('encoderReset', '', [ 'number' ]),
      encoderLoadRGBA: Module.cwrap('encoderLoadRGBA', 'bool', [ 'number', 'number', 'number', 'number' ]),
      encoderSetLossless: Module.cwrap('encoderSetLossless', 'bool', [ 'number', 'bool' ]),
      encoderSetQuality: Module.cwrap('encoderSetQuality', 'bool', [ 'number', 'number' ]),
      encoderSetMethod: Module.cwrap('encoderSetMethod', 'bool', [ 'number', 'number' ]),
      encoderSetExact: Module.cwrap('encoderSetExact', 'bool', [ 'number', 'bool' ]),
      encoderRun: Module.cwrap('encoderRun', 'number', [ 'number' ]),
      _encoderGetResult: Module.cwrap('encoderGetResult', 'number', [ 'number' ]),
      _encoderGetResultSize: Module.cwrap('encoderGetResultSize', 'number', [ 'number' ]),
      encoderGetResult: (e) => { return new Uint8Array(new Uint8Array(Module.HEAP8.buffer, api._encoderGetResult(e), api._encoderGetResultSize(e))); },
      decodeRGBA: Module.cwrap('decodeRGBA', 'number', [ 'number', 'number' ]),
      decodeFree: Module.cwrap('decodeFree', 'void', [ 'number' ]),
      allocBuffer: Module.cwrap('allocBuffer', 'number', [ 'number' ]),
      destroyBuffer: Module.cwrap('destroyBuffer', '', [ 'number' ])
    };
  }
  initEnc() { if (!this.enc) { this.enc = this.api.encoderCreate(); } }
  destroyEnc() { if (this.enc) { this.api.encoderDestroy(this.enc); this.enc = 0; } }
  encodeImage(data, width, height, { lossless, quality, method, exact } = {}) {
    let { api, Module } = this, p, ret = {}, enc;
    this.initEnc();
    enc = this.enc;
    api.encoderInit(enc);
    if (lossless != undefined) { api.encoderSetLossless(enc, lossless); }
    if (quality != undefined) { api.encoderSetQuality(enc, quality); }
    if (method != undefined) { api.encoderSetMethod(enc, method); }
    if (exact != undefined) { api.encoderSetExact(enc, !!exact); }
    p = api.allocBuffer(data.length);
    Module.HEAP8.set(data, p);
    api.encoderLoadRGBA(enc, p, width, height);
    api.destroyBuffer(p);
    ret.res = api.encoderRun(enc);
    if (ret.res == 0) { ret.buf = api.encoderGetResult(enc); }
    this.destroyEnc();
    return ret;
  }
  decodeImage(data, width, height) {
    let { api, Module } = this, p, ret;
    let np = api.allocBuffer(data.length);
    Module.HEAP8.set(data, np);
    let bp = api.decodeRGBA(np, data.length);
    ret = new Uint8Array(new Uint8Array(Module.HEAP8.buffer, bp, width * height * 4));
    api.decodeFree(bp);
    api.destroyBuffer(np);
    return ret;
  }
};
