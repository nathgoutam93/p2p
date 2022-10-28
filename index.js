function startup() {
  const header = document.getElementById("peerId");
  const connectBtn = document.getElementById("connectBtn");
  const connectInput = document.getElementById("connectInput");
  const messageInput = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");
  const messageBox = document.getElementById("messageBox");

  const peer = new Peer(uuid.v4());

  let connection = null;

  // connect to
  function connectToPeer() {
    const id = connectInput.value;

    connection = peer.connect(id);

    // on open will be launch when you successfully connect to PeerServer
    connection.on("open", function () {
      connection.send("hi");
    });

    connection.on("data", function (data) {
      const newMessage = document.createElement("p");
      newMessage.innerText = data;
      newMessage.classList.add(...["message", "received"]);
      messageBox.appendChild(newMessage);
    });
  }

  // on connection start listening for data
  peer.on("connection", function (conn) {
    connection = conn;

    conn.on("data", function (data) {
      const newMessage = document.createElement("p");
      newMessage.innerText = data;
      newMessage.classList.add(...["message", "received"]);
      messageBox.appendChild(newMessage);
    });
  });

  // send message to connected data channel
  function sendMessage() {
    if (connection == null) return;

    const message = messageInput.value;

    const newMessage = document.createElement("p");
    newMessage.innerText = message;
    newMessage.classList.add(...["message", "sent"]);
    messageBox.appendChild(newMessage);

    connection.send(message);

    messageInput.innerText = "";
  }

  // show local self ID
  header.innerText = `YOUR PEER ID: ${peer.id}`;

  // Event listeners
  connectBtn.addEventListener("click", connectToPeer);
  sendBtn.addEventListener("click", sendMessage);
}

document.addEventListener("DOMContentLoaded", startup);
