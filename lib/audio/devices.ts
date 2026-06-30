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
 * Requests a microphone stream with explicit, production-appropriate constraints:
 * echo cancellation, noise suppression, and automatic gain control all enabled
 * (required for a laptop mic picking up both the agent's voice and a phone
 * speaker on the desk), plus an optional deviceId for device selection.
 */
export async function requestMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
    video: false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}
