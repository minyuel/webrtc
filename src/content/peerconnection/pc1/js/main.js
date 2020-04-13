/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const delayButton = document.getElementById('delayButton');
callButton.disabled = true;
hangupButton.disabled = true;
delayButton.disabled = true;
startButton.addEventListener('click', start);
callButton.addEventListener('click', call);
hangupButton.addEventListener('click', hangup);
delayButton.addEventListener('click', () => {
  let [a, v] = pc2.getReceivers();
  if (a) {
    a.jitterBufferDelayHint = 2.0;
    a.playoutDelayHint = 2.0;
    delayButton.disabled = true;
  }
});

let startTime;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const remoteAudio = document.getElementById('remoteAudio');

localVideo.addEventListener('loadedmetadata', function() {
  console.log(`Local video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
});

remoteVideo.addEventListener('loadedmetadata', function() {
  console.log(`Remote video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
});

remoteVideo.addEventListener('resize', () => {
  console.log(`Remote video size changed to ${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`);
  // We'll use the first onsize callback as an indication that video has started
  // playing out.
  if (startTime) {
    const elapsedTime = window.performance.now() - startTime;
    console.log('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
    startTime = null;
  }
});

let localStream;
let pc1;
let pc2;
const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};


const kAbsCaptureTime =
    'http://www.webrtc.org/experiments/rtp-hdrext/abs-capture-time';

function addHeaderExtensionToSdp(sdp, uri) {
  const extmap = new RegExp('a=extmap:(\\d+)');
  let sdpLines = sdp.split('\r\n');

  // This assumes at most one audio m= section and one video m= section.
  // If more are present, only the first section of each kind is munged.
  for (const section of ['audio', 'video']) {
    let found_section = false;
    let maxId = undefined;
    let maxIdLine = undefined;
    let extmapAllowMixed = false;

    // find the largest header extension id for section.
    for (let i = 0; i < sdpLines.length; ++i) {
      if (!found_section) {
        if (sdpLines[i].startsWith('m=' + section)) {
          found_section = true;
        }
        continue;
      } else {
        if (sdpLines[i].startsWith('m=')) {
          // end of section
          break;
        }
      }

      if (sdpLines[i] === 'a=extmap-allow-mixed') {
        extmapAllowMixed = true;
      }
      let result = sdpLines[i].match(extmap);
      if (result && result.length === 2) {
        if (maxId == undefined || result[1] > maxId) {
          maxId = parseInt(result[1]);
          maxIdLine = i;
        }
      }
    }

    if (maxId == 14 && !extmapAllowMixed) {
      // Reaching the limit of one byte header extension. Adding two byte header
      // extension support.
      sdpLines.splice(maxIdLine + 1, 0, 'a=extmap-allow-mixed');
    }
    if (maxIdLine !== undefined) {
      sdpLines.splice(maxIdLine + 1, 0,
                      'a=extmap:' + (maxId + 1).toString() + ' ' + uri);
    }
  }
  return sdpLines.join('\r\n');
}

function getName(pc) {
  return (pc === pc1) ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
  return (pc === pc1) ? pc2 : pc1;
}

async function start() {
  console.log('Requesting local stream');
  startButton.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    console.log('Received local stream');
    localVideo.srcObject = stream;
    localStream = stream;
    callButton.disabled = false;
  } catch (e) {
    alert(`getUserMedia() error: ${e.name}`);
  }
}

function getSelectedSdpSemantics() {
  const sdpSemanticsSelect = document.querySelector('#sdpSemantics');
  const option = sdpSemanticsSelect.options[sdpSemanticsSelect.selectedIndex];
  return option.value === '' ? {} : {sdpSemantics: option.value};
}

async function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  delayButton.disabled = false;
  console.log('Starting call');
  startTime = window.performance.now();
  const videoTracks = localStream.getVideoTracks();
  const audioTracks = localStream.getAudioTracks();
  if (videoTracks.length > 0) {
    console.log(`Using video device: ${videoTracks[0].label}`);
  }
  if (audioTracks.length > 0) {
    console.log(`Using audio device: ${audioTracks[0].label}`);
  }
  const configuration = getSelectedSdpSemantics();
  console.log('RTCPeerConnection configuration:', configuration);
  pc1 = new RTCPeerConnection(configuration);
  console.log('Created local peer connection object pc1');
  pc1.addEventListener('icecandidate', e => onIceCandidate(pc1, e));
  pc2 = new RTCPeerConnection(configuration);
  console.log('Created remote peer connection object pc2');
  pc2.addEventListener('icecandidate', e => onIceCandidate(pc2, e));
  pc1.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc1, e));
  pc2.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc2, e));
  pc2.addEventListener('track', gotRemoteStream);

  // Assume audio and video track here for demo purposes
  // (actually order is not specified in standard but in Chrome it is
  // returned in that order).
  console.assert(localStream.getTracks().length === 2);
  // Create separate streams to disable default 1:1 audio video synchronization.
  // Other option would be to comment this line in Chrome:
  // https://cs.chromium.org/chromium/src/third_party/webrtc/call/call.cc?l=1160&rcl=79685304182cd81f34c3d2b80527d4e8de92b04c
  //
  // It is a little bit hackish as there is no clear audio video
  // synchronization guide in WebRTC. I think it is mentioned only once in the
  // spec where it says something like "there is an internal slot for
  // MediaStream which is responsible for synchronization of tracks attached to
  // it with respect to ietf lips-sync spec". Then in practise lips-sync exists
  // only 1:1 audio and video streams. But don't take my words too close, I
  // might be easily wrong ¯\_(ツ)_/¯
  const [audioTrack, videoTrack] = localStream.getTracks();
  pc1AudioStream = new MediaStream();
  pc1VideoStream = new MediaStream();
  pc1.addTrack(audioTrack, pc1AudioStream);
  pc1.addTrack(videoTrack, pc1VideoStream);

  //.forEach(track => pc1.addTrack(track, localStream));
  console.log('Added local stream to pc1');

  try {
    console.log('pc1 createOffer start');
    const offer = await pc1.createOffer(offerOptions);
  
    // Absolute capture time header extension may not be offered by default,
    // in such case, munge the SDP.
    offer.sdp = addHeaderExtensionToSdp(offer.sdp, kAbsCaptureTime);

    await onCreateOfferSuccess(offer);
  } catch (e) {
    onCreateSessionDescriptionError(e);
  }
}

