import { generateKeyPairSync, privateDecrypt, publicEncrypt } from "crypto";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 1024,
});

const key = publicKey.export({
  format: "pem",
  type: "pkcs1",
});

const enc = publicEncrypt(key, Buffer.from("hello world!"));
console.log(enc);

const dec = privateDecrypt(privateKey, enc);
console.log(dec.toString());
