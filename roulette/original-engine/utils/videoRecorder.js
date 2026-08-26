import { pad } from './utils.js';
export class VideoRecorder {
    constructor(canvas) {
        this.chunks = [];
        this.targetCanvas = canvas;
        this.videoStream = this.targetCanvas.captureStream();
        this.mediaRecorder = new MediaRecorder(this.videoStream, {
            videoBitsPerSecond: 6000000,
        });
    }
    get isRecording() {
        return this.mediaRecorder.state === 'recording';
    }
    async start() {
        if (this.isRecording)
            return;
        return new Promise((rs) => {
            this.chunks = [];
            this.mediaRecorder.ondataavailable = (e) => {
                this.chunks.push(e.data);
            };
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: 'video/mp4' });
                const videoUrl = URL.createObjectURL(blob);
                const downloadLink = document.createElement('a');
                const d = new Date();
                downloadLink.href = videoUrl;
                downloadLink.download = `marble_roulette_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.mp4`;
                downloadLink.click();
                downloadLink.remove();
                URL.revokeObjectURL(videoUrl);
            };
            this.mediaRecorder.onstart = () => {
                rs();
            };
            this.mediaRecorder.start();
        });
    }
    stop() {
        if (this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
    }
}
