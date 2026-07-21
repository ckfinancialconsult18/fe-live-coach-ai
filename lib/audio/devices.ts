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
 * Returns true when the device label suggests it's an external / USB mic.
 * Used to auto-switch when a higher-quality device is plugged in mid-call.
 */
export function isExternalMic(device: AudioInputDevice): boolean {
  const l = device.label.toLowerCase();
  if (l.includes('default') || l.includes('communications')) return false;
  return (
    l.includes('usb') ||
    l.includes('headset') ||
    l.includes('airpods') ||
    l.includes('bluetooth') ||
    l.includes('jabra') ||
    l.includes('logitech') ||
    l.includes('blue ') ||
    l.includes('yeti') ||
    l.includes('snowball') ||
    l.includes('fifine') ||
    l.includes('conference') ||
    l.includes('webcam') ||
    // not a built-in Intel / Realtek / Apple internal mic
    (!l.includes('built-in') && !l.includes('internal') && !l.includes('intel') &&
     !l.includes('smart sound') && !l.includes('realtek') && !l.includes('microphone array'))
  );
}

/**
 * Requests a microphone stream tuned for this app's use case: capturing BOTH
 * the agent's voice AND the prospect's voice bleeding from the phone speaker.
 *
 * echoCancellation and noiseSuppression are always OFF — they would erase the
 * prospect's voice (EC treats speaker audio as echo to subtract; NS attenuates
 * far-field audio).
 *
 * autoGainControl is ON for external/USB mics (boosts the quiet phone-speaker
 * bleed without adding noise floor artifacts) and OFF for built-in Intel mics
 * (AGC amplifies their noisy noise floor, producing static).
 */
export async function requestMicrophoneStream(
  deviceId?: string,
  device?: AudioInputDevice,
): Promise<MediaStream> {
  const external = device ? isExternalMic(device) : false;
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: external,
      channelCount: 1,
    },
    video: false,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const settings = stream.getAudioTracks()[0]?.getSettings() ?? {};
  console.log('[microphone] stream acquired —', external ? 'external mic (AGC on)' : 'built-in mic (AGC off)', '— settings:', JSON.stringify({
    deviceId: settings.deviceId,
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: settings.autoGainControl,
    sampleRate: settings.sampleRate,
    channelCount: settings.channelCount,
  }));
  return stream;
}
