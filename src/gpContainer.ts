// Check archive budgets before handing the original bytes to alphaTab. Nothing is extracted to disk.
export async function checkGpContainer(bytes: Uint8Array): Promise<void> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const budget = 32 * 1024 * 1024;
  if (bytes.length >= 8 && String.fromCharCode(...bytes.subarray(0, 4)) === 'BCFZ') {
    if (view.getUint32(4, true) > budget) throw new Error('GPX 解压内容不能超过 32 MB');
    return;
  }
  if (bytes.length < 4 || view.getUint32(0, true) !== 0x04034b50) return;
  let endRecord = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      endRecord = i;
      break;
    }
  }
  if (endRecord < 0) throw new Error('GP ZIP 文件目录损坏');
  const entries = view.getUint16(endRecord + 10, true);
  const directorySize = view.getUint32(endRecord + 12, true);
  let offset = view.getUint32(endRecord + 16, true);
  const directoryEnd = offset + directorySize;
  if (
    !entries ||
    entries > 512 ||
    directoryEnd > endRecord ||
    view.getUint16(endRecord + 4, true) !== 0 ||
    view.getUint16(endRecord + 6, true) !== 0
  )
    throw new Error('GP ZIP 文件结构或资源数量不受支持');
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error('GP ZIP 文件目录无效');
    const method = view.getUint16(offset + 10, true);
    const packed = view.getUint32(offset + 20, true);
    const expanded = view.getUint32(offset + 24, true);
    const local = view.getUint32(offset + 42, true);
    if (
      view.getUint16(offset + 8, true) & 1 ||
      ![0, 8].includes(method) ||
      local + 30 > bytes.length ||
      view.getUint32(local, true) !== 0x04034b50
    )
      throw new Error('加密或特殊压缩 GP 文件暂不支持');
    total += expanded;
    if (total > budget) throw new Error('GP 解压内容不能超过 32 MB');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + packed > bytes.length) throw new Error('GP ZIP 文件数据不完整');
    if (method === 0) {
      if (expanded !== packed) throw new Error('GP ZIP 文件大小信息无效');
    } else {
      if (typeof DecompressionStream === 'undefined')
        throw new Error('请更新浏览器后导入 GP 文件（需要安全解压能力）');
      const reader = new Blob([bytes.slice(start, start + packed).buffer])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
        .getReader();
      let actual = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          actual += chunk.value.length;
          if (actual > expanded || actual > budget) throw new Error('GP 实际解压大小超出限制');
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      if (actual !== expanded) throw new Error('GP ZIP 文件大小校验失败');
    }
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
  if (offset !== directoryEnd) throw new Error('GP ZIP 文件目录长度无效');
}
