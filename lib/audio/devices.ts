export type MicPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

/** Enumerates available audio input devices. Labels are blank until permission is granted. */
export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
      groupId: d.groupId,
    }));
}

/** Reads current mic permission state via the Permissions API, falling back to 'unknown' if unsupported. */
export async function getMicPermissionState(): Promise<MicPermissionState> {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state as MicPermissionState;
  } catch {
    return 'unknown';
  }
}

/**
 * Requests a microphone stream tuned for this app's core use case: a laptop
 * mic picking up BOTH the agent's voice AND the phone call playing through the
 * computer's speakers.
 *
 * echoCancellation and noiseSuppression MUST be off here. The echo canceller
 * treats any audio coming out of the speakers as echo and subtracts it from
 * the mic signal — it erases the remote party's voice entirely — and its
 * half-duplex ducking suppresses the mic while speaker audio plays, so during
 * a call almost nothing survives. noiseSuppression similarly attenuates
 * far-field speaker audio. autoGainControl stays on: it boosts quiet distant
 * audio and cancels nothing.
 */
export async function requestMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
    video: false,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const settings = stream.getAudioTracks()[0]?.getSettings() ?? {};
  console.log('[microphone] stream acquired — applied settings:', JSON.stringify({
    deviceId: settings.deviceId,
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: settings.autoGainControl,
    sampleRate: settings.sampleRate,
    channelCount: settings.channelCount,
  }));
  return stream;
}
