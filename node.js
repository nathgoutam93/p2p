import express from "express";
import { createServer } from "http";
import { io } from "socket.io-client";
import { Server } from "socket.io";
import { createHash } from "crypto";
import { createWriteStream, mkdir, access } from "fs";
import readline from "readline";
import chalk from "chalk";
import axios from "axios";

const app = express();
const httpServer = createServer(app);

app.use(express.json());

app.get("/", (req, res) => {
  res.json(req.body);
});

app.get("/file", (req, res) => {
  if (req.body && "fileName" in req.body) {
    res.download("./" + req.body.fileName, (err) => {
      // if (err) {
      //   console.log(err);
      // } else {
      //   console.log(req.body.fileName + " BEING SENT...");
      // }
    });
  } else {
    res.json("send a valid file name");
  }
});

const log = console.log;

const EVENTS = {
  JOIN: "join",
  JOINED: "joined",
  SET_GRAND_SUCCESSOR: "set-grand-successor",
  UPDATE_PREDECESSOR: "update-predecessor",
  UPDATE_SUCCESSOR: "update-successor",
  UPDATE_GRAND_SUCCESSOR: "update-grand-successor",
  UPDATE_LARGEST: "update-largest",
  PING_TABLE: "ping-table",
  UPDATE_TABLE: "update-table",
  // ALIVE_CHECK: "alive-check",
  // ALIVE_ACK: "alive-acknowledge",
  DOWNLOAD: "download",
  UPLOAD: "upload",
  GET_FILE: "get-file",
  FILE_NOT_PRESENT: "file-not-present",
};

const QUERY = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(Q) {
  return new Promise((r) => {
    QUERY.question(Q, (answer) => {
      r(answer);
    });
  });
}

