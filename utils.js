import axios from "axios";
import { privateDecrypt } from "crypto";
import { createWriteStream, mkdir, access, readdir, writeFile } from "fs";
import readline from "readline";

export const log = console.log;

export const EVENTS = {
  JOIN: "join",
  JOINED: "joined",
  SET_GRAND_SUCCESSOR: "set-grand-successor",
  UPDATE_PREDECESSOR: "update-predecessor",
  UPDATE_SUCCESSOR: "update-successor",
  UPDATE_GRAND_SUCCESSOR: "update-grand-successor",
  UPDATE_LARGEST: "update-largest",
  PING_TABLE: "ping-table",
  UPDATE_TABLE: "update-table",
  ALIVE_CHECK: "alive-check",
  ALIVE_ACK: "alive-acknowledge",
  DOWNLOAD: "download",
  UPLOAD: "upload",
  GET_FILE: "get-file",
  GET_DHT: "get-dht",
  FILE_NOT_PRESENT: "file-not-present",
};

const QUERY = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export function question(Q) {
  return new Promise((r) => {
    QUERY.question(Q, (answer) => {
      r(answer);
    });
  });
}

export function get_files(path) {
  return new Promise((res, rej) => {
    const dirFiles = [];
    readdir(path, (err, files) => {
      if (err) res(dirFiles);
      else {
        files.forEach((file) => {
          dirFiles.push(file);
        });
        res(dirFiles);
      }
    });
  });
}

export function create_dir(path) {
  return new Promise((res, rej) => {
    access(path, (error) => {
      // To check if the given directory
      // already exists or not
      if (error) {
        // If current directory does not exist
        // then create it
        mkdir(path, (error) => {
          if (error) {
            rej(error);
          } else {
            res(path);
          }
        });
      } else {
        res(path);
      }
    });
  });
}

export function download_file(url, filename, path, keys) {
  const pubKey = keys.publicKey.export({
    format: "pem",
    type: "pkcs1",
  });

  const prvKey = keys.privateKey.export({
    format: "pem",
    type: "pkcs1",
  });

  axios({
    method: "GET",
    url: url,
    responseType: "stream",
    data: {
      fileName: filename,
      publicKey: pubKey,
    },
  })
    .then(function (response) {
      // CREATE NEW DIRECTORY IF NOT PRESENT
      create_dir(path).then((path) => {
        let data = "";
        // DECRYPT THE INCOMING DATA
        response.data.on("data", (chunk) => {
          const dec = privateDecrypt(prvKey, chunk);
          data += dec;
        });

        // WRITE THIS NEW FILE TO DIRECTORY
        response.data.on("end", () => {
          writeFile(`${path}/${filename}`, data, (err) => {
            if (err) console.log(err);
          });
        });
      });
    })
    .catch((err) => {
      console.log(err);
    });
}