function onCreateSessionDescriptionError(error) {
  console.log(`Failed to create session description: ${error.toString()}`);
}

async function onCreateOfferSuccess(desc) {
  console.log(`Offer from pc1\n${desc.sdp}`);
  console.log('pc1 setLocalDescription start');
  try {
    await pc1.setLocalDescription(desc);
    onSetLocalSuccess(pc1);
  } catch (e) {
    onSetSessionDescriptionError();
  }

  console.log('pc2 setRemoteDescription start');
  try {
    await pc2.setRemoteDescription(desc);
    onSetRemoteSuccess(pc2);
  } catch (e) {
    onSetSessionDescriptionError();
  }

  console.log('pc2 createAnswer start');
  // Since the 'remote' side has no media stream we need
  // to pass in the right constraints in order for it to
  // accept the incoming offer of audio and video.
  try {
    const answer = await pc2.createAnswer();
    await onCreateAnswerSuccess(answer);
  } catch (e) {
    onCreateSessionDescriptionError(e);
  }
}

function onSetLocalSuccess(pc) {
  console.log(`${getName(pc)} setLocalDescription complete`);
}

function onSetRemoteSuccess(pc) {
  console.log(`${getName(pc)} setRemoteDescription complete`);
}

function onSetSessionDescriptionError(error) {
  console.log(`Failed to set session description: ${error.toString()}`);
}

function gotRemoteStream(e) {
  console.log('gotRemoteStream e', e);
  const remoteSink = e.track.kind === 'audio' ? remoteAudio : remoteVideo;
  if (remoteSink.srcObject !== e.streams[0]) {
    remoteSink.srcObject = e.streams[0];
    console.log('pc2 received remote stream');

    if (pc2.getReceivers().length !== 2) {
      return;
    }

    let [a, v] = pc2.getReceivers();
    let audioBar = document.getElementById('remoteAudioBar');
    let videoBar = document.getElementById('remoteVideoBar');
    let diffBar = document.getElementById('remoteDiffBar');

    // Stop previous pulling.
    clearInterval(window.pid);
    window.pid = setInterval(() => {
      try {
        let a_time = (a.getSynchronizationSources()[0].captureTimestamp / 1000.0);
        let v_time = (v.getSynchronizationSources()[0].captureTimestamp / 1000.0);
        let d_time = v_time - a_time;

        audioBar.textContent = `a: ${a_time.toFixed(2)} s`;
        videoBar.textContent = `v: ${v_time.toFixed(2)} s`;
        diffBar.textContent = `d: ${d_time.toFixed(2)} s`;
      } catch (e) {
        console.error('interval error', e);
      }
    }, 100);
  }
}

async function onCreateAnswerSuccess(desc) {
  console.log(`Answer from pc2:\n${desc.sdp}`);
  console.log('pc2 setLocalDescription start');
  try {
    await pc2.setLocalDescription(desc);
    onSetLocalSuccess(pc2);
  } catch (e) {
    onSetSessionDescriptionError(e);
  }
  console.log('pc1 setRemoteDescription start');
  try {
    await pc1.setRemoteDescription(desc);
    onSetRemoteSuccess(pc1);
  } catch (e) {
    onSetSessionDescriptionError(e);
  }
}

async function onIceCandidate(pc, event) {
  try {
    await (getOtherPc(pc).addIceCandidate(event.candidate));
    onAddIceCandidateSuccess(pc);
  } catch (e) {
    onAddIceCandidateError(pc, e);
  }
  console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
}

function onAddIceCandidateSuccess(pc) {
  console.log(`${getName(pc)} addIceCandidate success`);
}

function onAddIceCandidateError(pc, error) {
  console.log(`${getName(pc)} failed to add ICE Candidate: ${error.toString()}`);
}

function onIceStateChange(pc, event) {
  if (pc) {
    console.log(`${getName(pc)} ICE state: ${pc.iceConnectionState}`);
    console.log('ICE state change event: ', event);
  }
}

function hangup() {
  console.log('Ending call');
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
  delayButton.disabled = true;
}
