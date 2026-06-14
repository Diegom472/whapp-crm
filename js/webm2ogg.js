// ============================================
//  webm2ogg.js — Remux WebM/Opus → OGG/Opus
//  Sin librerías externas. Extrae los paquetes
//  Opus del contenedor WebM (EBML) y los
//  reempaqueta en un contenedor OGG válido.
//  Esto NO recodifica el audio (es liviano);
//  solo cambia el "envase" para que WhatsApp
//  lo acepte como nota de voz.
// ============================================

(function (global) {
  'use strict';

  // ---------- Parser EBML/WebM mínimo ----------
  function readVint(buf, pos) {
    const first = buf[pos];
    let mask = 0x80, len = 1;
    while (len <= 8 && !(first & mask)) { mask >>= 1; len++; }
    let value = first & (mask - 1);
    for (let i = 1; i < len; i++) value = value * 256 + buf[pos + i];
    return { value, len };
  }
  function readVintId(buf, pos) {
    const first = buf[pos];
    let mask = 0x80, len = 1;
    while (len <= 4 && !(first & mask)) { mask >>= 1; len++; }
    let value = 0;
    for (let i = 0; i < len; i++) value = value * 256 + buf[pos + i];
    return { value, len };
  }

  // Extrae los paquetes Opus (SimpleBlock/Block) de un WebM
  function extraerPaquetesOpus(buf) {
    const paquetes = [];
    let pos = 0;
    const size = buf.length;

    function parse(end) {
      while (pos < end) {
        const id = readVintId(buf, pos);
        pos += id.len;
        const sz = readVint(buf, pos);
        pos += sz.len;
        let contentSize = sz.value;
        const id0 = id.value;

        // Master elements que hay que descender:
        // Segment(0x18538067), Cluster(0x1F43B675), BlockGroup(0xA0)
        if (id0 === 0x18538067 || id0 === 0x1F43B675 || id0 === 0xA0) {
          const childEnd = (contentSize === 0x00FFFFFFFFFFFFFF || pos + contentSize > size)
            ? size : pos + contentSize;
          parse(childEnd);
        }
        // SimpleBlock (0xA3) o Block (0xA1)
        else if (id0 === 0xA3 || id0 === 0xA1) {
          const blockStart = pos;
          const track = readVint(buf, pos);
          let p = pos + track.len;
          p += 2; // timecode (int16)
          const flags = buf[p]; p += 1;
          const lacing = (flags >> 1) & 0x03;
          if (lacing === 0) {
            // Sin lacing: un solo frame
            const frameStart = p;
            const frameEnd = blockStart + contentSize;
            paquetes.push(buf.subarray(frameStart, frameEnd));
          } else {
            // Con lacing: varios frames (poco común en grabación, manejo básico)
            const numFrames = buf[p] + 1; p += 1;
            const sizes = [];
            if (lacing === 2) {
              // fixed lacing
              const total = (blockStart + contentSize) - p;
              const each = Math.floor(total / numFrames);
              for (let i = 0; i < numFrames; i++) sizes.push(each);
            } else {
              // EBML o Xiph: tomar el resto como un bloque (fallback simple)
              sizes.push((blockStart + contentSize) - p);
            }
            let fp = p;
            for (const s of sizes) {
              paquetes.push(buf.subarray(fp, fp + s));
              fp += s;
            }
          }
          pos = blockStart + contentSize;
        }
        else {
          pos += contentSize;
        }
      }
    }

    try { parse(size); } catch (e) { console.warn('Parse WebM parcial:', e); }
    return paquetes;
  }

  // ---------- Escritor OGG ----------
  function crc32Ogg(data) {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 24;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x80000000) ? ((crc << 1) ^ 0x04c11db7) : (crc << 1);
        crc = crc >>> 0;
      }
    }
    return crc >>> 0;
  }

  function buildOggPage(segments, headerType, granule, serial, seq) {
    let totalData = 0;
    const lacing = [];
    for (const seg of segments) {
      let len = seg.length;
      while (len >= 255) { lacing.push(255); len -= 255; }
      lacing.push(len);
      totalData += seg.length;
    }
    const headerLen = 27 + lacing.length;
    const page = new Uint8Array(headerLen + totalData);
    page[0] = 0x4F; page[1] = 0x67; page[2] = 0x67; page[3] = 0x53; // "OggS"
    page[4] = 0; // version
    page[5] = headerType; // 0x02=BOS, 0x04=EOS, 0x00=normal
    // granule position (64-bit LE)
    let g = granule;
    for (let i = 0; i < 8; i++) { page[6 + i] = g & 0xFF; g = Math.floor(g / 256); }
    // serial
    page[14] = serial & 0xFF; page[15] = (serial >> 8) & 0xFF;
    page[16] = (serial >> 16) & 0xFF; page[17] = (serial >> 24) & 0xFF;
    // sequence
    page[18] = seq & 0xFF; page[19] = (seq >> 8) & 0xFF;
    page[20] = (seq >> 16) & 0xFF; page[21] = (seq >> 24) & 0xFF;
    // checksum (se calcula al final) → 22..25 en 0 por ahora
    page[26] = lacing.length;
    for (let i = 0; i < lacing.length; i++) page[27 + i] = lacing[i];
    let off = headerLen;
    for (const seg of segments) { page.set(seg, off); off += seg.length; }
    const crc = crc32Ogg(page);
    page[22] = crc & 0xFF; page[23] = (crc >> 8) & 0xFF;
    page[24] = (crc >> 16) & 0xFF; page[25] = (crc >> 24) & 0xFF;
    return page;
  }

  function strBytes(s) {
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  // OpusHead (cabecera de identificación)
  function opusHead(channels) {
    const h = new Uint8Array(19);
    h.set(strBytes('OpusHead'), 0);
    h[8] = 1;            // version
    h[9] = channels;     // canales
    h[10] = 0x38; h[11] = 0x01; // pre-skip (312)
    // sample rate original 48000 LE
    h[12] = 0x80; h[13] = 0xBB; h[14] = 0x00; h[15] = 0x00;
    h[16] = 0; h[17] = 0; // output gain
    h[18] = 0;            // mapping family
    return h;
  }
  function opusTags() {
    const vendor = strBytes('CRMW');
    const t = new Uint8Array(8 + 4 + vendor.length + 4);
    t.set(strBytes('OpusTags'), 0);
    t[8] = vendor.length & 0xFF; t[9] = 0; t[10] = 0; t[11] = 0;
    t.set(vendor, 12);
    // 0 comentarios
    const o = 12 + vendor.length;
    t[o] = 0; t[o+1] = 0; t[o+2] = 0; t[o+3] = 0;
    return t;
  }

  // ---------- Función principal ----------
  async function webmBlobToOggBlob(blob, channels) {
    channels = channels || 1;
    const arrayBuf = await blob.arrayBuffer();
    const buf = new Uint8Array(arrayBuf);
    const paquetes = extraerPaquetesOpus(buf);
    if (!paquetes.length) throw new Error('No se encontraron paquetes Opus en el WebM');

    const serial = (Math.random() * 0xFFFFFFFF) >>> 0;
    const pages = [];
    let seq = 0;

    // Página BOS con OpusHead
    pages.push(buildOggPage([opusHead(channels)], 0x02, 0, serial, seq++));
    // Página con OpusTags
    pages.push(buildOggPage([opusTags()], 0x00, 0, serial, seq++));

    // Páginas de audio: cada paquete Opus suele ser 20ms = 960 samples a 48kHz
    let granule = 0;
    const SAMPLES_POR_PAQUETE = 960;
    for (let i = 0; i < paquetes.length; i++) {
      granule += SAMPLES_POR_PAQUETE;
      const esUltimo = (i === paquetes.length - 1);
      pages.push(buildOggPage([paquetes[i]], esUltimo ? 0x04 : 0x00, granule, serial, seq++));
    }

    let total = 0;
    for (const p of pages) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of pages) { out.set(p, off); off += p.length; }
    return new Blob([out], { type: 'audio/ogg' });
  }

  global.webmBlobToOggBlob = webmBlobToOggBlob;
})(window);
