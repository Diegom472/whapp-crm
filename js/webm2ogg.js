// ============================================
//  webm2ogg.js — Remux WebM/Opus → OGG/Opus
//  Extrae los paquetes Opus del contenedor WebM
//  (EBML) y los reempaqueta en OGG válido para
//  que WhatsApp lo reconozca como NOTA DE VOZ.
//  No recodifica (liviano): solo cambia el envase.
// ============================================

(function (global) {
  'use strict';

  function readVintSize(buf, pos) {
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

  // Cuántos samples (a 48kHz) representa un paquete Opus, leyendo su TOC byte
  function opusSamplesPorPaquete(pkt) {
    if (!pkt || pkt.length === 0) return 960;
    const toc = pkt[0];
    const config = toc >> 3;
    let frameMs;
    if (config < 12) { const mods = [10,20,40,60]; frameMs = mods[config % 4]; }
    else if (config < 16) { frameMs = (config % 2 === 0) ? 10 : 20; }
    else { const mods = [2.5,5,10,20]; frameMs = mods[config % 4]; }
    const c = toc & 0x03;
    let frames = 1;
    if (c === 1 || c === 2) frames = 2;
    else if (c === 3 && pkt.length > 1) frames = pkt[1] & 0x3F;
    return Math.round(48 * frameMs * frames);
  }

  function extraerPaquetesOpus(buf) {
    const paquetes = [];
    let pos = 0;
    const size = buf.length;

    function parse(end) {
      while (pos < end) {
        if (pos >= size) break;
        const id = readVintId(buf, pos);
        pos += id.len;
        const sz = readVintSize(buf, pos);
        pos += sz.len;
        let contentSize = sz.value;
        const id0 = id.value;

        if (id0 === 0x18538067 || id0 === 0x1F43B675 || id0 === 0xA0) {
          const unknownSize = (contentSize >= 0x00FFFFFFFFFFFFF0);
          const childEnd = (unknownSize || pos + contentSize > size) ? size : pos + contentSize;
          parse(childEnd);
        }
        else if (id0 === 0xA3 || id0 === 0xA1) {
          const blockStart = pos;
          const track = readVintSize(buf, pos);
          let p = pos + track.len;
          p += 2;
          const flags = buf[p]; p += 1;
          const lacing = (flags >> 1) & 0x03;
          const blockEnd = blockStart + contentSize;

          if (lacing === 0) {
            paquetes.push(buf.subarray(p, blockEnd));
          } else {
            const numFrames = buf[p] + 1; p += 1;
            const sizes = [];
            if (lacing === 2) {
              const total = blockEnd - p;
              const each = Math.floor(total / numFrames);
              for (let i = 0; i < numFrames; i++) sizes.push(each);
            } else if (lacing === 1) {
              for (let i = 0; i < numFrames - 1; i++) {
                let s = 0;
                while (buf[p] === 255) { s += 255; p++; }
                s += buf[p]; p++;
                sizes.push(s);
              }
              const used = sizes.reduce((a,b)=>a+b,0);
              sizes.push((blockEnd - p) - used);
            } else {
              const first = readVintSize(buf, p); p += first.len;
              sizes.push(first.value);
              let prev = first.value;
              for (let i = 1; i < numFrames - 1; i++) {
                const d = readVintSize(buf, p); p += d.len;
                const half = (1 << (7 * d.len - 1)) - 1;
                prev = prev + (d.value - half);
                sizes.push(prev);
              }
              const used = sizes.reduce((a,b)=>a+b,0);
              sizes.push((blockEnd - p) - used);
            }
            let fp = p;
            for (const s of sizes) { paquetes.push(buf.subarray(fp, fp + s)); fp += s; }
          }
          pos = blockEnd;
        }
        else {
          pos += contentSize;
        }
      }
    }

    try { parse(size); } catch (e) { console.warn('Parse WebM parcial:', e); }
    return paquetes;
  }

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

  function buildOggPage(packets, headerType, granule, serial, seq) {
    const lacing = [];
    let totalData = 0;
    for (const pkt of packets) {
      let len = pkt.length;
      while (len >= 255) { lacing.push(255); len -= 255; }
      lacing.push(len);
      totalData += pkt.length;
    }
    const headerLen = 27 + lacing.length;
    const page = new Uint8Array(headerLen + totalData);
    page[0]=0x4F; page[1]=0x67; page[2]=0x67; page[3]=0x53;
    page[4]=0;
    page[5]=headerType;
    let g = granule;
    for (let i = 0; i < 8; i++) { page[6+i] = g & 0xFF; g = Math.floor(g/256); }
    page[14]=serial&0xFF; page[15]=(serial>>8)&0xFF; page[16]=(serial>>16)&0xFF; page[17]=(serial>>24)&0xFF;
    page[18]=seq&0xFF; page[19]=(seq>>8)&0xFF; page[20]=(seq>>16)&0xFF; page[21]=(seq>>24)&0xFF;
    page[26]=lacing.length;
    for (let i = 0; i < lacing.length; i++) page[27+i] = lacing[i];
    let off = headerLen;
    for (const pkt of packets) { page.set(pkt, off); off += pkt.length; }
    const crc = crc32Ogg(page);
    page[22]=crc&0xFF; page[23]=(crc>>8)&0xFF; page[24]=(crc>>16)&0xFF; page[25]=(crc>>24)&0xFF;
    return page;
  }

  function strBytes(s) {
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  const PRE_SKIP = 3840;

  function opusHead(channels) {
    const h = new Uint8Array(19);
    h.set(strBytes('OpusHead'), 0);
    h[8]=1;
    h[9]=channels;
    h[10]=PRE_SKIP & 0xFF; h[11]=(PRE_SKIP>>8)&0xFF;
    h[12]=0x80; h[13]=0xBB; h[14]=0x00; h[15]=0x00;
    h[16]=0; h[17]=0;
    h[18]=0;
    return h;
  }
  function opusTags() {
    const vendor = strBytes('CRMW');
    const t = new Uint8Array(8 + 4 + vendor.length + 4);
    t.set(strBytes('OpusTags'), 0);
    t[8]=vendor.length&0xFF; t[9]=0; t[10]=0; t[11]=0;
    t.set(vendor, 12);
    const o = 12 + vendor.length;
    t[o]=0; t[o+1]=0; t[o+2]=0; t[o+3]=0;
    return t;
  }

  async function webmBlobToOggBlob(blob, channels) {
    channels = channels || 1;
    const buf = new Uint8Array(await blob.arrayBuffer());
    const paquetes = extraerPaquetesOpus(buf);
    if (!paquetes.length) throw new Error('No se encontraron paquetes Opus en el WebM');

    const serial = (Math.random() * 0xFFFFFFFF) >>> 0;
    const pages = [];
    let seq = 0;

    pages.push(buildOggPage([opusHead(channels)], 0x02, 0, serial, seq++));
    pages.push(buildOggPage([opusTags()], 0x00, 0, serial, seq++));

    let granule = 0;
    const PAQUETES_POR_PAGINA = 50;
    for (let i = 0; i < paquetes.length; i += PAQUETES_POR_PAGINA) {
      const grupo = paquetes.slice(i, i + PAQUETES_POR_PAGINA);
      for (const pkt of grupo) granule += opusSamplesPorPaquete(pkt);
      const esUltima = (i + PAQUETES_POR_PAGINA >= paquetes.length);
      pages.push(buildOggPage(grupo, esUltima ? 0x04 : 0x00, granule, serial, seq++));
    }

    let total = 0;
    for (const p of pages) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of pages) { out.set(p, off); off += p.length; }
    return new Blob([out], { type: 'audio/ogg' });
  }

  // Extrae los paquetes Opus de un OGG/Opus (saltea OpusHead y OpusTags)
  function extraerPaquetesOgg(buf) {
    const paquetes = [];
    let pos = 0;
    let pagina = 0;
    while (pos < buf.length - 27) {
      if (!(buf[pos]===0x4f && buf[pos+1]===0x67 && buf[pos+2]===0x67 && buf[pos+3]===0x53)) {
        pos++; continue;
      }
      const nsegs = buf[pos+26];
      const segTable = [];
      for (let i = 0; i < nsegs; i++) segTable.push(buf[pos+27+i]);
      let dataPos = pos + 27 + nsegs;
      // Reconstruir paquetes según la tabla de segmentos (lacing)
      let pktLen = 0;
      for (let i = 0; i < nsegs; i++) {
        pktLen += segTable[i];
        if (segTable[i] < 255) {
          // fin de paquete
          if (pagina >= 2 && pktLen > 0) {  // saltear páginas 0 (OpusHead) y 1 (OpusTags)
            paquetes.push(buf.subarray(dataPos, dataPos + pktLen));
          }
          dataPos += pktLen;
          pktLen = 0;
        }
      }
      if (pktLen > 0 && pagina >= 2) {
        paquetes.push(buf.subarray(dataPos, dataPos + pktLen));
        dataPos += pktLen;
      }
      pos = dataPos;
      pagina++;
    }
    return paquetes;
  }

  // Une varios blobs OGG/Opus (mismo formato) en uno solo, sin recodificar
  async function concatenarOggBlobs(blobs, channels) {
    channels = channels || 1;
    let todosPaquetes = [];
    for (const blob of blobs) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      const pkts = extraerPaquetesOgg(buf);
      todosPaquetes = todosPaquetes.concat(pkts);
    }
    if (!todosPaquetes.length) throw new Error('No se encontraron paquetes Opus');

    const serial = (Math.random() * 0xFFFFFFFF) >>> 0;
    const pages = [];
    let seq = 0;
    pages.push(buildOggPage([opusHead(channels)], 0x02, 0, serial, seq++));
    pages.push(buildOggPage([opusTags()], 0x00, 0, serial, seq++));

    let granule = 0;
    const PAQUETES_POR_PAGINA = 50;
    for (let i = 0; i < todosPaquetes.length; i += PAQUETES_POR_PAGINA) {
      const grupo = todosPaquetes.slice(i, i + PAQUETES_POR_PAGINA);
      for (const pkt of grupo) granule += opusSamplesPorPaquete(pkt);
      const esUltima = (i + PAQUETES_POR_PAGINA >= todosPaquetes.length);
      pages.push(buildOggPage(grupo, esUltima ? 0x04 : 0x00, granule, serial, seq++));
    }

    let total = 0;
    for (const p of pages) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of pages) { out.set(p, off); off += p.length; }
    return new Blob([out], { type: 'audio/ogg' });
  }

  global.webmBlobToOggBlob = webmBlobToOggBlob;
  global.concatenarOggBlobs = concatenarOggBlobs;
})(window);
