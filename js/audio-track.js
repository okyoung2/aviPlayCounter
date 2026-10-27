// 안드로이드 크롬은 영상 트랙이 들어 있는 파일을 화면이 꺼지면 멈춘다(<audio> 로 재생해도 마찬가지).
// MP4/MOV 목차(moov)에서 영상 트랙(trak, 핸들러 'vide')의 상자 이름을 'free' 로 바꿔
// 소리만 있는 파일처럼 보이게 한다. 상자 크기와 위치는 그대로라 다른 값은 고칠 필요가 없고,
// 다시 인코딩하지 않으므로 빠르고 메모리도 거의 쓰지 않는다.
const MAX_MOOV_BYTES = 64 * 1024 * 1024;

const fourcc = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

async function readBytes(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

// bytes 의 [start, end) 구간에 있는 상자들. 깨진 크기를 만나면 멈춘다.
function* boxes(bytes, start, end) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = start;
  while (pos + 8 <= end) {
    let size = view.getUint32(pos);
    const type = fourcc(bytes, pos + 4);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) return;
      size = Number(view.getBigUint64(pos + 8));
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header || pos + size > end) return;
    yield { type, pos, header, size };
    pos += size;
  }
}

function child(bytes, box, type) {
  for (const b of boxes(bytes, box.pos + box.header, box.pos + box.size)) if (b.type === type) return b;
  return null;
}

// trak 의 핸들러 종류('vide', 'soun' 등). hdlr 내용: version/flags(4) pre_defined(4) handler_type(4)
function handlerOf(bytes, trak) {
  const mdia = child(bytes, trak, 'mdia');
  const hdlr = mdia && child(bytes, mdia, 'hdlr');
  if (!hdlr || hdlr.header + 12 > hdlr.size) return null;
  return fourcc(bytes, hdlr.pos + hdlr.header + 8);
}

// 최상위 상자를 머리만 읽으며 moov 를 찾는다.
async function findMoov(blob) {
  let pos = 0;
  while (pos + 8 <= blob.size) {
    const h = await readBytes(blob, pos, Math.min(pos + 16, blob.size));
    const view = new DataView(h.buffer);
    let size = view.getUint32(0);
    const type = fourcc(h, 4);
    if (pos === 0 && type !== 'ftyp') return null;
    if (size === 1) {
      if (h.length < 16) return null;
      size = Number(view.getBigUint64(8));
    } else if (size === 0) {
      size = blob.size - pos;
    }
    if (size < 8) return null;
    if (type === 'moov') return { pos, size };
    pos += size;
  }
  return null;
}

// 영상 트랙을 뺀 소리 전용 Blob. 해당 없거나(영상 없음, MP4 아님, 조각난 MP4) 못 하면 null.
export async function stripVideoTracks(blob) {
  try {
    const moov = await findMoov(blob);
    if (!moov || moov.size > MAX_MOOV_BYTES || moov.pos + moov.size > blob.size) return null;
    const bytes = await readBytes(blob, moov.pos, moov.pos + moov.size);
    const [root] = boxes(bytes, 0, bytes.length);
    if (!root) return null;

    const patches = [];
    let hasAudio = false;
    for (const box of boxes(bytes, root.header, root.size)) {
      if (box.type === 'mvex') return null; // 조각난 MP4: 조각 쪽에도 영상 정보가 있어 이 방법을 못 쓴다.
      if (box.type !== 'trak') continue;
      const handler = handlerOf(bytes, box);
      if (handler === 'vide') patches.push(moov.pos + box.pos + 4);
      else if (handler === 'soun') hasAudio = true;
    }
    if (!patches.length || !hasAudio) return null;

    const parts = [];
    let last = 0;
    for (const p of patches) {
      parts.push(blob.slice(last, p), 'free');
      last = p + 4;
    }
    parts.push(blob.slice(last));
    return new Blob(parts, { type: 'audio/mp4' });
  } catch {
    return null;
  }
}