function create_dir(path) {
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

function download_file(url, filename, path) {
  axios({
    method: "GET",
    url: url,
    responseType: "stream",
    data: {
      fileName: filename,
    },
  })
    .then(function (response) {
      // CREATE NEW DIRECTORY IF NOT PRESENT
      create_dir(path).then((path) => {
        // WRITE THIS NEW FILE TO DIRECTORY
        response.data.pipe(createWriteStream(`${path}/${filename}`));
      });
    })
    .catch((err) => {
      console.log(err);
    });
}

class Address {
  constructor(port = 5000) {
    this.ip = "127.0.0.1";
    this.port = port;
    this.id = this.generate_id();
    this.address = this.get_address();
  }

  get_address() {
    return `${this.ip}:${this.port}`;
  }

  generate_id() {
    return createHash("sha256").update(this.get_address()).digest("hex");
  }
}

class Node {
  constructor(local_address, remote_address = null) {
    this.self_ = {
      id: local_address.id,
      address: local_address.address,
    };

    this.predecessor_ = this.self_;
    this.successor_ = this.self_;
    this.grandsuccessor_ = this.self_;
    this.predSocket_ =
      this.sucSocket_ =
      this.gSucSocket_ =
        io(`ws://${this.self_.address}`);

    this.largest_ = false;
    this.finger_ = {};
    this.pingcount_ = 5;

    this.lastRejected_ = "";

    this.start_listening();
    this.join(remote_address);
    this.start();
  }

  start() {
    this.print_neighbours();
    this.take_command();
    // this.pingInterval = setInterval(this.ping.bind(this), 500);
    this.updateTableInterval = setInterval(this.update_table.bind(this), 3000);
  }

  print_neighbours() {
    log(
      chalk.bgMagenta.yellow("Self ->"),
      chalk.bgYellow.black(this.self_.address)
    );
    log(
      chalk.bgMagenta.yellow("Pre ->"),
      chalk.bgYellow.black(this.predecessor_.address)
    );
    log(
      chalk.bgMagenta.yellow("Suc ->"),
      chalk.bgYellow.black(this.successor_.address)
    );
    log(
      chalk.bgMagenta.yellow("GSuc ->"),
      chalk.bgYellow.black(this.grandsuccessor_.address)
    );
    log(
      chalk.bgMagenta.yellow("Largest? ->"),
      chalk.bgYellow.black(this.largest_)
    );
  }

  print_table() {
    console.table(this.finger_);
  }

  update_table() {
    this.sucSocket_.emit(EVENTS.PING_TABLE, {
      index: 1,
      peer: this.self_,
    });
  }

  // ping() {
  //   // IF SUCCESSOR AND GRAND_SUCCESSOR IS SAME, WE WON'T PING
  //   if (this.successor_.id === this.grandsuccessor_.id) {
  //     return;
  //   }

  //   // IF MY SUCCESSOR HAS LEFT
  //   if (this.pingcount_ == 0) {
  //     this.pingcount_ = 5;
  //     // UPDATE MY PREDECESSOR'S GRAND_SUCCESSOR WITH MY GRAND SUCCESSOR
  //     this.predSocket_.emit(
  //       EVENTS.UPDATE_GRAND_SUCCESSOR,
  //       this.grandsuccessor_
  //     );
  //     // MAKE MY GRAND_SUCCESSOR, MY NEW SUCCESSOR
  //     this.successor_ = this.grandsuccessor_;
  //     this.sucSocket_ = this.gSucSocket_;
  //     // MAKE MYSELF, THE PREDECESSOR OF MY NEW SUCCESSOR
  //     this.sucSocket_.emit(EVENTS.UPDATE_PREDECESSOR, this.self_);
  //     // MAKE THIS SUCCESSOR'S SUCCESSOR, MY GRAND SUCCESSOR
  //     this.sucSocket_.emit(EVENTS.SET_GRAND_SUCCESSOR);
  //     this.print_neighbours();
  //   } else {
  //     this.pingcount_--;
  //     // SEND ALIVE CHECK TO MY SUCCESSOR
  //     this.sucSocket_.emit(EVENTS.ALIVE_CHECK, this.self_);
  //   }
  // }

  join(remote_address) {
    if (remote_address) {
      const remote = io(`ws://${remote_address.address}`);
      remote.emit(EVENTS.JOIN, this.self_);
    }
  }

  place_node_in_mid(node) {
    // MAKE REQUESTING NODE, PREDECESSOR OF MY SUCCESSOR
    this.sucSocket_.emit(EVENTS.UPDATE_PREDECESSOR, node);
    // MAKE REQUESTING NODE, MY PREDECESSOR'S GRAND-SUCCESSOR
    this.predSocket_.emit(EVENTS.UPDATE_GRAND_SUCCESSOR, node);
    // CLOSE OLD SUCCESSOR CONNECTION
    const prevSucSocket = this.sucSocket_;
    // CREATE A NEW SUCCESSOR CONNECTION TO THIS REQUISTING NODE
    this.sucSocket_ = io(`ws://${node.address}`);
    // MAKE ME THE PREDECESOR OF REQUESTING NODE.
    this.sucSocket_.emit(EVENTS.UPDATE_PREDECESSOR, this.self_);
    // MAKE MY SUCCESSOR, SUCCESSOR OF REQUESTING NODE.
    this.sucSocket_.emit(EVENTS.UPDATE_SUCCESSOR, this.successor_);
    // MAKE MY GRAND_SUCCESSOR, GRAD_SUCCESSOR OF REQUESTING NODE
    this.sucSocket_.emit(EVENTS.UPDATE_GRAND_SUCCESSOR, this.grandsuccessor_);
    // MAKE MY SUCCESSOR, MY GRAND-SUCCESSOR
    this.grandsuccessor_ = this.successor_;
    this.gSucSocket_ = prevSucSocket;
    // MAKE REQUESTING NODE, MY SUCCESSOR
    this.successor_ = node;
    // EMIT JOINED SIGNAL TO REQUESTING NODE
    this.sucSocket_.emit(EVENTS.JOINED);
    this.print_neighbours();
  }

  start_listening() {
    // START LISTENING FOR OTHER NODES AND CLIENTS
    this.socket_listen = new Server(httpServer, {
      cors: {
        origin: "http://127.0.0.1:5500",
        methods: ["GET", "POST"],
      },
    });

    this.socket_listen.on("connection", (socket) => {
      socket.on(EVENTS.JOIN, (peer) => {
        log("join req");
        //IF I AM THE ONLY NODE IN THE NETWORK
        if (
          this.predecessor_.id == this.self_.id &&
          this.successor_.id == this.self_.id
        ) {
          // MAKE REQUESTING NODE AS MY PREDECESSOR AND SUCCESOR
          this.predecessor_ = peer;
          this.successor_ = peer;

          this.predSocket_?.close();
          this.sucSocket_?.close();
          // MAKE MYSELF AS PREDECESSOR AND SUCCESSOR OF REQUESTING NODE
          this.predSocket_ = this.sucSocket_ = io(`ws://${peer.address}`);
          this.sucSocket_.emit(EVENTS.UPDATE_PREDECESSOR, this.self_);
          this.sucSocket_.emit(EVENTS.UPDATE_SUCCESSOR, this.self_);

          if (peer.id > this.self_.id) {
            // IF REQUESTING NODE'S ID IS LARGER THAN ME
            // MAKE REQUESTING NODE THE LARGEST
            this.sucSocket_.emit(EVENTS.UPDATE_LARGEST, { val: true });
            this.largest_ = false;
          } else {
            this.largest_ = true;
          }
          // EMIT JOINED SIGNAL TO THE REQUESTING NODE
          this.sucSocket_.emit(EVENTS.JOINED);
          this.print_neighbours();
        }
        // IF MY SUCCESSOR IS IN FRONT
        else if (this.successor_.id > this.self_.id) {
          // IF REQUESTING NODE IS IN MID OF ME AND MY SUCCESSOR
          if (peer.id > this.self_.id && peer.id < this.successor_.id) {
            this.place_node_in_mid(peer);
          } else {
            // FORWARD JOIN REQUEST TO MY SUCCESSOR
            this.sucSocket_.emit(EVENTS.JOIN, peer);
          }
        }
        // IF MY SUCCESSOR IS BEHIND
        else if (this.successor_.id < this.self_.id) {
          // IF REQUESTING NODE IS IN MID OF ME AND SUCCESSOR
          if (peer.id > this.self_.id || peer.id < this.successor_.id) {
            this.place_node_in_mid(peer);

            // IF REQUISTING NODE ID IS LARGER THAN ME AND I'M LARGEST NOW
            // MAKE HIM THE LARGEST
            if (peer.id > this.self_.id && this.largest_) {
              this.sucSocket_.emit(EVENTS.UPDATE_LARGEST, { val: true });
              this.largest_ = false;
            }
          } else {
            // FORWARD JOIN REQUEST TO MY SUCCESSOR
            this.sucSocket_.emit(EVENTS.JOIN, peer);
          }
        }
      });

      socket.on(EVENTS.JOINED, () => {
        this.print_neighbours();
      });

      socket.on(EVENTS.UPDATE_PREDECESSOR, (peer) => {
        // MAKE THIS NODE, MY PREDECESSOR
        this.predecessor_ = peer;
        // CLOSE OLD CONNECTION AND CREAT A NEW CONNECTION
        this.predSocket_?.close();
        this.predSocket_ = io(`ws://${peer.address}`);
      });

      socket.on(EVENTS.UPDATE_SUCCESSOR, (peer) => {
        // MAKE THIS NODE, MY SUCCESSOR
        this.successor_ = peer;
        // CLOSE OLD CONNECTION AND CREAT A NEW CONNECTION
        this.sucSocket_?.close();
        this.sucSocket_ = io(`ws://${peer.address}`);
      });

      socket.on(EVENTS.UPDATE_GRAND_SUCCESSOR, (peer) => {
        // MAKE THIS NODE, MY GRAND_SUCCESSOR
        this.grandsuccessor_ = peer;
        // CLOSE OLD CONNECTION AND CREAT A NEW CONNECTION
        this.gSucSocket_?.close();
        this.gSucSocket_ = io(`ws://${peer.address}`);
      });

      socket.on(EVENTS.SET_GRAND_SUCCESSOR, () => {
        // LET PREDECESSOR UPDATE HIS GRAND SUCCESSOR, AS MY SUCCESSOR
        this.predSocket_.emit(EVENTS.UPDATE_GRAND_SUCCESSOR, this.successor_);
      });

      socket.on(EVENTS.UPDATE_LARGEST, (data) => {
        this.largest_ = data.val;
      });

      socket.on(EVENTS.PING_TABLE, (data) => {
        const idx = Number(data.index);
        if (data.peer.id !== this.self_.id) {
          if ((Math.log(idx) / Math.log(2)) % 1 === 0) {
            const conn = io(`ws://${data.peer.address}`);
            conn.emit(EVENTS.UPDATE_TABLE, {
              index: idx,
              peer: this.self_,
            });
          }
          this.sucSocket_.emit(EVENTS.PING_TABLE, {
            index: idx + 1,
            peer: data.peer,
          });
        }
      });

      socket.on(EVENTS.UPDATE_TABLE, (data) => {
        const idx = Number(data.index);
        this.finger_[idx] = data.peer.address;

        socket.disconnect();
      });

      // socket.on(EVENTS.ALIVE_CHECK, () => {
      //   this.predSocket_.emit(EVENTS.ALIVE_ACK);
      // });

      // socket.on(EVENTS.ALIVE_ACK, () => {
      //   this.pingcount_++;
      //   if (this.pingcount_ > 5) {
      //     this.pingcount_ = 5;
      //   }
      // });

      socket.on(EVENTS.GET_FILE, (data) => {
        const peer = data.sender;
        const fileName = data.fileName;
        const path = `${this.self_.address.split(":")[1]}`;
        // DOWNLOAD THE FILE FROM THE NODE -> REQUESTING TO UPLOAD
        download_file(`http://${peer.address}/file`, fileName, path);
        // CLOSE THE CONNECTION
        socket.disconnect();
      });

      socket.on(EVENTS.UPLOAD, (data) => {
        const hash = data.hash;
        const peer = data.request;
        const fileName = data.fileName;
        const path = `./${this.self_.address.split(":")[1]}`;
        // IF FILE HASH IS IN BETWEEN ME AND MY PRED

        if (this.successor_.id === peer.id) {
          // DOWNLOAD THE FILE FROM THE NODE -> REQUESTING TO UPLOAD
          download_file(`http://${peer.address}/file`, fileName, path);
        } else if (
          (hash > this.predecessor_.id && hash <= this.self_.id) ||
          (this.predecessor_.id > this.self_.id && hash > this.predecessor_.id)
        ) {
          // DOWNLOAD THE FILE FROM THE NODE -> REQUESTING TO UPLOAD
          download_file(`http://${peer.address}/file`, fileName, path);
        } else {
          this.sucSocket_.emit(EVENTS.UPLOAD, data);
        }
      });

      socket.on(EVENTS.DOWNLOAD, (data) => {
        const fileName = data.fileName;
        const peer = data.request;

        // IF THIS FILE WAS RECENTLY SEARCHED AND NOT FOUND
        if (fileName === this.lastRejected_) {
          // UPDATE REQUESTING NODE THAT TTHIS FILE IS NOT PRESENT
          const conn = io(`ws://${peer.address}`);
          conn.emit(
            EVENTS.FILE_NOT_PRESENT,
            `404: ${fileName} does not exist in the Network`
          );
        }
        // ELSE TRY TO GET THE FILE
        else {
          const path = `./${this.self_.address.split(":")[1]}/${fileName}`;
          // CHECK IF FILE EXIST IN THIS NODE
          access(path, (err) => {
            // IF NOT FORWARD DOWNLOAD REQUEST TO SUCCESSOR
            if (err) {
              this.lastRejected_ = data.fileName;
              const hash = createHash("sha256")
                .update(data.fileName)
                .digest("hex");
              const keys = Object.keys(this.finger_);
              let i;
              for (i = 0; i < keys.length; i++) {
                const n = keys[i];
                if (this.finger_[n].id >= hash) {
                  const conn = io(`ws://${this.finger_[n].address}`);
                  conn.emit(EVENTS.DOWNLOAD, data);
                  break;
                }
              }
              if (i == keys.length) {
                // USE NEW CONNECTION AS DOWNLOAD EVENT WILL CUT THIS CONNECTION
                const conn = io(`ws://${this.successor_.address}`);
                conn.emit(EVENTS.DOWNLOAD, data);
              }
            }
            // ELSE ASk THE REQUESTING NODE TO DOWNLOAD FROM THIS NODE
            else {
              this.lastRejected_ = "";
              const conn = io(`ws://${peer.address}`);
              conn.emit(EVENTS.GET_FILE, {
                fileName: data.fileName,
                sender: this.self_,
                count: 0,
              });
            }
          });
        }

        // DISCONNECT THIS CONNECTION
        socket.disconnect();
      });

      socket.on(EVENTS.FILE_NOT_PRESENT, (message) => {
        log(chalk.redBright(message));

        // DISCONNECT THIS CONNECTION
        socket.disconnect();
      });
    });

    // START LISTENING
    httpServer.listen(Number(this.self_.address.split(":")[1]));
  }

  async take_command() {
    while (1) {
      log(chalk.bgWhite.black("-h or help to explore commands"));
      const Input = await question(">> ");

      if (Input === "-h" || Input === "help") {
        log(chalk.magentaBright("-n or neighbours to see connections"));
        log(chalk.magentaBright("-ft or ftable to see finger table"));
        log(chalk.magentaBright("-l or leave to exit"));
        log(chalk.magentaBright("-c or clear to clear console"));
      }

      // HANDLE SHOWING NEIGHBOUR NODES
      else if (Input === "neighbours" || Input === "-n") {
        this.print_neighbours();
      }
      // HANDLE SHOWING FINGER TABLE
      else if (Input === "ftable" || Input === "-ft") {
        this.print_table();
      }
      // HANDLE CLEARING CONSOLE
      else if (Input === "-c" || Input === "clear") {
        console.clear();
      }
      // HANDLE DOWNLOAD COMMAND
      else if (Input === "-d" || Input === "download") {
        const fileName = await question("filename? ->");
        // USE NEW CONNECTION, AS DOWNLOAD EVENT WILL CUT THIS CONNECTION
        const conn = io(`ws://${this.successor_.address}`);
        conn.emit(EVENTS.DOWNLOAD, {
          fileName: fileName,
          request: this.self_,
        });
      }
      // HANDLE UPLOAD COMMAND
      else if (Input === "-u" || Input === "upload") {
        // ASK THE FILE NAME TO UPLOAD
        const fileName = await question("filename? ->");
        // HASH GENERATE THE FILE NAME HASH
        const hash = createHash("sha256").update(fileName).digest("hex");
        // CHECK IF THE FILE EXIST
        access(fileName, (err) => {
          if (err) {
            log(chalk.redBright("YOU DONT HAVE SUCH FILE !!"));
          } else {
            // IF FILE HASH IS IN BETWEEN PRED & ME
            if (hash <= this.self_.id && hash > this.predecessor_.id) {
              // ASK MY SUCCESSOR TO GET THIS FILE FROM ME
              // USE NEW CONNECTION, AS GET FILE EVENT WILL CUT THIS CONNECTION
              const conn = io(`ws://${this.successor_.address}`);
              conn.emit(EVENTS.GET_FILE, {
                fileName: fileName,
                sender: this.self_,
                count: 0,
              });
            } else {
              // ASK MY SUCCESSOR TO UPLOAD THIS FILE
              this.sucSocket_.emit(EVENTS.UPLOAD, {
                hash: hash,
                fileName: fileName,
                request: this.self_,
                count: 0,
              });
            }
          }
        });
      }
      // HANLDE LEAVE
      else if (Input === "Leave" || Input === "-l") {
        // CLOSE ALL CONNECTIONS AND STOP LISTENING
        this.socket_listen.close();
        // clearInterval(this.pingInterval);
        clearInterval(this.updateTableInterval);

        // MAKE MY PREDECESSOR, MY SUCCESSOR'S PREDECESSOR
        this.sucSocket_.emit(EVENTS.UPDATE_PREDECESSOR, this.predecessor_);
        // MAKE MY PREDECESSOR THE LARGEST, IF I WERE LARGEST
        if (this.largest_) {
          this.predSocket_.emit(EVENTS.UPDATE_LARGEST, { val: true });
        }
        // MAKE MY SUCCESSOR, MY PREDECESSOR'S SUCCESSOR
        this.predSocket_.emit(EVENTS.UPDATE_SUCCESSOR, this.successor_);
        // MAKE MY GRAND-SUCCESSOR, MY PREDECESSOR'S GRAND-SUCCESSOR
        this.predSocket_.emit(
          EVENTS.UPDATE_GRAND_SUCCESSOR,
          this.grandsuccessor_
        );

        log(chalk.bgWhite.black("YOU LEFT THE NETWORK"));
      }
    }
  }
}

if (process.argv.length === 4) {
  // GET port to run on
  const local_port = Number(process.argv[2]);
  const local_address = new Address(local_port);
  // GET port to connect to
  const remote_port = Number(process.argv[3]);
  const remote_address = new Address(remote_port);
  new Node(local_address, remote_address);
} else if (process.argv.length === 3) {
  // GET port to run on
  const local_port = Number(process.argv[2]);
  const local_address = new Address(local_port);
  new Node(local_address);
} else {
  console.log("please put valid args");
}
