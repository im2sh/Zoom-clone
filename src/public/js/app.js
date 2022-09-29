const socket = io("http://localhost:3000"); // io function은 socket.io를 실행하고 있는 서버를 알아서 찾는다
//const socket = io();

const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const camerasSelect = document.getElementById("cameras");

const call = document.getElementById("call");

call.hidden = true;

let myStream; //비디오와 오디오의 결합
let muted = false; //음성
let cameraOff = false; //영상
let roomName;
let myPeerConnection; //getMedia 함수를 불렀을 때와 똑같이 stream을 공유하기 위한 변수
let myDataChannel;

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices(); //장치 리스트
    const cameras = devices.filter((device) => device.kind === "videoinput"); //videoinput 가져오기
    const currentCamera = myStream.getVideoTracks()[0]; //video트랙의 첫 번째 track가져와서 cameras에 있는 label과 같다면 label은 선택됨
    cameras.forEach((camera) => {
      const option = document.createElement("option"); //새로운 옵션 생성
      option.value = camera.deviceId; //카메라의 deviceId를 value값에 넣음
      option.innerText = camera.label; //카메라 label을 옵션에 넣음
      if (currentCamera.label === camera.label) { //현재 선택된 카메라가 맞는지
        option.selected = true; //맞으면 선택
      }
      camerasSelect.appendChild(option); //카메라의 정보를 option에 넣음
    });
  } catch (e) {
    console.log(e);
  }
}

async function getMedia(deviceId) {
  const initialConstrains = {
    //deviceId가 없을 때 실행됨, cameras를 만들기 전
    audio: true,
    video: { facingMode: "user" }, //facingmode:user  셀카
  };

  const cameraConstraints = {
    //deviceId가 있을 때 실행됨
    audio: true,
    video: { deviceId: { exact: deviceId } }, // exact를 쓰면 받아온 deviceId면 비디오 출력
  };

  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraints : initialConstrains // devicdeId가 있다면 cameraconstraints 없으면 initialconstrains 실행
    );
    myFace.srcObject = myStream; //myFace에 srcObject에 myStream(비디오,오디오)를 저장
    if (!deviceId) { //deviceId가 없으면 실행 최초 한 번만 실행됨
      await getCameras();
    }
  } catch (e) {
    console.log(e);
  }
}

function handleMuteClick() {
  myStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (!muted) {
    muteBtn.innerText = "Unmute";
    muted = true;
  } else {
    muteBtn.innerText = "Mute";
    muted = false;
  }
}

function handleCameraClick() {
  myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (cameraOff) {
    cameraBtn.innerText = "Turn Camera Off";
    cameraOff = false;
  } else {
    cameraBtn.innerText = "Turn Camera on";
    cameraOff = true;
  }
}

async function handleCameraChange() {
  await getMedia(camerasSelect.value); //video device에 다른 deviceID stream을 추가
  if (myPeerConnection) { //myPeerConnection이 있으면
    const videoTrack = myStream.getVideoTracks()[0]; //비디오트랙을 가져와서
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video"); //종류가 비디오인걸 찾아서
    videoSender.replaceTrack(videoTrack); //찾아온 비디오로 대체한다
  }
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);

/// welcome Form (join a room)

const welcome = document.getElementById("welcome");
const welcomeForm = welcome.querySelector("form");

async function initCall() {
  welcome.hidden = true;
  call.hidden = false;
  await getMedia();
  makeConnection();
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelector("input");
  await initCall();
  socket.emit("join_room", input.value); //서버로 input value를 보내줌
  roomName = input.value;
  input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);

//Socket Code
socket.on("welcome", async () => {
  myDataChannel = myPeerConnection.createDataChannel("chat"); //offer를 만드는 peer A가 myDataChannel를 만듬
  //알람을 받는 브라우저에서만 작동됨
  myDataChannel.addEventListener("message", (event) => console.log(event.data)); //메세지를 받음
  console.log("made data channel");
  const offer = await myPeerConnection.createOffer(); //peer A (맨 처음 방에 들어간 브라우저)에서 offer를 생성 (초대장)
  myPeerConnection.setLocalDescription(offer); //setLocalDescription을 하고 (myPeerConnection에 내 초대장의 위치 정보를 연결해줌)
  console.log("sent the offer");
  socket.emit("offer", offer, roomName); //peer B로 offer를 보냄
});

socket.on("offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (event) => { //offer를 받는 peer B가 새로운 DataChannel이 있으면 이벤틑 발생
    myDataChannel = event.channel;
    myDataChannel.addEventListener("message", (event) => //메세지 받은 걸 출력
      console.log(event.data)
    );
  });
  console.log("received the offer");
  myPeerConnection.setRemoteDescription(offer); //다른 브라우저의 위치를 myPeerConnection에 연결
  const answer = await myPeerConnection.createAnswer(); //현재 브라우저에서의 answer을 생성
  myPeerConnection.setLocalDescription(answer); //생성한 answer을 현재 브라우저의 myPeerConnection에 LocalDescription으로 등록
  socket.emit("answer", answer, roomName);
  console.log("sent the answer");
});

socket.on("answer", (answer) => {
  console.log("received the answer");
  myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", (ice) => {
  console.log("received candidate");
  myPeerConnection.addIceCandidate(ice);
});

// RTC Code
function makeConnection() {
  myPeerConnection = new RTCPeerConnection({ //구글의 stun 서버를 빌려옴
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });

  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);
  //myPeerConnection.addEventListener("track", handleTrack);
  myStream //Video와 audio를 myPeerConnection에 추가해줌 (peer-to-peer 연결)
    .getTracks()
    .forEach((track) => myPeerConnection.addTrack(track, myStream));
}

function handleIce(data) {
  console.log("sent candidate");
  socket.emit("ice", data.candidate, roomName); // 서로 다른 브라우저가 candidate를 주고 받음
}

function handleAddStream(data) {
  const peersFace = document.getElementById("peersFace");
  peersFace.srcObject = data.stream;
}

// function handleTrack(data) {
//   console.log("handle track");
//   const peerFace = document.querySelector("#peerFace");
//   peerFace.srcObject = data.streams[0];
// }
