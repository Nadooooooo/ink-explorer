import { getAddress, ParamType } from "ethers";

export function parseArgument(param: ParamType, raw: unknown): unknown {
  if (param.baseType === "array") {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      !Array.isArray(value) ||
      (param.arrayLength !== -1 && value.length !== param.arrayLength)
    )
      throw new Error(`Expected ${param.type} as a JSON array`);
    return value.map((item) => parseArgument(param.arrayChildren!, item));
  }
  if (param.baseType === "tuple") {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(value) || value.length !== param.components!.length)
      throw new Error("Expected a JSON array with one entry per tuple field");
    return param.components!.map((field, index) =>
      parseArgument(field, value[index]),
    );
  }
  const value = String(raw ?? "");
  if (param.type === "bool") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error("Boolean must be true or false");
  }
  if (/^u?int\d*$/.test(param.type)) {
    if (typeof raw === "number" && !Number.isSafeInteger(raw))
      throw new Error("Large integers in JSON must be quoted strings");
    if (!/^-?\d+$/.test(value.trim()))
      throw new Error("Expected a whole number in base units");
    const integer = BigInt(value.trim());
    const signed = param.type.startsWith("int"),
      bits = BigInt(Number(param.type.replace(/\D/g, "")) || 256);
    if (
      integer < (signed ? -(1n << (bits - 1n)) : 0n) ||
      integer >= 1n << (signed ? bits - 1n : bits)
    )
      throw new Error(`Value is outside ${param.type}`);
    return integer;
  }
  if (param.type === "address") return getAddress(value.trim());
  if (/^bytes\d*$/.test(param.type)) {
    if (!/^0x(?:[a-f\d]{2})*$/i.test(value))
      throw new Error("Bytes must be even-length hexadecimal starting with 0x");
    const length = Number(param.type.slice(5));
    if (length && value.length !== 2 + length * 2)
      throw new Error(`Expected ${length} bytes`);
    return value;
  }
  if (param.type === "string") return value;
  throw new Error(`Unsupported input type: ${param.type}`);
}

export const exactJson = (value: unknown) =>
  JSON.stringify(
    value,
    (_, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
