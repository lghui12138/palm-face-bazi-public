(function (global) {
  "use strict";

  const timeoutMs = 15_000;
  const maxBytes = 32 * 1024 * 1024;
  const maxPixels = 80_000_000;

  function looksSupported(file) {
    if (!file) return false;
    if (String(file.type || "").toLowerCase().startsWith("image/")) return true;
    return /\.(?:jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/i.test(String(file.name || ""));
  }

  function failureLabel(code) {
    return {
      image_decode_runtime_failed: "图片解码组件未加载",
      image_file_unsupported: "不是可识别图片格式",
      image_file_too_large: "文件超过32MB",
      image_decode_timeout: "图片解码超过15秒",
      image_decode_failed: "图片损坏或浏览器不支持",
      image_dimensions_invalid: "图片尺寸无效",
      image_dimensions_too_large: "图片像素超过8000万",
      canvas_draw_failed: "图片画布转换失败"
    }[code] || "图片无法解码";
  }

  function errorCode(error) {
    const code = String(error && error.message || error || "");
    return failureLabel(code) === "图片无法解码" ? "image_decode_failed" : code;
  }

  function decodeBitmap(file) {
    if (typeof global.createImageBitmap !== "function") return Promise.reject(new Error("image_bitmap_unavailable"));
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = global.setTimeout(() => {
        settled = true;
        reject(new Error("image_decode_timeout"));
      }, timeoutMs);
      global.createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => {
        if (settled) {
          if (bitmap && typeof bitmap.close === "function") bitmap.close();
          return;
        }
        settled = true;
        global.clearTimeout(timer);
        resolve({ source: bitmap, width: bitmap.width, height: bitmap.height, decoder: "createImageBitmap" });
      }).catch((error) => {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        reject(error);
      });
    });
  }

  function decodeElement(file) {
    return new Promise((resolve, reject) => {
      if (!global.URL || typeof global.URL.createObjectURL !== "function" || typeof global.Image !== "function") {
        reject(new Error("image_decode_failed"));
        return;
      }
      const objectUrl = global.URL.createObjectURL(file);
      const image = new global.Image();
      let settled = false;
      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        global.URL.revokeObjectURL(objectUrl);
        handler(value);
      };
      const timer = global.setTimeout(() => finish(reject, new Error("image_decode_timeout")), timeoutMs);
      image.decoding = "async";
      image.onload = () => finish(resolve, {
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        decoder: "image_element_object_url"
      });
      image.onerror = () => finish(reject, new Error("image_decode_failed"));
      image.src = objectUrl;
    });
  }

  async function decodeFile(file) {
    if (!looksSupported(file)) throw new Error("image_file_unsupported");
    if (Number(file.size || 0) > maxBytes) throw new Error("image_file_too_large");
    let decoded;
    try {
      decoded = await decodeBitmap(file);
    } catch (error) {
      if (errorCode(error) === "image_decode_timeout") throw error;
      decoded = await decodeElement(file);
    }
    const width = Number(decoded.width || 0);
    const height = Number(decoded.height || 0);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      if (decoded.source && typeof decoded.source.close === "function") decoded.source.close();
      throw new Error("image_dimensions_invalid");
    }
    if (width * height > maxPixels) {
      if (decoded.source && typeof decoded.source.close === "function") decoded.source.close();
      throw new Error("image_dimensions_too_large");
    }
    return decoded;
  }

  async function decodeToCanvas(file, canvas) {
    let decoded;
    try {
      decoded = await decodeFile(file);
      const scale = Math.min(900 / decoded.width, 1100 / decoded.height, 1);
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("canvas_draw_failed");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      return {
        canvas,
        width: canvas.width,
        height: canvas.height,
        imageDecode: {
          version: 1,
          decoder: decoded.decoder,
          mimeType: String(file.type || "unknown").slice(0, 80),
          fileBytes: Math.max(0, Number(file.size || 0)),
          sourceWidth: decoded.width,
          sourceHeight: decoded.height,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          orientationPolicy: "from_image_normalized_to_canvas",
          endpointEncoding: "image/jpeg",
          decodedAt: new Date().toISOString()
        }
      };
    } finally {
      if (decoded && decoded.source && typeof decoded.source.close === "function") decoded.source.close();
    }
  }

  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new global.FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("image_decode_failed"));
      reader.readAsDataURL(file);
    });
  }

  global.PalmFaceImageDecode = Object.freeze({
    version: 1,
    limits: Object.freeze({ timeoutMs, maxBytes, maxPixels, canvasMaxWidth: 900, canvasMaxHeight: 1100 }),
    looksSupported,
    failureLabel,
    errorCode,
    readDataUrl,
    decodeToCanvas
  });
})(globalThis);
