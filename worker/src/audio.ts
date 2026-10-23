import { spawn, spawnSync } from 'node:child_process';
import type { Writable } from 'node:stream';
import { fileRoutes } from '@bpackz/shared';

export type AudioMetadata = { durationMs: number; waveform: ReturnType<typeof fileRoutes.waveform.response.parse> };

export function checkAudioTools() {
  for (const [command, flag] of [['ffprobe', '-version'], ['ffmpeg', '-version'], ['audiowaveform', '--version']]) {
    const result = spawnSync(command, [flag], { stdio: 'ignore', timeout: 5000, windowsHide: true });
    if (result.error || result.status !== 0) throw new Error(`Required worker tool unavailable: ${command}`);
  }
}

// A bounded, backpressured tap on the same bytes being hashed; originals never touch disk.
export function startAudio(signal?: AbortSignal) {
  const probe = spawn('ffprobe', ['-v', 'error', '-protocol_whitelist', 'pipe', '-i', 'pipe:0',
    '-select_streams', 'a:0', '-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json'], { windowsHide: true });
  const decode = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-protocol_whitelist', 'pipe', '-threads', '1', '-i', 'pipe:0',
    '-map', '0:a:0', '-vn', '-threads', '1', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], { windowsHide: true });
  const peaks = spawn('audiowaveform', ['--quiet', '--input-format', 'raw', '--raw-format', 's16le',
    '--raw-samplerate', '8000', '--raw-channels', '1', '--output-format', 'json', '--bits', '8', '--zoom', '256'], { windowsHide: true });
  const children = [probe, decode, peaks];
  let stopped = false;
  let broken = false;
  let pcmBytes = 0;
  const cancel = () => {
    stopped = true;
    for (const child of children) { child.stdin.destroy(); child.kill('SIGKILL'); }
  };
  const fail = () => { broken = true; cancel(); };
  const exits = children.map((child) => new Promise<number | null>((resolve) => {
    child.on('error', fail);
    child.once('close', (code) => resolve(code));
    child.stdin.on('error', () => {}); // ffprobe can close stdin as soon as it recognizes the header.
    child.stderr.resume();
  }));
  const collect = (child: typeof probe, limit: number) => {
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) fail();
      else chunks.push(chunk);
    });
    return () => Buffer.concat(chunks).toString('utf8');
  };
  const probeOutput = collect(probe, 64 * 1024);
  const peakOutput = collect(peaks, 8 * 1024 * 1024);
  // shortcut: cap decoded audio at six hours; raise only with a measured memory/CPU budget.
  decode.stdout.on('data', (chunk: Buffer) => { pcmBytes += chunk.length; if (pcmBytes > 8000 * 2 * 60 * 60 * 6) fail(); });
  decode.stdout.pipe(peaks.stdin);
  peaks.once('close', () => { if (decode.exitCode === null) decode.kill('SIGKILL'); });
  const timer = setTimeout(fail, 10 * 60 * 1000);
  timer.unref();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const write = (stream: Writable, chunk: Buffer) => new Promise<void>((resolve) => {
    if (stopped || stream.destroyed || stream.writableEnded) return resolve();
    stream.write(chunk, () => resolve());
  });
  return {
    async write(chunk: Buffer) { await Promise.all([write(probe.stdin, chunk), write(decode.stdin, chunk)]); },
    cancel,
    async finish(): Promise<AudioMetadata | null> {
      probe.stdin.end();
      decode.stdin.end();
      try {
        const [probeCode, decodeCode, peakCode] = await Promise.all(exits);
        signal?.throwIfAborted();
        if (broken) throw new Error('Audio tool failed or exceeded processing budget');
        // Unrecognized files and recognized containers without audio are valid vault objects.
        if (probeCode !== 0) return null;
        const metadata = JSON.parse(probeOutput());
        if (!metadata.streams?.some((stream: { codec_type?: string }) => stream.codec_type === 'audio')) return null;
        if (decodeCode !== 0 || peakCode !== 0 || pcmBytes === 0) throw new Error('Audio decode failed');
        const raw = JSON.parse(peakOutput());
        const waveform = fileRoutes.waveform.response.parse({ sampleRate: raw.sample_rate, samplesPerPixel: raw.samples_per_pixel,
          bits: raw.bits, length: raw.length, data: raw.data });
        if (raw.version !== 2 || raw.channels !== 1 || waveform.sampleRate !== 8000 || waveform.samplesPerPixel !== 256 ||
          waveform.length <= 0 || waveform.data.length !== waveform.length * 2 ||
          waveform.data.some((value) => value < -128 || value > 127)) throw new Error('Invalid waveform output');
        const duration = Number(metadata.streams[0]?.duration ?? metadata.format?.duration);
        // Streamed containers can omit duration; exact decoded sample count is the fallback.
        const durationMs = Math.round(Number.isFinite(duration) && duration > 0 ? duration * 1000 : pcmBytes / 16);
        if (durationMs <= 0 || durationMs > 2_147_483_647) throw new Error('Invalid audio duration');
        return { durationMs, waveform };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        cancel();
      }
    },
  };
}
