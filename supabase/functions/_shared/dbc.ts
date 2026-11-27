// Leitor de .DBC do DATASUS (DBF comprimido com PKWare DCL "implode") + DBF simples.
// Formato .DBC: [cabeçalho DBF (tamanho em bytes 8–9, LE)] [4 bytes CRC] [dados DBF "imploded"].
// O descompressor é um port fiel do blast.c (Mark Adler, zlib/contrib/blast — domínio livre
// de uso, licença zlib). Sem dependências: roda em Deno (edge) e Node (testes).

class Estado {
  bitbuf = 0; bitcnt = 0; pos = 0;
  out: number[] = [];
  constructor(public inp: Uint8Array) {}
  bits(need: number): number {
    let val = this.bitbuf;
    while (this.bitcnt < need) {
      if (this.pos >= this.inp.length) throw new Error("DBC: fim inesperado dos dados");
      val |= this.inp[this.pos++] << this.bitcnt;
      this.bitcnt += 8;
    }
    this.bitbuf = val >>> need;
    this.bitcnt -= need;
    return val & ((1 << need) - 1);
  }
}

interface Huffman { count: Int16Array; symbol: Int16Array }
const MAXBITS = 13;

function decode(s: Estado, h: Huffman): number {
  let code = 0, first = 0, index = 0, len = 1;
  let bitbuf = s.bitbuf, left = s.bitcnt, next = 1;
  for (;;) {
    while (left--) {
      code |= (bitbuf & 1) ^ 1; // bits invertidos (convenção do PKWare)
      bitbuf >>>= 1;
      const count = h.count[next++];
      if (code < first + count) { s.bitbuf = bitbuf; s.bitcnt = (s.bitcnt - len) & 7; return h.symbol[index + (code - first)]; }
      index += count; first += count; first <<= 1; code <<= 1; len++;
    }
    left = (MAXBITS + 1) - len;
    if (left === 0) break;
    if (s.pos >= s.inp.length) throw new Error("DBC: fim inesperado dos dados");
    bitbuf = s.inp[s.pos++];
    if (left > 8) left = 8;
  }
  throw new Error("DBC: código Huffman inválido");
}

function construct(rep: number[]): Huffman {
  const length: number[] = [];
  for (const r of rep) { let len = r & 15; let n = (r >> 4) + 1; while (n--) length.push(len); }
  const n = length.length;
  const count = new Int16Array(MAXBITS + 1), symbol = new Int16Array(n);
  for (const l of length) count[l]++;
  const offs = new Int16Array(MAXBITS + 1);
  for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len] + count[len];
  for (let sym = 0; sym < n; sym++) if (length[sym] !== 0) symbol[offs[length[sym]]++] = sym;
  return { count, symbol };
}

const LITLEN = [11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8, 9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9, 11, 12, 6, 7, 22, 5, 7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12, 8, 12, 5, 38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27, 44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45, 44, 173];
const LENLEN = [2, 35, 36, 53, 38, 23];
const DISTLEN = [2, 20, 53, 230, 247, 151, 248];
const BASE = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264];
const EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];
let tabelas: { litcode: Huffman; lencode: Huffman; distcode: Huffman } | null = null;

export function blast(inp: Uint8Array): Uint8Array {
  tabelas ??= { litcode: construct(LITLEN), lencode: construct(LENLEN), distcode: construct(DISTLEN) };
  const { litcode, lencode, distcode } = tabelas;
  const s = new Estado(inp);
  const lit = s.bits(8);
  if (lit > 1) throw new Error("DBC: cabeçalho de compressão inválido");
  const dict = s.bits(8);
  if (dict < 4 || dict > 6) throw new Error("DBC: tamanho de dicionário inválido");
  const out = s.out;
  for (;;) {
    if (s.bits(1)) {
      let symbol = decode(s, lencode);
      const len = BASE[symbol] + s.bits(EXTRA[symbol]);
      if (len === 519) break; // fim
      symbol = len === 2 ? 2 : dict;
      let dist = decode(s, distcode) << symbol;
      dist += s.bits(symbol);
      dist++;
      if (dist > out.length) throw new Error("DBC: distância inválida");
      const start = out.length - dist;
      for (let i = 0; i < len; i++) out.push(out[start + i]);
    } else {
      out.push(lit ? decode(s, litcode) : s.bits(8));
    }
  }
  return Uint8Array.from(out);
}

// .DBC → bytes do .DBF
export function dbcParaDbf(dbc: Uint8Array): Uint8Array {
  const hdr = dbc[8] | (dbc[9] << 8);
  const corpo = blast(dbc.subarray(hdr + 4));
  const dbf = new Uint8Array(hdr + corpo.length);
  dbf.set(dbc.subarray(0, hdr), 0);
  dbf.set(corpo, hdr);
  return dbf;
}

// Lê um DBF (dBase III): devolve registros como objetos {CAMPO: texto aparado}. Ignora excluídos.
export function lerDbf(dbf: Uint8Array, campos?: string[]): Record<string, string>[] {
  const dv = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength);
  const n = dv.getUint32(4, true), hdr = dv.getUint16(8, true), tam = dv.getUint16(10, true);
  const defs: { nome: string; off: number; len: number }[] = [];
  let off = 1;
  for (let p = 32; p + 32 <= hdr && dbf[p] !== 0x0d; p += 32) {
    let nome = "";
    for (let i = 0; i < 11 && dbf[p + i]; i++) nome += String.fromCharCode(dbf[p + i]);
    const len = dbf[p + 16];
    defs.push({ nome, off, len });
    off += len;
  }
  const usar = campos ? defs.filter((d) => campos.includes(d.nome)) : defs;
  const out: Record<string, string>[] = [];
  for (let r = 0; r < n; r++) {
    const base = hdr + r * tam;
    if (base + tam > dbf.length) break;
    if (dbf[base] === 0x2a) continue; // '*' = excluído
    const reg: Record<string, string> = {};
    for (const d of usar) {
      let t = "";
      for (let i = 0; i < d.len; i++) t += String.fromCharCode(dbf[base + d.off + i]);
      reg[d.nome] = t.trim();
    }
    out.push(reg);
  }
  return out;
}
