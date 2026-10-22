/** Backup files are web-only for now; native uses the share sheet in a later milestone. */
export const filesSupported = false;

export async function saveTextFile(_name: string, _text: string, _type?: string): Promise<void> {
  throw new Error('Backup export is not available on this platform yet.');
}

export async function pickTextFile(_accept?: string): Promise<string | null> {
  throw new Error('Backup import is not available on this platform yet.');
}
