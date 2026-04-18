import { WhoopPacket, SOF, MAX_FRAME_LENGTH, MAX_BUFFER_SIZE } from './packet-types';
import { base64ToUint8Array, decodeFrame } from './packet-codec';

export class PacketAssembler {
  private buffer = new Uint8Array(MAX_BUFFER_SIZE);
  private writeOffset = 0;

  feed(base64Chunk: string): WhoopPacket[] {
    const chunk = base64ToUint8Array(base64Chunk);
    if (this.writeOffset + chunk.length > MAX_BUFFER_SIZE) {
      this.reset();
      return [];
    }
    this.buffer.set(chunk, this.writeOffset);
    this.writeOffset += chunk.length;

    const packets: WhoopPacket[] = [];
    let readOffset = 0;

    while (readOffset < this.writeOffset) {
      // Find SOF
      if (this.buffer[readOffset] !== SOF) {
        readOffset++;
        continue;
      }

      // Need at least 4 bytes for header (SOF + length(2) + headerCRC)
      if (this.writeOffset - readOffset < 4) break;

      // Read length (LE uint16)
      const length = this.buffer[readOffset + 1] | (this.buffer[readOffset + 2] << 8);

      // Sanity check
      if (length > MAX_FRAME_LENGTH || length < 4) {
        readOffset++;
        continue;
      }

      // Total frame size = 4 (header) + length (payload + CRC32)
      const frameSize = 4 + length;
      if (this.writeOffset - readOffset < frameSize) break; // incomplete frame, wait for more data

      // Extract and decode
      const frame = this.buffer.slice(readOffset, readOffset + frameSize);
      const packet = decodeFrame(frame);
      if (packet) {
        packets.push(packet);
      }
      readOffset += frameSize;
    }

    // Shift remaining data to front of buffer
    if (readOffset > 0) {
      const remaining = this.writeOffset - readOffset;
      if (remaining > 0) {
        this.buffer.copyWithin(0, readOffset, this.writeOffset);
      }
      this.writeOffset = remaining;
    }

    return packets;
  }

  reset(): void {
    this.writeOffset = 0;
  }
}
