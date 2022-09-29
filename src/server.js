import http from "http";
import { Server } from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import path from "path";
const __dirname = path.resolve();

import express from "express";
import { Http2ServerRequest } from "http2";
import { SocketAddress } from "net";

const app = express();

app.set("view engine", "pug"); //view engine은  pug
app.set("views", __dirname + "/src/views"); //directory 설정
app.use("/public", express.static(__dirname + "/src/public")); // public ㅗㅍㄹ더를 유저에게 공개
app.get("/", (req, res) => res.render("home")); //홈페이지로 이동할 대 사용될 템플릿을 렌더
app.get("/*", (req, res) => res.redirect("/")); //홈페이지 내 어느 페이지에 접근해도 홈으로 연결되도록 리다이렉트

const httpServer = http.createServer(app); //http 서버
const wsServer = new Server(httpServer);

wsServer.on("connection", (socket) => {
  socket.on("join_room", (roomName) => {
    socket.join(roomName);
    socket.to(roomName).emit("welcome");
  });
  socket.on("offer", (offer, roomName) => { //offer 이벤트가 오면 roomname에 offer 이벤트 전송
    socket.to(roomName).emit("offer", offer);
  });
  socket.on("answer", (answer, roomName) => { //위와 동일
    socket.to(roomName).emit("answer", answer);
  });
  socket.on("ice", (ice, roomName) => { //위와 동일
    socket.to(roomName).emit("ice", ice);
  });
});

const handleListen = () => console.log("Listening on http://localhost:3000"); //3000번 포트로 연결
httpServer.listen(3000, handleListen);
