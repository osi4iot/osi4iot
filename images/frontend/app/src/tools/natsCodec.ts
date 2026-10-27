// @nats-io/nats-core v3 eliminó los codecs (StringCodec/JSONCodec) de nats.ws.
// Este helper mantiene la misma API (`sc.encode` / `sc.decode`) usando TextEncoder/TextDecoder.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface StringCodecLike {
    encode(d: string): Uint8Array;
    decode(a: Uint8Array): string;
}

export const StringCodec = (): StringCodecLike => ({
    encode: (d: string) => encoder.encode(d),
    decode: (a: Uint8Array) => decoder.decode(a),
});
