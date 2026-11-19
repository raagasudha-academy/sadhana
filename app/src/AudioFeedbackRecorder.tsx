import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MAX_AUDIO_BYTES = 20_000_000;

export default function AudioFeedbackRecorder({
  onRecording,
  onRecordingChange,
  disabled = false,
  label = 'Record optional audio feedback',
  startText = 'Record',
  stopText = 'Stop',
}: {
  onRecording: (file: File) => void;
  onRecordingChange?: (recording: boolean) => void;
  disabled?: boolean;
  label?: string;
  startText?: string;
  stopText?: string;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onRecordingRef = useRef(onRecording);
  const onRecordingChangeRef = useRef(onRecordingChange);
  const mountedRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onRecordingRef.current = onRecording;
  }, [onRecording]);

  useEffect(() => {
    onRecordingChangeRef.current = onRecordingChange;
  }, [onRecordingChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (mountedRef.current) {
      setRecording(false);
      onRecordingChangeRef.current?.(false);
    }
  };

  const startRecording = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
      const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        const mime = (recorder.mimeType || chunksRef.current[0]?.type || '')
          .split(';')[0]
          .toLowerCase();
        const extensionByMime: Record<string, string> = {
          'audio/webm': 'webm',
          'audio/mp4': 'm4a',
          'audio/aac': 'aac',
        };
        const extension = extensionByMime[mime];
        const blob = new Blob(chunksRef.current, { type: mime });
        stopTracks();
        if (!mountedRef.current) return;
        if (!extension || !blob.size) {
          setError('This browser did not produce a supported audio recording.');
          return;
        }
        if (blob.size > MAX_AUDIO_BYTES) {
          setError('The recording is over the 20 MB limit. Please record a shorter message.');
          return;
        }
        onRecordingRef.current(new File([blob], `audio-recording.${extension}`, { type: mime }));
      });
      recorder.addEventListener('error', () => {
        if (mountedRef.current)
          setError('The audio recording could not be completed. Please try again.');
        stopTracks();
      });
      recorder.start();
      setRecording(true);
      onRecordingChangeRef.current?.(true);
    } catch {
      stopTracks();
      if (mountedRef.current) setError('Allow microphone access to record audio feedback.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  return (
    <div className="tw-audio-recorder">
      <button
        type="button"
        className={`tw-audio-recorder-button ${
          recording ? 'tw-audio-recorder-stop' : 'tw-audio-recorder-start'
        }`}
        aria-label={recording ? 'Stop audio feedback recording' : label}
        title={recording ? 'Stop recording' : label}
        disabled={disabled}
        onClick={() => (recording ? stopRecording() : void startRecording())}
      >
        {recording ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
        {recording ? stopText : startText}
      </button>
      <span role="status" aria-live="polite">
        {recording ? 'Recording…' : ''}
      </span>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
