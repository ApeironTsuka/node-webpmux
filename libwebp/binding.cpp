#include <stdlib.h>
#include <stdio.h>
#include "emscripten.h"
#include "libwebp/src/webp/encode.h"
#include "libwebp/src/webp/decode.h"

class WebPEnc {
  public:
    WebPEnc() { this->ready = false; this->picAlloc = false; }
    ~WebPEnc() { this->reset(); }
    bool init() {
      if (this->ready) { return false; }
      WebPPictureInit(&(this->pic));
      WebPMemoryWriterInit(&(this->writer));
      this->pic.writer = WebPMemoryWrite;
      this->pic.custom_ptr = &(this->writer);
      WebPConfigInit(&(this->config));
      this->ready = true;
      return true;
    }
    void reset() {
      if (!this->ready) { return; }
      if (this->picAlloc) { WebPPictureFree(&(this->pic)); }
      WebPMemoryWriterClear(&(this->writer));
      this->ready = false;
      this->picAlloc = false;
    }
    bool loadRGBA(const uint8_t *input, int width, int height) {
      if (!this->ready) { return false; }
      this->pic.width = width;
      this->pic.height = height;
      WebPPictureImportRGBA(&(this->pic), input, width * 4);
      this->picAlloc = true;
      return true;
    }
    bool setLossless(int en) {
      if (!this->ready) { return false; }
      if (en > 0) { WebPConfigLosslessPreset(&(this->config), en); this->pic.use_argb = 1; }
      else { WebPConfigInit(&(this->config)); this->pic.use_argb = 0; }
      return true;
    }
    bool setQuality(float q) { if (!this->ready) { return false; } this->config.quality = q; return true; }
    bool setMethod(int m) { if (!this->ready) { return false; } this->config.method = m; return true; }
    bool setExact(bool ex) { if (!this->ready) { return false; } this->config.exact = ex ? 1 : 0; return true; }
    int encode() {
      if (!this->ready) { return -1; }
      if (!WebPValidateConfig(&(this->config))) { return -2; }
      if (!WebPEncode(&(this->config), &(this->pic))) { return this->pic.error_code; }
      return 0;
    }
    uint8_t *getResult() { return this->writer.mem; }
    size_t getResultSize() { return this->writer.size; }
  private:
    bool ready;
    bool picAlloc;
    WebPConfig config;
    WebPPicture pic;
    WebPMemoryWriter writer;
};
extern "C" {
// Encoder hooks
EMSCRIPTEN_KEEPALIVE WebPEnc *encoderCreate() { return new WebPEnc(); }
EMSCRIPTEN_KEEPALIVE void encoderDestroy(WebPEnc *p) { delete p; }
EMSCRIPTEN_KEEPALIVE bool encoderInit(WebPEnc *enc) { return enc->init(); }
EMSCRIPTEN_KEEPALIVE void encoderReset(WebPEnc *enc) { enc->reset(); }
EMSCRIPTEN_KEEPALIVE bool encoderLoadRGBA(WebPEnc *enc, const uint8_t *input, int width, int height) { return enc->loadRGBA(input, width, height); }
EMSCRIPTEN_KEEPALIVE bool encoderSetLossless(WebPEnc *enc, int en) { return enc->setLossless(en); }
EMSCRIPTEN_KEEPALIVE bool encoderSetQuality(WebPEnc *enc, float q) { return enc->setQuality(q); }
EMSCRIPTEN_KEEPALIVE bool encoderSetMethod(WebPEnc *enc, int m) { return enc->setMethod(m); }
EMSCRIPTEN_KEEPALIVE bool encoderSetExact(WebPEnc *enc, bool ex) { return enc->setExact(ex); }
EMSCRIPTEN_KEEPALIVE int encoderRun(WebPEnc *enc) { return enc->encode(); }
EMSCRIPTEN_KEEPALIVE uint8_t *encoderGetResult(WebPEnc *enc) { return enc->getResult(); }
EMSCRIPTEN_KEEPALIVE size_t encoderGetResultSize(WebPEnc *enc) { return enc->getResultSize(); }
// Decoder hooks
EMSCRIPTEN_KEEPALIVE uint8_t *decodeRGBA(const uint8_t *data, size_t dataSize) { return WebPDecodeRGBA(data, dataSize, 0, 0); }
EMSCRIPTEN_KEEPALIVE void decodeFree(uint8_t *data) { WebPFree(data); }
// Utility
EMSCRIPTEN_KEEPALIVE uint8_t *allocBuffer(size_t size) { return (uint8_t*)malloc(size * sizeof(uint8_t)); }
EMSCRIPTEN_KEEPALIVE void destroyBuffer(uint8_t *p) { free(p); }
}
