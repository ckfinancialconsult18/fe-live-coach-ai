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

export interface MicProcessingOptions {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

/**
 * Default processing for acoustic pickup (a laptop mic hearing BOTH the
 * agent's voice AND a phone call playing through the computer's speakers):
 * echoCancellation and noiseSuppression MUST be off — the echo canceller
 * treats speaker output as echo and erases the remote party's voice, and its
 * half-duplex ducking suppresses the mic while speaker audio plays;
 * noiseSuppression similarly attenuates far-field speech.
 *
 * Capture modes override this per-mode (see lib/audio/input-manager.ts):
 * a close-talking headset mic wants processing ON, since the remote party
 * arrives digitally and there is nothing acoustic to erase.
 */
export const DEFAULT_MIC_PROCESSING: MicProcessingOptions = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
};

export async function requestMicrophoneStream(
  deviceId?: string,
  processing: MicProcessingOptions = DEFAULT_MIC_PROCESSING,
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: processing.echoCancellation,
      noiseSuppression: processing.noiseSuppression,
      autoGainControl: processing.autoGainControl,
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
